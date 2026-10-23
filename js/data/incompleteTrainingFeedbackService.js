import { trackingCycleService } from "./trackingCycleService.js";
import { recommendationService } from "./recommendationService.js";
import { exerciseService } from "./exerciseService.js";
import { createCollection, storageService } from "./storageService.js";
import { buildIncompleteTrainingProgress } from "./incompleteTrainingFeedback.js";
const analysis = createCollection("analysisRecords");
export function currentIncompleteTrainingProgress(patientId, dateKey) {
  if (["failed", "loading"].includes(storageService.getOptionalCloudLoadStatus("trackingCycles"))) return null;
  const cycle = trackingCycleService.getActiveTrackingCycle(patientId);
  return buildIncompleteTrainingProgress({ patientId, dateKey, cycle, recommendation: cycle && recommendationService.getById(cycle.recommendationId), records: analysis.query(r => r.patientId === patientId), getCatalog: id => exerciseService.getById(id) });
}
