import Link from "next/link";
import { ensureReady } from "@/lib/bootstrap";
import { accountAgeCurve, behaviourComparison, churnByGroup, getOverview, listCustomers, riskSegments } from "@/lib/analytics";
import { AgeCurve, BehaviourBars, DriversBar, GroupChurnBar, RiskDonut } from "@/components/charts";
import { Card, Hero, Kpi, ProbBar, RiskBadge, fmtInt, fmtMoney, fmtPct } from "@/components/ui";
import type { Metrics } from "@/lib/ml/metrics";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { model, importance, row } = await ensureReady();
  const metrics = row.metrics as Metrics;
  const [overview, bySub, ageCurve, behaviour, topRisk, segments] = await Promise.all([
    getOverview(),
    churnByGroup("subscriptionType"),
    accountAgeCurve(),
    behaviourComparison(),
    listCustomers({ sort: "prob_desc", pageSize: 8 }),
    riskSegments(4),
  ]);
  const viewing = behaviour.find((b) => b.metric.startsWith("Viewing"));
  const topSub = [...bySub].sort((a, b) => b.churnRate - a.churnRate)[0];

  return (
    <>
      <Hero
        title="Streaming Customer Churn & Retention Intelligence"
        subtitle="Predict who is likely to churn, understand what the model associates with that risk, and prioritise retention where it matters."
        right={
          <div
            className="grid min-w-[260px] grid-cols-2 gap-3 rounded-2xl p-4"
            style={{
              background: "rgba(15,23,42,0.5)",
              border: "1px solid rgba(99,102,241,0.2)",
              backdropFilter: "blur(12px)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 32px -8px rgba(0,0,0,0.4)",
            }}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Final model</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-200">{model.name}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">ROC-AUC · PR-AUC</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">
                {metrics.rocAuc.toFixed(3)} · {metrics.prAuc.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Recall</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">{fmtPct(metrics.recall)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Test set</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">{fmtInt(metrics.nTest)}</div>
            </div>
          </div>
        }
      >
        <Link
          href="/customers?risk=Very%20High"
          className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            backdropFilter: "blur(8px)",
            boxShadow: "0 4px 12px -4px rgba(0,0,0,0.3)",
          }}
        >
          ⚡ View very-high-risk customers
        </Link>
        <Link
          href="/assistant"
          className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition"
          style={{
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            boxShadow: "0 0 16px -4px rgba(99,102,241,0.3)",
          }}
        >
          ✦ Ask the AI assistant
        </Link>
        <Link
          href="/predict"
          className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition"
          style={{
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          Upload a CSV
        </Link>
      </Hero>

      {/* KPI row with staggered animations */}
      <div className="perspective-container grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="fade-up fade-up-1">
          <Kpi label="Total customers" value={fmtInt(overview.totalCustomers)} hint={`${fmtInt(overview.churned)} churned · ${fmtInt(overview.retained)} retained`} icon={<I d="M9 8a3.5 3.5 0 1 0 0 .01M2.5 20a6.5 6.5 0 0 1 13 0M17 9a2.5 2.5 0 1 0 0 .01M15.5 14.5a5 5 0 0 1 6 5" />} />
        </div>
        <div className="fade-up fade-up-2">
          <Kpi label="Observed churn rate" value={fmtPct(overview.churnRate)} hint="Share of customers with Churn = 1" accent="rose" icon={<I d="M3 17l5-6 4 4 6-8 3 3" />} />
        </div>
        <div className="fade-up fade-up-3">
          <Kpi label="High-risk customers" value={fmtInt(overview.highRiskCustomers)} hint={`${fmtMoney(overview.highRiskMonthlyRevenue)}/mo associated revenue`} accent="amber" delta={{ text: `${fmtInt(overview.veryHighRisk)} very high`, tone: "up" }} icon={<I d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />} />
        </div>
        <div className="fade-up fade-up-4">
          <Kpi label="Avg. churn probability" value={fmtPct(overview.avgChurnProbability)} hint="Calibrated to the observed base rate" accent="emerald" icon={<I d="M12 3a9 9 0 1 0 9 9M12 3v9l6 3" />} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title="Churn risk distribution" subtitle="Customers by configurable risk band">
          <RiskDonut data={overview.riskDistribution} />
          <ul className="mt-1 grid grid-cols-2 gap-2 text-sm">
            {overview.riskDistribution.map((r) => (
              <li
                key={r.level}
                className="flex items-center justify-between rounded-xl px-3 py-2"
                style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(30,41,59,0.5)" }}
              >
                <RiskBadge level={r.level} />
                <span className="tabular-nums text-slate-300">
                  {fmtInt(r.count)} <span className="text-slate-500">· {fmtPct(r.share)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="Churn by subscription type"
          subtitle="Observed churn rate vs. average predicted risk"
          className="lg:col-span-2"
          action={
            <Link href="/analysis" className="btn-ghost">
              Full analysis →
            </Link>
          }
        >
          <GroupChurnBar data={bySub} />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {bySub.map((s) => (
              <div
                key={s.group}
                className="rounded-xl p-3"
                style={{
                  background: s.group === topSub.group ? "rgba(244,63,94,0.08)" : "rgba(15,23,42,0.4)",
                  border: s.group === topSub.group ? "1px solid rgba(244,63,94,0.25)" : "1px solid rgba(30,41,59,0.5)",
                }}
              >
                <div className="text-xs font-medium text-slate-400">{s.group}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">{fmtPct(s.churnRate)}</div>
                <div className="text-[11px] text-slate-500">
                  {fmtInt(s.customers)} customers · {fmtInt(s.highRisk)} high-risk
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Association only — the plan itself is not shown to cause churn.</p>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Viewing behaviour: churned vs. retained" subtitle={viewing ? `Churned customers average ${viewing.churned} h/week vs. ${viewing.retained} h/week for retained` : undefined}>
          <BehaviourBars data={behaviour.filter((b) => !b.metric.startsWith("Account") && !b.metric.startsWith("Monthly"))} />
        </Card>
        <Card title="Account age analysis" subtitle="Observed churn rate and predicted risk by tenure (6-month buckets)">
          <AgeCurve data={ageCurve} />
        </Card>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Card title="Top churn drivers" subtitle={`Global attributions of the ${model.name} model (mean |Δ probability|)`} className="lg:col-span-2">
          <DriversBar data={importance.slice(0, 10)} />
          <p className="mt-1 text-[11px] text-slate-500">What the model relies on — not causal effects on customers.</p>
        </Card>
        <Card
          title="Highest-risk customers"
          subtitle="Sorted by predicted churn probability"
          className="lg:col-span-3"
          action={
            <Link href="/customers" className="btn-ghost">
              Explorer →
            </Link>
          }
        >
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Probability</th>
                  <th>Level</th>
                  <th>Plan</th>
                  <th>Viewing</th>
                  <th>Tenure</th>
                  <th>Engagement</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {topRisk.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold text-slate-100">{c.customerId}</td>
                    <td>
                      <ProbBar p={c.churnProbability} />
                    </td>
                    <td>
                      <RiskBadge level={c.riskLevel} />
                    </td>
                    <td>{c.subscriptionType}</td>
                    <td className="tabular-nums">{c.viewingHoursPerWeek} h</td>
                    <td className="tabular-nums">{c.accountAge} mo</td>
                    <td>{c.engagementCategory}</td>
                    <td className="text-right">
                      <Link href={`/customers/${c.customerId}`} className="btn-ghost !px-2 !py-1 text-xs">
                        Why? →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Priority segments — holographic ranked cards */}
      <Card title="Priority segments" subtitle="Highest average predicted risk (subscription × tenure × engagement)" className="mt-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {segments.map((s, i) => (
            <div
              key={s.segment}
              className="holo-sheen rounded-2xl p-4"
              style={{
                background: "linear-gradient(135deg, rgba(15,23,42,0.7), rgba(15,23,42,0.5))",
                border: "1px solid rgba(99,102,241,0.15)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 24px -8px rgba(0,0,0,0.4)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    boxShadow: "0 0 12px -2px rgba(99,102,241,0.5)",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  className="text-lg font-semibold tabular-nums"
                  style={{
                    color: "#fb7185",
                    textShadow: "0 0 12px rgba(244,63,94,0.4)",
                  }}
                >
                  {fmtPct(s.avgProbability)}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium text-slate-200">{s.segment}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                {fmtInt(s.customers)} customers · {fmtPct(s.observedChurnRate)} observed churn · {fmtMoney(s.monthlyRevenue)}/mo
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function I({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
