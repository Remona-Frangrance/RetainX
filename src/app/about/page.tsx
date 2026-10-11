import { ensureReady } from "@/lib/bootstrap";
import { CATEGORICAL_FEATURES, EXCLUDED_FROM_MODEL, FEATURE_LABELS, NUMERIC_FEATURES, RISK_THRESHOLDS } from "@/lib/config";
import type { Metrics } from "@/lib/ml/metrics";
import { Callout, Card, PageHeader, RiskBadge, fmtInt, fmtPct } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const { allModels, model } = await ensureReady();
  const final = allModels.find((m) => m.isFinal)!;
  const metrics = final.metrics as Metrics;
  const info = final.trainingInfo as Record<string, number>;

  return (
    <>
      <PageHeader eyebrow="Model card" title="About the Model" subtitle="Transparency: data, features, methodology, evaluation, limitations and responsible-use notes" />

      <Callout tone="warn" title="Important">
         Predictions represent model-estimated churn risk and should support, not replace, business decision-making. The model identifies statistical associations in historical data; it does not prove why any customer churns.
      </Callout>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Dataset">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>
              <strong>Synthetic streaming/OTT subscription dataset</strong> of {fmtInt(info.datasetSize)} customers × 21 columns, generated with a fixed random seed ({info.seed}) so results are reproducible.
            </li>
            <li>The schema mirrors a public streaming-churn dataset (CustomerID, AccountAge, MonthlyCharges, TotalCharges, SubscriptionType, PaymentMethod, PaperlessBilling, ContentType, MultiDeviceAccess, DeviceRegistered, ViewingHoursPerWeek, AverageViewingDuration, ContentDownloadsPerMonth, GenrePreference, UserRating, SupportTicketsPerMonth, Gender, WatchlistSize, ParentalControl, SubtitlesEnabled, Churn).</li>
            <li>
              It contains <strong>no real customer data</strong> and is not Netflix, Prime Video or any other provider&apos;s data. Swap in a real CSV via the pipeline to use production data.
            </li>
            <li>Observed churn rate: {fmtPct(info.churnRate)}. Data-quality checks (duplicates, ranges, types) run in the pipeline; the input validator imputes missing values with training medians/modes and rejects impossible values.</li>
          </ul>
        </Card>
        <Card title="Features used by the model">
          <div className="text-sm text-slate-300">
            <div className="font-semibold text-slate-200">Numeric ({NUMERIC_FEATURES.length})</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {NUMERIC_FEATURES.map((f) => (
                <span key={f} className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
                  {FEATURE_LABELS[f]}
                </span>
              ))}
            </div>
            <div className="mt-3 font-semibold text-slate-200">Categorical ({Object.keys(CATEGORICAL_FEATURES).length}, one-hot encoded → {info.featureCount} model columns in total)</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.keys(CATEGORICAL_FEATURES).map((f) => (
                <span key={f} className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
                  {FEATURE_LABELS[f]}
                </span>
              ))}
            </div>
            <div className="mt-3 font-semibold text-slate-200">Excluded</div>
            <ul className="mt-1 list-disc pl-5 text-xs text-slate-400">
              {Object.entries(EXCLUDED_FROM_MODEL).map(([k, v]) => (
                <li key={k}>
                  <code>{k}</code> — {v}
                </li>
              ))}
            </ul>
            <div className="mt-3 font-semibold text-slate-200">Engineered (analytics only, not model inputs)</div>
            <p className="mt-1 text-xs text-slate-400">
              Account-age group (0-6 / 6-12 / 12-24 / 24-48 / 48+ months), viewing category (&lt;12 / 12-25 / ≥25 h per week ≈ dataset terciles) and a 0-100 engagement score (weighted blend of viewing hours 40%, session duration 25%, downloads 20%, watchlist 15%; Low &lt;35, Medium 35-65, High ≥65). They are deliberately kept out of the model to avoid duplicating the raw features they are derived from.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Methodology">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Stratified 80/20 train/test split ({fmtInt(info.trainSize)} / {fmtInt(info.testSize)}), preserving the churn rate.</li>
            <li>Preprocessor (imputation values, scaling statistics, category vocabulary) fitted on the training split only — no leakage.</li>
            <li>
              Class imbalance handled with a positive-class weight of {info.posWeight} rather than SMOTE: the features are mostly continuous and the prevalence (~{fmtPct(info.churnRate, 0)}) is moderate, so synthetic oversampling adds little and hurts calibration. Predicted probabilities are prior-corrected back to the observed base rate so they can be read as calibrated risk.
            </li>
            <li>Three models compared with identical inputs: Logistic Regression (L2, mini-batch GD), Random Forest (60 trees, depth 10, √p features, bootstrap) and Gradient-Boosted Trees (160 rounds, depth 4, Newton boosting on log-loss with shrinkage, row/column subsampling and L2 leaf regularisation — the XGBoost formulation).</li>
            <li>Decision threshold chosen on the training set (max F1); all reported metrics come from the untouched test set.</li>
            <li>
              Final model selected by PR-AUC (tie-break ROC-AUC): <strong>{model.name}</strong> — ROC-AUC {metrics.rocAuc.toFixed(3)}, PR-AUC {metrics.prAuc.toFixed(3)}, recall {fmtPct(metrics.recall)}, precision {fmtPct(metrics.precision)}.
            </li>
          </ol>
        </Card>
        <Card title="Explainability (SHAP-style attributions)">
          <p className="text-sm text-slate-300">
            Each attribution answers: <em>how much does the predicted probability change when this attribute is replaced by the training baseline (mean or mode)?</em> Positive values push towards churn. Global importance is the mean absolute attribution over 600 sampled customers. This baseline-replacement method is a single-reference approximation to Shapley values and is model-agnostic; in a Python deployment it maps directly onto <code>shap.LinearExplainer</code> / <code>shap.TreeExplainer</code>.
          </p>
          <p className="mt-3 text-sm text-slate-300">
            Wording matters: we say a factor is <strong>&ldquo;associated with the prediction&rdquo;</strong> or <strong>&ldquo;identified by the model&rdquo;</strong> — never that it <em>caused</em> the customer to churn.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Risk threshold configuration" subtitle="Product configuration — tune to the business's intervention capacity">
          <table className="table-base">
            <thead>
              <tr>
                <th>Churn probability</th>
                <th>Risk level</th>
              </tr>
            </thead>
            <tbody>
              {RISK_THRESHOLDS.map((b) => (
                <tr key={b.level}>
                  <td>
                    {Math.round(b.min * 100)}% – {Math.round(Math.min(b.max, 1) * 100)}%
                  </td>
                  <td>
                    <RiskBadge level={b.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Defined in <code>src/lib/config.ts</code>. These bands are business choices, not scientifically universal boundaries.
          </p>
        </Card>
        <Card title="Limitations & responsible use">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>The training data is synthetic; real-world performance will differ and must be re-validated on production data.</li>
            <li>Predictions are correlational. Changing a feature (e.g. moving a customer to Premium) is not guaranteed to change their churn outcome.</li>
            <li>Models can encode bias or error. Gender is excluded from modelling and never exposed by the API; other proxies may still exist and should be audited.</li>
            <li>Scores are point-in-time. Behaviour drifts; the model should be monitored and retrained (see <code>POST /api/train</code>).</li>
            <li>Predictions for customers in the training split are in-sample and look optimistic; only the test split is a fair estimate.</li>
            <li>Only the minimum customer information required for scoring is stored and displayed.</li>
          </ul>
        </Card>
      </div>

      <Card title="API reference" subtitle="JSON over HTTP — input keys are the dataset column names" className="mt-4">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          {[
            ["GET /api/health", "Service + model readiness"],
            ["POST /api/predict", "{ churn_probability, risk_level }"],
            ["POST /api/explain", "{ top_reasons, attributions, explanation }"],
            ["POST /api/predict-and-explain", "Both of the above in one call"],
            ["POST /api/upload (multipart file)", "Batch CSV scoring with validation report"],
            ["GET /api/customers?risk=&subscription=&minProb=…", "Filterable, paginated scored customers"],
            ["GET /api/customers/:id", "Profile + prediction + explanation"],
            ["GET /api/analytics", "All dashboard analytics"],
            ["GET /api/model", "Model comparison, metrics, importance, thresholds"],
            ["GET|POST /api/tools", "MCP-style tool manifest & invocation"],
            ["POST /api/assistant", "{ question } → data-grounded answer"],
            ["POST /api/train", "Regenerate data, retrain, rescore"],
          ].map(([ep, desc]) => (
            <div key={ep} className="rounded-lg p-3" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(30,41,59,0.5)' }}>
              <code className="text-xs font-semibold text-indigo-400">{ep}</code>
              <div className="text-xs text-slate-400">{desc}</div>
            </div>
          ))}
        </div>
        <pre className="mt-3 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`curl -X POST /api/predict-and-explain -H "Content-Type: application/json" -d '{
  "SubscriptionType": "Basic", "ViewingHoursPerWeek": 7.5, "AccountAge": 8,
  "MonthlyCharges": 9.99, "TotalCharges": 79.9, "AverageViewingDuration": 55,
  "ContentDownloadsPerMonth": 6, "UserRating": 2.8, "SupportTicketsPerMonth": 3,
  "WatchlistSize": 4, "PaymentMethod": "Electronic check", "PaperlessBilling": "Yes",
  "ContentType": "Movies", "MultiDeviceAccess": "No", "DeviceRegistered": "Mobile",
  "GenrePreference": "Comedy", "ParentalControl": "No", "SubtitlesEnabled": "No"
}'`}</pre>
      </Card>
    </>
  );
}
