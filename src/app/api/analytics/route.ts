import { ensureReady } from "@/lib/bootstrap";
import { accountAgeCurve, behaviourComparison, churnByGroup, getOverview, riskSegments, viewingHistogram } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** GET /api/analytics — all business analytics used by the dashboard. */
export async function GET() {
  const { importance, model } = await ensureReady();
  const [overview, bySubscription, byDevice, byPayment, byAgeGroup, byViewing, byEngagement, byContent, behaviour, viewingHist, ageCurve, segments] = await Promise.all([
    getOverview(),
    churnByGroup("subscriptionType"),
    churnByGroup("deviceRegistered"),
    churnByGroup("paymentMethod"),
    churnByGroup("accountAgeGroup"),
    churnByGroup("viewingCategory"),
    churnByGroup("engagementCategory"),
    churnByGroup("contentType"),
    behaviourComparison(),
    viewingHistogram(),
    accountAgeCurve(),
    riskSegments(10),
  ]);
  return Response.json({ model: model.name, overview, bySubscription, byDevice, byPayment, byAgeGroup, byViewing, byEngagement, byContent, behaviour, viewingHist, ageCurve, segments, drivers: importance });
}
