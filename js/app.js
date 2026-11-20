import { esc, de, enDate, enMonthYear, DAYS_SHORT } from "./text.js";
import * as store from "./store.js";
import { ensureCard, grade, dueCards, stats } from "./srs.js";
import { speak, stop as stopAudio, loadManifest, germanVoices } from "./speech.js";
import { h, toast, modal, copyText, playBtn } from "./ui.js";
import STEP, { SKILL, SKILL_LABEL } from "./steps.js";
import * as plan from "./plan.js";
import { JOBS, HOBBIES, CITIES, aboutMe, jobOf, jobLabel } from "./profile.js";
import { icon, hydrateIcons } from "./icons.js";

const APP_VERSION = "0.5.0";
const THEMES = [
  ["lavender", "#DCD2FA", "#FFB627", "Lavender"],
  ["rose", "#F8CFDC", "#FF6A3D", "Rose"],
  ["sky", "#CBE5FB", "#FF5C8A", "Sky"],
  ["butter", "#FFEFA3", "#6D4AFF", "Butter"],
  ["mint", "#CFF0DC", "#D9367F", "Mint"]
];

/* ---------- iOS: no accidental zoom ---------- */
// 1) viewport is locked (index.html); 2) inputs are ≥ 16px (no focus zoom); 3) block pinch + double-tap;
// 4) if the page still ends up zoomed (e.g. after an input), re-apply the viewport to snap back to 1×.
const vpMeta = document.querySelector('meta[name="viewport"]');
const VP = vpMeta.content;
function resetZoom() { vpMeta.content = VP.replace("initial-scale=1,", "initial-scale=1.0,"); requestAnimationFrame(() => (vpMeta.content = VP)); }
["gesturestart", "gesturechange", "gestureend"].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - lastTouchEnd < 350 && !e.target.closest("input, textarea, select")) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("dblclick", e => e.preventDefault(), { passive: false });
window.visualViewport?.addEventListener("resize", () => { if (window.visualViewport.scale > 1.01) resetZoom(); });
document.addEventListener("focusout", e => { if (e.target.matches?.("input, textarea, select")) setTimeout(resetZoom, 50); });

/* ---------- state ---------- */
const view = document.getElementById("view");
let course = null;
const lessons = {};     // id -> lesson json (only lessons with content)
const items = {};       // itemId -> item
let cleanup = [];

function item(id) {
  if (id?.startsWith("me.")) {
    const mine = aboutMe(store.get().profile);
    // "me.hobby" = the learner's first hobby; "me.family" = married/single sentence
    if (id === "me.hobby") return mine.find(x => x.id.startsWith("me.hobby.")) || null;
    if (id === "me.family") return mine.find(x => x.id === "me.married" || x.id === "me.single") || null;
    return mine.find(x => x.id === id) || null;
  }
  return items[id] || null;
}
const isReady = lid => !!lessons[lid];
const meta = lid => course.lessons.find(l => l.id === lid);
const stageName = n => `Stage ${n + 1}`;

/* ---------- theme ---------- */
const mq = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const s = store.get().settings;
  const root = document.documentElement;
  root.dataset.theme = s.theme || "lavender";
  root.dataset.mode = s.mode === "auto" ? (mq.matches ? "dark" : "light") : s.mode;
  const bg = getComputedStyle(root).getPropertyValue("--base").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#FBFAFF");
}
mq.addEventListener?.("change", applyTheme);

/* ---------- study-time tracking ---------- */
let tStart = null;
function timerStart() { if (tStart == null) tStart = Date.now(); }
function timerStop() {
  if (tStart == null) return;
  const min = Math.min(20, (Date.now() - tStart) / 60000);
  tStart = null;
  store.addMinutes(min);
}
document.addEventListener("visibilitychange", () => { if (document.hidden) timerStop(); else if (document.body.dataset.timed) timerStart(); });

/* ---------- boot ---------- */
async function loadJSON(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url);
  return r.json();
}
// Profiles saved by the Uzbek-language version stored the city as { de, uz }: add the English name.
function migrateProfile() {
  const p = store.get().profile;
  if (p?.city && !p.city.en) { p.city.en = CITIES.find(c => c.de === p.city.de)?.en || p.city.de; delete p.city.uz; store.save(); }
}
async function boot() {
  hydrateIcons();
  applyTheme();
  migrateProfile();
  try {
    course = await loadJSON("content/course.json");
    await Promise.all(course.lessons.filter(l => l.file).map(async l => {
      const data = await loadJSON(`content/${l.id}.json`);
      lessons[l.id] = data;
      for (const [id, it] of Object.entries(data.items || {})) items[id] = { ...it, id, lesson: l.id };
    }));
  } catch (e) {
    view.innerHTML = `<div class="wrap"><div class="banner">Couldn't load the lessons. Check your internet connection and open the app again.</div></div>`;
    return;
  }
  loadManifest();
  addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then(reg => {
      // look for a new version whenever the app comes back to the foreground
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) toast("App updated ✨");
    });
  }
}

/* ---------- router ---------- */
function setTab(name) {
  document.querySelectorAll(".tabbar a").forEach(a => a.toggleAttribute("aria-current", a.dataset.tab === name));
}
function route() {
  cleanup.forEach(f => { try { f(); } catch (_) {} }); cleanup = [];
  stopAudio(); timerStop();
  document.getElementById("modal-root").innerHTML = "";
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  document.body.className = "";
  delete document.body.dataset.timed;
  view.innerHTML = "";
  view.classList.remove("in"); void view.offsetWidth; view.classList.add("in");
  window.scrollTo(0, 0);
  const s = store.get();
  if (!s.profile && parts[0] !== "onboard") { location.replace("#/onboard"); return; }
  const timed = () => { document.body.dataset.timed = "1"; timerStart(); };
  switch (parts[0]) {
    case "onboard": document.body.className = "focus"; return renderOnboard(Number(parts[1] || 0));
    case "l": document.body.className = "focus"; timed(); return renderLesson(parts[1], parts[2], parts[3] != null ? Number(parts[3]) : null);
    case "warmup": document.body.className = "focus"; timed(); return renderReview({ mode: "warmup", then: `#/l/${parts[1]}/${parts[2]}`, limit: 10 });
    case "pack": document.body.className = "focus"; timed(); return renderReview({ mode: parts[1], arg: parts[2] });
    case "review": setTab("review"); timed(); return renderReview({ mode: "free" });
    case "progress": setTab("progress"); return renderProgress();
    case "settings": setTab("settings"); return renderSettings();
    case "path": setTab("home"); return renderPath();
    case "me": setTab("home"); return renderMe();
    default: setTab("home"); return renderHome();
  }
}

/* ---------- shared bits ---------- */
function weeklyChip() {
  const w = plan.weekly();
  return w.streak ? `<span class="chip">${icon("flame", { size: 16 })} ${w.streak} ${w.streak === 1 ? "week" : "weeks"}</span>` : `<span class="chip">${icon("calendar", { size: 16 })} This week ${w.thisWeek}/${w.target}</span>`;
}

function lessonState(l) {
  if (plan.lessonDone(l)) return "done";
  const u = plan.nextUnit(course);
  if (u && u.lesson.id === l.id) return "now";
  return isReady(l.id) ? "open" : "lock";
}

function stopNode(l, k) {
  const st = lessonState(l);
  const sub = l.mini ? "Role-play" : `${l.sessions === 2 ? "2 parts · " : ""}${Math.round((l.len || 0) / 60)} min video`;
  const node = h(`<button type="button" class="node ${st}" style="--d:${k * 60}ms">
      <span class="stop" aria-hidden="true">${st === "done" ? "✓" : l.pic}</span>
      <span class="t"><b>${l.n ? l.n + ". " : ""}${esc(l.title)}</b><span>${st === "now" ? "Now · " : st === "lock" ? "Coming soon · " : ""}${sub}</span></span>
    </button>`);
  node.addEventListener("click", () => lessonSheet(l));
  return node;
}

function lessonSheet(l) {
  const el = h(`<div class="sheet">
    <div class="sheet-pic">${l.pic}</div>
    <div class="kicker">${l.n ? `Lesson ${l.n}` : "Mini-Gespräch"} · ${stageName(l.stage)}</div>
    <h2 class="de">${de(l.hero)}</h2><p class="muted">${esc(l.gloss || "")}</p>
    <h3>${esc(l.title)}</h3><div class="sess"></div></div>`);
  const box = el.querySelector(".sess");
  if (!isReady(l.id)) box.append(h(`<p class="muted">This lesson is still being prepared.</p>`));
  else plan.sessionIds(l).forEach(sid => {
    const ses = lessons[l.id].sessions.find(x => x.id === sid);
    const done = store.sessionDone(plan.sessKey(l.id, sid));
    const a = h(`<a class="sess-row ${done ? "done" : ""}" href="#/l/${l.id}/${sid}"><span class="mark">${done ? icon("check", { size: 18 }) : sid}</span><span>${esc(ses?.title || "")}<small>${ses?.steps.length || 0} exercises</small></span><span class="go">${icon("next", { size: 18 })}</span></a>`);
    box.append(a);
  });
  const close = modal(el);
  el.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
}

/* ---------- home ---------- */
function todayCard() {
  const pack = plan.todayPack(course, isReady);
  const plan4 = (a, b, c, d) => `<div class="plan">
      <div><b>${icon("review")}</b>Review<small>${a}</small></div><div><b>${icon("video")}</b>Video<small>${b}</small></div>
      <div><b>${icon("speak")}</b>Speaking<small>${c}</small></div><div><b>${icon("write")}</b>Writing<small>${d}</small></div></div>`;
  if (pack.kind === "comeback") return h(`<section class="today enter">
      <div class="k">Welcome back!</div><h2>Let's review first</h2>
      <p>You haven't studied for ${pack.gap} days. Review ${Math.min(pack.due, 15)} cards first (about 5 minutes), then we continue with the next lesson. Nothing is lost.</p>
      <a class="btn" href="#/pack/comeback">Start review</a></section>`);
  if (pack.kind === "reinforce") return h(`<section class="today enter">
      <div class="k">Extra practice</div><h2>${esc(plan.TAGS[pack.tag] || pack.tag)}</h2>
      <p>You've made quite a few mistakes with this lately (${Math.round(pack.rate * 100)}%). Let's do a short practice round.</p>
      <a class="btn" href="#/pack/reinforce/${pack.tag}">Start</a></section>`);
  if (pack.kind === "review") return h(`<section class="today enter">
      <div class="k">Review session</div><h2>5 lessons done!</h2>
      <p>Time to consolidate the words and phrases you've learned.</p>
      <a class="btn" href="#/pack/review/${pack.block}">Start</a></section>`);
  if (pack.kind === "done") return h(`<section class="today enter"><div class="k">Congratulations!</div><h2 class="de">Super gemacht!</h2><p>You've finished all the lessons. Keep reviewing.</p><a class="btn" href="#/review">Review</a></section>`);
  const l = pack.unit.lesson, sid = pack.unit.sid;
  const ses = lessons[l.id]?.sessions.find(x => x.id === sid);
  const href = pack.due > 0 ? `#/warmup/${l.id}/${sid}` : `#/l/${l.id}/${sid}`;
  const started = ses && ses.steps.some((_, k) => store.stepDone(`${l.id}.${sid}.${k}`));
  return h(`<section class="today enter">
      <div class="k">Today's 30 minutes</div>
      <h2 class="de">${de(l.hero)}</h2>
      <p>${l.n ? `Lesson ${l.n}` : "Mini-Gespräch"} · ${esc(l.title)}${l.sessions === 2 ? ` · part ${sid === "A" ? "1" : "2"} of 2` : ""}</p>
      ${plan4(pack.due ? "5 min" : "—", "12 min", "10 min", "3 min")}
      ${pack.ready ? `<a class="btn" href="${href}">${started ? "Continue" : "Start"} ${icon("next", { size: 20 })}</a>` : `<div class="btn disabled" aria-disabled="true">Lesson coming soon</div>`}
    </section>`);
}

function renderHome() {
  const p = store.get().profile;
  const el = h(`<div class="wrap"></div>`);
  el.append(h(`<div class="hello enter"><h1>Hi, ${esc(p.name)}<small>${enDate(new Date(), { weekday: true })}</small></h1>${weeklyChip()}</div>`));
  el.append(todayCard());
  const st = stats();
  if (st.due) el.append(h(`<a class="rowcard enter" href="#/review"><span class="ico">${icon("review")}</span><span><b>${st.due} ${st.due === 1 ? "card" : "cards"} to review</b><small>Hardest ones first</small></span><span class="go">${icon("next", { size: 18 })}</span></a>`));
  el.append(h(`<a class="rowcard enter" href="#/me"><span class="ico">${icon("me")}</span><span><b>About me — in German</b><small>Sentences built from your profile</small></span><span class="go">${icon("next", { size: 18 })}</span></a>`));

  const cur = plan.currentStage(course);
  const stg = course.stages[cur];
  const pr = plan.stageProgress(course, cur);
  el.append(h(`<div class="sec"><h3>${stageName(cur)} · ${esc(stg.title)}</h3><span>${pr.done} / ${pr.total}</span></div>`));
  el.append(pathFor(cur));
  const nxt = course.stages[cur + 1];
  el.append(h(`<a class="next-stage" href="#/path">${nxt ? `Next: ${stageName(nxt.n)} · ${esc(nxt.title)} — ${course.lessons.filter(l => l.stage === nxt.n && !l.mini).length} lessons` : "Full course map"} ${icon("next", { size: 16 })}</a>`));
  view.append(el);
}

function pathFor(stage) {
  const ls = course.lessons.filter(l => l.stage === stage);
  const box = h(`<div class="path"></div>`);
  const H = 92, W = 350;
  const pts = ls.map((_, k) => [k % 2 ? W - 40 : 40, 46 + k * H]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let k = 1; k < pts.length; k++) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; d += ` C ${x0} ${y0 + H * 0.6}, ${x1} ${y1 - H * 0.6}, ${x1} ${y1}`; }
  box.append(h(`<svg viewBox="0 0 ${W} ${ls.length * H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" class="road"/></svg>`));
  ls.forEach((l, k) => box.append(stopNode(l, k)));
  return box;
}

function renderPath() {
  const el = h(`<div class="wrap"><div class="pagehead enter"><a class="back" href="#/" aria-label="Back">${icon("back")}</a><h1>Course map</h1></div></div>`);
  course.stages.forEach(stg => {
    const pr = plan.stageProgress(course, stg.n);
    el.append(h(`<div class="sec"><h3>${stageName(stg.n)} · ${esc(stg.title)}</h3><span>${pr.done} / ${pr.total}</span></div>`));
    el.append(pathFor(stg.n));
  });
  view.append(el);
}

function renderMe() {
  const p = store.get().profile;
  const list = aboutMe(p);
  const el = h(`<div class="wrap"><div class="pagehead enter"><a class="back" href="#/" aria-label="Back">${icon("back")}</a><h1>About me</h1></div>
    <p class="muted">These sentences are built from your profile. Learn them by heart — you'll need them every time you meet someone.</p><div class="cards"></div>
    <a class="btn ghost" href="#/onboard/1">Edit profile</a></div>`);
  const box = el.querySelector(".cards");
  list.forEach((it, k) => {
    ensureCard(it.id);
    const row = h(`<div class="pcard enter" style="--d:${k * 40}ms"><div class="pic">${it.pic}</div><div class="txt"><div class="big de">${esc(it.de)}</div><div class="tr">${esc(it.en)}</div></div><div class="btns"></div></div>`);
    row.querySelector(".btns").append(playBtn(it.de), playBtn(it.de, { slow: true }));
    box.append(row);
  });
  view.append(el);
}

/* ---------- onboarding ---------- */
const OB_STEPS = ["welcome", "name", "form", "job", "city", "hobbies", "family", "days", "theme", "done"];
let draft = null;

function renderOnboard(i) {
  const s = store.get();
  if (!draft) draft = JSON.parse(JSON.stringify(s.profile || { name: "", form: null, job: null, city: null, hobbies: [], family: null, days: [] }));
  if (s.profile && i === 0) i = 1;
  const step = OB_STEPS[Math.max(0, Math.min(i, OB_STEPS.length - 1))];
  const el = h(`<div class="ob"><div class="ob-top"><div class="ob-bar"><i style="width:${Math.round((i / (OB_STEPS.length - 1)) * 100)}%"></i></div></div><div class="ob-body enter"></div></div>`);
  const body = el.querySelector(".ob-body"), foot = h(`<div class="ob-foot"></div>`); // fixed bar must not sit inside an animated (transformed) parent
  const go = n => { location.hash = `#/onboard/${n}`; };
  const nextBtn = (label = "Next", valid = () => true, msg = "") => {
    const b = h(`<button class="btn" type="button">${label}</button>`);
    b.addEventListener("click", () => { if (!valid()) { toast(msg); return; } go(i + 1); });
    return b;
  };
  const back = h(`<button class="btn ghost" type="button">Back</button>`);
  back.addEventListener("click", () => go(i - 1));

  if (step === "welcome") {
    body.append(h(`<div class="ob-hero"><img class="app-mark" src="icons/icon-180.png" alt="" width="88" height="88"><h1 class="de">Willkommen!</h1><p class="lead">Welcome! Let's learn German from zero, at your own pace.</p>
      <ul class="ticks"><li>3–4 times a week, 30 minutes each</li><li>Video, listening, speaking and writing</li><li>Everything built around sentences about your own life</li></ul></div>`));
    foot.append(nextBtn("Let's start"));
  }
  if (step === "name") {
    body.append(h(`<h2>What's your name?</h2><p class="muted">We'll use it in your German sentences: <span class="de">Ich heiße …</span></p>`));
    const inp = h(`<input class="field" autocomplete="given-name" autocapitalize="words" maxlength="30" placeholder="e.g. Aziz" aria-label="Name">`);
    inp.value = draft.name || "";
    inp.addEventListener("input", () => { draft.name = inp.value.trim().replace(/\s+/g, " "); });
    body.append(inp);
    foot.append(back, nextBtn("Next", () => /^\p{L}[\p{L}\s'ʼʻ-]{0,29}$/u.test(draft.name || ""), "Please type your name using letters."));
  }
  if (step === "form") {
    body.append(h(`<h2>Are you a man or a woman?</h2><p class="muted">In German, job titles change accordingly. For example, “teacher”: <span class="de">Lehrer</span> (man) / <span class="de">Lehrerin</span> (woman).</p>`));
    const opts = h(`<div class="choices two"></div>`);
    [["m", "👨", "Man"], ["f", "👩", "Woman"]].forEach(([v, e, t]) => {
      const b = h(`<button type="button" class="choice ${draft.form === v ? "on" : ""}"><span class="e">${e}</span><b>${t}</b></button>`);
      b.addEventListener("click", () => { draft.form = v; opts.querySelectorAll(".choice").forEach(c => c.classList.remove("on")); b.classList.add("on"); });
      opts.append(b);
    });
    body.append(opts);
    foot.append(back, nextBtn("Next", () => !!draft.form, "Please choose one."));
  }
  if (step === "job") {
    body.append(h(`<h2>What do you do?</h2><p class="muted">Pick the closest one from the list.</p>`));
    const grid = h(`<div class="choices"></div>`);
    JOBS.forEach(j => {
      const b = h(`<button type="button" class="choice ${draft.job === j.id ? "on" : ""}"><span class="e">${j.pic}</span><b>${esc(jobLabel(j))}</b><small class="de">${draft.form === "f" ? j.f : j.m}</small></button>`);
      b.addEventListener("click", () => { draft.job = j.id; grid.querySelectorAll(".choice").forEach(c => c.classList.remove("on")); b.classList.add("on"); });
      grid.append(b);
    });
    body.append(grid);
    foot.append(back, nextBtn("Next", () => !!draft.job, "Please choose a job."));
  }
  if (step === "city") {
    body.append(h(`<h2>Which city do you live in?</h2><p class="muted"><span class="de">Ich wohne in …</span></p>`));
    const grid = h(`<div class="choices chips"></div>`);
    const other = h(`<input class="field" maxlength="30" placeholder="Another city" aria-label="Another city" autocapitalize="words">`);
    CITIES.forEach(c => {
      const b = h(`<button type="button" class="choice ${draft.city?.de === c.de ? "on" : ""}"><b>${esc(c.en)}</b><small class="de">${esc(c.de)}</small></button>`);
      b.addEventListener("click", () => { draft.city = c; other.value = ""; grid.querySelectorAll(".choice").forEach(x => x.classList.remove("on")); b.classList.add("on"); });
      grid.append(b);
    });
    if (draft.city && !CITIES.some(c => c.de === draft.city.de)) other.value = draft.city.de;
    other.addEventListener("input", () => { const v = other.value.trim(); grid.querySelectorAll(".choice").forEach(x => x.classList.remove("on")); draft.city = v ? { de: v, en: v } : null; });
    body.append(grid, h(`<p class="small muted">Not in the list? Type the city name (just the name):</p>`), other);
    foot.append(back, nextBtn("Next", () => !!draft.city?.de && /^\p{L}[\p{L}\s.'-]{0,29}$/u.test(draft.city.de), "Choose or type a city."));
  }
  if (step === "hobbies") {
    body.append(h(`<h2>Your hobbies</h2><p class="muted">Pick 1–3. <span class="de">Ich … gern.</span></p>`));
    const grid = h(`<div class="choices"></div>`);
    HOBBIES.forEach(hb => {
      const b = h(`<button type="button" class="choice ${draft.hobbies.includes(hb.id) ? "on" : ""}"><span class="e">${hb.pic}</span><b>${esc(hb.label)}</b><small class="de">${esc(hb.de)}</small></button>`);
      b.addEventListener("click", () => {
        const k = draft.hobbies.indexOf(hb.id);
        if (k >= 0) draft.hobbies.splice(k, 1);
        else { if (draft.hobbies.length >= 3) { toast("Three at most."); return; } draft.hobbies.push(hb.id); }
        b.classList.toggle("on", draft.hobbies.includes(hb.id));
      });
      grid.append(b);
    });
    body.append(grid);
    foot.append(back, nextBtn("Next", () => draft.hobbies.length > 0, "Pick at least one."));
  }
  if (step === "family") {
    const f = (draft.family = draft.family || { married: null, kids: null, brothers: null, sisters: null });
    body.append(h(`<h2>Your family <small class="muted">(optional)</small></h2><p class="muted">Only used for practice sentences. Skip it if you prefer.</p>`));
    const seg = (label, key, opts) => {
      const row = h(`<div class="field-row"><span>${label}</span><div class="seg"></div></div>`);
      opts.forEach(([v, t]) => {
        const b = h(`<button type="button" class="${f[key] === v ? "on" : ""}">${t}</button>`);
        b.addEventListener("click", () => { f[key] = f[key] === v ? null : v; row.querySelectorAll("button").forEach(x => x.classList.remove("on")); if (f[key] === v) b.classList.add("on"); });
        row.querySelector(".seg").append(b);
      });
      return row;
    };
    const nums = [0, 1, 2, 3, 4, 5].map(n => [n, String(n)]);
    body.append(seg("Are you married?", "married", [[true, "Yes"], [false, "No"]]),
      seg("Children", "kids", nums), seg("Brothers", "brothers", nums), seg("Sisters", "sisters", nums));
    const skip = h(`<button class="btn ghost" type="button">Skip</button>`);
    skip.addEventListener("click", () => { draft.family = null; go(i + 1); });
    foot.append(skip, nextBtn("Next"));
  }
  if (step === "days") {
    body.append(h(`<h2>Which days will you study?</h2><p class="muted">Pick 3 or 4 days. This isn't a strict timetable — the app adapts to your real pace.</p>`));
    const row = h(`<div class="days"></div>`);
    [1, 2, 3, 4, 5, 6, 0].forEach(d => {
      const b = h(`<button type="button" class="${draft.days.includes(d) ? "on" : ""}">${DAYS_SHORT[d]}</button>`);
      b.addEventListener("click", () => {
        const k = draft.days.indexOf(d);
        if (k >= 0) draft.days.splice(k, 1); else { if (draft.days.length >= 4) { toast("Four days at most."); return; } draft.days.push(d); }
        b.classList.toggle("on", draft.days.includes(d));
      });
      row.append(b);
    });
    body.append(row);
    foot.append(back, nextBtn("Next", () => draft.days.length >= 3, "Pick 3 or 4 days."));
  }
  if (step === "theme") {
    body.append(h(`<h2>Pick a colour</h2><p class="muted">You can change it later in Settings.</p>`));
    body.append(themePicker());
    foot.append(back, nextBtn("Done"));
  }
  if (step === "done") {
    store.setProfile(draft);
    draft = null;
    const list = aboutMe(store.get().profile);
    body.append(h(`<div class="ob-hero"><div class="badge-ok pop">${icon("check", { size: 40 })}</div><h1 class="de">Super!</h1><p class="lead">Here are your first German sentences. Tap play to listen.</p></div>`));
    const box = h(`<div class="cards"></div>`);
    list.slice(0, 4).forEach((it, k) => {
      const row = h(`<div class="pcard enter" style="--d:${k * 80}ms"><div class="pic">${it.pic}</div><div class="txt"><div class="big de">${esc(it.de)}</div><div class="tr">${esc(it.en)}</div></div><div class="btns"></div></div>`);
      row.querySelector(".btns").append(playBtn(it.de));
      box.append(row);
    });
    body.append(box);
    foot.append(h(`<a class="btn" href="#/">Go to home</a>`));
  }
  view.append(el, foot);
  body.querySelector("input")?.focus({ preventScroll: true });
}

function themePicker() {
  const s = store.get().settings;
  const wrap = h(`<div class="theme-pick"><div class="dots"></div><div class="seg mode"></div></div>`);
  THEMES.forEach(([id, air, acc, name]) => {
    const b = h(`<button type="button" class="tdot ${s.theme === id ? "on" : ""}" aria-label="${name}"><i style="background:${air}"></i><i style="background:${acc}"></i><span>${name}</span></button>`);
    b.addEventListener("click", () => { store.setSetting("theme", id); applyTheme(); wrap.querySelectorAll(".tdot").forEach(x => x.classList.toggle("on", x === b)); });
    wrap.querySelector(".dots").append(b);
  });
  [["light", "sun", "Light"], ["dark", "moon", "Dark"], ["auto", "auto", "Auto"]].forEach(([m, ic, t]) => {
    const b = h(`<button type="button" class="${s.mode === m ? "on" : ""}">${icon(ic, { size: 16 })} ${t}</button>`);
    b.addEventListener("click", () => { store.setSetting("mode", m); applyTheme(); wrap.querySelectorAll(".mode button").forEach(x => x.classList.toggle("on", x === b)); });
    wrap.querySelector(".mode").append(b);
  });
  return wrap;
}

/* ---------- lesson ---------- */
function renderLesson(lid, sid, stepIdx) {
  const m = meta(lid), L = lessons[lid];
  const ses = L?.sessions.find(x => x.id === sid);
  if (!m || !ses) { view.append(h(`<div class="wrap"><div class="banner">Lesson not found. <a href="#/">Home</a></div></div>`)); return; }
  if (stepIdx == null || isNaN(stepIdx)) { const k = ses.steps.findIndex((_, j) => !store.stepDone(`${lid}.${sid}.${j}`)); stepIdx = k < 0 ? 0 : k; }
  stepIdx = Math.max(0, Math.min(stepIdx, ses.steps.length - 1));
  const step = ses.steps[stepIdx];
  const key = `${lid}.${sid}.${stepIdx}`;
  store.touch();

  const top = h(`<div class="ltop">
      <a class="x" href="#/" aria-label="Close lesson">${icon("close", { size: 18 })}</a>
      <div class="segs">${ses.steps.map((_, k) => `<i class="${k < stepIdx || store.stepDone(`${lid}.${sid}.${k}`) ? "on" : k === stepIdx ? "now" : ""}"></i>`).join("")}</div>
      <button class="x" type="button" data-report aria-label="Report a mistake">${icon("flag", { size: 18 })}</button></div>`);
  top.querySelector("[data-report]").addEventListener("click", () => reportModal(`${m.n ? "Lesson " + m.n : m.id} · ${sid} · step ${stepIdx + 1}: ${step.title || step.type}`));
  view.append(top);
  const wrap = h(`<div class="lesson enter"></div>`);
  wrap.append(h(`<div class="stepk">${stepIdx + 1} / ${ses.steps.length} · ${esc(SKILL_LABEL[step.skill || SKILL[step.type]] || "")}</div>`));
  if (step.title) wrap.append(h(`<h2 class="lh">${esc(step.title)}</h2>`));
  const body = h(`<div class="step-body"></div>`);
  wrap.append(body);
  view.append(wrap);
  const r = STEP[step.type];
  const ctx = { item, cleanup, key, profile: store.get().profile };
  if (r) r(step, body, ctx); else body.append(h(`<div class="banner">This exercise type (“${esc(step.type)}”) isn't supported yet.</div>`));

  const last = stepIdx === ses.steps.length - 1;
  const foot = h(`<div class="foot">${stepIdx > 0 ? `<a class="btn ghost" href="#/l/${lid}/${sid}/${stepIdx - 1}">Back</a>` : ""}<button class="btn" type="button" data-next>${last ? "Finish lesson" : "Continue"}</button></div>`);
  foot.querySelector("[data-next]").addEventListener("click", () => {
    store.markStep(key, step.skill || SKILL[step.type]);
    store.logEvent("step_completed", key);
    if (last) { store.markSession(plan.sessKey(lid, sid)); finishSession(m, ses); }
    else location.hash = `#/l/${lid}/${sid}/${stepIdx + 1}`;
  });
  view.append(foot);
}

function finishSession(m, ses) {
  timerStop();
  const said = (ses.said || []).map(id => item(id)).filter(Boolean);
  const el = h(`<div class="finish"><div class="badge-ok pop">${icon("check", { size: 40 })}</div><h2>Great job!</h2>
    <p class="muted">${esc(m.title)} · ${esc(ses.title)}</p>
    ${said.length ? `<h3>Today you learned to say:</h3><div class="said">${said.map(it => `<div class="de">${de(it.de)}</div>`).join("")}</div>` : ""}
    <p class="small muted">New words and phrases have been added to your review cards.</p><div class="col"></div></div>`);
  const col = el.querySelector(".col");
  col.append(h(`<a class="btn" href="#/">Go to home</a>`));
  col.append(h(`<a class="btn ghost" href="#/review">Review</a>`));
  const close = modal(el);
  el.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
  burst();
}

function burst() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = h(`<div class="burst" aria-hidden="true"></div>`);
  for (let k = 0; k < 22; k++) {
    const s = document.createElement("span");
    s.className = ["c1", "c2", "c3"][k % 3] + (k % 2 ? " round" : "");
    s.style.setProperty("--x", `${(Math.random() - 0.5) * 320}px`);
    s.style.setProperty("--y", `${-120 - Math.random() * 260}px`);
    s.style.setProperty("--r", `${(Math.random() - 0.5) * 540}deg`);
    s.style.animationDelay = `${Math.random() * 120}ms`;
    layer.append(s);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1600);
}

function reportModal(where) {
  const el = h(`<div><h3>Report a mistake</h3><p class="small muted">${esc(where)}</p>
    <textarea class="field" rows="4" placeholder="What's wrong? e.g. wrong translation, wrong pronunciation…"></textarea>
    <div class="row end"><button class="btn ghost" type="button" data-c>Cancel</button><button class="btn" type="button" data-s>Save</button></div></div>`);
  const close = modal(el);
  el.querySelector("[data-c]").addEventListener("click", close);
  el.querySelector("[data-s]").addEventListener("click", () => {
    const t = el.querySelector("textarea").value.trim();
    if (!t) { toast("Please describe the mistake first."); return; }
    store.addReport(where, t); close(); toast("Saved. You can send it from Settings.");
  });
}

/* ---------- review / packs ---------- */
function renderReview({ mode, then, limit = 20, arg }) {
  const s = store.get();
  let filter = id => !!item(id);
  if (mode === "reinforce" && arg) filter = id => !!item(id) && (item(id).tags || []).includes(arg);
  let queue = dueCards(mode === "comeback" ? 15 : limit, filter);
  if (mode === "reinforce" && queue.length < 5) {
    // not enough due cards with that tag: pull in tagged cards regardless of due date
    const extra = Object.keys(s.srs).filter(id => filter(id) && !queue.includes(id)).slice(0, 10 - queue.length);
    queue = queue.concat(extra);
  }
  if (mode === "warmup" && !queue.length) { location.replace(then); return; }
  const titles = { warmup: "Warm-up: review", comeback: "Welcome back!", reinforce: `Practice: ${plan.TAGS[arg] || ""}`, review: "Review session", free: "Review" };
  const el = h(`<div class="wrap"><div class="pagehead enter">${mode === "free" ? "" : `<a class="back" href="#/" aria-label="Back">${icon("back")}</a>`}<h1>${esc(titles[mode] || "Review")}</h1></div><div class="rv"></div></div>`);
  const box = el.querySelector(".rv");
  view.append(el);
  let done = 0;
  const total = queue.length;
  const finish = () => {
    if (mode === "comeback") store.markExtra("comeback-" + store.dayKey());
    if (mode === "reinforce") store.markExtra(`reinforce-${arg}-${store.dayKey()}`);
    if (mode === "review") store.markExtra("review-block-" + arg);
  };
  const show = () => {
    box.innerHTML = "";
    if (!queue.length) {
      finish();
      const st = stats();
      box.append(h(`<div class="result enter"><div class="score">${done}</div><p><b>${done ? (done === 1 ? "card reviewed" : "cards reviewed") : "Nothing to review right now"}</b></p><p class="muted small">${st.total ? `${st.total} words and phrases so far, ${st.learned} of them well remembered.` : "Cards appear after your first lesson."}</p></div>`));
      box.append(h(`<a class="btn" href="${then || "#/"}">${then ? "Go to the lesson" : "Go to home"}</a>`));
      return;
    }
    const id = queue[0], it = item(id);
    const c = s.srs[id];
    const reverse = c && c.box >= 2 && Math.random() < 0.5;
    box.append(h(`<div class="q-count wide"><i style="width:${Math.round((done / Math.max(1, total)) * 100)}%"></i></div>`));
    const card = h(`<div class="flash enter"></div>`);
    if (it.pic) card.append(h(`<div class="pic">${it.pic}</div>`));
    if (reverse) card.append(h(`<div><div class="small muted">Say it in German:</div><h2>${esc(it.en)}</h2></div>`));
    else {
      card.append(h(`<div class="big de">${de(it.de)}</div>`));
      const pr = h(`<div class="row center"></div>`); pr.append(playBtn(it.de)); card.append(pr);
      setTimeout(() => speak(it.de), 250);
    }
    const ans = h(`<div class="answer" hidden></div>`);
    if (reverse) { ans.append(h(`<div class="big de">${de(it.de)}</div>`)); const pr = h(`<div class="row center"></div>`); pr.append(playBtn(it.de)); ans.append(pr); }
    else ans.append(h(`<div><b>${esc(it.en)}</b></div>`));
    if (it.plural) ans.append(h(`<div class="small">plural: <span class="de">${de(it.plural)}</span></div>`));
    card.append(ans);
    box.append(card);
    const showBtn = h(`<button class="btn" type="button">Show answer</button>`);
    const grades = h(`<div class="grade" hidden><button class="btn g0" type="button" data-g="0">Forgot</button><button class="btn ghost" type="button" data-g="1">Hard</button><button class="btn" type="button" data-g="2">Got it</button></div>`);
    showBtn.addEventListener("click", () => { ans.hidden = false; card.classList.add("flip"); showBtn.hidden = true; grades.hidden = false; if (reverse) speak(it.de); });
    grades.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      const g = Number(b.dataset.g);
      grade(id, g); store.logEvent("reviewed", id, { grade: g });
      queue.shift(); if (g === 0) queue.push(id); done++;
      show();
    }));
    box.append(showBtn, grades);
  };
  show();
}

/* ---------- progress ---------- */
function renderProgress() {
  const s = store.get();
  const st = stats();
  const w = plan.weekly();
  const e = plan.eta(course);
  const cur = plan.currentStage(course);
  const el = h(`<div class="wrap"><div class="pagehead enter"><h1>Progress</h1></div></div>`);

  const stages = h(`<div class="stages enter"></div>`);
  course.stages.forEach(stg => {
    const pr = plan.stageProgress(course, stg.n);
    stages.append(h(`<a href="#/path" class="stage ${stg.n === cur ? "now" : pr.done === pr.total ? "done" : ""}"><span class="e">${pr.done === pr.total ? icon("check") : stg.n + 1}</span><i><u style="width:${Math.round((pr.done / pr.total) * 100)}%"></u></i></a>`));
  });
  el.append(h(`<div class="sec"><h3>${stageName(cur)} · ${esc(course.stages[cur].title)}</h3><a href="#/path">Map ${icon("next", { size: 14 })}</a></div>`), stages);

  el.append(h(`<section class="eta enter"><div class="k">Estimated A1 finish date</div><div class="when de">${enMonthYear(e.date)}</div>
    <p class="small">${e.sessionsLeft} sessions to go · about ${e.perWeek.toFixed(1).replace(".0", "")} a week ${e.measured ? "(your real pace)" : "(based on your planned days)"}</p></section>`));

  const hrs = Math.floor(s.minutes / 60), mins = Math.round(s.minutes % 60);
  el.append(h(`<div class="stats enter">
    <div class="stat"><b>${hrs ? `${hrs} h ${mins} min` : `${mins} min`}</b><span>total time</span></div>
    <div class="stat"><b>${w.streak ? `${w.streak}` : `${w.thisWeek}/${w.target}`}</b><span>${w.streak ? "weeks in a row" : "this week"}</span></div>
    <div class="stat"><b>${st.learned}</b><span>well remembered</span></div></div>`));

  const max = Math.max(1, ...Object.values(s.skills));
  el.append(h(`<div class="sec"><h3>Skills</h3></div>`));
  el.append(h(`<div class="panel skills enter">${["listen", "speak", "read", "write"].map(k => `<div class="sk"><span>${icon({ listen: "listen", speak: "speak", read: "read", write: "write" }[k], { size: 18 })} ${SKILL_LABEL[k]}</span><i><u style="width:${Math.round(((s.skills[k] || 0) / max) * 100)}%"></u></i><b>${s.skills[k] || 0}</b></div>`).join("")}<p class="small muted">Number of exercises completed.</p></div>`));

  const errs = Object.entries(s.errors).sort((a, b) => b[1] - a[1]).slice(0, 4);
  el.append(h(`<div class="sec"><h3>Most common mistakes</h3></div>`));
  el.append(errs.length
    ? h(`<div class="panel enter">${errs.map(([t, n]) => `<div class="err"><span>${esc(plan.TAGS[t] || t)}</span><span class="chip">${n}</span></div>`).join("")}<p class="small muted">Reviews focus more on these.</p></div>`)
    : h(`<div class="panel enter muted">No mistakes yet.</div>`));
  view.append(el);
}

/* ---------- settings ---------- */
function renderSettings() {
  const s = store.get();
  const p = s.profile;
  const j = jobOf(p);
  const el = h(`<div class="wrap"><div class="pagehead enter"><h1>Settings</h1></div>
    <div class="sec"><h3>Profile</h3></div>
    <a class="rowcard" href="#/onboard/1"><span class="ico">${icon("me")}</span><span><b>${esc(p.name)}</b><small>${esc(j ? jobLabel(j) : "")} · ${esc(p.city?.en || p.city?.de || "")}</small></span><span class="go">Edit</span></a>
    <div class="sec"><h3>Appearance</h3></div><div class="panel tp"></div>
    <div class="sec"><h3>Voice</h3></div>
    <div class="panel">
      <label class="setting"><span>Speed</span><select class="field" data-k="rate">${[0.8, 0.9, 1].map(v => `<option value="${v}" ${Number(s.settings.rate) === v ? "selected" : ""}>${v === 1 ? "Normal" : v + "×"}</option>`).join("")}</select></label>
      <label class="setting"><span>Device voice</span><select class="field" data-k="voiceURI"></select></label>
      <p class="small muted">The app plays recorded audio where it exists and the iPhone's German voice everywhere else. For a better voice: Settings → Accessibility → Spoken Content → Voices → German → Anna (Enhanced).</p>
    </div>
    <div class="sec"><h3>Reported mistakes</h3></div><div class="panel reports"></div>
    <div class="sec"><h3>Backup</h3></div>
    <div class="panel"><p class="small muted">Your progress is stored only on this phone, and iOS may delete it. Save a backup file from time to time (Files / iCloud).</p>
      <div class="row"><button class="btn ghost" type="button" data-export>Save backup</button><label class="btn ghost">Restore from file<input type="file" accept="application/json,.json" data-import hidden></label></div></div>
    <div class="panel"><button class="btn danger" type="button" data-reset>Delete all progress</button></div>
    <p class="small muted about">Version ${APP_VERSION}. Videos: YourGermanTeacher and Max Yoko — the app only embeds them from YouTube. Pictures: emoji.</p></div>`);
  el.querySelector(".tp").append(themePicker());
  const vs = el.querySelector('[data-k="voiceURI"]');
  const fill = () => { const list = germanVoices(); vs.innerHTML = `<option value="">Automatic</option>` + list.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.settings.voiceURI ? "selected" : ""}>${esc(v.name)}</option>`).join(""); };
  fill(); setTimeout(fill, 700);
  el.querySelectorAll("[data-k]").forEach(inp => inp.addEventListener("change", () => {
    const k = inp.dataset.k;
    store.setSetting(k, k === "rate" ? Number(inp.value) : inp.value);
    speak("Guten Tag! Wie geht es Ihnen?");
  }));
  const rep = el.querySelector(".reports");
  if (!s.reports.length) rep.append(h(`<p class="muted small">Nothing yet. Tap the flag during a lesson to report something.</p>`));
  else {
    s.reports.slice().reverse().forEach(r => rep.append(h(`<div class="rep"><div class="small muted">${esc(r.where)}</div><div>${esc(r.text)}</div></div>`)));
    const cp = h(`<button class="btn" type="button">Copy all</button>`);
    cp.addEventListener("click", async () => toast((await copyText("German app — content reports:\n\n" + s.reports.map((r, i) => `${i + 1}. [${r.where}] ${r.text}`).join("\n"))) ? "Copied." : "Couldn't copy."));
    const clr = h(`<button class="btn ghost" type="button">Clear list</button>`);
    clr.addEventListener("click", () => { s.reports = []; store.save(); route(); });
    rep.append(h(`<div class="row"></div>`)); rep.lastChild.append(cp, clr);
  }
  el.querySelector("[data-export]").addEventListener("click", () => {
    const blob = new Blob([store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `german-backup-${store.dayKey()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  el.querySelector("[data-import]").addEventListener("change", async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try { store.importJSON(await f.text()); migrateProfile(); applyTheme(); toast("Restored."); route(); }
    catch (err) { toast("This file doesn't look like a backup."); }
  });
  el.querySelector("[data-reset]").addEventListener("click", () => {
    const box = h(`<div><h3>Delete everything?</h3><p>Your profile, progress and review cards will be deleted. This can't be undone unless you have a backup file.</p><div class="row end"><button class="btn ghost" type="button" data-c>Cancel</button><button class="btn danger" type="button" data-y>Delete</button></div></div>`);
    const close = modal(box);
    box.querySelector("[data-c]").addEventListener("click", close);
    box.querySelector("[data-y]").addEventListener("click", () => { store.resetAll(); close(); applyTheme(); location.hash = "#/onboard"; });
  });
  view.append(el);
}

boot();
