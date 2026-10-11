/**
 * Logistic regression with L2 regularisation, trained by mini-batch gradient
 * descent on standardised features. Supports class weighting to handle the
 * imbalanced churn target (used instead of SMOTE — see About Model).
 */

export type LogisticParams = {
  type: "logistic";
  weights: number[];
  bias: number;
  means: number[];
  stds: number[];
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function trainLogistic(
  X: Float64Array[],
  y: number[],
  opts: { epochs?: number; lr?: number; l2?: number; batch?: number; posWeight?: number; seed?: number } = {},
): LogisticParams {
  const { epochs = 40, lr = 0.05, l2 = 1e-4, batch = 256, posWeight = 1 } = opts;
  const n = X.length;
  const d = X[0].length;

  // standardisation stats
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) means[j] += row[j];
  for (let j = 0; j < d; j++) means[j] /= n;
  for (const row of X) for (let j = 0; j < d; j++) stds[j] += (row[j] - means[j]) ** 2;
  for (let j = 0; j < d; j++) stds[j] = Math.sqrt(stds[j] / n) || 1;

  const Xs = X.map((row) => {
    const r = new Float64Array(d);
    for (let j = 0; j < d; j++) r[j] = (row[j] - means[j]) / stds[j];
    return r;
  });

  const w = new Float64Array(d);
  let b = 0;
  const order = Array.from({ length: n }, (_, i) => i);
  let seed = opts.seed ?? 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let ep = 0; ep < epochs; ep++) {
    // shuffle
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const stepLr = lr / (1 + ep * 0.05);
    for (let start = 0; start < n; start += batch) {
      const end = Math.min(n, start + batch);
      const grad = new Float64Array(d);
      let gradB = 0;
      let wsum = 0;
      for (let k = start; k < end; k++) {
        const i = order[k];
        const row = Xs[i];
        let z = b;
        for (let j = 0; j < d; j++) z += w[j] * row[j];
        const p = sigmoid(z);
        const sw = y[i] === 1 ? posWeight : 1;
        const err = (p - y[i]) * sw;
        for (let j = 0; j < d; j++) grad[j] += err * row[j];
        gradB += err;
        wsum += sw;
      }
      for (let j = 0; j < d; j++) w[j] -= stepLr * (grad[j] / wsum + l2 * w[j]);
      b -= stepLr * (gradB / wsum);
    }
  }

  return { type: "logistic", weights: Array.from(w), bias: b, means, stds };
}

export function predictLogistic(p: LogisticParams, x: Float64Array | number[]): number {
  let z = p.bias;
  for (let j = 0; j < p.weights.length; j++) z += p.weights[j] * ((x[j] - p.means[j]) / p.stds[j]);
  return sigmoid(z);
}
