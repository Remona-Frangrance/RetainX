import { predictAndExplain } from "@/lib/tools";

export const dynamic = "force-dynamic";

/** POST /api/predict-and-explain — probability, risk level, top reasons, attributions. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object of customer features" }, { status: 400 });
  }
  try {
    const r = await predictAndExplain(body as Record<string, unknown>);
    if (!r.ok) return Response.json({ error: "Validation failed", details: r.errors }, { status: 422 });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
