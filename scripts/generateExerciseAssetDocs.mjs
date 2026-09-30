/**
 * Writes the exercise asset audit + production backlog from the ONE source of
 * truth (js/data/exerciseAssets.js) and the exercise catalog. Run:
 *   node scripts/generateExerciseAssetDocs.mjs
 * tests/selfPracticeLibrary.test.js checks the committed files stay in sync.
 */
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rehabExercises } from "../js/data/rehabExercises.js";
import { EXERCISE_ASSET_AUDIT } from "../js/data/exerciseAssets.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMANTIC = { confirmed: "yes", wrong: "no", needs_review: "unclear", missing: "n/a" };

export function buildExerciseAssetDocs() {
  const audit = rehabExercises.map((r) => {
    const a = EXERCISE_ASSET_AUDIT[r.exercise_id] || { status: "missing", file: null };
    const currentAsset = a.file || a.candidate || null;
    return {
      exerciseId: r.exercise_id,
      exerciseName: r.exercise_name,
      domain: r.category,
      currentAsset,
      fileExists: currentAsset ? existsSync(join(root, "public", currentAsset)) : false,
      semanticMatch: SEMANTIC[a.status],
      status: a.status,
      note: a.note || null,
    };
  });
  const backlog = rehabExercises
    .filter((r) => (EXERCISE_ASSET_AUDIT[r.exercise_id] || {}).status !== "confirmed")
    .map((r) => {
      const a = EXERCISE_ASSET_AUDIT[r.exercise_id] || { status: "missing" };
      return {
        exerciseId: r.exercise_id,
        name: r.exercise_name,
        domain: r.category,
        currentStatus: a.status,
        existingFile: a.file || a.candidate || null,
        reviewNote: a.note || null,
        description: r.description,
        steps: r.steps,
        cameraAngle: r.cameraAngle,
        targetMuscles: r.target_muscle,
        recommendedAspectRatio: "4:3",
        assetFilename: `/images/exercise/${r.exercise_id}.png`,
      };
    });
  const count = (s) => audit.filter((x) => x.status === s).length;
  return {
    audit: { generatedFrom: "js/data/exerciseAssets.js", catalogCount: audit.length, summary: { confirmed: count("confirmed"), wrong: count("wrong"), needs_review: count("needs_review"), missing: count("missing") }, items: audit },
    backlog: { generatedFrom: "js/data/exerciseAssets.js", note: "Exercises without a confirmed image. Produce one image per movement from its own steps/description; 4:3 frame, whole body (head, hands, feet) inside the frame, ReMotion light background.", count: backlog.length, items: backlog },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { audit, backlog } = buildExerciseAssetDocs();
  writeFileSync(join(root, "docs/specs/exercise_asset_audit.json"), JSON.stringify(audit, null, 2) + "\n");
  writeFileSync(join(root, "docs/specs/exercise_asset_backlog.json"), JSON.stringify(backlog, null, 2) + "\n");
  console.log("audit", audit.summary, "backlog", backlog.count);
}
