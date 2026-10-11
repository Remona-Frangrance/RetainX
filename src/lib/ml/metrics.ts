/** Classification metrics for probabilistic binary classifiers. */

export type Metrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  prAuc: number;
  threshold: number;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  rocCurve: { fpr: number; tpr: number }[];
  prCurve: { recall: number; precision: number }[];
  nTest: number;
  positiveRate: number;
};

export function confusionAt(probs: number[], y: number[], threshold: number) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < y.length; i++) {
    const pred = probs[i] >= threshold ? 1 : 0;
    if (pred === 1 && y[i] === 1) tp++;
    else if (pred === 1) fp++;
    else if (y[i] === 1) fn++;
    else tn++;
  }
  return { tp, fp, tn, fn };
}

export function evaluate(probs: number[], y: number[], threshold = 0.5): Metrics {
  const n = y.length;
  const { tp, fp, tn, fn } = confusionAt(probs, y, threshold);
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + tn) / n;

  // sort by prob desc for ROC / PR
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => probs[b] - probs[a]);
  const P = y.reduce((s, v) => s + v, 0);
  const N = n - P;
  let tpc = 0;
  let fpc = 0;
  let rocAuc = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  let prAuc = 0;
  let prevRecall = 0;
  const rocCurve: { fpr: number; tpr: number }[] = [{ fpr: 0, tpr: 0 }];
  const prCurve: { recall: number; precision: number }[] = [];
  const step = Math.max(1, Math.floor(n / 100));

  for (let k = 0; k < n; k++) {
    const i = idx[k];
    if (y[i] === 1) tpc++;
    else fpc++;
    // process ties together
    if (k + 1 < n && probs[idx[k + 1]] === probs[i]) continue;
    const tpr = P ? tpc / P : 0;
    const fpr = N ? fpc / N : 0;
    rocAuc += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
    const prec = tpc / (tpc + fpc);
    prAuc += (tpr - prevRecall) * prec;
    prevFpr = fpr;
    prevTpr = tpr;
    prevRecall = tpr;
    if (k % step === 0 || k === n - 1) {
      rocCurve.push({ fpr: round(fpr, 4), tpr: round(tpr, 4) });
      prCurve.push({ recall: round(tpr, 4), precision: round(prec, 4) });
    }
  }
  rocCurve.push({ fpr: 1, tpr: 1 });

  return {
    accuracy: round(accuracy),
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    rocAuc: round(rocAuc),
    prAuc: round(prAuc),
    threshold,
    confusion: { tp, fp, tn, fn },
    rocCurve,
    prCurve,
    nTest: n,
    positiveRate: round(P / n),
  };
}

/** Pick the threshold maximising F1 on the given (validation) probabilities. */
export function bestF1Threshold(probs: number[], y: number[]): number {
  let best = 0.5;
  let bestF1 = -1;
  for (let t = 0.1; t <= 0.9; t += 0.02) {
    const { tp, fp, fn } = confusionAt(probs, y, t);
    const p = tp + fp ? tp / (tp + fp) : 0;
    const r = tp + fn ? tp / (tp + fn) : 0;
    const f1 = p + r ? (2 * p * r) / (p + r) : 0;
    if (f1 > bestF1) {
      bestF1 = f1;
      best = t;
    }
  }
  return round(best, 2);
}

export const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
