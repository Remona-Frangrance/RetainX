import { ensureReady } from "@/lib/bootstrap";
import { CATEGORICAL_FEATURES, NUMERIC_FEATURES, riskLevelFor } from "@/lib/config";
import { cleanInput } from "@/lib/ml/features";
import { explainInput, predictInput, reasonPhrase } from "@/lib/ml/model";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ROWS = 5000;
const REQUIRED = [...NUMERIC_FEATURES, ...Object.keys(CATEGORICAL_FEATURES)];

/** Minimal RFC-4180-ish CSV parser (handles quotes, CRLF). */
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      cur.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      if (cur.some((c) => c.trim() !== "")) rows.push(cur);
      cur = [];
    } else field += ch;
  }
  cur.push(field);
  if (cur.some((c) => c.trim() !== "")) rows.push(cur);
  const header = (rows.shift() ?? []).map((h) => h.replace(/^\uFEFF/, "").trim());
  return { header, rows };
}

/** POST /api/upload (multipart/form-data, field `file`) — batch scoring. */
export async function POST(req: Request) {
  let text: string;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return Response.json({ error: "Upload a CSV file in the `file` field." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: "File too large (max 10 MB)." }, { status: 413 });
    text = await file.text();
  } catch {
    return Response.json({ error: "Could not read the uploaded file. Send multipart/form-data with a `file` field." }, { status: 400 });
  }

  const { header, rows } = parseCsv(text);
  if (!header.length || !rows.length) return Response.json({ error: "The CSV appears to be empty or has no data rows." }, { status: 422 });

  const lowerHeader = header.map((h) => h.toLowerCase());
  const missing = REQUIRED.filter((c) => !lowerHeader.includes(c.toLowerCase()));
  const extra = header.filter((h) => !REQUIRED.map((c) => c.toLowerCase()).includes(h.toLowerCase()) && !["customerid", "churn", "gender"].includes(h.toLowerCase()));
  if (missing.length > REQUIRED.length / 2) {
    return Response.json({ error: "This does not look like a ChurnSense customer file.", details: { missingColumns: missing, expectedColumns: REQUIRED } }, { status: 422 });
  }

  const { model } = await ensureReady();
  const idIdx = lowerHeader.indexOf("customerid");
  const results: Record<string, unknown>[] = [];
  const rowErrors: { row: number; errors: string[] }[] = [];
  let warningsCount = 0;
  const truncated = rows.length > MAX_ROWS;

  rows.slice(0, MAX_ROWS).forEach((cells, i) => {
    const raw: Record<string, unknown> = {};
    header.forEach((h, j) => (raw[h] = cells[j]));
    const cleaned = cleanInput(raw, model.pre);
    if (!cleaned.ok) {
      rowErrors.push({ row: i + 2, errors: cleaned.errors });
      return;
    }
    warningsCount += cleaned.warnings.length;
    const p = predictInput(model, cleaned.input);
    const { attributions } = explainInput(model, cleaned.input);
    const top = attributions.filter((a) => a.contribution > 0).slice(0, 3).map(reasonPhrase);
    results.push({
      CustomerID: idIdx >= 0 ? cells[idIdx] : `ROW-${i + 2}`,
      ChurnProbability: Math.round(p * 10000) / 10000,
      RiskLevel: riskLevelFor(p),
      SubscriptionType: cleaned.input.SubscriptionType,
      ViewingHoursPerWeek: cleaned.input.ViewingHoursPerWeek,
      AccountAge: cleaned.input.AccountAge,
      TopReasons: top.join(" | "),
    });
  });

  results.sort((a, b) => (b.ChurnProbability as number) - (a.ChurnProbability as number));
  const riskCounts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.RiskLevel as string] = (acc[r.RiskLevel as string] ?? 0) + 1;
    return acc;
  }, {});

  return Response.json({
    summary: {
      totalRows: rows.length,
      scored: results.length,
      failed: rowErrors.length,
      imputedValues: warningsCount,
      truncated,
      maxRows: MAX_ROWS,
      missingColumns: missing,
      ignoredColumns: extra,
      riskCounts,
      avgProbability: results.length ? Math.round((results.reduce((s, r) => s + (r.ChurnProbability as number), 0) / results.length) * 10000) / 10000 : 0,
    },
    results,
    rowErrors: rowErrors.slice(0, 50),
    model: model.name,
  });
}
