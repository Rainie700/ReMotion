import { createCollection } from "./storageService.js";
import { seedSchedules } from "./seedData.js";
import { nowIso } from "../utils/id.js";

const schedulesCollection = createCollection("schedules", seedSchedules);

export const scheduleService = {
  list() {
    return schedulesCollection.list();
  },
  getById(id) {
    return schedulesCollection.getById(id);
  },
  getByPatientId(patientId) {
    return schedulesCollection.query((s) => s.patientId === patientId);
  },
  getByPatientAndDate(patientId, date) {
    const matches = schedulesCollection.query((s) => s.patientId === patientId && s.date === date);
    if (!matches.length) return null;
    return [...matches].sort(
      (a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0)
    )[0];
  },
  create(schedule) {
    return schedulesCollection.create(schedule);
  },
  update(id, patch) {
    return schedulesCollection.update(id, patch);
  },
  /**
   * Patches a single exercise inside a schedule (identified by its array
   * position) and recomputes the schedule's overall status from the
   * resulting exercise statuses: "completed" once every exercise is
   * completed, otherwise "in_progress".
   */
  updateExerciseAt(scheduleId, index, patch) {
    const schedule = schedulesCollection.getById(scheduleId);
    if (!schedule || !schedule.exercises[index]) return null;
    const exercises = schedule.exercises.map((ex, i) => (i === index ? { ...ex, ...patch } : ex));
    const completedCount = exercises.filter((ex) => ex.status === "completed").length;
    const status = completedCount === exercises.length ? "completed" : "in_progress";
    return schedulesCollection.update(scheduleId, { exercises, status, updatedAt: nowIso() });
  },
};
