import Link from "next/link";
import { ensureReady } from "@/lib/bootstrap";
import { getFilterOptions, listCustomers, type CustomerFilters } from "@/lib/analytics";
import { Card, Empty, PageHeader, ProbBar, RiskBadge, fmtInt } from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await ensureReady();
  const sp = await searchParams;
  const filters: CustomerFilters = {
    risk: first(sp.risk) || "all",
    subscription: first(sp.subscription) || "all",
    device: first(sp.device) || "all",
    ageGroup: first(sp.ageGroup) || "all",
    engagement: first(sp.engagement) || "all",
    payment: first(sp.payment) || "all",
    minProb: first(sp.minProb) ? Number(first(sp.minProb)) / 100 : undefined,
    search: first(sp.search) || undefined,
    sort: (first(sp.sort) as CustomerFilters["sort"]) || "prob_desc",
    page: Number(first(sp.page) ?? 1),
    pageSize: 25,
  };
  const [opts, res] = await Promise.all([getFilterOptions(), listCustomers(filters)]);
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));

  const pageLink = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = first(v);
      if (val) q.set(k, val);
    }
    q.set("page", String(p));
    return `/customers?${q.toString()}`;
  };

  return (
    <>
      <PageHeader eyebrow="Customers" title="Customer Explorer" subtitle="Search, filter and rank customers by predicted churn risk" />

      <Card className="mb-4">
        <form method="get" className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <input name="search" defaultValue={filters.search ?? ""} placeholder="Customer ID…" className="input xl:col-span-2" />
          <Select name="risk" value={filters.risk!} options={opts.risks} label="Risk level" />
          <Select name="subscription" value={filters.subscription!} options={opts.subscriptions} label="Subscription" />
          <Select name="device" value={filters.device!} options={opts.devices} label="Device" />
          <Select name="ageGroup" value={filters.ageGroup!} options={opts.ageGroups} label="Account age" />
          <Select name="engagement" value={filters.engagement!} options={opts.engagement} label="Engagement" />
          <Select name="payment" value={filters.payment!} options={opts.payments} label="Payment" />
          <div className="flex items-center gap-2 md:col-span-2">
            <label className="whitespace-nowrap text-xs text-slate-400">Min probability %</label>
            <input name="minProb" type="number" min={0} max={100} defaultValue={first(sp.minProb) ?? ""} className="input" />
          </div>
          <select name="sort" defaultValue={filters.sort} className="input md:col-span-2">
            <option value="prob_desc">Sort: highest risk first</option>
            <option value="prob_asc">Sort: lowest risk first</option>
            <option value="age_asc">Sort: newest accounts first</option>
            <option value="viewing_asc">Sort: lowest viewing first</option>
          </select>
          <div className="flex gap-2 md:col-span-4">
            <button className="btn-primary" type="submit">
              Apply filters
            </button>
            <Link href="/customers" className="btn-secondary">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
          <span>
            <span className="font-semibold text-slate-200">{fmtInt(res.total)}</span> customers match · page {res.page} of {pages}
          </span>
          <div className="flex gap-2">
            {res.page > 1 && (
              <Link href={pageLink(res.page - 1)} className="btn-secondary !py-1">
                ← Prev
              </Link>
            )}
            {res.page < pages && (
              <Link href={pageLink(res.page + 1)} className="btn-secondary !py-1">
                Next →
              </Link>
            )}
          </div>
        </div>
        <div
          className="overflow-x-auto rounded-xl scrollbar-thin"
          style={{ border: "1px solid rgba(99,102,241,0.12)" }}
        >
          <table className="table-base">
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Churn probability</th>
                <th>Risk level</th>
                <th>Subscription</th>
                <th>Viewing hrs</th>
                <th>Account age</th>
                <th>Engagement</th>
                <th>Device</th>
                <th>Payment</th>
                <th>Monthly $</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.customerId}`} className="font-semibold text-indigo-400 hover:text-indigo-300 hover:underline">
                      {c.customerId}
                    </Link>
                  </td>
                  <td>
                    <ProbBar p={c.churnProbability} />
                  </td>
                  <td>
                    <RiskBadge level={c.riskLevel} />
                  </td>
                  <td>{c.subscriptionType}</td>
                  <td>{c.viewingHoursPerWeek}</td>
                  <td>{c.accountAge} mo</td>
                  <td>
                    {c.engagementCategory} <span className="text-slate-500">({c.engagementScore})</span>
                  </td>
                  <td>{c.deviceRegistered}</td>
                  <td>{c.paymentMethod}</td>
                  <td>${c.monthlyCharges.toFixed(2)}</td>
                </tr>
              ))}
              {res.rows.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <Empty text="No customers match these filters." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Select({ name, value, options, label }: { name: string; value: string; options: readonly string[]; label: string }) {
  return (
    <select name={name} defaultValue={value} className="input" aria-label={label}>
      <option value="all">{label}: all</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
