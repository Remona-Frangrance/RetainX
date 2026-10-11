/**
 * ChurnSense AI Business Assistant.
 *
 * Two execution paths, both grounded in the real tool layer (src/lib/tools.ts):
 *
 * 1. LLM tool-calling (optional) — if OPENAI_API_KEY or LLM_BASE_URL is set,
 *    an OpenAI-compatible chat model (OpenAI, Ollama, LM Studio, vLLM…) is
 *    given the tools and must answer only from tool results.
 * 2. Deterministic intent engine (always available) — scores the question
 *    against a library of intents, extracts entities (customer id, plan,
 *    percentage, dimension) and calls the matching tool. It never invents data.
 */

import { behaviourComparison, churnByGroup, getCustomer, getOverview, listCustomers, riskSegments } from "@/lib/analytics";
import { ensureReady } from "@/lib/bootstrap";
import { RISK_THRESHOLDS } from "@/lib/config";
import type { Metrics } from "@/lib/ml/metrics";
import { getTool, predictAndExplain, TOOLS } from "@/lib/tools";

export type AssistantReply = { answer: string; tool: string; data?: unknown; engine: "llm" | "rules"; suggestions?: string[] };

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmtInt = (x: number) => Math.round(x).toLocaleString("en-US");
const money = (x: number) => `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------

type Entities = {
  customerId?: string;
  plan?: "Basic" | "Standard" | "Premium";
  percent?: number;
  dimension?: Parameters<typeof churnByGroup>[0];
  dimensionLabel?: string;
  limit?: number;
};

const DIMENSIONS: { re: RegExp; col: Parameters<typeof churnByGroup>[0]; label: string }[] = [
  { re: /\bdevice|tv\b|mobile|tablet|computer/, col: "deviceRegistered", label: "registered device" },
  { re: /payment|pay(ing|s)? (by|with)|credit card|bank transfer|electronic check|mailed check/, col: "paymentMethod", label: "payment method" },
  { re: /genre|action|comedy|drama|sci-?fi|fantasy/, col: "genrePreference", label: "genre preference" },
  { re: /content type|movies|tv shows/, col: "contentType", label: "content type" },
  { re: /engagement/, col: "engagementCategory", label: "engagement category" },
  { re: /viewing (category|group|level)|heavy viewer|low viewer|moderate viewer/, col: "viewingCategory", label: "viewing category" },
  { re: /account[- ]age|tenure|age group|new customers|long[- ]term|months old/, col: "accountAgeGroup", label: "account-age group" },
  { re: /multi[- ]?device/, col: "multiDeviceAccess", label: "multi-device access" },
  { re: /paperless/, col: "paperlessBilling", label: "paperless billing" },
  { re: /subscription|plan|tier|basic|standard|premium/, col: "subscriptionType", label: "subscription type" },
];

function extract(qRaw: string): Entities {
  const q = qRaw.toLowerCase();
  const e: Entities = {};
  const id = qRaw.match(/\b(c\s?\d{4,})\b/i);
  if (id) e.customerId = id[1].replace(/\s/g, "").toUpperCase();
  const plan = q.match(/\b(basic|standard|premium)\b/);
  if (plan) e.plan = cap(plan[1]) as Entities["plan"];
  const p = q.match(/(\d{1,3}(?:\.\d+)?)\s*(%|percent)/) ?? q.match(/\b0\.(\d{1,2})\b/);
  if (p) e.percent = p[2] ? Number(p[1]) : Number(`0.${p[1]}`) * 100;
  const lim = q.match(/\b(?:top|first|show|list)\s+(\d{1,3})\b/) ?? q.match(/\b(\d{1,3})\s+(?:customers|accounts|users)\b/);
  if (lim) e.limit = Math.min(50, Math.max(1, Number(lim[1])));
  for (const d of DIMENSIONS) {
    if (d.re.test(q)) {
      e.dimension = d.col;
      e.dimensionLabel = d.label;
      break;
    }
  }
  return e;
}

// ---------------------------------------------------------------------------
// Intent library (scored keyword matching)
// ---------------------------------------------------------------------------

type Intent = { name: string; patterns: RegExp[]; weight?: number; run: (e: Entities, q: string) => Promise<AssistantReply> };

const RISK_LIST_SUGGESTIONS = ["Which segments have the highest risk?", "What are the main churn drivers?", "How much revenue is associated with high-risk customers?"];

const INTENTS: Intent[] = [
  {
    name: "greeting",
    patterns: [/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/, /\b(help|what can you do|how do you work|what can i ask)\b/],
    weight: 3,
    run: async () => ({
      engine: "rules",
      tool: "help",
      answer:
        "Hello! I'm the ChurnSense assistant. I answer using live calls to the churn model and the customer database, so every number you see is real. You can ask about overall KPIs, risk levels, churn by plan / device / payment / tenure, the main churn drivers, high-risk segments, revenue at risk, model performance, or any individual customer (e.g. \"why is C113657 at risk?\").",
      suggestions: ["How many customers are high risk?", "Which subscription type has the highest churn?", "What are the main churn drivers?", "Show customers with more than 80% churn probability"],
    }),
  },
  {
    name: "explain_customer",
    patterns: [/\bwhy\b/, /explain|reason|factor|driver|because|what makes/],
    weight: 2,
    run: async (e) => {
      const r = await predictAndExplainForCustomer(e.customerId!);
      if ("error" in r) return { engine: "rules", tool: "explain_customer", answer: r.error };
      return {
        engine: "rules",
        tool: "explain_customer",
        answer: `${r.explanation}\n\nTop contributing factors:\n${r.top_reasons.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
        data: r,
        suggestions: [`Show the profile of ${e.customerId}`, "Show customers with more than 80% churn probability"],
      };
    },
  },
  {
    name: "customer_profile",
    patterns: [/profile|details|show|who is|tell me about|lookup|look up|find|customer/],
    weight: 1,
    run: async (e) => {
      const c = await getCustomer(e.customerId!);
      if (!c) return { engine: "rules", tool: "get_customer_profile", answer: `I couldn't find customer ${e.customerId}. IDs look like C100001 – C${100000 + (await getOverview()).totalCustomers}.` };
      return {
        engine: "rules",
        tool: "get_customer_profile",
        answer: `Customer ${c.customerId} — churn probability ${pct(c.churnProbability)} (${c.riskLevel} risk).\n• Plan: ${c.subscriptionType}, $${c.monthlyCharges.toFixed(2)}/month, ${c.accountAge} months tenure (${c.accountAgeGroup})\n• Viewing: ${c.viewingHoursPerWeek} h/week, ${c.averageViewingDuration} min average session, ${c.contentDownloadsPerMonth} downloads/month, watchlist ${c.watchlistSize}\n• Engagement: ${c.engagementCategory} (${c.engagementScore}/100), rating ${c.userRating}/5, ${c.supportTicketsPerMonth} support tickets/month\n• Device: ${c.deviceRegistered}, multi-device ${c.multiDeviceAccess.toLowerCase()}, pays by ${c.paymentMethod.toLowerCase()}`,
        data: c,
        suggestions: [`Why is ${c.customerId} at risk?`],
      };
    },
  },
  {
    name: "customers_above_threshold",
    patterns: [/more than|above|over|greater|exceed|at least|higher than|\d+\s*%/],
    weight: 2,
    run: async (e) => {
      const min = (e.percent ?? 60) / 100;
      const res = await listCustomers({ minProb: min, subscription: e.plan, pageSize: e.limit ?? 10, sort: "prob_desc" });
      const list = res.rows.map((c) => `${c.customerId} — ${pct(c.churnProbability)}, ${c.subscriptionType}, ${c.viewingHoursPerWeek} h/wk, ${c.accountAge} mo`).join("\n");
      return {
        engine: "rules",
        tool: "get_high_risk_customers",
        answer: `${fmtInt(res.total)} customers${e.plan ? ` on the ${e.plan} plan` : ""} have a churn probability above ${Math.round(min * 100)}%.${res.total ? `\n\nTop ${res.rows.length}:\n${list}` : ""}`,
        data: { total: res.total, customers: res.rows.map(({ gender: _g, ...r }) => (void _g, r)) },
        suggestions: res.rows[0] ? [`Why is ${res.rows[0].customerId} at risk?`, ...RISK_LIST_SUGGESTIONS.slice(0, 1)] : RISK_LIST_SUGGESTIONS,
      };
    },
  },
  {
    name: "riskiest_customers",
    patterns: [/most likely to churn|riskiest|highest[- ]risk customers|top .*(risk|churn)|who (is|are) (most )?likely|list .*high[- ]risk|show .*high[- ]risk|which customers|at[- ]risk customers|very high risk customers/],
    weight: 3,
    run: async (e) => {
      const res = await listCustomers({ subscription: e.plan, pageSize: e.limit ?? 10, sort: "prob_desc" });
      const list = res.rows.map((c, i) => `${i + 1}. ${c.customerId} — ${pct(c.churnProbability)} (${c.riskLevel}), ${c.subscriptionType}, ${c.viewingHoursPerWeek} h/wk, ${c.accountAge} mo`).join("\n");
      return {
        engine: "rules",
        tool: "get_high_risk_customers",
        answer: `The ${res.rows.length} customers${e.plan ? ` on the ${e.plan} plan` : ""} with the highest predicted churn probability:\n${list}`,
        data: res.rows.map(({ gender: _g, ...r }) => (void _g, r)),
        suggestions: res.rows[0] ? [`Why is ${res.rows[0].customerId} at risk?`, "How many customers are high risk?"] : undefined,
      };
    },
  },
  {
    name: "safest_customers",
    patterns: [/lowest[- ]risk|safest|least likely|most loyal|low[- ]risk customers/],
    weight: 3,
    run: async (e) => {
      const res = await listCustomers({ subscription: e.plan, pageSize: e.limit ?? 10, sort: "prob_asc" });
      const list = res.rows.map((c, i) => `${i + 1}. ${c.customerId} — ${pct(c.churnProbability)}, ${c.subscriptionType}, ${c.viewingHoursPerWeek} h/wk, ${c.accountAge} mo`).join("\n");
      return { engine: "rules", tool: "get_high_risk_customers", answer: `Lowest predicted churn risk${e.plan ? ` on the ${e.plan} plan` : ""}:\n${list}`, data: res.rows.map(({ gender: _g, ...r }) => (void _g, r)) };
    },
  },
  {
    name: "plan_stats",
    patterns: [/how many|count|number|churn rate|risk|customers|revenue|average|avg/],
    weight: 2,
    run: async (e) => {
      const stats = await churnByGroup("subscriptionType");
      const s = stats.find((x) => x.group === e.plan)!;
      return {
        engine: "rules",
        tool: "compare_subscription_types",
        answer: `${s.group} plan: ${fmtInt(s.customers)} customers, observed churn rate ${pct(s.churnRate)}, average predicted risk ${pct(s.avgProbability)}, ${fmtInt(s.highRisk)} High/Very-High-risk customers (${pct(s.highRiskRate)}), average viewing ${s.avgViewingHours} h/week, average charge $${s.avgMonthlyCharges.toFixed(2)}/month.`,
        data: s,
        suggestions: ["Compare churn across subscription types", `Show ${e.plan} customers with more than 70% churn probability`],
      };
    },
  },
  {
    name: "compare_dimension",
    patterns: [/compare|by |across|versus|vs\.?|breakdown|split|per |which .* (highest|lowest|most|least)|differ/],
    weight: 2,
    run: async (e) => {
      const stats = await churnByGroup(e.dimension!);
      const top = [...stats].sort((a, b) => b.churnRate - a.churnRate)[0];
      const lines = stats.map((s) => `• ${s.group}: ${pct(s.churnRate)} observed churn · ${pct(s.avgProbability)} avg predicted risk · ${fmtInt(s.highRisk)} high-risk of ${fmtInt(s.customers)}`).join("\n");
      return {
        engine: "rules",
        tool: e.dimension === "subscriptionType" ? "compare_subscription_types" : "compare_groups",
        answer: `Churn by ${e.dimensionLabel}:\n${lines}\n\n${top.group} shows the highest observed churn rate (${pct(top.churnRate)}). This is an association in the data, not evidence that the ${e.dimensionLabel} itself causes churn.`,
        data: stats,
        suggestions: ["What are the main churn drivers?", "Which segments have the highest risk?"],
      };
    },
  },
  {
    name: "drivers",
    patterns: [/driver|feature|important|influenc|why do customers|what causes|cause|predictor|signal|contribut|shap|explain the model/],
    weight: 2,
    run: async () => {
      const { importance, model } = await ensureReady();
      const top = importance.slice(0, 7);
      const lines = top.map((d, i) => `${i + 1}. ${d.label} — mean |impact| ${(d.meanAbsImpact * 100).toFixed(1)} pts${d.meanSignedImpact > 0 ? " (tends to raise risk)" : ""}`).join("\n");
      return {
        engine: "rules",
        tool: "get_churn_drivers",
        answer: `The features the ${model.name} model relies on most, ranked by mean absolute change in predicted churn probability:\n${lines}\n\nThese are model attributions — associations with the prediction — not proven causes of churn.`,
        data: top,
        suggestions: ["How does viewing behaviour differ for churned customers?", "How does account age relate to churn?"],
      };
    },
  },
  {
    name: "segments",
    patterns: [/segment|cohort|group of customers|which groups|combination/],
    weight: 2,
    run: async (e) => {
      const segs = await riskSegments(e.limit ?? 6);
      const lines = segs.map((s, i) => `${i + 1}. ${s.segment} — ${pct(s.avgProbability)} avg risk, ${pct(s.observedChurnRate)} observed churn, ${fmtInt(s.customers)} customers, ${money(s.monthlyRevenue)}/mo`).join("\n");
      return { engine: "rules", tool: "get_risk_segments", answer: `Highest predicted-risk segments (subscription × tenure × engagement, ≥ 50 customers):\n${lines}`, data: segs, suggestions: ["How much revenue is associated with high-risk customers?"] };
    },
  },
  {
    name: "behaviour",
    patterns: [/view|watch|hours|engag|behav|rating|ticket|support|download|watchlist|session|duration|activity|usage/],
    weight: 1,
    run: async (_e, q) => {
      const cmp = await behaviourComparison();
      const focus = cmp.filter((c) => {
        const m = c.metric.toLowerCase();
        return (/view|watch|hours/.test(q) && m.startsWith("viewing")) || (/rating/.test(q) && m.startsWith("user")) || (/ticket|support/.test(q) && m.startsWith("support")) || (/download/.test(q) && m.startsWith("content")) || (/watchlist/.test(q) && m.startsWith("watchlist")) || (/session|duration/.test(q) && m.startsWith("avg")) || (/engag/.test(q) && m.startsWith("engagement"));
      });
      const head = focus.length ? focus.map((c) => `${c.metric}: churned ${c.churned} vs retained ${c.retained}`).join("; ") + "." : "";
      const lines = cmp.map((c) => `• ${c.metric}: ${c.churned} (churned) vs ${c.retained} (retained)`).join("\n");
      return { engine: "rules", tool: "compare_behaviour", answer: `${head ? head + "\n\n" : ""}Average behaviour, churned vs retained customers:\n${lines}`, data: cmp, suggestions: ["Compare churn by engagement", "Compare churn by viewing category"] };
    },
  },
  {
    name: "tenure",
    patterns: [/account[- ]age|tenure|how long|new customers|first (few )?months|months/],
    weight: 2,
    run: async () => {
      const stats = await churnByGroup("accountAgeGroup");
      const cmp = await behaviourComparison();
      const age = cmp.find((c) => c.metric.startsWith("Account"));
      const lines = stats.map((s) => `• ${s.group}: ${pct(s.churnRate)} observed churn, ${pct(s.avgProbability)} avg predicted risk (${fmtInt(s.customers)} customers)`).join("\n");
      return { engine: "rules", tool: "compare_groups", answer: `Average tenure is ${age?.churned} months for churned vs ${age?.retained} months for retained customers. Observed churn by account-age group:\n${lines}`, data: stats };
    },
  },
  {
    name: "revenue",
    patterns: [/revenue|money|\$|dollar|charges|mrr|arr|worth|value at risk|financial/],
    weight: 2,
    run: async () => {
      const o = await getOverview();
      return {
        engine: "rules",
        tool: "get_churn_statistics",
        answer: `Estimated monthly subscription revenue associated with High/Very-High-risk customers: ${money(o.highRiskMonthlyRevenue)} of ${money(o.totalMonthlyRevenue)} total (${pct(o.highRiskMonthlyRevenue / o.totalMonthlyRevenue)}). That is revenue currently tied to ${fmtInt(o.highRiskCustomers)} at-risk accounts — not a guaranteed future loss.`,
        data: o,
        suggestions: ["Which segments have the highest risk?"],
      };
    },
  },
  {
    name: "model_performance",
    patterns: [/model|accura|precision|recall|f1|auc|roc|performance|how good|reliable|confiden|metric|threshold|algorithm|logistic|random forest|xgboost|gradient/],
    weight: 2,
    run: async () => {
      const { allModels, model } = await ensureReady();
      const lines = allModels.map((m) => {
        const x = m.metrics as Metrics;
        return `• ${m.name}${m.isFinal ? " (final)" : ""}: ROC-AUC ${x.rocAuc.toFixed(3)}, PR-AUC ${x.prAuc.toFixed(3)}, recall ${pct(x.recall)}, precision ${pct(x.precision)}, F1 ${x.f1.toFixed(3)}`;
      });
      const f = allModels.find((m) => m.isFinal)!.metrics as Metrics;
      return {
        engine: "rules",
        tool: "get_model_metrics",
        answer: `The final model is ${model.name}, selected by PR-AUC on a held-out test set of ${fmtInt(f.nTest)} customers.\n${lines.join("\n")}\n\nAt the decision threshold of ${f.threshold} it catches ${pct(f.recall)} of actual churners (recall) with ${pct(f.precision)} precision. See Model Insights for curves and the confusion matrix.`,
        data: allModels.map((m) => ({ name: m.name, isFinal: m.isFinal, metrics: m.metrics })),
      };
    },
  },
  {
    name: "risk_bands",
    patterns: [/what (is|does|do) .*(risk level|high risk|very high|medium|low risk)|risk (band|level|threshold|categor)|define|meaning of/],
    weight: 3,
    run: async () => {
      const o = await getOverview();
      const bands = RISK_THRESHOLDS.map((b) => {
        const d = o.riskDistribution.find((r) => r.level === b.level);
        return `• ${b.level}: ${Math.round(b.min * 100)}–${Math.round(Math.min(b.max, 1) * 100)}% churn probability — ${fmtInt(d?.count ?? 0)} customers (${pct(d?.share ?? 0)})`;
      }).join("\n");
      return { engine: "rules", tool: "get_churn_statistics", answer: `Risk levels are configurable product bands over the model's churn probability:\n${bands}\n\nThey are business settings (src/lib/config.ts), not scientific boundaries.`, data: o.riskDistribution };
    },
  },
  {
    name: "overview",
    patterns: [/high[- ]?risk|very high|how many|churn rate|overview|summary|kpi|total|overall|status|dashboard|customers/],
    weight: 1,
    run: async () => {
      const o = await getOverview();
      return {
        engine: "rules",
        tool: "get_churn_statistics",
        answer: `Customer base: ${fmtInt(o.totalCustomers)} customers, observed churn rate ${pct(o.churnRate)} (${fmtInt(o.churned)} churned, ${fmtInt(o.retained)} retained).\n\nPredicted risk: ${fmtInt(o.highRiskCustomers)} customers are High or Very High risk (${fmtInt(o.veryHighRisk)} Very High); average churn probability ${pct(o.avgChurnProbability)}.\nRisk bands: ${o.riskDistribution.map((r) => `${r.level} ${fmtInt(r.count)}`).join(" · ")}.\nMonthly revenue associated with high-risk customers: ${money(o.highRiskMonthlyRevenue)}.`,
        data: o,
        suggestions: ["Which subscription type has the highest churn?", "Show customers with more than 80% churn probability", "What are the main churn drivers?"],
      };
    },
  },
];

async function predictAndExplainForCustomer(id: string) {
  const c = await getCustomer(id);
  if (!c) return { error: `I couldn't find customer ${id}.` };
  const { customerToInput } = await import("@/lib/analytics");
  const r = await predictAndExplain(customerToInput(c), `Customer ${c.customerId}`);
  if (!r.ok) return { error: `Could not score ${id}: ${r.errors.join("; ")}` };
  return r;
}

export async function answerWithRules(question: string): Promise<AssistantReply> {
  const q = question.toLowerCase().trim();
  const e = extract(question);

  // hard entity routing first
  if (e.customerId) {
    const wantsWhy = /\bwhy\b|explain|reason|factor|driver|because/.test(q);
    return (wantsWhy ? INTENTS.find((i) => i.name === "explain_customer") : INTENTS.find((i) => i.name === "customer_profile"))!.run(e, q);
  }

  const scored = INTENTS.map((intent) => {
    let score = 0;
    for (const p of intent.patterns) if (p.test(q)) score += intent.weight ?? 1;
    // entity gating
    if (intent.name === "customers_above_threshold" && e.percent === undefined) score = 0;
    if (intent.name === "plan_stats" && (!e.plan || /compare|vs|versus|across|which (plan|subscription)/.test(q))) score = 0;
    if (intent.name === "compare_dimension" && !e.dimension) score = 0;
    if (intent.name === "compare_dimension" && e.dimension && /compare|by |across|versus|vs|which|highest|lowest|breakdown|differ|rate/.test(q)) score += 2;
    if (intent.name === "explain_customer" || intent.name === "customer_profile") score = 0; // need id
    if (intent.name === "tenure" && e.dimension === "accountAgeGroup") score += 1;
    if (intent.name === "behaviour" && /compare .*by|churn by/.test(q)) score -= 2;
    return { intent, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best.score > 0) return best.intent.run(e, q);

  return {
    engine: "rules",
    tool: "help",
    answer: `I couldn't map that to the data I have. I can answer questions about: overall KPIs and risk levels, churn by subscription / device / payment / tenure / engagement / genre, the main churn drivers, highest-risk segments, revenue at risk, model performance, and any individual customer by ID (e.g. "why is C113657 at risk?").`,
    suggestions: ["How many customers are high risk?", "Which subscription type has the highest churn?", "What are the main churn drivers?", "Which customers are most likely to churn?"],
  };
}

// ---------------------------------------------------------------------------
// Optional LLM path (OpenAI-compatible chat completions with tool calling)
// ---------------------------------------------------------------------------

type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]; tool_call_id?: string };

export function llmConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.LLM_BASE_URL);
}

export async function answerWithLlm(question: string, history: { role: "user" | "assistant"; text: string }[] = []): Promise<AssistantReply | null> {
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = process.env.OPENAI_API_KEY ?? "ollama";
  const modelName = process.env.LLM_MODEL ?? "gpt-4o-mini";

  const messages: ChatMsg[] = [
    {
      role: "system",
      content:
        "You are the ChurnSense AI business assistant for a streaming subscription company. Answer ONLY using the results of the tools provided; never invent numbers or customers. Use concise business language. Describe model attributions as associations ('the model associated…'), never as causes. Percentages with one decimal. If a question cannot be answered with the tools, say so.",
    },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.text }) as ChatMsg),
    { role: "user", content: question },
  ];
  const toolDefs = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  const used: string[] = [];
  let lastData: unknown;

  for (let step = 0; step < 4; step++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelName, messages, tools: toolDefs, tool_choice: "auto", temperature: 0.1 }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message: ChatMsg }[] };
    const msg = json.choices?.[0]?.message;
    if (!msg) return null;
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      return { engine: "llm", tool: used.join(", ") || "none", answer: msg.content ?? "", data: lastData };
    }
    for (const call of msg.tool_calls) {
      const tool = getTool(call.function.name);
      let result: unknown = { error: "unknown tool" };
      if (tool) {
        try {
          result = await tool.run(JSON.parse(call.function.arguments || "{}"));
        } catch (err) {
          result = { error: (err as Error).message };
        }
      }
      used.push(call.function.name);
      lastData = result;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
    }
  }
  return null;
}

export async function answerQuestion(question: string, history: { role: "user" | "assistant"; text: string }[] = []): Promise<AssistantReply> {
  if (llmConfigured()) {
    try {
      const r = await answerWithLlm(question, history);
      if (r && r.answer.trim()) return r;
    } catch {
      /* fall through to rules */
    }
  }
  return answerWithRules(question);
}
