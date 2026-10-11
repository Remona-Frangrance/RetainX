import { invalidateModelCache } from "@/lib/bootstrap";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/train — re-run the full pipeline (regenerate data, retrain, rescore). */
export async function POST() {
  const logs: string[] = [];
  try {
    const report = await runPipeline((m) => logs.push(m));
    invalidateModelCache();
    return Response.json({ report, logs });
  } catch (e) {
    return Response.json({ error: (e as Error).message, logs }, { status: 500 });
  }
}
