import { getCustomer } from "@/lib/analytics";
import { getTool } from "@/lib/tools";

export const dynamic = "force-dynamic";

/** GET /api/customers/:id — profile + prediction + explanation. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await getCustomer(id);
  if (!c) return Response.json({ error: `Customer ${id} not found` }, { status: 404 });
  const explanation = await getTool("explain_customer")!.run({ customer_id: id });
  const { gender: _g, ...profile } = c;
  void _g;
  return Response.json({ profile, explanation });
}
