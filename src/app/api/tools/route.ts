import { ensureReady } from "@/lib/bootstrap";
import { TOOLS, getTool } from "@/lib/tools";

export const dynamic = "force-dynamic";

/** GET /api/tools — MCP-style tool manifest. */
export async function GET() {
  return Response.json({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
}

/** POST /api/tools { tool, arguments } — invoke a tool against the real model/data. */
export async function POST(req: Request) {
  let body: { tool?: string; arguments?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON: { tool, arguments }" }, { status: 400 });
  }
  const tool = getTool(String(body.tool ?? ""));
  if (!tool) return Response.json({ error: `Unknown tool. Available: ${TOOLS.map((t) => t.name).join(", ")}` }, { status: 404 });
  await ensureReady();
  try {
    const result = await tool.run(body.arguments ?? {});
    return Response.json({ tool: tool.name, result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
