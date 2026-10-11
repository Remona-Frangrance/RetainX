/**
 * Unified model wrapper: prediction + SHAP-style local/global explanations.
 *
 * Explanation method: baseline-replacement ("occlusion") attribution. For each
 * original feature we replace the customer's value with the training baseline
 * (mean for numeric, mode for categorical) and measure the change in predicted
 * probability. Positive values push the prediction towards churn.
 *
 * This is a model-agnostic, additive-style attribution in the same family as
 * SHAP (it equals a single-reference Shapley approximation). In a Python
 * deployment this module would be replaced by shap.TreeExplainer /
 * shap.LinearExplainer. Attributions describe *the model's behaviour*, not
 * causal effects on real customers.
 */

import { CATEGORICAL_FEATURES, FEATURE_LABELS, NUMERIC_FEATURES, riskLevelFor, type CategoricalFeature, type CustomerInput, type NumericFeature } from "@/lib/config";
import { baselineInput, encodeRow, type Preprocessor } from "@/lib/ml/features";
import { predictLogistic, type LogisticParams } from "@/lib/ml/logistic";
import { predictForest, predictGbdt, type ForestParams, type GbdtParams } from "@/lib/ml/trees";

/** `posWeight` = class weight used in training; predictions are prior-corrected back to the true base rate. */
export type ModelParams = (LogisticParams | ForestParams | GbdtParams) & { posWeight?: number };

export type FittedModel = {
  algorithm: ModelParams["type"];
  name: string;
  params: ModelParams;
  pre: Preprocessor;
};

/**
 * Prior correction for class-weighted training: a model trained with positive
 * weight w over-estimates P(churn); p_cal = p / (p + (1 - p) * w) restores
 * calibration to the observed base rate while preserving the ranking.
 */
export function calibrate(p: number, posWeight = 1): number {
  if (posWeight === 1) return p;
  const q = p / (p + (1 - p) * posWeight);
  return Math.min(1, Math.max(0, q));
}

export function predictVector(m: ModelParams, x: Float64Array | number[]): number {
  let p: number;
  switch (m.type) {
    case "logistic":
      p = predictLogistic(m, x);
      break;
    case "random_forest":
      p = predictForest(m, x);
      break;
    case "gradient_boosting":
      p = predictGbdt(m, x);
      break;
  }
  return calibrate(p, m.posWeight ?? 1);
}

export function predictInput(model: FittedModel, input: CustomerInput): number {
  return predictVector(model.params, encodeRow(input, model.pre));
}

export type Attribution = {
  feature: string;
  label: string;
  value: string | number;
  baseline: string | number;
  contribution: number; // Δ probability vs baseline (positive => towards churn)
  direction: "increases" | "decreases";
};

export function explainInput(model: FittedModel, input: CustomerInput): { probability: number; attributions: Attribution[] } {
  const base = baselineInput(model.pre);
  const p = predictInput(model, input);
  const attributions: Attribution[] = [];

  for (const f of NUMERIC_FEATURES) {
    const swapped: CustomerInput = { ...input, [f]: base[f] };
    const pSwap = predictInput(model, swapped);
    const c = p - pSwap;
    attributions.push({
      feature: f,
      label: FEATURE_LABELS[f] ?? f,
      value: input[f],
      baseline: Math.round(base[f] * 100) / 100,
      contribution: Math.round(c * 10000) / 10000,
      direction: c >= 0 ? "increases" : "decreases",
    });
  }
  for (const f of Object.keys(CATEGORICAL_FEATURES) as CategoricalFeature[]) {
    const swapped: CustomerInput = { ...input, [f]: base[f] };
    const pSwap = predictInput(model, swapped);
    const c = p - pSwap;
    attributions.push({
      feature: f,
      label: FEATURE_LABELS[f] ?? f,
      value: input[f],
      baseline: base[f],
      contribution: Math.round(c * 10000) / 10000,
      direction: c >= 0 ? "increases" : "decreases",
    });
  }
  attributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { probability: p, attributions };
}

/** Human-readable reason phrases for the top risk-increasing factors. */
export function reasonPhrase(a: Attribution): string {
  const f = a.feature;
  const v = a.value;
  const b = a.baseline;
  const num = typeof v === "number" && typeof b === "number";
  const rel = num ? (v < b ? "low" : "high") : "";
  switch (f) {
    case "ViewingHoursPerWeek":
      return rel === "low" ? `Low viewing activity (${v} h/week vs. ~${b} avg)` : `High viewing activity (${v} h/week)`;
    case "AccountAge":
      return rel === "low" ? `Short account tenure (${v} months vs. ~${b} avg)` : `Long account tenure (${v} months)`;
    case "AverageViewingDuration":
      return rel === "low" ? `Short average viewing sessions (${v} min)` : `Long average viewing sessions (${v} min)`;
    case "ContentDownloadsPerMonth":
      return rel === "low" ? `Few content downloads (${v}/month)` : `Many content downloads (${v}/month)`;
    case "WatchlistSize":
      return rel === "low" ? `Small watchlist (${v} titles)` : `Large watchlist (${v} titles)`;
    case "UserRating":
      return rel === "low" ? `Low user rating (${v}/5)` : `High user rating (${v}/5)`;
    case "SupportTicketsPerMonth":
      return rel === "high" ? `Frequent support tickets (${v}/month)` : `Few support tickets (${v}/month)`;
    case "MonthlyCharges":
      return rel === "high" ? `Higher monthly charges ($${v})` : `Lower monthly charges ($${v})`;
    case "TotalCharges":
      return rel === "low" ? `Low lifetime spend ($${v})` : `High lifetime spend ($${v})`;
    default:
      return `${a.label}: ${v}`;
  }
}

export function naturalLanguageExplanation(customerLabel: string, probability: number, attributions: Attribution[]): string {
  const risk = riskLevelFor(probability);
  const up = attributions.filter((a) => a.contribution > 0.005).slice(0, 3);
  const down = attributions.filter((a) => a.contribution < -0.005).slice(0, 2);
  const pct = (probability * 100).toFixed(1);
  let text = `${customerLabel} has a ${risk.toLowerCase()} predicted churn risk (${pct}%). `;
  if (up.length) {
    text += `The strongest factors the model associated with higher risk are ${up.map((a) => reasonPhrase(a).toLowerCase()).join(", ")}. `;
  } else {
    text += `No individual attribute pushed the prediction noticeably above the baseline. `;
  }
  if (down.length) {
    text += `Factors associated with lower risk include ${down.map((a) => reasonPhrase(a).toLowerCase()).join(" and ")}. `;
  }
  text += `These are model-identified associations, not proven causes of churn.`;
  return text;
}

/**
 * Global importance = mean |attribution| over a sample of customers, plus the
 * mean signed attribution (direction).
 */
export function globalImportance(model: FittedModel, sample: CustomerInput[]) {
  const acc = new Map<string, { abs: number; signed: number; label: string }>();
  for (const s of sample) {
    const { attributions } = explainInput(model, s);
    for (const a of attributions) {
      const cur = acc.get(a.feature) ?? { abs: 0, signed: 0, label: a.label };
      cur.abs += Math.abs(a.contribution);
      cur.signed += a.contribution;
      acc.set(a.feature, cur);
    }
  }
  return [...acc.entries()]
    .map(([feature, v]) => ({
      feature,
      label: v.label,
      meanAbsImpact: Math.round((v.abs / sample.length) * 10000) / 10000,
      meanSignedImpact: Math.round((v.signed / sample.length) * 10000) / 10000,
    }))
    .sort((a, b) => b.meanAbsImpact - a.meanAbsImpact);
}

export type GlobalImportance = ReturnType<typeof globalImportance>;

export function isNumericFeature(f: string): f is NumericFeature {
  return (NUMERIC_FEATURES as readonly string[]).includes(f);
}
