// Regenerates every file in ../results from the current project + the frozen 1.0 code.
// Synthetic engineering verification only — NOT a real-person accuracy validation.
// Usage (from the project root): node docs/verification/fa5x-coordinate-scale/scripts/reproduce.mjs
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const OUT = join(HERE, "../results");
mkdirSync(OUT, { recursive: true });
const run = (args, cwd = ROOT) => {
  const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
  return { status: r.status, text: `${r.stdout || ""}${r.stderr || ""}` };
};
const save = (name, text) => { writeFileSync(join(OUT, name), text.replace(/\r\n/g, "\n")); console.log(`wrote results/${name}`); };

save("features_before_1.0.txt", run([join(HERE, "compare_features.mjs"), join(HERE, "../baseline-1.0")]).text);
save("features_after_1.1.txt", run([join(HERE, "compare_features.mjs"), ROOT]).text);
save("session_before_after.txt", run([join(HERE, "compare_session.mjs")]).text);

const lines = [];
for (const t of ["tests/fiveTimesSitToStandAssessment.test.js", "tests/fa5xMeasurementCompatibility.test.js"]) {
  const r = run([t]);
  // the 5xSTS test's git-diff probe prints git usage when the folder is not a git repo; keep only the verdict
  const verdict = r.text.split("\n").filter((l) => /tests passed|AssertionError|Error:/.test(l)).join("\n");
  lines.push(`$ node ${t}\nexit ${r.status}\n${verdict}\n`);
}
const all = run(["scripts/runAllTests.mjs"]);
lines.push(`$ node scripts/runAllTests.mjs   (npm test)\nexit ${all.status}\n${all.text.split("\n").filter((l) => /^✓|^✗|passed|failed:/.test(l)).join("\n")}\n`);
save("test_summary.txt", `Generated ${new Date().toISOString()} with node ${process.version}\n\n${lines.join("\n")}`);
