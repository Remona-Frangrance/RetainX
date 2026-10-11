import { ensureReady } from "@/lib/bootstrap";
import type { Metrics } from "@/lib/ml/metrics";
import { CurveChart, DriversBar } from "@/components/charts";
import { Card, Kpi, PageHeader, fmtInt, fmtPct } from "@/components/ui";

export const dynamic = "force-dynamic";

const METRIC_HELP: { key: keyof Metrics; label: string; help: string }[] = [
  { key: "precision", label: "Precision", help: "Of customers flagged as churners, the share that actually churned. High precision = few false alarms." },
  { key: "recall", label: "Recall", help: "Of customers who actually churned, the share the model caught. High recall = few missed churners (business priority)." },
  { key: "f1", label: "F1", help: "Harmonic mean of precision and recall — balances the two." },
  { key: "rocAuc", label: "ROC-AUC", help: "Probability a random churner is ranked above a random non-churner. 0.5 = random, 1.0 = perfect." },
  { key: "prAuc", label: "PR-AUC", help: "Area under the precision-recall curve; more informative than ROC-AUC for an imbalanced target (baseline = churn rate)." },
  { key: "accuracy", label: "Accuracy", help: "Share of all predictions that are correct. Misleading alone when ~80% of customers never churn." },
];

export default async function ModelPage() {
  const { allModels, importance, model } = await ensureReady();
  const rows = allModels.map((m) => ({ ...m, metrics: m.metrics as Metrics, info: m.trainingInfo as Record<string, number> }));
  const final = rows.find((r) => r.isFinal)!;
  const cm = final.metrics.confusion;

  return (
    <>
      <PageHeader eyebrow="Machine learning" title="Model Insights" subtitle="Model comparison, evaluation on the held-out test set, and global explainability" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Final model" value={model.name} hint={`Selected by PR-AUC on ${fmtInt(final.metrics.nTest)} held-out customers`} />
        <Kpi label="ROC-AUC" value={final.metrics.rocAuc.toFixed(3)} accent="emerald" hint="Held-out test set" />
        <Kpi label="PR-AUC" value={final.metrics.prAuc.toFixed(3)} accent="amber" hint={`Baseline (churn rate) = ${final.metrics.positiveRate.toFixed(3)}`} />
        <Kpi label="Recall @ threshold" value={fmtPct(final.metrics.recall)} accent="rose" hint={`Decision threshold ${final.metrics.threshold} (max-F1 on train)`} />
      </div>

      <Card title="Model comparison" subtitle="All models trained on the same stratified 80/20 split with identical preprocessing; positive-class weight = 2" className="mt-4">
        <div
          className="overflow-x-auto rounded-xl scrollbar-thin"
          style={{ border: "1px solid rgba(99,102,241,0.12)" }}
        >
          <table className="table-base">
            <thead>
              <tr>
                <th>Model</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1</th>
                <th>ROC-AUC</th>
                <th>PR-AUC</th>
                <th>Accuracy</th>
                <th>Threshold</th>
                <th>Train time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={r.isFinal ? { background: "rgba(99,102,241,0.08)" } : undefined}
                >
                  <td className="font-medium text-slate-200">
                    {r.name}
                    {r.isFinal && (
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
                        style={{
                          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                          boxShadow: "0 0 8px -2px rgba(99,102,241,0.5)",
                        }}
                      >
                        final
                      </span>
                    )}
                  </td>
                  <td>{r.metrics.precision.toFixed(3)}</td>
                  <td>{r.metrics.recall.toFixed(3)}</td>
                  <td>{r.metrics.f1.toFixed(3)}</td>
                  <td>{r.metrics.rocAuc.toFixed(3)}</td>
                  <td>{r.metrics.prAuc.toFixed(3)}</td>
                  <td>{r.metrics.accuracy.toFixed(3)}</td>
                  <td>{r.metrics.threshold}</td>
                  <td>{r.info.trainSeconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Selection rule: highest PR-AUC (tie-break ROC-AUC). The tree ensembles were not assumed to win; on this dataset the differences are small and the simpler, more transparent model was preferred by the metric.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Confusion matrix" subtitle={`${model.name} at threshold ${final.metrics.threshold}`}>
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div
              className="rounded-xl p-4"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}
            >
              <div style={{ color: "#34d399" }} className="text-xs">True negatives</div>
              <div style={{ color: "#34d399", textShadow: "0 0 12px rgba(16,185,129,0.3)" }} className="text-2xl font-semibold">{fmtInt(cm.tn)}</div>
            </div>
            <div
              className="rounded-xl p-4"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}
            >
              <div style={{ color: "#fbbf24" }} className="text-xs">False positives</div>
              <div style={{ color: "#fbbf24", textShadow: "0 0 12px rgba(245,158,11,0.3)" }} className="text-2xl font-semibold">{fmtInt(cm.fp)}</div>
            </div>
            <div
              className="rounded-xl p-4"
              style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.2)" }}
            >
              <div style={{ color: "#fb7185" }} className="text-xs">False negatives (missed churners)</div>
              <div style={{ color: "#fb7185", textShadow: "0 0 12px rgba(244,63,94,0.3)" }} className="text-2xl font-semibold">{fmtInt(cm.fn)}</div>
            </div>
            <div
              className="rounded-xl p-4"
              style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
            >
              <div style={{ color: "#a5b4fc" }} className="text-xs">True positives</div>
              <div style={{ color: "#a5b4fc", textShadow: "0 0 12px rgba(99,102,241,0.3)" }} className="text-2xl font-semibold">{fmtInt(cm.tp)}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Missing a genuine churner (false negative) is usually costlier than a false alarm, so the threshold and class weight favour recall.</p>
        </Card>
        <Card title="ROC & Precision-Recall curves" subtitle="Held-out test set" className="lg:col-span-2">
          <CurveChart roc={final.metrics.rocCurve} pr={final.metrics.prCurve} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Global feature importance" subtitle="Mean |Δ probability| when a feature is replaced by its training baseline, over 600 sampled customers">
          <DriversBar data={importance} height={520} />
        </Card>
        <Card title="What each metric means">
          <dl className="space-y-3 text-sm">
            {METRIC_HELP.map((m) => (
              <div
                key={m.key}
                className="rounded-lg p-3"
                style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(30,41,59,0.5)" }}
              >
                <dt className="flex items-center justify-between font-semibold text-slate-200">
                  {m.label}
                  <span className="tabular-nums text-indigo-400">{Number(final.metrics[m.key]).toFixed(3)}</span>
                </dt>
                <dd className="mt-0.5 text-slate-400">{m.help}</dd>
              </div>
            ))}
          </dl>
          <div
            className="mt-4 rounded-lg p-3 text-xs text-slate-500"
            style={{ background: "rgba(15,23,42,0.4)", border: "1px solid rgba(30,41,59,0.4)" }}
          >
            Training set: {fmtInt(final.info.trainSize)} · Test set: {fmtInt(final.info.testSize)} · Features after encoding: {final.info.featureCount} · Churn rate: {fmtPct(final.info.churnRate)}
          </div>
        </Card>
      </div>
    </>
  );
}
