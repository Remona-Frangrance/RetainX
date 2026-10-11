import { ensureReady } from "@/lib/bootstrap";
import { RISK_THRESHOLDS } from "@/lib/config";

export const dynamic = "force-dynamic";

/** GET /api/model — model comparison, metrics, feature importance, thresholds. */
export async function GET() {
  const { allModels, importance, model } = await ensureReady();
  return Response.json({
    finalModel: model.name,
    algorithm: model.algorithm,
    features: model.pre.featureNames,
    riskThresholds: RISK_THRESHOLDS,
    models: allModels.map((m) => ({ name: m.name, algorithm: m.algorithm, isFinal: m.isFinal, metrics: m.metrics, trainingInfo: m.trainingInfo, createdAt: m.createdAt })),
    featureImportance: importance,
  });
}
