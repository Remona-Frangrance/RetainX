import { ensureReady } from "@/lib/bootstrap";
import { behaviourComparison, churnByGroup, getOverview, riskSegments, viewingHistogram } from "@/lib/analytics";
import { GroupChurnBar, ViewingHistogram } from "@/components/charts";
import { Card, PageHeader, fmtInt, fmtMoney, fmtPct } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const { importance, model } = await ensureReady();
  const [overview, bySub, byDevice, byPayment, byAge, byViewing, byEngagement, byContent, behaviour, hist, segments] = await Promise.all([
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
    riskSegments(10),
  ]);
  const topSub = [...bySub].sort((a, b) => b.churnRate - a.churnRate)[0];
  const viewing = behaviour.find((b) => b.metric.startsWith("Viewing"))!;
  const age = behaviour.find((b) => b.metric.startsWith("Account"))!;
  const topDrivers = importance.slice(0, 5);

  const answers = [
    { q: "Which subscription type has the highest observed churn rate?", a: `${topSub.group} — ${fmtPct(topSub.churnRate)} of ${fmtInt(topSub.customers)} customers churned (${bySub.map((s) => `${s.group} ${fmtPct(s.churnRate)}`).join(", ")}). Association only; the plan is not shown to cause churn.` },
    { q: "Which customer segments have higher predicted churn risk?", a: `${segments[0].segment} (${fmtPct(segments[0].avgProbability)} avg risk, ${fmtInt(segments[0].customers)} customers) and ${segments[1].segment} (${fmtPct(segments[1].avgProbability)}). See the segment table below.` },
    { q: "What are the strongest overall churn-related features?", a: `${topDrivers.map((d) => d.label).join(", ")} — ranked by mean absolute attribution in the ${model.name} model.` },
    { q: "How does viewing behaviour differ between churned and retained customers?", a: `Churned customers average ${viewing.churned} h/week vs. ${viewing.retained} h/week for retained customers; observed churn is ${fmtPct(byViewing[0].churnRate)} among ${byViewing[0].group}s vs. ${fmtPct(byViewing[byViewing.length - 1].churnRate)} among ${byViewing[byViewing.length - 1].group}s.` },
    { q: "How does account age relate to churn?", a: `Average tenure is ${age.churned} months for churned vs. ${age.retained} months for retained customers. Observed churn by group: ${byAge.map((g) => `${g.group} ${fmtPct(g.churnRate)}`).join(", ")}.` },
    { q: "How many customers are classified as High / Very High risk?", a: `${fmtInt(overview.highRiskCustomers)} customers (${fmtPct(overview.highRiskCustomers / overview.totalCustomers)} of the base), of which ${fmtInt(overview.veryHighRisk)} are Very High.` },
    { q: "What monthly subscription revenue is associated with high-risk customers?", a: `Estimated revenue associated with high-risk customers: ${fmtMoney(overview.highRiskMonthlyRevenue)} per month (${fmtPct(overview.highRiskMonthlyRevenue / overview.totalMonthlyRevenue)} of ${fmtMoney(overview.totalMonthlyRevenue)}). This is revenue currently tied to at-risk accounts — not a guaranteed future loss.` },
  ];

  return (
    <>
      <PageHeader eyebrow="Business analytics" title="Churn Analysis" subtitle="Business-level insights computed from the scored customer base" />

      <Card title="Key business questions" subtitle="Answers are computed live from the data and model — nothing is hard-coded">
        <ol className="grid gap-3 md:grid-cols-2">
          {answers.map((x, i) => (
            <li
              key={i}
              className="rounded-xl p-4"
              style={{
                background: "rgba(15,23,42,0.5)",
                border: "1px solid rgba(99,102,241,0.12)",
              }}
            >
              <div className="text-sm font-semibold text-slate-200">
                {i + 1}. {x.q}
              </div>
              <p className="mt-1 text-sm text-slate-400">{x.a}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Churn by subscription type">
          <GroupChurnBar data={bySub} />
        </Card>
        <Card title="Churn by account-age group">
          <GroupChurnBar data={byAge} color="#38bdf8" />
        </Card>
        <Card title="Churn by viewing category" subtitle="Low < 12 h · Moderate 12-25 h · Heavy ≥ 25 h per week">
          <GroupChurnBar data={byViewing} color="#fb7185" />
        </Card>
        <Card title="Churn by engagement category" subtitle="Composite of viewing hours, session duration, downloads and watchlist size">
          <GroupChurnBar data={byEngagement} color="#34d399" />
        </Card>
        <Card title="Churn by registered device">
          <GroupChurnBar data={byDevice} color="#a78bfa" />
        </Card>
        <Card title="Churn by payment method">
          <GroupChurnBar data={byPayment} color="#fbbf24" />
        </Card>
        <Card title="Churn by content type">
          <GroupChurnBar data={byContent} color="#2dd4bf" />
        </Card>
        <Card title="Viewing hours distribution" subtitle="Churned vs. retained customers by weekly viewing hours">
          <ViewingHistogram data={hist} />
        </Card>
      </div>

      <Card title="Highest predicted-risk segments" subtitle="Subscription × account-age group × engagement (segments with ≥ 50 customers)" className="mt-4">
        <div
          className="overflow-x-auto rounded-xl scrollbar-thin"
          style={{ border: "1px solid rgba(99,102,241,0.12)" }}
        >
          <table className="table-base">
            <thead>
              <tr>
                <th>Segment</th>
                <th>Customers</th>
                <th>Avg. predicted risk</th>
                <th>High-risk share</th>
                <th>Observed churn</th>
                <th>Monthly revenue</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.segment}>
                  <td className="font-medium text-slate-200">{s.segment}</td>
                  <td>{fmtInt(s.customers)}</td>
                  <td>{fmtPct(s.avgProbability)}</td>
                  <td>{fmtPct(s.highRiskRate)}</td>
                  <td>{fmtPct(s.observedChurnRate)}</td>
                  <td>{fmtMoney(s.monthlyRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Behavioural comparison" subtitle="Average values for churned vs. retained customers" className="mt-4">
        <div
          className="overflow-x-auto rounded-xl scrollbar-thin"
          style={{ border: "1px solid rgba(99,102,241,0.12)" }}
        >
          <table className="table-base">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Churned</th>
                <th>Retained</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {behaviour.map((b) => (
                <tr key={b.metric}>
                  <td className="font-medium text-slate-200">{b.metric}</td>
                  <td>{b.churned}</td>
                  <td>{b.retained}</td>
                  <td style={{ color: b.churned - b.retained < 0 ? "#fb7185" : "#34d399" }}>
                    {b.churned - b.retained > 0 ? "+" : ""}
                    {(b.churned - b.retained).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
