/**
 * ChurnSense tool layer (MCP-style).
 *
 * Each tool is a named, schema-described function that calls the REAL
 * prediction / analytics code. They are exposed over HTTP at /api/tools
 * (list + call) and used by the built-in AI assistant. An MCP server would
 * simply register these same functions as MCP tools.
 */

import { ensureReady } from "@/lib/bootstrap";
import { behaviourComparison, churnByGroup, customerToInput, getCustomer, getOverview, listCustomers, riskSegments } from "@/lib/analytics";
import { riskLevelFor } from "@/lib/config";
import { cleanInput } from "@/lib/ml/features";
import { explainInput, naturalLanguageExplanation, reasonPhrase } from "@/lib/ml/model";

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

const num = (v: unknown, d?: number) => (v === undefined || v === null || v === "" ? d : Number(v));

export async function predictAndExplain(raw: Record<string, unknown>, label = "This customer") {
  const { model } = await ensureReady();
  const cleaned = cleanInput(raw, model.pre);
  if (!cleaned.ok) return { ok: false as const, errors: cleaned.errors };
  const { probability, attributions } = explainInput(model, cleaned.input);
  const top = attributions.filter((a) => a.contribution > 0).slice(0, 5);
  return {
    ok: true as const,
    churn_probability: Math.round(probability * 10000) / 10000,
    risk_level: riskLevelFor(probability),
    top_reasons: top.map(reasonPhrase),
    attributions: attributions.slice(0, 8),
    explanation: naturalLanguageExplanation(label, probability, attributions),
    warnings: cleaned.warnings,
    model: model.name,
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "predict_churn",
    description: "Predict churn probability and risk level for a customer record (dataset feature names as keys).",
    inputSchema: { type: "object", properties: { customer: { type: "object" } }, required: ["customer"] },
    run: async (args) => {
      const r = await predictAndExplain((args.customer ?? args) as Record<string, unknown>);
      if (!r.ok) return r;
      return { churn_probability: r.churn_probability, risk_level: r.risk_level, model: r.model };
    },
  },
  {
    name: "explain_customer",
    description: "Explain why an existing customer (by CustomerID) is at their predicted risk level.",
    inputSchema: { type: "object", properties: { customer_id: { type: "string" } }, required: ["customer_id"] },
    run: async (args) => {
      const c = await getCustomer(String(args.customer_id ?? ""));
      if (!c) return { error: `Customer ${String(args.customer_id)} not found` };
      const r = await predictAndExplain(customerToInput(c), `Customer ${c.customerId}`);
      return r;
    },
  },
  {
    name: "get_customer_profile",
    description: "Return the stored attributes and score of a customer.",
    inputSchema: { type: "object", properties: { customer_id: { type: "string" } }, required: ["customer_id"] },
    run: async (args) => {
      const c = await getCustomer(String(args.customer_id ?? ""));
      if (!c) return { error: `Customer ${String(args.customer_id)} not found` };
      const { gender: _gender, ...safe } = c; // never expose sensitive attribute
      void _gender;
      return safe;
    },
  },
  {
    name: "get_high_risk_customers",
    description: "List customers above a churn-probability threshold, optionally filtered by subscription type.",
    inputSchema: { type: "object", properties: { min_probability: { type: "number", default: 0.6 }, subscription: { type: "string" }, limit: { type: "number", default: 20 } } },
    run: async (args) => {
      const res = await listCustomers({ minProb: num(args.min_probability, 0.6), subscription: args.subscription ? String(args.subscription) : undefined, pageSize: num(args.limit, 20), sort: "prob_desc" });
      return {
        total_matching: res.total,
        customers: res.rows.map((c) => ({ customerId: c.customerId, churnProbability: c.churnProbability, riskLevel: c.riskLevel, subscriptionType: c.subscriptionType, viewingHoursPerWeek: c.viewingHoursPerWeek, accountAge: c.accountAge, engagementCategory: c.engagementCategory })),
      };
    },
  },
  {
    name: "get_churn_statistics",
    description: "Overall churn KPIs: totals, churn rate, risk distribution, high-risk counts, associated revenue.",
    inputSchema: { type: "object", properties: {} },
    run: async () => getOverview(),
  },
  {
    name: "get_churn_drivers",
    description: "Global feature attributions of the final model (mean |impact| on churn probability).",
    inputSchema: { type: "object", properties: { top: { type: "number", default: 10 } } },
    run: async (args) => {
      const { importance, model } = await ensureReady();
      return { model: model.name, drivers: importance.slice(0, num(args.top, 10)) };
    },
  },
  {
    name: "compare_subscription_types",
    description: "Observed churn rate and predicted risk by subscription type.",
    inputSchema: { type: "object", properties: {} },
    run: async () => churnByGroup("subscriptionType"),
  },
  {
    name: "compare_groups",
    description: "Churn by any analytics dimension: device, payment, account_age, viewing, engagement, content_type.",
    inputSchema: { type: "object", properties: { dimension: { type: "string" } }, required: ["dimension"] },
    run: async (args) => {
      const map: Record<string, Parameters<typeof churnByGroup>[0]> = {
        device: "deviceRegistered",
        payment: "paymentMethod",
        account_age: "accountAgeGroup",
        viewing: "viewingCategory",
        engagement: "engagementCategory",
        content_type: "contentType",
        subscription: "subscriptionType",
        genre: "genrePreference",
      };
      const col = map[String(args.dimension)];
      if (!col) return { error: `Unknown dimension. Use one of ${Object.keys(map).join(", ")}` };
      return churnByGroup(col);
    },
  },
  {
    name: "get_risk_segments",
    description: "Highest predicted-risk customer segments (subscription × tenure × engagement).",
    inputSchema: { type: "object", properties: { limit: { type: "number", default: 8 } } },
    run: async (args) => riskSegments(num(args.limit, 8)),
  },
  {
    name: "get_model_metrics",
    description: "Model comparison table (precision, recall, F1, ROC-AUC, PR-AUC) and which model is final.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const { allModels, model } = await ensureReady();
      return { finalModel: model.name, models: allModels.map((m) => ({ name: m.name, isFinal: m.isFinal, metrics: m.metrics })) };
    },
  },
  {
    name: "compare_behaviour",
    description: "Average behavioural metrics for churned vs retained customers.",
    inputSchema: { type: "object", properties: {} },
    run: async () => behaviourComparison(),
  },
];

export function getTool(name: string) {
  return TOOLS.find((t) => t.name === name);
}
