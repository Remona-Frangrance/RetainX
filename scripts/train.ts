/**
 * Run the full ChurnSense pipeline from the command line:
 *
 *   npx tsx scripts/train.ts
 *
 * Generates the synthetic dataset, trains & compares the three models,
 * selects the final model, computes global attributions and persists
 * everything (scored customers + model artefacts) to PostgreSQL.
 */
import "dotenv/config";

async function main() {
  const { runPipeline } = await import("@/lib/pipeline");
  const { pool } = await import("@/db");
  const report = await runPipeline((m) => console.log(`[churnsense] ${m}`));
  console.log("\nModel comparison (held-out test set):");
  console.table(
    report.results.map((r) => ({
      Model: r.name,
      Precision: r.metrics.precision,
      Recall: r.metrics.recall,
      F1: r.metrics.f1,
      "ROC-AUC": r.metrics.rocAuc,
      "PR-AUC": r.metrics.prAuc,
      Threshold: r.metrics.threshold,
      "Train (s)": r.trainSeconds,
    })),
  );
  console.log(`Final model: ${report.finalModel}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
