import { ensureReady } from "@/lib/bootstrap";
import { listCustomers, type CustomerFilters } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** GET /api/customers?risk=&subscription=&device=&ageGroup=&engagement=&minProb=&search=&page= */
export async function GET(req: Request) {
  await ensureReady();
  const p = new URL(req.url).searchParams;
  const numOrUndef = (v: string | null) => (v === null || v === "" ? undefined : Number(v));
  const f: CustomerFilters = {
    risk: p.get("risk") ?? undefined,
    subscription: p.get("subscription") ?? undefined,
    device: p.get("device") ?? undefined,
    ageGroup: p.get("ageGroup") ?? undefined,
    engagement: p.get("engagement") ?? undefined,
    payment: p.get("payment") ?? undefined,
    minProb: numOrUndef(p.get("minProb")),
    maxProb: numOrUndef(p.get("maxProb")),
    search: p.get("search") ?? undefined,
    sort: (p.get("sort") as CustomerFilters["sort"]) ?? undefined,
    page: numOrUndef(p.get("page")),
    pageSize: numOrUndef(p.get("pageSize")),
  };
  const res = await listCustomers(f);
  return Response.json({
    ...res,
    rows: res.rows.map(({ gender: _g, ...rest }) => {
      void _g;
      return rest;
    }),
  });
}
