/**
 * `npm test` — runs every "test:*" script in package.json (each is a plain
 * `node tests/<name>.test.js`) one after another and exits non-zero if any fails.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const entries = Object.entries(scripts).filter(([name, cmd]) => name.startsWith("test:") && /^node tests\/\S+\.test\.js$/.test(cmd));

const failed = [];
for (const [name, cmd] of entries) {
  const file = cmd.replace(/^node /, "");
  const run = spawnSync(process.execPath, [file], { cwd: root, encoding: "utf8" });
  if (run.status === 0) {
    console.log(`✓ ${name}`);
  } else {
    failed.push(name);
    console.log(`✗ ${name}\n${(run.stdout || "").trim()}\n${(run.stderr || "").trim()}`);
  }
}
console.log(`\n${entries.length - failed.length} / ${entries.length} test scripts passed`);
if (failed.length) {
  console.log(`failed: ${failed.join(", ")}`);
  process.exit(1);
}
