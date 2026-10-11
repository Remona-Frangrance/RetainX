import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureReady } from "@/lib/bootstrap";
import { customerToInput, getCustomer } from "@/lib/analytics";
import { FEATURE_LABELS, RISK_COLORS, riskLevelFor, type RiskLevel } from "@/lib/config";
import { explainInput, naturalLanguageExplanation, reasonPhrase } from "@/lib/ml/model";
import { AttributionBar } from "@/components/charts";
import { Callout, Card, PageHeader, RiskBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { model } = await ensureReady();
  const c = await getCustomer(id);
  if (!c) notFound();

  const input = customerToInput(c);
  const { probability, attributions } = explainInput(model, input);
  const risk: RiskLevel = riskLevelFor(probability);
  const topUp = attributions.filter((a) => a.contribution > 0).slice(0, 5);
  const topDown = attributions.filter((a) => a.contribution < 0).slice(0, 3);
  const text = naturalLanguageExplanation(`Customer ${c.customerId}`, probability, attributions);

  const attrs: [string, string | number][] = [
    ["SubscriptionType", c.subscriptionType],
    ["AccountAge", `${c.accountAge} months`],
    ["ViewingHoursPerWeek", `${c.viewingHoursPerWeek} h`],
    ["AverageViewingDuration", `${c.averageViewingDuration} min`],
    ["ContentDownloadsPerMonth", c.contentDownloadsPerMonth],
    ["WatchlistSize", c.watchlistSize],
    ["UserRating", `${c.userRating} / 5`],
    ["SupportTicketsPerMonth", c.supportTicketsPerMonth],
    ["MonthlyCharges", `$${c.monthlyCharges.toFixed(2)}`],
    ["TotalCharges", `$${c.totalCharges.toFixed(2)}`],
    ["PaymentMethod", c.paymentMethod],
    ["PaperlessBilling", c.paperlessBilling],
    ["DeviceRegistered", c.deviceRegistered],
    ["MultiDeviceAccess", c.multiDeviceAccess],
    ["ContentType", c.contentType],
    ["GenrePreference", c.genrePreference],
    ["ParentalControl", c.parentalControl],
    ["SubtitlesEnabled", c.subtitlesEnabled],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customer profile"
        title={`Customer ${c.customerId}`}
        subtitle={`${c.subscriptionType} plan · ${c.accountAgeGroup} tenure · ${c.viewingCategory} · ${c.engagementCategory} engagement`}
        right={
          <Link href="/customers" className="btn-secondary">
            ← Back to explorer
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Churn probability</div>
          <div className="mt-2 flex items-end gap-3">
            <div
              className="text-5xl font-semibold tabular-nums"
              style={{
                color: RISK_COLORS[risk],
                textShadow: `0 0 20px ${RISK_COLORS[risk]}40`,
              }}
            >
              {(probability * 100).toFixed(1)}%
            </div>
            <RiskBadge level={risk} />
          </div>
          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(15,23,42,0.6)", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${probability * 100}%`,
                backgroundColor: RISK_COLORS[risk],
                boxShadow: `0 0 12px 2px ${RISK_COLORS[risk]}50`,
              }}
            />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div
              className="rounded-lg p-3"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(30,41,59,0.5)" }}
            >
              <dt className="text-xs text-slate-400">Engagement score</dt>
              <dd className="font-semibold text-slate-200">{c.engagementScore} / 100</dd>
            </div>
            <div
              className="rounded-lg p-3"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(30,41,59,0.5)" }}
            >
              <dt className="text-xs text-slate-400">Observed label</dt>
              <dd className="font-semibold text-slate-200">{c.churn === 1 ? "Churned" : "Retained"}</dd>
            </div>
            <div
              className="rounded-lg p-3"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(30,41,59,0.5)" }}
            >
              <dt className="text-xs text-slate-400">Data split</dt>
              <dd className="font-semibold capitalize text-slate-200">{c.split}</dd>
            </div>
            <div
              className="rounded-lg p-3"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(30,41,59,0.5)" }}
            >
              <dt className="text-xs text-slate-400">Model</dt>
              <dd className="font-semibold text-slate-200">{model.name}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            The observed label is shown for transparency only; the model is evaluated on the held-out test split and predictions for training rows are in-sample.
          </p>
        </Card>

        <Card title="Why this prediction?" subtitle="Natural-language explanation generated from the model's feature attributions" className="lg:col-span-2">
          <Callout>{text}</Callout>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "#fb7185" }}>Top contributing factors (↑ risk)</h3>
              <ol className="mt-2 space-y-1.5 text-sm">
                {topUp.map((a, i) => (
                  <li
                    key={a.feature}
                    className="flex items-start justify-between gap-2 rounded-lg px-3 py-1.5"
                    style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.15)" }}
                  >
                    <span className="text-slate-300">
                      {i + 1}. {reasonPhrase(a)}
                    </span>
                    <span className="whitespace-nowrap tabular-nums font-medium" style={{ color: "#fb7185" }}>+{(a.contribution * 100).toFixed(1)} pts</span>
                  </li>
                ))}
                {topUp.length === 0 && <li className="text-slate-500">None above baseline.</li>}
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "#34d399" }}>Protective factors (↓ risk)</h3>
              <ol className="mt-2 space-y-1.5 text-sm">
                {topDown.map((a, i) => (
                  <li
                    key={a.feature}
                    className="flex items-start justify-between gap-2 rounded-lg px-3 py-1.5"
                    style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}
                  >
                    <span className="text-slate-300">
                      {i + 1}. {reasonPhrase(a)}
                    </span>
                    <span className="whitespace-nowrap tabular-nums font-medium" style={{ color: "#34d399" }}>{(a.contribution * 100).toFixed(1)} pts</span>
                  </li>
                ))}
                {topDown.length === 0 && <li className="text-slate-500">None below baseline.</li>}
              </ol>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Feature attribution" subtitle="Δ churn probability when each attribute is replaced by the training baseline (SHAP-style)" className="lg:col-span-2">
          <AttributionBar data={attributions.slice(0, 12)} height={360} />
        </Card>
        <Card title="Customer attributes" subtitle="Model inputs (sensitive attributes are excluded)">
          <dl className="text-sm" style={{ borderColor: "rgba(30,41,59,0.5)" }}>
            {attrs.map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between py-1.5"
                style={{ borderBottom: "1px solid rgba(30,41,59,0.4)" }}
              >
                <dt className="text-slate-400">{FEATURE_LABELS[k] ?? k}</dt>
                <dd className="font-medium text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
