import { createCollection } from "./storageService.js";
import { seedGameProfiles } from "./seedData.js";

const gameProfilesCollection = createCollection("gameProfiles", seedGameProfiles);

function createDefaultProfile(patientId) {
  return {
    id: patientId,
    patientId,
    level: 1,
    xp: 0,
    currentLevelXp: 0,
    nextLevelXp: 100,
    stars: 0,
    streakDays: 0,
    lastTrainingDate: null,
    mapStage: 1,
    unlockedBadges: [],
  };
}

function getOrCreateProfile(patientId) {
  const existing = gameProfilesCollection.getById(patientId);
  if (existing) return existing;
  return gameProfilesCollection.create(createDefaultProfile(patientId));
}

export const gameService = {
  list() {
    return gameProfilesCollection.list();
  },
  getByPatientId(patientId) {
    return gameProfilesCollection.find((g) => g.patientId === patientId);
  },
  getOrCreateByPatientId(patientId) {
    return getOrCreateProfile(patientId);
  },
  update(patientId, patch) {
    return gameProfilesCollection.update(patientId, patch);
  },
  /**
   * Adds XP to the patient's current level, carrying level-ups over (each
   * level's threshold grows by 100 XP once one is used up).
   */
  addXp(patientId, amount) {
    const profile = getOrCreateProfile(patientId);
    let level = profile.level;
    let nextLevelXp = profile.nextLevelXp;
    let currentLevelXp = profile.currentLevelXp + amount;
    const xp = (profile.xp || 0) + amount;
    while (currentLevelXp >= nextLevelXp) {
      currentLevelXp -= nextLevelXp;
      level += 1;
      nextLevelXp += 100;
    }
    return gameProfilesCollection.update(patientId, { xp, level, currentLevelXp, nextLevelXp });
  },
};
