# RetainX

### Autonomous Churn Intelligence & Explainable Retention ML Platform

RetainX is an end-to-end, explainable churn-intelligence product for subscription and streaming businesses. It predicts which customers are likely to churn, assigns a calibrated churn probability and a configurable risk level to every customer, explains *why* each customer is at risk, surfaces the strongest churn-related features across the base, and turns all of that into business analytics, a REST API, an interactive dashboard, CSV batch scoring, an MCP-style tool layer and a data-grounded AI assistant.

> **Implementation note.** The original brief specified a Python stack (Pandas / scikit-learn / XGBoost / SHAP / FastAPI / Streamlit). This repository delivers the same product in a **Next.js (App Router) + TypeScript + PostgreSQL (Drizzle ORM)** stack: the ML algorithms (logistic regression, random forest, gradient-boosted trees), evaluation metrics and SHAP-style attributions are implemented from scratch in TypeScript, the REST API is provided by Next.js route handlers (the FastAPI role), and the dashboard is a server-rendered React app (the Streamlit role). Every claim in the UI is computed live from the trained model and the database — nothing is hard-coded.

---

## 1. Problem statement

Subscription businesses lose a meaningful share of customers every month. Retention teams need to know **who** is likely to leave, **how confident** the model is, **why** the model thinks so, and **which segments** to prioritise — in language a non-technical stakeholder can act on, without mistaking statistical association for causation.

## 2. Objective

1. Predict churn probability for every customer.
2. Categorise customers into Low / Medium / High / Very High risk (configurable bands).
3. Explain individual predictions (top contributing factors + natural-language summary).
4. Rank the global churn drivers of the model.
5. Analyse churn by subscription, viewing behaviour, tenure, engagement, device, payment method, content type.
6. Identify high-risk segments and the subscription revenue associated with high-risk customers.
7. Expose everything through a REST API, an interactive dashboard, CSV batch scoring and an assistant.

## 3. Dataset

No dataset file was available in the build environment, so the project ships a **seeded synthetic generator** (`src/lib/ml/synthetic.ts`) that reproduces the 21-column schema of the streaming churn dataset described in the brief:

`CustomerID, AccountAge, MonthlyCharges, TotalCharges, SubscriptionType, PaymentMethod, PaperlessBilling, ContentType, MultiDeviceAccess, DeviceRegistered, ViewingHoursPerWeek, AverageViewingDuration, ContentDownloadsPerMonth, GenrePreference, UserRating, SupportTicketsPerMonth, Gender, WatchlistSize, ParentalControl, SubtitlesEnabled, Churn`

* 24,000 customers by default (`CHURNSENSE_DATASET_SIZE` env var to change), seed 42, fully reproducible.
* The latent churn model contains linear effects, an early-tenure cliff, plan × viewing interactions and noise, so the model comparison is meaningful rather than rigged.
* **This is synthetic data.** It is not Netflix, Prime Video or any provider's real customer data. To use a real CSV, replace the generator call in `src/lib/pipeline.ts` with a CSV loader that yields `RawRecord[]`.

Observed patterns in the generated data (all computed live in the app, not hard-coded): Basic plan churns more than Premium, churned customers watch noticeably fewer hours per week and have shorter tenure, and churn is highest in the 0-6 month group.

## 4. Architecture

```
src/
├── db/
│   ├── schema.ts            customers (21 dataset cols + engineered fields + scores), models (artefacts + metrics)
│   └── index.ts             Drizzle / pg connection
├── lib/
│   ├── config.ts            risk thresholds, feature schema, engineered-feature cut-offs (product config)
│   ├── ml/
│   │   ├── synthetic.ts     seeded dataset generator
│   │   ├── features.ts      validation / cleaning / imputation, one-hot encoding, engagement score
│   │   ├── logistic.ts      logistic regression (L2, mini-batch GD, class weights)
│   │   ├── trees.ts         histogram decision trees → Random Forest + Gradient-Boosted Trees (Newton boosting)
│   │   ├── metrics.ts       accuracy, precision, recall, F1, ROC-AUC, PR-AUC, confusion matrix, curves
│   │   └── model.ts         unified predict, prior-correction calibration, SHAP-style attributions, NL explanations
│   ├── pipeline.ts          split → preprocess → train ×3 → evaluate → select → explain → score → persist
│   ├── bootstrap.ts         lazy model loading (auto-trains on an empty database)
│   ├── analytics.ts         SQL business analytics (KPIs, group churn, segments, behaviour comparison)
│   └── tools.ts             MCP-style tools + deterministic assistant router
├── app/
│   ├── page.tsx             Dashboard
│   ├── customers/           Customer Explorer + Customer Detail
│   ├── analysis/            Churn Analysis (7 business questions)
│   ├── model/               Model Insights (comparison table, confusion matrix, ROC/PR, importance)
│   ├── predict/             Single prediction form + CSV batch upload
│   ├── assistant/           AI Business Assistant
│   ├── about/               About Model (transparency, limitations, API reference)
│   └── api/                 REST endpoints (see §12)
├── components/              sidebar, UI primitives, recharts charts
scripts/train.ts             CLI: run the full pipeline
```

## 5. Tech stack

Next.js 16 (App Router, React 19) · TypeScript · PostgreSQL · Drizzle ORM · Tailwind CSS 4 · Recharts · tsx

## 6. Data preprocessing

* Data-quality checks: duplicate ids, plausible ranges, types.
* `cleanInput` validates any JSON/CSV row: case-insensitive column matching, numeric coercion (`$`, `,` stripped), category normalisation and aliases (`Y/N/true/false`), **imputation with training medians/modes** for missing values (reported as warnings), rejection of impossible values with precise error messages.
* Preprocessor (imputation values, scaling statistics, vocabularies) is **fitted on the training split only**.
* Categoricals are one-hot encoded (28 columns in total); standardisation is applied inside the logistic model; trees use raw values.

## 7. Feature engineering

Only three engineered fields, all with explicit thresholds and used **for analytics, not as model inputs** (to avoid duplicating the raw features):

| Feature | Rule |
|---|---|
| Account-age group | 0-6 / 6-12 / 12-24 / 24-48 / 48+ months |
| Viewing category | Low < 12 h · Moderate 12-25 h · Heavy ≥ 25 h per week (≈ terciles) |
| Engagement score (0-100) | 40 % viewing hours + 25 % session duration + 20 % downloads + 15 % watchlist; Low < 35, Medium 35-65, High ≥ 65 |

`Gender` is excluded from the model (sensitive attribute) and never exposed by the API. `CustomerID` is an identifier.

## 8. Exploratory / business analytics

The **Churn Analysis** page answers the seven business questions live: highest-churn subscription type, highest-risk segments (subscription × tenure × engagement), strongest features, viewing behaviour of churned vs retained customers, churn by account-age group, count of High/Very-High customers, and *estimated monthly revenue associated with high-risk customers* (explicitly not "guaranteed loss"). Charts cover subscription, tenure, viewing, engagement, device, payment, content type and a viewing-hours histogram.

## 9. Models

Stratified 80/20 split. Positive-class weight = 2 (SMOTE deliberately not used: continuous features, moderate prevalence, better calibration). Probabilities are prior-corrected back to the base rate (`p / (p + (1-p)·w)`) so they read as calibrated risk.

| Model | Implementation |
|---|---|
| Logistic Regression | L2, mini-batch gradient descent on standardised features |
| Random Forest | 60 histogram trees, depth 10, √p feature subsampling, bootstrap |
| Gradient-Boosted Trees | 160 rounds, depth 4, Newton (2nd-order) boosting on log-loss, shrinkage 0.08, row/col subsampling, L2 leaves — the XGBoost formulation |

Threshold = max-F1 on the training set; all reported metrics come from the held-out test set. Final model = highest **PR-AUC** (tie-break ROC-AUC). The tree models are *not* assumed to win.

## 10. Evaluation

The Model Insights page shows the full comparison table (Precision, Recall, F1, ROC-AUC, PR-AUC, Accuracy, threshold), the confusion matrix, ROC and PR curves, and a plain-language explanation of each metric. On the seeded dataset the three models land within ~0.01 ROC-AUC of each other (≈0.75) and logistic regression is selected; run `npx tsx scripts/train.ts` to see the exact numbers for your build — the README intentionally does not hard-code them.

## 11. Explainability

`explainInput` computes **baseline-replacement (occlusion) attributions**: for each feature, replace the customer's value with the training mean/mode and measure the change in predicted probability. This is a single-reference Shapley approximation, model-agnostic, and maps directly onto `shap.LinearExplainer` / `shap.TreeExplainer` in a Python deployment. Global importance = mean |attribution| over 600 sampled customers.

Every customer view shows probability, risk level, top contributing factors, protective factors, an attribution chart and a natural-language explanation that uses "associated with" / "the model identified" wording — never causal claims.

## 12. API (the FastAPI role)

| Endpoint | Description |
|---|---|
| `GET /api/health` | service + model readiness |
| `POST /api/predict` | `{ churn_probability, risk_level }` |
| `POST /api/explain` | `{ top_reasons, attributions, explanation }` |
| `POST /api/predict-and-explain` | both |
| `POST /api/upload` | multipart CSV → validation report + scored rows |
| `GET /api/customers?risk=&subscription=&device=&ageGroup=&engagement=&payment=&minProb=&search=&sort=&page=` | scored customers |
| `GET /api/customers/:id` | profile + prediction + explanation |
| `GET /api/analytics` | all dashboard analytics |
| `GET /api/model` | comparison, metrics, importance, thresholds |
| `GET /api/tools` / `POST /api/tools` | MCP-style manifest / invocation |
| `POST /api/assistant` | `{ question }` → grounded answer |
| `POST /api/train` | regenerate, retrain, rescore |

Example:

```bash
curl -X POST http://localhost:3000/api/predict-and-explain -H "Content-Type: application/json" -d '{
  "SubscriptionType": "Basic", "ViewingHoursPerWeek": 7.5, "AccountAge": 8,
  "MonthlyCharges": 9.99, "TotalCharges": 79.9, "AverageViewingDuration": 55,
  "ContentDownloadsPerMonth": 6, "UserRating": 2.8, "SupportTicketsPerMonth": 3,
  "WatchlistSize": 4, "PaymentMethod": "Electronic check", "PaperlessBilling": "Yes",
  "ContentType": "Movies", "MultiDeviceAccess": "No", "DeviceRegistered": "Mobile",
  "GenrePreference": "Comedy", "ParentalControl": "No", "SubtitlesEnabled": "No"
}'
```

Missing fields are imputed (with a warning); invalid values return `422` with field-level messages.

## 13. Dashboard (the Streamlit role)

Sidebar navigation: **Dashboard · Customer Explorer · Churn Analysis · Model Insights · Prediction · AI Assistant · About Model**. KPI cards (customers, churn rate, high-risk count + associated revenue, average probability), risk-distribution donut, churn by subscription, viewing behaviour, account-age curve, top drivers, high-risk table → click-through to the customer detail view with SHAP-style explanation.

## 14. MCP-style tools & AI assistant

`src/lib/tools.ts` defines `predict_churn`, `explain_customer`, `get_customer_profile`, `get_high_risk_customers`, `get_churn_statistics`, `get_churn_drivers`, `compare_subscription_types`, `compare_groups`, `get_risk_segments`, `compare_behaviour`, `get_model_metrics`. Each calls the real model/analytics code and is exposed at `/api/tools`.

`src/lib/assistant.ts` has two engines, both grounded in those tools:

* **Deterministic intent engine (always on)** — scores the question against an intent library, extracts entities (customer ID, plan, percentage, comparison dimension, limit) and calls the matching tool. Handles phrasings such as "which customers are most likely to churn", "top 5 riskiest premium customers", "churn rate for premium users", "what does very high risk mean", "how accurate is the model", "compare genres", and returns follow-up suggestions. It never fabricates figures.
* **LLM tool-calling (optional)** — set `OPENAI_API_KEY` (and optionally `LLM_MODEL`) for OpenAI, or `LLM_BASE_URL` (e.g. `http://localhost:11434/v1`) + `LLM_MODEL` for Ollama/LM Studio/vLLM. The model is given the same tools and instructed to answer only from tool results; on any failure the assistant falls back to the deterministic engine.

```
User → Assistant → Tool router → ChurnSense tools → ML model + PostgreSQL → real results
```

## 15. Installation & running

```bash
npm install
# .env: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
npx drizzle-kit push          # create tables
npx tsx scripts/train.ts      # generate data, train, compare, select, score (≈15 s)
npm run dev                   # http://localhost:3000
```

If the database is empty, the first request auto-runs the pipeline. `POST /api/train` retrains at any time.

## 16. Limitations

* Synthetic training data — real-world performance must be re-validated.
* Predictions are correlational; intervening on a feature is not guaranteed to change the outcome.
* Models can contain bias or error; gender is excluded but other proxies may exist.
* Risk bands are business configuration (`src/lib/config.ts`), not universal boundaries.
* Predictions for training-split customers are in-sample; only the test split is a fair estimate.
* Occlusion attributions are a single-reference approximation of Shapley values.

## 17. Future improvements (not implemented)

Real-time churn monitoring · scheduled retraining pipeline · drift detection · unsupervised customer segmentation · A/B testing of retention campaigns · recommendation-system integration · automated retention workflows · cloud deployment · streaming analytics · LLM-generated business reports · causal/uplift modelling · full SHAP (KernelSHAP/TreeSHAP) implementation.

---

*Predictions represent model-estimated churn risk and should support, not replace, business decision-making.*
