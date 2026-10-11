import { ensureReady } from "@/lib/bootstrap";
import { answerQuestion, llmConfigured } from "@/lib/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/assistant { question, history? } — data-grounded natural-language answers. */
export async function POST(req: Request) {
  let question = "";
  let history: { role: "user" | "assistant"; text: string }[] = [];
  try {
    const body = (await req.json()) as { question?: string; history?: { role: "user" | "assistant"; text: string }[] };
    question = String(body.question ?? "").slice(0, 500);
    history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  } catch {
    return Response.json({ error: "Body must be JSON with a `question` field" }, { status: 400 });
  }
  if (!question.trim()) return Response.json({ error: "`question` is required" }, { status: 400 });
  try {
    await ensureReady();
    const reply = await answerQuestion(question, history);
    return Response.json(reply);
  } catch (e) {
    return Response.json({ error: `Assistant error: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, engine: llmConfigured() ? "llm+tools" : "rules+tools" });
}
