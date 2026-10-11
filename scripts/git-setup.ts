import { execSync } from "child_process";

function run(cmd: string) {
  console.log(`> ${cmd}`);
  try {
    const out = execSync(cmd, { stdio: "pipe" }).toString();
    if (out.trim()) console.log(out.trim());
  } catch (err: any) {
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    throw err;
  }
}

try {
  run("git init");
  run("git branch -M main");
  run("git add .");
  run('git commit -m "feat: launch RetainX autonomous churn intelligence platform"');
  try {
    run("git remote remove origin");
  } catch {}
  run("git remote add origin https://github.com/Remona-Frangrance/RetainX.git");
  console.log("\nStaged and committed successfully. Ready to push.");
} catch (e) {
  console.error("Git step failed:", e);
}
