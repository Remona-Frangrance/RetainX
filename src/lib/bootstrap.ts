import { db } from "@/db";
import { models, type ModelRow } from "@/db/schema";
import type { Preprocessor } from "@/lib/ml/features";
import type { FittedModel, GlobalImportance, ModelParams } from "@/lib/ml/model";
import { runPipeline } from "@/lib/pipeline";
import { eq } from "drizzle-orm";

type Loaded = { model: FittedModel; importance: GlobalImportance; row: ModelRow; allModels: ModelRow[] };

const g = globalThis as typeof globalThis & {
  __churnsenseLoaded?: Loaded;
  __churnsenseBootstrapping?: Promise<void>;
};

async function loadFromDb(): Promise<Loaded | null> {
  const rows = await db.select().from(models);
  const finalRow = rows.find((r) => r.isFinal);
  if (!finalRow) return null;
  const stored = finalRow.params as { params: ModelParams; pre: Preprocessor };
  if (!stored.params || !stored.pre) return null;
  return {
    model: { algorithm: stored.params.type, name: finalRow.name, params: stored.params, pre: stored.pre },
    importance: finalRow.featureImportance as GlobalImportance,
    row: finalRow,
    allModels: rows,
  };
}

/**
 * Returns the trained final model, training the whole pipeline on first use
 * when the database is empty (e.g. a fresh sandbox). Concurrent callers share
 * one bootstrap promise.
 */
export async function ensureReady(): Promise<Loaded> {
  if (g.__churnsenseLoaded) return g.__churnsenseLoaded;
  const existing = await loadFromDb();
  if (existing) {
    g.__churnsenseLoaded = existing;
    return existing;
  }
  if (!g.__churnsenseBootstrapping) {
    g.__churnsenseBootstrapping = runPipeline((m) => console.log(`[churnsense] ${m}`))
      .then(() => undefined)
      .finally(() => {
        g.__churnsenseBootstrapping = undefined;
      });
  }
  await g.__churnsenseBootstrapping;
  const loaded = await loadFromDb();
  if (!loaded) throw new Error("Model bootstrap failed");
  g.__churnsenseLoaded = loaded;
  return loaded;
}

export async function isReady(): Promise<boolean> {
  if (g.__churnsenseLoaded) return true;
  const [row] = await db.select({ id: models.id }).from(models).where(eq(models.isFinal, true)).limit(1);
  return Boolean(row);
}

export function invalidateModelCache() {
  g.__churnsenseLoaded = undefined;
}
