"use client";

import { useState } from "react";
import { CATEGORICAL_FEATURES, FEATURE_LABELS, NUMERIC_FEATURES, RISK_COLORS, type RiskLevel } from "@/lib/config";
import { AttributionBar } from "@/components/charts";
import { Card, RiskBadge, Stat } from "@/components/ui";

type PredictResult = {
  churn_probability: number;
  risk_level: RiskLevel;
  top_reasons: string[];
  attributions: { label: string; contribution: number; value: string | number }[];
  explanation: string;
  warnings: string[];
  model: string;
};

const DEFAULTS: Record<string, string | number> = {
  AccountAge: 8,
  MonthlyCharges: 9.99,
  TotalCharges: 79.92,
  ViewingHoursPerWeek: 7.5,
  AverageViewingDuration: 55,
  ContentDownloadsPerMonth: 6,
  UserRating: 2.8,
  SupportTicketsPerMonth: 3,
  WatchlistSize: 4,
  SubscriptionType: "Basic",
  PaymentMethod: "Electronic check",
  PaperlessBilling: "Yes",
  ContentType: "Movies",
  MultiDeviceAccess: "No",
  DeviceRegistered: "Mobile",
  GenrePreference: "Comedy",
  ParentalControl: "No",
  SubtitlesEnabled: "No",
};

type UploadResult = {
  summary: { totalRows: number; scored: number; failed: number; imputedValues: number; truncated: boolean; maxRows: number; missingColumns: string[]; ignoredColumns: string[]; riskCounts: Record<string, number>; avgProbability: number };
  results: Record<string, string | number>[];
  rowErrors: { row: number; errors: string[] }[];
  model: string;
};

export function PredictClient() {
  const [form, setForm] = useState<Record<string, string | number>>(DEFAULTS);
  const [result, setResult] = useState<PredictResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [riskFilter, setRiskFilter] = useState<string>("all");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/predict-and-explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) {
        setError([data.error, ...(data.details ?? [])].filter(Boolean).join(" · "));
        setResult(null);
      } else setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUpload(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        const details = data.details?.missingColumns?.length ? ` Missing columns: ${data.details.missingColumns.join(", ")}.` : "";
        setUploadError(`${data.error}${details}`);
      } else setUpload(data);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function downloadCsv() {
    if (!upload) return;
    const cols = Object.keys(upload.results[0] ?? {});
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...upload.results.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "churnsense_predictions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadTemplate() {
    const cols = ["CustomerID", ...NUMERIC_FEATURES, ...Object.keys(CATEGORICAL_FEATURES)];
    const sample = ["C900001", ...NUMERIC_FEATURES.map((f) => DEFAULTS[f]), ...Object.keys(CATEGORICAL_FEATURES).map((f) => DEFAULTS[f])];
    const csv = [cols.join(","), sample.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "churnsense_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const filteredResults = upload?.results.filter((r) => riskFilter === "all" || r.RiskLevel === riskFilter) ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Single customer" subtitle="Enter the customer's attributes — field names match the dataset columns" className="lg:col-span-3">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {NUMERIC_FEATURES.map((f) => (
              <label key={f} className="text-xs font-medium text-slate-400">
                {FEATURE_LABELS[f]}
                <input type="number" step="any" className="input mt-1" value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
              </label>
            ))}
            {(Object.keys(CATEGORICAL_FEATURES) as (keyof typeof CATEGORICAL_FEATURES)[]).map((f) => (
              <label key={f} className="text-xs font-medium text-slate-400">
                {FEATURE_LABELS[f]}
                <select className="input mt-1" value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}>
                  {CATEGORICAL_FEATURES[f].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="flex items-end gap-2 sm:col-span-2 md:col-span-3">
              <button className="btn-primary" disabled={loading} type="submit">
                {loading ? "Scoring…" : "Predict churn risk"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setForm(DEFAULTS)}>
                Reset example
              </button>
            </div>
          </form>
          {error && <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', color: '#fb7185' }}>{error}</div>}
        </Card>

        <Card title="Prediction" subtitle="POST /api/predict-and-explain" className="lg:col-span-2">
          {!result && <div className="grid h-full min-h-48 place-items-center rounded-xl text-center text-sm text-slate-500" style={{ border: '1px dashed rgba(99,102,241,0.2)', background: 'rgba(15,23,42,0.3)' }}><div><div className="mb-2 text-3xl opacity-40">◎</div>Submit the form to see the churn probability,<br/>risk level and explanation.</div></div>}
          {result && (
            <div>
              <div className="flex items-end gap-3">
                <div className="text-5xl font-semibold tabular-nums" style={{ color: RISK_COLORS[result.risk_level], textShadow: `0 0 20px ${RISK_COLORS[result.risk_level]}40` }}>
                  {(result.churn_probability * 100).toFixed(1)}%
                </div>
                <RiskBadge level={result.risk_level} />
              </div>
              <p className="mt-3 rounded-xl p-3 text-sm text-slate-300" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>{result.explanation}</p>
              <h3 className="mt-4 text-sm font-semibold text-slate-200">Top contributing factors</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-300">
                {result.top_reasons.length ? result.top_reasons.map((r) => <li key={r}>{r}</li>) : <li className="list-none text-slate-500">None above baseline</li>}
              </ol>
              <div className="mt-3">
                <AttributionBar data={result.attributions} height={240} />
              </div>
              {result.warnings.length > 0 && <div className="mt-2 text-xs" style={{ color: '#fbbf24' }}>{result.warnings.join(" · ")}</div>}
              <div className="mt-2 text-xs text-slate-400">Model: {result.model}</div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Batch scoring — CSV upload" subtitle="Upload customer records; columns are validated, cleaned, scored and assigned a risk level">
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-primary cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
            {uploading ? "Scoring…" : "Choose CSV file"}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onUpload} disabled={uploading} />
          </label>
          <button type="button" className="btn-secondary" onClick={downloadTemplate}>
            Download CSV template
          </button>
          <span className="text-xs text-slate-500">Required columns: {[...NUMERIC_FEATURES, ...Object.keys(CATEGORICAL_FEATURES)].join(", ")} (CustomerID optional). Up to 5,000 rows.</span>
        </div>
        {uploadError && <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', color: '#fb7185' }}>{uploadError}</div>}
        {upload && (
          <div className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Rows in file" value={upload.summary.totalRows} />
              <Stat label="Scored" value={upload.summary.scored} />
              <Stat label="Failed validation" value={upload.summary.failed} tone={upload.summary.failed ? "rose" : "slate"} />
              <Stat label="Avg. probability" value={`${(upload.summary.avgProbability * 100).toFixed(1)}%`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {Object.entries(upload.summary.riskCounts).map(([k, v]) => (
                <span key={k} className="rounded-full px-2.5 py-1" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(30,41,59,0.5)' }}>
                  <RiskBadge level={k} /> <span className="ml-1 font-medium text-slate-300">{v}</span>
                </span>
              ))}
              {upload.summary.imputedValues > 0 && <span className="rounded-full px-2.5 py-1" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>{upload.summary.imputedValues} missing values imputed</span>}
              {upload.summary.missingColumns.length > 0 && <span className="rounded-full px-2.5 py-1" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>Missing columns imputed: {upload.summary.missingColumns.join(", ")}</span>}
              {upload.summary.ignoredColumns.length > 0 && <span className="rounded-full px-2.5 py-1" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(30,41,59,0.5)', color: '#94a3b8' }}>Ignored columns: {upload.summary.ignoredColumns.join(", ")}</span>}
              {upload.summary.truncated && <span className="rounded-full px-2.5 py-1" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>Only the first {upload.summary.maxRows} rows were scored</span>}
            </div>
            {upload.rowErrors.length > 0 && (
              <details className="mt-3 rounded-lg p-3 text-xs" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#fb7185' }}>
                <summary className="cursor-pointer font-medium">Row validation errors ({upload.rowErrors.length} shown)</summary>
                <ul className="mt-2 space-y-1">
                  {upload.rowErrors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.errors.join("; ")}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Show:</span>
                {["all", "Very High", "High", "Medium", "Low"].map((r) => (
                  <button key={r} type="button" onClick={() => setRiskFilter(r)} className={`chip ${riskFilter === r ? "chip-active" : ""}`}>
                    {r === "all" ? "All" : r}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-secondary" onClick={downloadCsv} disabled={!upload.results.length}>
                Download predictions CSV
              </button>
            </div>
            <div className="mt-3 max-h-96 overflow-auto rounded-lg" style={{ border: '1px solid rgba(99,102,241,0.12)' }}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Customer ID</th>
                    <th>Churn probability</th>
                    <th>Risk level</th>
                    <th>Plan</th>
                    <th>Viewing hrs</th>
                    <th>Account age</th>
                    <th>Top reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.slice(0, 500).map((r, i) => (
                    <tr key={i}>
                      <td className="font-medium text-slate-200">{r.CustomerID}</td>
                      <td className="tabular-nums">{(Number(r.ChurnProbability) * 100).toFixed(1)}%</td>
                      <td>
                        <RiskBadge level={String(r.RiskLevel)} />
                      </td>
                      <td>{r.SubscriptionType}</td>
                      <td>{r.ViewingHoursPerWeek}</td>
                      <td>{r.AccountAge} mo</td>
                      <td className="max-w-md text-xs text-slate-500">{r.TopReasons}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
