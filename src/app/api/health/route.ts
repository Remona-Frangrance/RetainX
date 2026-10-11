import { db } from "@/db";
import { isReady } from "@/lib/bootstrap";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const modelReady = await isReady().catch(() => false);
    return Response.json({ ok: true, service: "ChurnSense AI", modelReady });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
