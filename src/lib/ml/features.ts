/**
 * Preprocessing & feature-engineering pipeline.
 *
 * - `fitPreprocessor` learns imputation values + scaling stats from TRAINING
 *   data only (no leakage).
 * - `transform` turns validated customer inputs into a dense numeric matrix
 *   (one-hot categoricals, numeric passthrough; scaling is applied only by the
 *   logistic-regression model, tree models use raw values).
 * - `cleanInput` validates/coerces arbitrary JSON or CSV rows into the schema
 *   and reports problems instead of crashing.
 */

import {
  CATEGORICAL_FEATURES,
  NUMERIC_FEATURES,
  type CategoricalFeature,
  type CustomerInput,
  type NumericFeature,
} from "@/lib/config";

export type Preprocessor = {
  featureNames: string[]; // dense column names, e.g. "ViewingHoursPerWeek", "SubscriptionType=Basic"
  numericMeans: Record<string, number>;
  numericStds: Record<string, number>;
  numericMedians: Record<string, number>;
  categoricalModes: Record<string, string>;
  /** dense column -> original feature name (for aggregating attributions) */
  columnToFeature: Record<string, string>;
};

const NUMERIC_BOUNDS: Record<NumericFeature, [number, number]> = {
  AccountAge: [0, 600],
  MonthlyCharges: [0, 500],
  TotalCharges: [0, 100000],
  ViewingHoursPerWeek: [0, 168],
  AverageViewingDuration: [0, 1440],
  ContentDownloadsPerMonth: [0, 1000],
  UserRating: [0, 5],
  SupportTicketsPerMonth: [0, 100],
  WatchlistSize: [0, 1000],
};

export type CleanResult =
  | { ok: true; input: CustomerInput; warnings: string[] }
  | { ok: false; errors: string[] };

function normaliseCategory(feature: CategoricalFeature, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const allowed = CATEGORICAL_FEATURES[feature] as readonly string[];
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  // common aliases
  const lower = s.toLowerCase();
  if (feature === "PaperlessBilling" || feature === "MultiDeviceAccess" || feature === "ParentalControl" || feature === "SubtitlesEnabled") {
    if (["y", "true", "1"].includes(lower)) return "Yes";
    if (["n", "false", "0"].includes(lower)) return "No";
  }
  if (feature === "PaymentMethod") {
    if (lower.includes("credit")) return "Credit card";
    if (lower.includes("bank")) return "Bank transfer";
    if (lower.includes("electronic")) return "Electronic check";
    if (lower.includes("mail")) return "Mailed check";
  }
  return null;
}

/**
 * Validate & coerce a loosely-typed record. Missing values are imputed with
 * training medians/modes (when a preprocessor is supplied) and reported as
 * warnings; impossible values are errors.
 */
export function cleanInput(raw: Record<string, unknown>, pre?: Preprocessor): CleanResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const input: Partial<CustomerInput> = {};

  // case-insensitive key lookup
  const keyMap = new Map<string, string>();
  for (const k of Object.keys(raw)) keyMap.set(k.trim().toLowerCase(), k);
  const get = (name: string) => {
    const k = keyMap.get(name.toLowerCase());
    return k === undefined ? undefined : raw[k];
  };

  for (const f of NUMERIC_FEATURES) {
    const v = get(f);
    let num: number | null = null;
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      num = Number(String(v).replace(/[$,]/g, ""));
      if (!Number.isFinite(num)) {
        errors.push(`${f}: "${String(v)}" is not a number`);
        continue;
      }
      const [lo, hi] = NUMERIC_BOUNDS[f];
      if (num < lo || num > hi) {
        errors.push(`${f}: ${num} is outside the plausible range ${lo}-${hi}`);
        continue;
      }
    }
    if (num === null) {
      if (pre) {
        num = pre.numericMedians[f];
        warnings.push(`${f} missing — imputed with training median (${num})`);
      } else {
        errors.push(`${f} is required`);
        continue;
      }
    }
    input[f] = num;
  }

  for (const f of Object.keys(CATEGORICAL_FEATURES) as CategoricalFeature[]) {
    const v = get(f);
    let cat = normaliseCategory(f, v);
    if (cat === null) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        errors.push(`${f}: "${String(v)}" is not one of ${CATEGORICAL_FEATURES[f].join(", ")}`);
        continue;
      }
      if (pre) {
        cat = pre.categoricalModes[f];
        warnings.push(`${f} missing — imputed with training mode (${cat})`);
      } else {
        errors.push(`${f} is required`);
        continue;
      }
    }
    input[f] = cat;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, input: input as CustomerInput, warnings };
}

/** Composite 0-100 engagement score (analytics feature, not a model input). */
export function engagementScore(i: Pick<CustomerInput, "ViewingHoursPerWeek" | "AverageViewingDuration" | "ContentDownloadsPerMonth" | "WatchlistSize">): number {
  const s =
    0.4 * Math.min(i.ViewingHoursPerWeek / 40, 1) +
    0.25 * Math.min(i.AverageViewingDuration / 180, 1) +
    0.2 * Math.min(i.ContentDownloadsPerMonth / 49, 1) +
    0.15 * Math.min(i.WatchlistSize / 24, 1);
  return Math.round(s * 1000) / 10;
}

export function buildFeatureNames(): { names: string[]; columnToFeature: Record<string, string> } {
  const names: string[] = [];
  const columnToFeature: Record<string, string> = {};
  for (const f of NUMERIC_FEATURES) {
    names.push(f);
    columnToFeature[f] = f;
  }
  for (const [f, cats] of Object.entries(CATEGORICAL_FEATURES)) {
    for (const c of cats) {
      const col = `${f}=${c}`;
      names.push(col);
      columnToFeature[col] = f;
    }
  }
  return { names, columnToFeature };
}

export function fitPreprocessor(train: CustomerInput[]): Preprocessor {
  const { names, columnToFeature } = buildFeatureNames();
  const numericMeans: Record<string, number> = {};
  const numericStds: Record<string, number> = {};
  const numericMedians: Record<string, number> = {};
  const categoricalModes: Record<string, string> = {};

  for (const f of NUMERIC_FEATURES) {
    const vals = train.map((r) => r[f]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const sorted = [...vals].sort((a, b) => a - b);
    numericMeans[f] = mean;
    numericStds[f] = Math.sqrt(variance) || 1;
    numericMedians[f] = sorted[Math.floor(sorted.length / 2)];
  }
  for (const f of Object.keys(CATEGORICAL_FEATURES) as CategoricalFeature[]) {
    const counts = new Map<string, number>();
    for (const r of train) counts.set(r[f], (counts.get(r[f]) ?? 0) + 1);
    categoricalModes[f] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return { featureNames: names, numericMeans, numericStds, numericMedians, categoricalModes, columnToFeature };
}

/** Encode one record into a dense numeric vector (raw scale). */
export function encodeRow(input: CustomerInput, pre: Preprocessor): Float64Array {
  const x = new Float64Array(pre.featureNames.length);
  let idx = 0;
  for (const f of NUMERIC_FEATURES) x[idx++] = input[f];
  for (const [f, cats] of Object.entries(CATEGORICAL_FEATURES)) {
    const val = input[f as CategoricalFeature];
    for (const c of cats) x[idx++] = val === c ? 1 : 0;
  }
  return x;
}

export function encodeMatrix(inputs: CustomerInput[], pre: Preprocessor): Float64Array[] {
  return inputs.map((i) => encodeRow(i, pre));
}

/** Baseline record (training means / modes) used for occlusion attributions. */
export function baselineInput(pre: Preprocessor): CustomerInput {
  const b: Partial<CustomerInput> = {};
  for (const f of NUMERIC_FEATURES) b[f] = pre.numericMeans[f];
  for (const f of Object.keys(CATEGORICAL_FEATURES) as CategoricalFeature[]) b[f] = pre.categoricalModes[f];
  return b as CustomerInput;
}
