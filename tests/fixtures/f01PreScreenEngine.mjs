// The Phase C generator as it behaved BEFORE the G01 condition screen (docs/F01_G01_IMPLEMENTABLE_CONDITIONS.md):
// the current source with only the G01 switch turned off, loaded from a temporary copy. Tests use it for
// fixtures that stand for EXISTING plans (made before the screen; never rewritten) and to keep the pre-screen
// Phase C regression hash. New G01 plans are tested against the real generator.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "js", "data");
const SWITCH = "const screenG01 = goal.goalId === F01_G01_SCREEN_GOAL_ID;";
const src = readFileSync(join(dataDir, "f01GoalRecommendation.js"), "utf8");
if (src.split(SWITCH).length !== 2) throw new Error("G01 switch not found exactly once in f01GoalRecommendation.js");
const file = join(mkdtempSync(join(tmpdir(), "f01-prescreen-")), "f01GoalRecommendation.prescreen.mjs");
writeFileSync(file, src.replace(SWITCH, "const screenG01 = false;")
  .replace(/from "\.\/([^"]+)"/g, (_, f) => `from "${pathToFileURL(join(dataDir, f)).href}"`));

export const { generateF01GoalRecommendation: generatePreScreenF01GoalRecommendation } = await import(pathToFileURL(file).href);
