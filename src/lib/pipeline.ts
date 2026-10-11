/**
 * End-to-end ChurnSense training pipeline.
 *
 *  synthetic dataset -> stratified train/test split -> preprocessor fitted on
 *  train only -> Logistic Regression / Random Forest / Gradient Boosting ->
 *  held-out evaluation -> final model selected by PR-AUC (tie-break ROC-AUC) ->
 *  global attributions -> score every customer -> persist to PostgreSQL.
 */

import { db } from "@/db";
import { customers, models, type NewCustomer } from "@/db/schema";
import { accountAgeGroupFor, engagementCategoryFor, riskLevelFor, viewingCategoryFor, type CustomerInput } from "@/lib/config";
import { encodeMatrix, engagementScore, fitPreprocessor, type Preprocessor } from "@/lib/ml/features";
import { trainLogistic } from "@/lib/ml/logistic";
import { bestF1Threshold, evaluate, round, type Metrics } from "@/lib/ml/metrics";
import { globalImportance, predictVector, type FittedModel, type ModelParams } from "@/lib/ml/model";
import { generateDataset, makeRng, type RawRecord } from "@/lib/ml/synthetic";
import { trainGbdt, trainRandomForest } from "@/lib/ml/trees";
import { sql } from "drizzle-orm";

export const DATASET_SIZE = Number(process.env.CHURNSENSE_DATASET_SIZE ?? 24000);
export const DATASET_SEED = 42;

export function toInput(r: RawRecord): CustomerInput {
  return {
    AccountAge: r.AccountAge,
    MonthlyCharges: r.MonthlyCharges,
    TotalCharges: r.TotalCharges,
    ViewingHoursPerWeek: r.ViewingHoursPerWeek,
    AverageViewingDuration: r.AverageViewingDuration,
    ContentDownloadsPerMonth: r.ContentDownloadsPerMonth,
    UserRating: r.UserRating,
    SupportTicketsPerMonth: r.SupportTicketsPerMonth,
    WatchlistSize: r.WatchlistSize,
    SubscriptionType: r.SubscriptionType,
    PaymentMethod: r.PaymentMethod,
    PaperlessBilling: r.PaperlessBilling,
    ContentType: r.ContentType,
    MultiDeviceAccess: r.MultiDeviceAccess,
    DeviceRegistered: r.DeviceRegistered,
    GenrePreference: r.GenrePreference,
    ParentalControl: r.ParentalControl,
    SubtitlesEnabled: r.SubtitlesEnabled,
  };
}

/** Stratified split: same churn rate in train and test. */
function stratifiedSplit(rows: RawRecord[], testFrac: number, seed: number) {
  const rng = makeRng(seed);
  const pos = rows.filter((r) => r.Churn === 1);
  const neg = rows.filter((r) => r.Churn === 0);
  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  shuffle(pos);
  shuffle(neg);
  const testSet = new Set<string>();
  pos.slice(0, Math.round(pos.length * testFrac)).forEach((r) => testSet.add(r.CustomerID));
  neg.slice(0, Math.round(neg.length * testFrac)).forEach((r) => testSet.add(r.CustomerID));
  return testSet;
}

export type TrainingReport = {
  datasetSize: number;
  trainSize: number;
  testSize: number;
  churnRate: number;
  results: { name: string; algorithm: string; metrics: Metrics; trainSeconds: number }[];
  finalModel: string;
  durationSeconds: number;
};

export async function runPipeline(log: (m: string) => void = console.log): Promise<TrainingReport> {
  const t0 = Date.now();
  log(`Generating synthetic dataset (${DATASET_SIZE} customers, seed ${DATASET_SEED})…`);
  const raw = generateDataset(DATASET_SIZE, DATASET_SEED);

  // ---- data quality (synthetic data has no missing values / duplicates, but we verify)
  const ids = new Set(raw.map((r) => r.CustomerID));
  if (ids.size !== raw.length) throw new Error("Duplicate customer ids in generated dataset");

  const testIds = stratifiedSplit(raw, 0.2, 7);
  const train = raw.filter((r) => !testIds.has(r.CustomerID));
  const test = raw.filter((r) => testIds.has(r.CustomerID));
  const churnRate = raw.reduce((s, r) => s + r.Churn, 0) / raw.length;
  log(`Split: train=${train.length} test=${test.length} churn rate=${(churnRate * 100).toFixed(2)}%`);

  const trainInputs = train.map(toInput);
  const testInputs = test.map(toInput);
  const yTrain = train.map((r) => r.Churn);
  const yTest = test.map((r) => r.Churn);

  const pre: Preprocessor = fitPreprocessor(trainInputs);
  const Xtr = encodeMatrix(trainInputs, pre);
  const Xte = encodeMatrix(testInputs, pre);

  // Class-imbalance handling: moderate positive-class weight instead of SMOTE
  // (SMOTE on ~18% prevalence with mostly continuous features adds little and
  // distorts calibration; a weight of ~2 keeps probabilities interpretable).
  const posWeight = 2;

  const candidates: { name: string; train: () => ModelParams }[] = [
    { name: "Logistic Regression", train: () => trainLogistic(Xtr, yTrain, { epochs: 30, lr: 0.05, l2: 1e-4, posWeight }) },
    { name: "Random Forest", train: () => trainRandomForest(Xtr, yTrain, { nTrees: 60, maxDepth: 10, minLeaf: 25, classWeight: posWeight }) },
    { name: "Gradient Boosted Trees", train: () => trainGbdt(Xtr, yTrain, { nRounds: 160, maxDepth: 4, learningRate: 0.08, minLeaf: 30, posWeight }) },
  ];

  const results: TrainingReport["results"] = [];
  const fitted: { name: string; params: ModelParams; metrics: Metrics; trainSeconds: number }[] = [];

  for (const c of candidates) {
    const s = Date.now();
    log(`Training ${c.name}…`);
    const params: ModelParams = { ...c.train(), posWeight };
    const trainSeconds = round((Date.now() - s) / 1000, 1);
    const probsTr = Xtr.map((x) => predictVector(params, x));
    const threshold = bestF1Threshold(probsTr, yTrain); // chosen on TRAIN, applied to TEST
    const probsTe = Xte.map((x) => predictVector(params, x));
    const metrics = evaluate(probsTe, yTest, threshold);
    log(`  ${c.name}: ROC-AUC=${metrics.rocAuc} PR-AUC=${metrics.prAuc} F1=${metrics.f1} recall=${metrics.recall} (${trainSeconds}s)`);
    fitted.push({ name: c.name, params, metrics, trainSeconds });
    results.push({ name: c.name, algorithm: params.type, metrics, trainSeconds });
  }

  // ---- select final model on held-out PR-AUC (imbalanced target), tie-break ROC-AUC
  const best = [...fitted].sort((a, b) => b.metrics.prAuc - a.metrics.prAuc || b.metrics.rocAuc - a.metrics.rocAuc)[0];
  log(`Final model: ${best.name}`);
  const finalModel: FittedModel = { algorithm: best.params.type, name: best.name, params: best.params, pre };

  // ---- global attributions on a random sample of training customers
  const rng = makeRng(99);
  const sample = [...trainInputs].sort(() => rng.next() - 0.5).slice(0, 600);
  log("Computing global feature attributions…");
  const importance = globalImportance(finalModel, sample);

  // ---- persist
  log("Persisting to PostgreSQL…");
  await db.execute(sql`truncate table ${customers} restart identity`);
  await db.execute(sql`truncate table ${models} restart identity`);

  for (const f of fitted) {
    const isFinal = f.name === best.name;
    await db.insert(models).values({
      name: f.name,
      algorithm: f.params.type,
      isFinal,
      metrics: f.metrics,
      params: isFinal ? { params: f.params, pre } : { params: null, pre: null },
      featureImportance: isFinal ? importance : [],
      trainingInfo: {
        datasetSize: raw.length,
        trainSize: train.length,
        testSize: test.length,
        churnRate: round(churnRate),
        posWeight,
        trainSeconds: f.trainSeconds,
        featureCount: pre.featureNames.length,
        seed: DATASET_SEED,
      },
    });
  }

  const allRows: NewCustomer[] = raw.map((r) => {
    const input = toInput(r);
    const x = encodeMatrix([input], pre)[0];
    const p = predictVector(best.params, x);
    const eng = engagementScore(input);
    return {
      customerId: r.CustomerID,
      accountAge: r.AccountAge,
      monthlyCharges: r.MonthlyCharges,
      totalCharges: r.TotalCharges,
      subscriptionType: r.SubscriptionType,
      paymentMethod: r.PaymentMethod,
      paperlessBilling: r.PaperlessBilling,
      contentType: r.ContentType,
      multiDeviceAccess: r.MultiDeviceAccess,
      deviceRegistered: r.DeviceRegistered,
      viewingHoursPerWeek: r.ViewingHoursPerWeek,
      averageViewingDuration: r.AverageViewingDuration,
      contentDownloadsPerMonth: r.ContentDownloadsPerMonth,
      genrePreference: r.GenrePreference,
      userRating: r.UserRating,
      supportTicketsPerMonth: r.SupportTicketsPerMonth,
      gender: r.Gender,
      watchlistSize: r.WatchlistSize,
      parentalControl: r.ParentalControl,
      subtitlesEnabled: r.SubtitlesEnabled,
      churn: r.Churn,
      engagementScore: eng,
      engagementCategory: engagementCategoryFor(eng),
      accountAgeGroup: accountAgeGroupFor(r.AccountAge),
      viewingCategory: viewingCategoryFor(r.ViewingHoursPerWeek),
      split: testIds.has(r.CustomerID) ? "test" : "train",
      churnProbability: round(p),
      riskLevel: riskLevelFor(p),
    };
  });

  const BATCH = 1000;
  for (let i = 0; i < allRows.length; i += BATCH) {
    await db.insert(customers).values(allRows.slice(i, i + BATCH));
  }

  const durationSeconds = round((Date.now() - t0) / 1000, 1);
  log(`Pipeline complete in ${durationSeconds}s`);
  return { datasetSize: raw.length, trainSize: train.length, testSize: test.length, churnRate: round(churnRate), results, finalModel: best.name, durationSeconds };
}
