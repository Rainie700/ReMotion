import assert from "node:assert/strict";
import fs from "node:fs";

import { rehabExercises } from "../js/data/rehabExercises.js";
import { exerciseService, resolvePoseAnalyzer } from "../js/data/exerciseService.js";

const categories = [
  "下肢功能",
  "平衡",
  "功能性移動",
  "步行功能",
  "上肢功能",
  "柔軟度／活動能力",
];

const removedLegacyIds = [
  "SH02", "SH03", "SH04", "SH05", "SH06", "SH07",
  "CR03", "CR04", "CR08",
  "AD01", "AD03", "AD06", "AD07", "AD08", "AD09", "AD10", "AD11", "AD12",
  "LE02", "LE04", "LE06", "LE07",
  "AK14",
];

assert.equal(rehabExercises.length, 66, "the catalog contains the completed six-domain exercise set");
assert.equal(new Set(rehabExercises.map((exercise) => exercise.exercise_id)).size, 66, "exercise ids are unique");
assert.ok(rehabExercises.every((exercise) => /^F0[1-6]-\d{2}$/.test(exercise.exercise_id)), "every public id uses F01-F06 numbering");
assert.ok(rehabExercises.every((exercise) => categories.includes(exercise.category)), "every exercise belongs to one of the six functional domains");
assert.ok(removedLegacyIds.every((id) => exerciseService.getById(id) === null), "red-marked exercises are no longer resolvable");
assert.equal(exerciseService.getById("HP10")?.exercise_id, "F02-04", "HP10 history migrates to the merged single-leg stance entry");
assert.equal(exerciseService.getById("AK13")?.exercise_id, "F02-04", "AK13 history migrates to the merged single-leg stance entry");
assert.ok(rehabExercises.every((exercise) => resolvePoseAnalyzer(exercise)), "every retained completed exercise keeps a detector route");

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
for (const exercise of rehabExercises) {
  assert.match(appSource, new RegExp('"' + exercise.exercise_id.replace("-", "\\-") + '"\\s*:'), exercise.exercise_id + " has an image-map entry");
}
for (const category of categories) {
  assert.ok(appSource.includes('"' + category + '"'), category + " is present in the category UI");
}

console.log("Six-domain catalog migration tests passed");
