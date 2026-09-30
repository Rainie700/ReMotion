let counter = 0;

// Dev/admin seeding only (js/dev/patient00Showcase.js): lets one seed run go
// through the app's real services with deterministic ids and a historical
// clock. Set only inside withSeedRuntime() and always restored; nothing in
// the app sets it, so normal ids / timestamps are unchanged.
let seedRuntime = null;

export function withSeedRuntime(runtime, fn) {
  const previous = seedRuntime;
  seedRuntime = runtime;
  try {
    return fn();
  } finally {
    seedRuntime = previous;
  }
}

export function generateId(prefix = "id") {
  if (seedRuntime && seedRuntime.nextId) return seedRuntime.nextId(prefix);
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso() {
  if (seedRuntime && seedRuntime.now) return seedRuntime.now();
  return new Date().toISOString();
}
