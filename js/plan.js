// Pace-based planning: which 30-minute pack comes next, adaptive reinforcement, ETA, weekly streak.
import * as store from "./store.js";
import { stats } from "./srs.js";

export const TAGS = {
  gender: "Articles (der / die / das)",
  verb: "Verb endings / du vs Sie",
  order: "Word order",
  case: "Akkusativ / Dativ",
  pron: "Pronunciation",
  spell: "Spelling (ä ö ü ß)"
};

const WEEK = 7 * 86400000;
const REVIEW_EVERY = 5;   // a consolidation session after every 5 completed lessons

export function sessionIds(lesson) { return lesson.sessions === 2 ? ["A", "B"] : ["A"]; }
export function sessKey(lid, sid) { return `${lid}.${sid}`; }
export function lessonDone(lesson) { return sessionIds(lesson).every(s => store.sessionDone(sessKey(lesson.id, s))); }

// All units in order: { lesson, sid }
export function units(course) {
  return course.lessons.flatMap(l => sessionIds(l).map(sid => ({ lesson: l, sid })));
}
export function nextUnit(course) {
  return units(course).find(u => !store.sessionDone(sessKey(u.lesson.id, u.sid))) || null;
}

// Tag with ≥ 40 % wrong over its last ≥ 5 attempts.
export function weakTag() {
  const a = store.get().attempts;
  let worst = null;
  for (const [tag, arr] of Object.entries(a)) {
    if (arr.length < 5) continue;
    const rate = arr.filter(x => x === 0).length / arr.length;
    if (rate >= 0.4 && (!worst || rate > worst.rate)) worst = { tag, rate };
  }
  return worst;
}

function completedLessons(course) { return course.lessons.filter(l => !l.mini && lessonDone(l)).length; }

// Decide today's pack. kind: onboard | comeback | reinforce | review | lesson | done
export function todayPack(course, ready) {
  const s = store.get();
  if (!s.profile) return { kind: "onboard" };
  const st = stats();
  const gap = store.daysSinceLastStudy();
  const today = store.dayKey();
  if (gap != null && gap >= 7 && st.due > 0 && !s.extra["comeback-" + today]) return { kind: "comeback", gap, due: st.due };
  const weak = weakTag();
  if (weak && !s.extra[`reinforce-${weak.tag}-${today}`]) return { kind: "reinforce", tag: weak.tag, rate: weak.rate };
  const done = completedLessons(course);
  const block = Math.floor(done / REVIEW_EVERY);
  if (block > 0 && !s.extra["review-block-" + block]) return { kind: "review", block, due: st.due };
  const u = nextUnit(course);
  if (!u) return { kind: "done" };
  return { kind: "lesson", unit: u, ready: ready(u.lesson.id), due: st.due };
}

// Sessions completed per week, measured over the last 4 weeks; falls back to the planned days.
export function pace() {
  const s = store.get();
  const planned = s.profile?.days?.length || 3;
  const since = Date.now() - 4 * WEEK;
  const recent = Object.values(s.sessions).filter(d => new Date(d).getTime() >= since).length;
  const first = s.days.length ? new Date(s.days[0]).getTime() : Date.now();
  const weeks = Math.max(1, Math.min(4, (Date.now() - first) / WEEK));
  const measured = recent / weeks;
  return recent >= 3 ? measured : planned;
}

export function eta(course) {
  const remaining = units(course).filter(u => !store.sessionDone(sessKey(u.lesson.id, u.sid))).length;
  const lessonsLeft = course.lessons.filter(l => !l.mini && !lessonDone(l)).length;
  const reviewsLeft = Math.floor(lessonsLeft / REVIEW_EVERY);
  const total = remaining + reviewsLeft;
  const perWeek = Math.max(0.5, pace());
  const date = new Date(Date.now() + (total / perWeek) * WEEK);
  return { date, sessionsLeft: total, perWeek, measured: Object.keys(store.get().sessions).length >= 3 };
}

// Weekly streak: consecutive weeks (Mon–Sun) in which the learner studied on ≥ their target days.
// The current week counts once the target is met; an unfinished current week does not break the streak.
function mondayOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
export function weekly() {
  const s = store.get();
  const target = s.profile?.days?.length || 3;
  const byWeek = {};
  for (const d of s.days) { const k = mondayOf(new Date(d)).getTime(); byWeek[k] = (byWeek[k] || 0) + 1; }
  const thisWeek = mondayOf(new Date()).getTime();
  const thisCount = byWeek[thisWeek] || 0;
  let n = thisCount >= target ? 1 : 0;
  let w = thisWeek - WEEK;
  while ((byWeek[w] || 0) >= target) { n++; w -= WEEK; }
  return { streak: n, thisWeek: thisCount, target };
}

export function stageProgress(course, stage) {
  const ls = course.lessons.filter(l => l.stage === stage);
  return { done: ls.filter(lessonDone).length, total: ls.length };
}
export function currentStage(course) {
  const u = nextUnit(course);
  return u ? u.lesson.stage : course.stages.length - 1;
}
