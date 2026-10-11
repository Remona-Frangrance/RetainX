/**
 * Histogram-based decision trees, used by two ensembles:
 *   - Random Forest (bagging + feature subsampling, probability averaging)
 *   - Gradient-Boosted Trees (Newton boosting on log-loss — the same core idea
 *     as XGBoost: second-order gradients, shrinkage, row subsampling, L2 on leaves)
 *
 * Features are pre-binned into ≤ MAX_BINS quantile buckets once, so each split
 * search is O(rows × features) histogram accumulation + O(features × bins) scan.
 */

export type TreeNode =
  | { leaf: true; value: number }
  | { leaf: false; feature: number; threshold: number; left: TreeNode; right: TreeNode };

export type ForestParams = { type: "random_forest"; trees: TreeNode[] };
export type GbdtParams = { type: "gradient_boosting"; trees: TreeNode[]; learningRate: number; baseScore: number };

const MAX_BINS = 32;

type Binned = {
  bins: Uint8Array[]; // per feature: bin index per row
  thresholds: number[][]; // per feature: upper edge of each bin (except last)
};

export function binFeatures(X: Float64Array[]): Binned {
  const n = X.length;
  const d = X[0].length;
  const bins: Uint8Array[] = [];
  const thresholds: number[][] = [];
  for (let j = 0; j < d; j++) {
    const col = new Float64Array(n);
    for (let i = 0; i < n; i++) col[i] = X[i][j];
    const sorted = Float64Array.from(col).sort();
    const uniq: number[] = [];
    for (let i = 0; i < n; i++) if (i === 0 || sorted[i] !== sorted[i - 1]) uniq.push(sorted[i]);
    let edges: number[];
    if (uniq.length <= MAX_BINS) {
      edges = uniq.slice(0, -1).map((v, k) => (v + uniq[k + 1]) / 2);
    } else {
      edges = [];
      for (let b = 1; b < MAX_BINS; b++) {
        const q = sorted[Math.floor((b / MAX_BINS) * n)];
        if (edges.length === 0 || q > edges[edges.length - 1]) edges.push(q);
      }
    }
    thresholds.push(edges);
    const bj = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      // first edge with value < edge -> bin index
      let lo = 0;
      let hi = edges.length;
      const v = col[i];
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (v < edges[mid]) hi = mid;
        else lo = mid + 1;
      }
      bj[i] = lo;
    }
    bins.push(bj);
  }
  return { bins, thresholds };
}

type Rng = () => number;
function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Grow one tree minimising sum of squared error of `grad` with Newton leaves
 * (leaf = -sum(grad)/(sum(hess)+lambda)). For RF, grad = y - 0 and hess = 1,
 * which yields mean(y) leaves (variance reduction == Gini for binary targets).
 */
function growTree(
  binned: Binned,
  rows: Int32Array,
  grad: Float64Array,
  hess: Float64Array,
  opts: { maxDepth: number; minLeaf: number; featureFrac: number; lambda: number; rng: Rng; leafSign: number },
): TreeNode {
  const d = binned.bins.length;

  const build = (idx: Int32Array, depth: number): TreeNode => {
    let G = 0;
    let H = 0;
    for (let k = 0; k < idx.length; k++) {
      G += grad[idx[k]];
      H += hess[idx[k]];
    }
    const leafValue = (opts.leafSign * G) / (H + opts.lambda);
    if (depth >= opts.maxDepth || idx.length < 2 * opts.minLeaf) return { leaf: true, value: leafValue };

    // feature subsample
    const nFeat = Math.max(1, Math.round(d * opts.featureFrac));
    const feats: number[] = [];
    if (nFeat >= d) for (let j = 0; j < d; j++) feats.push(j);
    else {
      const pool = Array.from({ length: d }, (_, j) => j);
      for (let k = 0; k < nFeat; k++) {
        const r = k + Math.floor(opts.rng() * (d - k));
        [pool[k], pool[r]] = [pool[r], pool[k]];
        feats.push(pool[k]);
      }
    }

    let bestGain = 1e-9;
    let bestFeat = -1;
    let bestBin = -1;
    const parentScore = (G * G) / (H + opts.lambda);
    const hg = new Float64Array(MAX_BINS);
    const hh = new Float64Array(MAX_BINS);
    const hc = new Int32Array(MAX_BINS);

    for (const j of feats) {
      const nb = binned.thresholds[j].length + 1;
      if (nb < 2) continue;
      hg.fill(0);
      hh.fill(0);
      hc.fill(0);
      const bj = binned.bins[j];
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const b = bj[i];
        hg[b] += grad[i];
        hh[b] += hess[i];
        hc[b]++;
      }
      let gl = 0;
      let hl = 0;
      let cl = 0;
      for (let b = 0; b < nb - 1; b++) {
        gl += hg[b];
        hl += hh[b];
        cl += hc[b];
        const cr = idx.length - cl;
        if (cl < opts.minLeaf || cr < opts.minLeaf) continue;
        const gr = G - gl;
        const hr = H - hl;
        const gain = (gl * gl) / (hl + opts.lambda) + (gr * gr) / (hr + opts.lambda) - parentScore;
        if (gain > bestGain) {
          bestGain = gain;
          bestFeat = j;
          bestBin = b;
        }
      }
    }

    if (bestFeat < 0) return { leaf: true, value: leafValue };

    const bj = binned.bins[bestFeat];
    let nl = 0;
    for (let k = 0; k < idx.length; k++) if (bj[idx[k]] <= bestBin) nl++;
    const left = new Int32Array(nl);
    const right = new Int32Array(idx.length - nl);
    let a = 0;
    let c = 0;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (bj[i] <= bestBin) left[a++] = i;
      else right[c++] = i;
    }
    return {
      leaf: false,
      feature: bestFeat,
      threshold: binned.thresholds[bestFeat][bestBin],
      left: build(left, depth + 1),
      right: build(right, depth + 1),
    };
  };

  return build(rows, 0);
}

export function predictTree(node: TreeNode, x: Float64Array | number[]): number {
  let cur = node;
  while (!cur.leaf) cur = x[cur.feature] < cur.threshold ? cur.left : cur.right;
  return cur.value;
}

// ---------------------------------------------------------------------------
// Random Forest
// ---------------------------------------------------------------------------

export function trainRandomForest(
  X: Float64Array[],
  y: number[],
  opts: { nTrees?: number; maxDepth?: number; minLeaf?: number; seed?: number; classWeight?: number } = {},
): ForestParams {
  const { nTrees = 60, maxDepth = 10, minLeaf = 20, seed = 11, classWeight = 1 } = opts;
  const n = X.length;
  const binned = binFeatures(X);
  const rng = makeRng(seed);
  const grad = new Float64Array(n);
  const hess = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = y[i] === 1 ? classWeight : 1;
    grad[i] = y[i] * w; // weighted sum(y) / weighted count = weighted mean
    hess[i] = w;
  }
  const featureFrac = Math.sqrt(X[0].length) / X[0].length;
  const trees: TreeNode[] = [];
  for (let t = 0; t < nTrees; t++) {
    const rows = new Int32Array(n);
    for (let i = 0; i < n; i++) rows[i] = Math.floor(rng() * n); // bootstrap
    trees.push(growTree(binned, rows, grad, hess, { maxDepth, minLeaf, featureFrac, lambda: 0, rng, leafSign: 1 }));
  }
  return { type: "random_forest", trees };
}

export function predictForest(p: ForestParams, x: Float64Array | number[]): number {
  let s = 0;
  for (const t of p.trees) s += predictTree(t, x);
  return Math.min(1, Math.max(0, s / p.trees.length));
}

// ---------------------------------------------------------------------------
// Gradient-Boosted Trees (Newton boosting on logistic loss)
// ---------------------------------------------------------------------------

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function trainGbdt(
  X: Float64Array[],
  y: number[],
  opts: { nRounds?: number; maxDepth?: number; learningRate?: number; minLeaf?: number; subsample?: number; colsample?: number; lambda?: number; seed?: number; posWeight?: number } = {},
): GbdtParams {
  const { nRounds = 150, maxDepth = 4, learningRate = 0.1, minLeaf = 20, subsample = 0.8, colsample = 0.8, lambda = 1, seed = 23, posWeight = 1 } = opts;
  const n = X.length;
  const binned = binFeatures(X);
  const rng = makeRng(seed);
  const pos = y.reduce((s, v) => s + v, 0);
  const prior = Math.min(0.999, Math.max(0.001, pos / n));
  const baseScore = Math.log(prior / (1 - prior));
  const F = new Float64Array(n).fill(baseScore);
  const grad = new Float64Array(n);
  const hess = new Float64Array(n);
  const trees: TreeNode[] = [];

  for (let r = 0; r < nRounds; r++) {
    for (let i = 0; i < n; i++) {
      const p = sigmoid(F[i]);
      const w = y[i] === 1 ? posWeight : 1;
      grad[i] = (p - y[i]) * w;
      hess[i] = Math.max(p * (1 - p) * w, 1e-6);
    }
    const sample: number[] = [];
    for (let i = 0; i < n; i++) if (rng() < subsample) sample.push(i);
    const tree = growTree(binned, Int32Array.from(sample), grad, hess, { maxDepth, minLeaf, featureFrac: colsample, lambda, rng, leafSign: -1 });
    trees.push(tree);
    for (let i = 0; i < n; i++) F[i] += learningRate * predictTree(tree, X[i]);
  }
  return { type: "gradient_boosting", trees, learningRate, baseScore };
}

export function predictGbdt(p: GbdtParams, x: Float64Array | number[]): number {
  let z = p.baseScore;
  for (const t of p.trees) z += p.learningRate * predictTree(t, x);
  return sigmoid(z);
}
