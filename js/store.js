// Local, single-learner state in localStorage (wrapped in try/catch). Export/import as JSON backup.
const KEY = "de-learning-v1";

const DEFAULT = () => ({
  version: 1,
  profile: null,          // filled by onboarding: { name, form:"m"|"f", job, city:{de,uz}, hobbies:[], family:{married, kids, brothers, sisters}, days:[1,3,5] }
  settings: { theme: "lavender", mode: "auto", rate: 1, voiceURI: "" },
  steps: {},              // "d01.A.3": ISO date completed
  sessions: {},           // "d01.A": ISO date completed
  extra: {},              // "review-YYYY-MM-DD" etc: completed non-lesson sessions
  srs: {},                // itemId: { box, due, wrong, right, last }
  errors: {},             // tag: total wrong count
  attempts: {},           // tag: [last 20 results, 1 = ok, 0 = wrong]
  skills: {},             // listen|speak|read|write: completed step count
  minutes: 0,             // active study minutes (rounded)
  days: [],               // "2026-11-20" days with activity
  reports: [],            // { at, where, text }
  drafts: {},
  log: [],                // xAPI-like events { at, verb, object, result }
  lastStudy: null
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT();
    const s = JSON.parse(raw);
    const d = DEFAULT();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  } catch (e) { return DEFAULT(); }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
}
export function get() { return state; }
export function setSetting(k, v) { state.settings[k] = v; save(); }
export function setProfile(p) { state.profile = p; save(); }

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function touch() {
  const t = dayKey();
  if (!state.days.includes(t)) state.days.push(t);
  state.lastStudy = new Date().toISOString();
  save();
}

export function logEvent(verb, object, result) {
  state.log.push({ at: new Date().toISOString(), verb, object, result });
  if (state.log.length > 4000) state.log = state.log.slice(-4000);
  touch();
}

export function addMinutes(min) { if (min > 0) { state.minutes = Math.round((state.minutes + min) * 10) / 10; save(); } }

export function markStep(key, skill) {
  if (state.steps[key]) return;
  state.steps[key] = new Date().toISOString();
  if (skill) state.skills[skill] = (state.skills[skill] || 0) + 1;
  save();
}
export function stepDone(key) { return !!state.steps[key]; }
export function markSession(key) { if (!state.sessions[key]) { state.sessions[key] = new Date().toISOString(); logEvent("session_completed", key); } }
export function sessionDone(key) { return !!state.sessions[key]; }
export function markExtra(key) { state.extra[key] = new Date().toISOString(); logEvent("extra_completed", key); }

// Error tags: gender, verb, order, case, pron, spell
export function result(tag, ok) {
  if (!tag) return;
  const a = (state.attempts[tag] = state.attempts[tag] || []);
  a.push(ok ? 1 : 0);
  if (a.length > 20) a.splice(0, a.length - 20);
  if (!ok) state.errors[tag] = (state.errors[tag] || 0) + 1;
  save();
}

export function addReport(where, text) { state.reports.push({ at: new Date().toISOString(), where, text }); save(); }

export function exportJSON() { return JSON.stringify(state, null, 2); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || typeof s !== "object" || !s.settings || !("srs" in s)) throw new Error("bad-format");
  const d = DEFAULT();
  state = { ...d, ...s, settings: { ...d.settings, ...s.settings } };
  save();
}
export function resetAll() { state = DEFAULT(); save(); }

export function daysSinceLastStudy() {
  if (!state.lastStudy) return null;
  return Math.floor((Date.now() - new Date(state.lastStudy).getTime()) / 86400000);
}
