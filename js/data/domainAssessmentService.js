import { createCollection, storageService, waitForCloudWrites } from "./storageService.js";
import { DOMAIN_ASSESSMENT_VERSION, getDomainProtocol, conditionsValid, evaluateDomainAssessment } from "./domainAssessments.js";
export const DOMAIN_ASSESSMENT_COLLECTION = "domainAssessmentRecords";
export function createDomainAssessmentService({ records, storage, cloudActive, syncWrites, lastOutcome, now = () => new Date().toISOString() }) {
  const statuses = () => storage.getItem("domainAssessmentSync", {}) || {};
  const setStatus = (id, status) => storage.setItem("domainAssessmentSync", { ...statuses(), [id]: status });
  const owns = (actor, r) => actor?.role === "patient" && actor.id === r?.patientId;
  const api = {
    status: id => statuses()[id] || "synced",
    get(id, patientId) { const r = records.getById(id); return r?.patientId === patientId ? r : null; },
    list(patientId, domain) { return records.query(r => r.patientId === patientId && (!domain || r.domain === domain)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)); },
    async settle(id) {
      if (!cloudActive()) { setStatus(id, "local_only"); return "local_only"; }
      setStatus(id, "pending"); let timer;
      try {
        const sync = await Promise.race([syncWrites(), new Promise(resolve => { timer = setTimeout(() => resolve(null), 12000); })]);
        const s = !sync ? "pending" : lastOutcome(id)?.ok === false || sync.failed?.some(f => f.name === DOMAIN_ASSESSMENT_COLLECTION && f.id === id) ? "failed" : "synced";
        setStatus(id, s); return s;
      } catch { setStatus(id, "failed"); return "failed"; }
      finally { clearTimeout(timer); }
    },
    async save({ actor, runId, domain, raw, conditions, candidates = {}, observerConfirmed = false }) {
      const p = getDomainProtocol(domain);
      if (actor?.role !== "patient" || !actor.id || !p || !/^[a-zA-Z0-9_-]{8,100}$/.test(runId || "") || !conditionsValid(conditions) || !raw || typeof raw !== "object") return { error: "invalid_assessment" };
      const id = `da_${actor.id}_${runId}`, existing = records.getById(id);
      if (existing && !owns(actor, existing)) return { error: "record_conflict" };
      // A completed assessment is append-only; retry never replaces its measurements.
      if (existing && (existing.domain !== domain || JSON.stringify(existing.raw) !== JSON.stringify(raw) || JSON.stringify(existing.conditions) !== JSON.stringify(conditions) || existing.observerConfirmed !== observerConfirmed)) return { error: "immutable_assessment" };
      const evaluation = evaluateDomainAssessment(domain, raw);
      const record = existing || { id, patientId: actor.id, domain, assessmentType: p.type, protocolVersion: DOMAIN_ASSESSMENT_VERSION,
        method: "observer_assisted", raw: JSON.parse(JSON.stringify(raw)), conditions: { ...conditions }, candidates: JSON.parse(JSON.stringify(candidates)), observerConfirmed: !!observerConfirmed,
        status: evaluation.valid && observerConfirmed ? "completed" : "incomplete", createdAt: now(), therapistId: "", relationId: "" };
      setStatus(id, "pending");
      existing ? records.update(id, {}) : records.create(record);
      return { record, sync: await api.settle(id), alreadySaved: !!existing };
    },
    async retry({ actor, id }) {
      const r = records.getById(id); if (!owns(actor, r)) return { error: "record_not_found" };
      setStatus(id, "pending"); records.update(id, {});
      return { record: r, sync: await api.settle(id) };
    },
  };
  return api;
}
export const domainAssessmentService = createDomainAssessmentService({ records: createCollection(DOMAIN_ASSESSMENT_COLLECTION), storage: storageService,
  cloudActive: () => storageService.isCloudSyncActive(), syncWrites: waitForCloudWrites,
  lastOutcome: id => storageService.getLastCloudWriteOutcome(DOMAIN_ASSESSMENT_COLLECTION, id) });
