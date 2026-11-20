import { esc, de, md, uzDate, uzMonthYear, UZ_DAYS_SHORT } from "./text.js";
import * as store from "./store.js";
import { ensureCard, grade, dueCards, stats } from "./srs.js";
import { speak, stop as stopAudio, loadManifest, germanVoices } from "./speech.js";
import { h, toast, modal, copyText, playBtn } from "./ui.js";
import STEP, { SKILL, SKILL_LABEL } from "./steps.js";
import * as plan from "./plan.js";
import { JOBS, HOBBIES, CITIES, aboutMe, jobOf } from "./profile.js";

const APP_VERSION = "0.1.0";
const THEMES = [
  ["lavender", "#DCD2FA", "#FFB627", "Lavanda"],
  ["rose", "#F8CFDC", "#FF6A3D", "Pushti"],
  ["sky", "#CBE5FB", "#FF5C8A", "Osmon"],
  ["butter", "#FFEFA3", "#6D4AFF", "Sariq"],
  ["mint", "#CFF0DC", "#D9367F", "Yalpiz"]
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
  if (id?.startsWith("me.")) return aboutMe(store.get().profile).find(x => x.id === id) || null;
  return items[id] || null;
}
const isReady = lid => !!lessons[lid];
const meta = lid => course.lessons.find(l => l.id === lid);

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
async function boot() {
  applyTheme();
  try {
    course = await loadJSON("content/course.json");
    await Promise.all(course.lessons.filter(l => l.file).map(async l => {
      const data = await loadJSON(`content/${l.id}.json`);
      lessons[l.id] = data;
      for (const [id, it] of Object.entries(data.items || {})) items[id] = { ...it, id, lesson: l.id };
    }));
  } catch (e) {
    view.innerHTML = `<div class="wrap"><div class="banner">Darslarni yuklab boʻlmadi. Internetni tekshirib, ilovani qayta oching.</div></div>`;
    return;
  }
  loadManifest();
  addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
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
  return w.streak ? `<span class="chip">🔥 ${w.streak} hafta</span>` : `<span class="chip">📅 Bu hafta ${w.thisWeek}/${w.target}</span>`;
}

function lessonState(l) {
  if (plan.lessonDone(l)) return "done";
  const u = plan.nextUnit(course);
  if (u && u.lesson.id === l.id) return "now";
  return isReady(l.id) ? "open" : "lock";
}

function stopNode(l, k) {
  const st = lessonState(l);
  const sub = l.mini ? "Rolli suhbat" : `${l.sessions === 2 ? "2 qism · " : ""}${Math.round((l.len || 0) / 60)} daq video`;
  const node = h(`<button type="button" class="node ${st}" style="--d:${k * 60}ms">
      <span class="stop" aria-hidden="true">${st === "done" ? "✓" : l.pic}</span>
      <span class="t"><b>${l.n ? l.n + ". " : ""}${esc(l.title)}</b><span>${st === "now" ? "Hozir · " : st === "lock" ? "Tayyorlanmoqda · " : ""}${sub}</span></span>
    </button>`);
  node.addEventListener("click", () => lessonSheet(l));
  return node;
}

function lessonSheet(l) {
  const el = h(`<div class="sheet">
    <div class="sheet-pic">${l.pic}</div>
    <div class="kicker">${l.n ? `${l.n}-dars` : "Mini-Gespräch"} · Bosqich ${l.stage}</div>
    <h2 class="de">${de(l.hero)}</h2><p class="muted">${esc(l.gloss || "")}</p>
    <h3>${esc(l.title)}</h3><div class="sess"></div></div>`);
  const box = el.querySelector(".sess");
  if (!isReady(l.id)) box.append(h(`<p class="muted">Bu dars hali tayyorlanmoqda.</p>`));
  else plan.sessionIds(l).forEach(sid => {
    const ses = lessons[l.id].sessions.find(x => x.id === sid);
    const done = store.sessionDone(plan.sessKey(l.id, sid));
    const a = h(`<a class="sess-row ${done ? "done" : ""}" href="#/l/${l.id}/${sid}"><span class="mark">${done ? "✓" : sid}</span><span>${esc(ses?.title || "")}<small>${ses?.steps.length || 0} ta mashq</small></span><span class="go">›</span></a>`);
    box.append(a);
  });
  const close = modal(el);
  el.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
}

/* ---------- home ---------- */
function todayCard() {
  const pack = plan.todayPack(course, isReady);
  const plan4 = (a, b, c, d) => `<div class="plan">
      <div><b>🃏</b>Takrorlash<small>${a}</small></div><div><b>🎬</b>Video<small>${b}</small></div>
      <div><b>🗣️</b>Gapirish<small>${c}</small></div><div><b>✍️</b>Yozish<small>${d}</small></div></div>`;
  if (pack.kind === "comeback") return h(`<section class="today enter">
      <div class="k">Xush kelibsiz!</div><h2>Avval takrorlaymiz</h2>
      <p>Siz ${pack.gap} kun dars qilmadingiz. Avval ${Math.min(pack.due, 15)} ta kartani takrorlang (~5 daqiqa), keyin yangi darsga oʻtamiz. Qarzdorlik yoʻq.</p>
      <a class="btn" href="#/pack/comeback">Takrorlashni boshlash</a></section>`);
  if (pack.kind === "reinforce") return h(`<section class="today enter">
      <div class="k">Mustahkamlash</div><h2>${esc(plan.TAGS[pack.tag] || pack.tag)}</h2>
      <p>Oxirgi mashqlarda bu mavzuda xatolar koʻp (${Math.round(pack.rate * 100)}%). Qisqa mustahkamlash qilamiz.</p>
      <a class="btn" href="#/pack/reinforce/${pack.tag}">Boshlash</a></section>`);
  if (pack.kind === "review") return h(`<section class="today enter">
      <div class="k">Umumiy takrorlash</div><h2>5 ta dars ortda!</h2>
      <p>Oʻtilgan soʻz va iboralarni mustahkamlash vaqti keldi.</p>
      <a class="btn" href="#/pack/review/${pack.block}">Boshlash</a></section>`);
  if (pack.kind === "done") return h(`<section class="today enter"><div class="k">Tabriklaymiz!</div><h2 class="de">Super gemacht!</h2><p>Barcha darslar tugadi. Takrorlashni davom ettiring.</p><a class="btn" href="#/review">Takrorlash</a></section>`);
  const l = pack.unit.lesson, sid = pack.unit.sid;
  const ses = lessons[l.id]?.sessions.find(x => x.id === sid);
  const href = pack.due > 0 ? `#/warmup/${l.id}/${sid}` : `#/l/${l.id}/${sid}`;
  const started = ses && ses.steps.some((_, k) => store.stepDone(`${l.id}.${sid}.${k}`));
  const card = h(`<section class="today enter">
      <div class="k">Bugungi 30 daqiqa</div>
      <h2 class="de">${de(l.hero)}</h2>
      <p>${l.n ? `${l.n}-dars` : "Mini-Gespräch"} · ${esc(l.title)}${l.sessions === 2 ? ` · ${sid === "A" ? "1" : "2"}/2 qism` : ""}</p>
      ${plan4(pack.due ? "5 daq" : "—", "12 daq", "10 daq", "3 daq")}
      ${pack.ready ? `<a class="btn" href="${href}">${started ? "Davom etish ▶" : "Boshlash ▶"}</a>` : `<div class="btn disabled" aria-disabled="true">Dars tayyorlanmoqda</div>`}
    </section>`);
  return card;
}

function renderHome() {
  const p = store.get().profile;
  const el = h(`<div class="wrap"></div>`);
  el.append(h(`<div class="hello enter"><h1>Salom, ${esc(p.name)} 👋<small>${uzDate(new Date(), { weekday: true })}</small></h1>${weeklyChip()}</div>`));
  el.append(todayCard());
  const st = stats();
  if (st.due) el.append(h(`<a class="rowcard enter" href="#/review"><span class="ico">🃏</span><span><b>${st.due} ta karta takrorlashni kutmoqda</b><small>Eng qiyinlari birinchi</small></span><span class="go">›</span></a>`));
  el.append(h(`<a class="rowcard enter" href="#/me"><span class="ico">🙋</span><span><b>Oʻzim haqimda — nemischa</b><small>Sizning maʼlumotlaringiz asosidagi gaplar</small></span><span class="go">›</span></a>`));

  const cur = plan.currentStage(course);
  const stg = course.stages[cur];
  const pr = plan.stageProgress(course, cur);
  el.append(h(`<div class="sec"><h3>Bosqich ${cur} · ${esc(stg.title)}</h3><span>${pr.done} / ${pr.total}</span></div>`));
  el.append(pathFor(cur));
  const nxt = course.stages[cur + 1];
  el.append(h(`<a class="next-stage" href="#/path">${nxt ? `Keyingi: Bosqich ${nxt.n} · ${esc(nxt.title)} — ${course.lessons.filter(l => l.stage === nxt.n && !l.mini).length} dars` : "Butun yoʻl xaritasi"} ›</a>`));
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
  const el = h(`<div class="wrap"><div class="pagehead enter"><a class="back" href="#/" aria-label="Orqaga">‹</a><h1>Yoʻl xaritasi</h1></div></div>`);
  course.stages.forEach(stg => {
    const pr = plan.stageProgress(course, stg.n);
    el.append(h(`<div class="sec"><h3>${stg.pic} Bosqich ${stg.n} · ${esc(stg.title)}</h3><span>${pr.done} / ${pr.total}</span></div>`));
    el.append(pathFor(stg.n));
  });
  view.append(el);
}

function renderMe() {
  const p = store.get().profile;
  const list = aboutMe(p);
  const el = h(`<div class="wrap"><div class="pagehead enter"><a class="back" href="#/" aria-label="Orqaga">‹</a><h1>Oʻzim haqimda</h1></div>
    <p class="muted">Bu gaplar sizning profilingizdan tuzilgan. Ularni yod oling — tanishuvda eng koʻp kerak boʻladi.</p><div class="cards"></div>
    <a class="btn ghost" href="#/onboard/1">Profilni tahrirlash</a></div>`);
  const box = el.querySelector(".cards");
  list.forEach((it, k) => {
    ensureCard(it.id);
    const row = h(`<div class="pcard enter" style="--d:${k * 40}ms"><div class="pic">${it.pic}</div><div class="txt"><div class="big de">${esc(it.de)}</div><div class="uz">${esc(it.uz)}</div></div><div class="btns"></div></div>`);
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
  const nextBtn = (label = "Keyingi", valid = () => true, msg = "") => {
    const b = h(`<button class="btn" type="button">${label}</button>`);
    b.addEventListener("click", () => { if (!valid()) { toast(msg); return; } go(i + 1); });
    return b;
  };
  const back = h(`<button class="btn ghost" type="button">Orqaga</button>`);
  back.addEventListener("click", () => go(i - 1));

  if (step === "welcome") {
    body.append(h(`<div class="ob-hero"><div class="big-emoji">🇩🇪</div><h1 class="de">Willkommen!</h1><p class="lead">Xush kelibsiz! Nemis tilini noldan, oʻz tezligingizda oʻrganamiz.</p>
      <ul class="ticks"><li>Haftasiga 3–4 marta, 30 daqiqadan</li><li>Video, tinglash, gapirish va yozish</li><li>Hammasi sizning hayotingiz haqidagi gaplar bilan</li></ul></div>`));
    foot.append(nextBtn("Boshlash"));
  }
  if (step === "name") {
    body.append(h(`<h2>Ismingiz nima?</h2><p class="muted">Nemischa gaplarda ishlatamiz: <span class="de">Ich heiße …</span></p>`));
    const inp = h(`<input class="field" autocomplete="given-name" autocapitalize="words" maxlength="30" placeholder="Masalan: Aziz" aria-label="Ism">`);
    inp.value = draft.name || "";
    inp.addEventListener("input", () => { draft.name = inp.value.trim().replace(/\s+/g, " "); });
    body.append(inp);
    foot.append(back, nextBtn("Keyingi", () => /^\p{L}[\p{L}\s'ʼʻ-]{0,29}$/u.test(draft.name || ""), "Ismingizni harflar bilan yozing."));
  }
  if (step === "form") {
    body.append(h(`<h2>Siz erkakmisiz yoki ayolmisiz?</h2><p class="muted">Nemis tilida kasb nomi shunga qarab oʻzgaradi. Masalan, “oʻqituvchi”: <span class="de">Lehrer</span> (erkak) / <span class="de">Lehrerin</span> (ayol).</p>`));
    const opts = h(`<div class="choices two"></div>`);
    [["m", "👨", "Erkak", "Ich bin Lehrer."], ["f", "👩", "Ayol", "Ich bin Lehrerin."]].forEach(([v, e, t, x]) => {
      const b = h(`<button type="button" class="choice ${draft.form === v ? "on" : ""}"><span class="e">${e}</span><b>${t}</b><small class="de">${x}</small></button>`);
      b.addEventListener("click", () => { draft.form = v; opts.querySelectorAll(".choice").forEach(c => c.classList.remove("on")); b.classList.add("on"); });
      opts.append(b);
    });
    body.append(opts);
    foot.append(back, nextBtn("Keyingi", () => !!draft.form, "Bittasini tanlang."));
  }
  if (step === "job") {
    body.append(h(`<h2>Kasbingiz?</h2><p class="muted">Roʻyxatdagi eng yaqinini tanlang.</p>`));
    const grid = h(`<div class="choices"></div>`);
    JOBS.forEach(j => {
      const b = h(`<button type="button" class="choice ${draft.job === j.id ? "on" : ""}"><span class="e">${j.pic}</span><b>${esc(j.uz)}</b><small class="de">${draft.form === "f" ? j.f : j.m}</small></button>`);
      b.addEventListener("click", () => { draft.job = j.id; grid.querySelectorAll(".choice").forEach(c => c.classList.remove("on")); b.classList.add("on"); });
      grid.append(b);
    });
    body.append(grid);
    foot.append(back, nextBtn("Keyingi", () => !!draft.job, "Kasbni tanlang."));
  }
  if (step === "city") {
    body.append(h(`<h2>Qaysi shaharda yashaysiz?</h2><p class="muted"><span class="de">Ich wohne in …</span></p>`));
    const grid = h(`<div class="choices chips"></div>`);
    const other = h(`<input class="field" maxlength="30" placeholder="Boshqa shahar" aria-label="Boshqa shahar" autocapitalize="words">`);
    CITIES.forEach(c => {
      const b = h(`<button type="button" class="choice ${draft.city?.de === c.de ? "on" : ""}"><b>${esc(c.uz)}</b><small class="de">${esc(c.de)}</small></button>`);
      b.addEventListener("click", () => { draft.city = c; other.value = ""; grid.querySelectorAll(".choice").forEach(x => x.classList.remove("on")); b.classList.add("on"); });
      grid.append(b);
    });
    if (draft.city && !CITIES.some(c => c.de === draft.city.de)) other.value = draft.city.de;
    other.addEventListener("input", () => { const v = other.value.trim(); grid.querySelectorAll(".choice").forEach(x => x.classList.remove("on")); draft.city = v ? { de: v, uz: v } : null; });
    body.append(grid, h(`<p class="small muted">Roʻyxatda yoʻq boʻlsa, shahar nomini yozing (faqat shahar nomi):</p>`), other);
    foot.append(back, nextBtn("Keyingi", () => !!draft.city?.de && /^\p{L}[\p{L}\s.'-]{0,29}$/u.test(draft.city.de), "Shaharni tanlang yoki yozing."));
  }
  if (step === "hobbies") {
    body.append(h(`<h2>Qiziqishlaringiz</h2><p class="muted">1–3 tasini tanlang. <span class="de">Ich … gern.</span></p>`));
    const grid = h(`<div class="choices"></div>`);
    HOBBIES.forEach(hb => {
      const b = h(`<button type="button" class="choice ${draft.hobbies.includes(hb.id) ? "on" : ""}"><span class="e">${hb.pic}</span><b>${esc(hb.uz.replace(/ni$/, ""))}</b><small class="de">${esc(hb.de)}</small></button>`);
      b.addEventListener("click", () => {
        const k = draft.hobbies.indexOf(hb.id);
        if (k >= 0) draft.hobbies.splice(k, 1);
        else { if (draft.hobbies.length >= 3) { toast("Koʻpi bilan 3 ta."); return; } draft.hobbies.push(hb.id); }
        b.classList.toggle("on", draft.hobbies.includes(hb.id));
      });
      grid.append(b);
    });
    body.append(grid);
    foot.append(back, nextBtn("Keyingi", () => draft.hobbies.length > 0, "Kamida bittasini tanlang."));
  }
  if (step === "family") {
    const f = (draft.family = draft.family || { married: null, kids: null, brothers: null, sisters: null });
    body.append(h(`<h2>Oilangiz <small class="muted">(ixtiyoriy)</small></h2><p class="muted">Faqat mashq uchun. Aytishni xohlamasangiz, oʻtkazib yuboring.</p>`));
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
    body.append(seg("Turmush qurganmisiz?", "married", [[true, "Ha"], [false, "Yoʻq"]]),
      seg("Farzandlar", "kids", nums), seg("Aka-ukalar", "brothers", nums), seg("Opa-singillar", "sisters", nums));
    const skip = h(`<button class="btn ghost" type="button">Oʻtkazib yuborish</button>`);
    skip.addEventListener("click", () => { draft.family = null; go(i + 1); });
    foot.append(skip, nextBtn("Keyingi"));
  }
  if (step === "days") {
    body.append(h(`<h2>Qaysi kunlari oʻqiysiz?</h2><p class="muted">3 yoki 4 kun tanlang. Bu qatʼiy jadval emas — ilova sizning haqiqiy tezligingizga moslashadi.</p>`));
    const row = h(`<div class="days"></div>`);
    [1, 2, 3, 4, 5, 6, 0].forEach(d => {
      const b = h(`<button type="button" class="${draft.days.includes(d) ? "on" : ""}">${UZ_DAYS_SHORT[d]}</button>`);
      b.addEventListener("click", () => {
        const k = draft.days.indexOf(d);
        if (k >= 0) draft.days.splice(k, 1); else { if (draft.days.length >= 4) { toast("Koʻpi bilan 4 kun."); return; } draft.days.push(d); }
        b.classList.toggle("on", draft.days.includes(d));
      });
      row.append(b);
    });
    body.append(row);
    foot.append(back, nextBtn("Keyingi", () => draft.days.length >= 3, "3 yoki 4 kun tanlang."));
  }
  if (step === "theme") {
    body.append(h(`<h2>Rangni tanlang</h2><p class="muted">Keyin Sozlamalarda oʻzgartirish mumkin.</p>`));
    body.append(themePicker());
    foot.append(back, nextBtn("Tayyor"));
  }
  if (step === "done") {
    store.setProfile(draft);
    draft = null;
    const list = aboutMe(store.get().profile);
    body.append(h(`<div class="ob-hero"><div class="big-emoji pop">🎉</div><h1 class="de">Super!</h1><p class="lead">Mana sizning birinchi nemischa gaplaringiz. ▶ tugmasini bosib tinglang.</p></div>`));
    const box = h(`<div class="cards"></div>`);
    list.slice(0, 4).forEach((it, k) => {
      const row = h(`<div class="pcard enter" style="--d:${k * 80}ms"><div class="pic">${it.pic}</div><div class="txt"><div class="big de">${esc(it.de)}</div><div class="uz">${esc(it.uz)}</div></div><div class="btns"></div></div>`);
      row.querySelector(".btns").append(playBtn(it.de));
      box.append(row);
    });
    body.append(box);
    const b = h(`<a class="btn" href="#/">Bosh sahifaga</a>`);
    foot.append(b);
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
  [["light", "☀️ Yorugʻ"], ["dark", "🌙 Qorongʻi"], ["auto", "⚙️ Avto"]].forEach(([m, t]) => {
    const b = h(`<button type="button" class="${s.mode === m ? "on" : ""}">${t}</button>`);
    b.addEventListener("click", () => { store.setSetting("mode", m); applyTheme(); wrap.querySelectorAll(".mode button").forEach(x => x.classList.toggle("on", x === b)); });
    wrap.querySelector(".mode").append(b);
  });
  return wrap;
}

/* ---------- lesson ---------- */
function renderLesson(lid, sid, stepIdx) {
  const m = meta(lid), L = lessons[lid];
  const ses = L?.sessions.find(x => x.id === sid);
  if (!m || !ses) { view.append(h(`<div class="wrap"><div class="banner">Dars topilmadi. <a href="#/">Bosh sahifa</a></div></div>`)); return; }
  if (stepIdx == null || isNaN(stepIdx)) { const k = ses.steps.findIndex((_, j) => !store.stepDone(`${lid}.${sid}.${j}`)); stepIdx = k < 0 ? 0 : k; }
  stepIdx = Math.max(0, Math.min(stepIdx, ses.steps.length - 1));
  const step = ses.steps[stepIdx];
  const key = `${lid}.${sid}.${stepIdx}`;
  store.touch();

  const top = h(`<div class="ltop">
      <a class="x" href="#/" aria-label="Darsni yopish">✕</a>
      <div class="segs">${ses.steps.map((_, k) => `<i class="${k < stepIdx || store.stepDone(`${lid}.${sid}.${k}`) ? "on" : k === stepIdx ? "now" : ""}"></i>`).join("")}</div>
      <button class="x" type="button" data-report aria-label="Xato haqida xabar">⚑</button></div>`);
  top.querySelector("[data-report]").addEventListener("click", () => reportModal(`${m.n ? m.n + "-dars" : m.id} · ${sid} · ${stepIdx + 1}-mashq: ${step.title || step.type}`));
  view.append(top);
  const wrap = h(`<div class="lesson enter"></div>`);
  wrap.append(h(`<div class="stepk">${stepIdx + 1} / ${ses.steps.length} · ${esc(SKILL_LABEL[step.skill || SKILL[step.type]] || "")}</div>`));
  if (step.title) wrap.append(h(`<h2 class="lh">${esc(step.title)}</h2>`));
  const body = h(`<div class="step-body"></div>`);
  wrap.append(body);
  view.append(wrap);
  const r = STEP[step.type];
  const ctx = { item, cleanup, key, profile: store.get().profile };
  if (r) r(step, body, ctx); else body.append(h(`<div class="banner">“${esc(step.type)}” turidagi mashq hali qoʻllab-quvvatlanmaydi.</div>`));

  const last = stepIdx === ses.steps.length - 1;
  const foot = h(`<div class="foot">${stepIdx > 0 ? `<a class="btn ghost" href="#/l/${lid}/${sid}/${stepIdx - 1}">Orqaga</a>` : ""}<button class="btn" type="button" data-next>${last ? "Darsni yakunlash" : "Davom etish"}</button></div>`);
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
  const el = h(`<div class="finish"><div class="big-emoji pop">🎉</div><h2>Ajoyib!</h2>
    <p class="muted">${esc(m.title)} · ${esc(ses.title)}</p>
    ${said.length ? `<h3>Bugun siz ayta oldingiz:</h3><div class="said">${said.map(it => `<div class="de">${de(it.de)}</div>`).join("")}</div>` : ""}
    <p class="small muted">Yangi soʻz va iboralar takrorlash kartalariga qoʻshildi.</p><div class="col"></div></div>`);
  const col = el.querySelector(".col");
  col.append(h(`<a class="btn" href="#/">Bosh sahifaga</a>`));
  col.append(h(`<a class="btn ghost" href="#/review">Takrorlash</a>`));
  const close = modal(el);
  el.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
  burst();
}

function burst() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = h(`<div class="burst" aria-hidden="true"></div>`);
  const em = ["✨", "⭐", "🎉", "💫"];
  for (let k = 0; k < 18; k++) {
    const s = document.createElement("span");
    s.textContent = em[k % em.length];
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
  const el = h(`<div><h3>Xato haqida xabar</h3><p class="small muted">${esc(where)}</p>
    <textarea class="field" rows="4" placeholder="Nima notoʻgʻri? Masalan: tarjima xato, ovoz notoʻgʻri…"></textarea>
    <div class="row end"><button class="btn ghost" type="button" data-c>Bekor qilish</button><button class="btn" type="button" data-s>Saqlash</button></div></div>`);
  const close = modal(el);
  el.querySelector("[data-c]").addEventListener("click", close);
  el.querySelector("[data-s]").addEventListener("click", () => {
    const t = el.querySelector("textarea").value.trim();
    if (!t) { toast("Avval xatoni yozing."); return; }
    store.addReport(where, t); close(); toast("Saqlandi. Sozlamalardan yuborishingiz mumkin.");
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
  const titles = { warmup: "Isinish: takrorlash", comeback: "Qaytganingiz bilan!", reinforce: `Mustahkamlash: ${plan.TAGS[arg] || ""}`, review: "Umumiy takrorlash", free: "Takrorlash" };
  const el = h(`<div class="wrap"><div class="pagehead enter">${mode === "free" ? "" : `<a class="back" href="#/" aria-label="Orqaga">‹</a>`}<h1>${esc(titles[mode] || "Takrorlash")}</h1></div><div class="rv"></div></div>`);
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
      box.append(h(`<div class="result enter"><div class="score">${done}</div><p><b>${done ? "ta karta takrorlandi" : "Hozircha takrorlash uchun karta yoʻq"}</b></p><p class="muted small">${st.total ? `Jami ${st.total} ta soʻz va ibora, ${st.learned} tasi yaxshi esda.` : "Dars oʻtganingizdan keyin kartalar paydo boʻladi."}</p></div>`));
      box.append(h(`<a class="btn" href="${then || "#/"}">${then ? "Darsga oʻtish ▶" : "Bosh sahifaga"}</a>`));
      return;
    }
    const id = queue[0], it = item(id);
    const c = s.srs[id];
    const reverse = c && c.box >= 2 && Math.random() < 0.5;
    box.append(h(`<div class="q-count wide"><i style="width:${Math.round((done / Math.max(1, total)) * 100)}%"></i></div>`));
    const card = h(`<div class="flash enter"></div>`);
    if (it.pic) card.append(h(`<div class="pic">${it.pic}</div>`));
    if (reverse) card.append(h(`<div><div class="small muted">Nemischa ayting:</div><h2>${esc(it.uz)}</h2></div>`));
    else {
      card.append(h(`<div class="big de">${de(it.de)}</div>`));
      const pr = h(`<div class="row center"></div>`); pr.append(playBtn(it.de)); card.append(pr);
      setTimeout(() => speak(it.de), 250);
    }
    const ans = h(`<div class="answer" hidden></div>`);
    if (reverse) { ans.append(h(`<div class="big de">${de(it.de)}</div>`)); const pr = h(`<div class="row center"></div>`); pr.append(playBtn(it.de)); ans.append(pr); }
    else ans.append(h(`<div><b>${esc(it.uz)}</b>${it.en ? `<div class="small muted">${esc(it.en)}</div>` : ""}</div>`));
    if (it.plural) ans.append(h(`<div class="small">koʻplik: <span class="de">${de(it.plural)}</span></div>`));
    card.append(ans);
    box.append(card);
    const showBtn = h(`<button class="btn" type="button">Javobni koʻrsatish</button>`);
    const grades = h(`<div class="grade" hidden><button class="btn g0" type="button" data-g="0">Unutdim</button><button class="btn ghost" type="button" data-g="1">Qiyin</button><button class="btn" type="button" data-g="2">Esladim</button></div>`);
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
  const el = h(`<div class="wrap"><div class="pagehead enter"><h1>Natijalar</h1></div></div>`);

  const stages = h(`<div class="stages enter"></div>`);
  course.stages.forEach(stg => {
    const pr = plan.stageProgress(course, stg.n);
    stages.append(h(`<a href="#/path" class="stage ${stg.n === cur ? "now" : pr.done === pr.total ? "done" : ""}"><span class="e">${pr.done === pr.total ? "✓" : stg.pic}</span><b>${stg.n}</b><i><u style="width:${Math.round((pr.done / pr.total) * 100)}%"></u></i></a>`));
  });
  el.append(h(`<div class="sec"><h3>Bosqich ${cur} · ${esc(course.stages[cur].title)}</h3><a href="#/path">Xarita ›</a></div>`), stages);

  el.append(h(`<section class="eta enter"><div class="k">A1 darajasini taxminiy tugatish</div><div class="when de">${uzMonthYear(e.date)}</div>
    <p class="small">${e.sessionsLeft} ta mashgʻulot qoldi · haftasiga ~${e.perWeek.toFixed(1).replace(".0", "")} ta ${e.measured ? "(sizning haqiqiy tezligingiz)" : "(rejadagi kunlar boʻyicha)"}</p></section>`));

  const hrs = Math.floor(s.minutes / 60), mins = Math.round(s.minutes % 60);
  el.append(h(`<div class="stats enter">
    <div class="stat"><b>${hrs ? `${hrs}s ${mins}d` : `${mins} d`}</b><span>jami vaqt</span></div>
    <div class="stat"><b>${w.streak ? `${w.streak}🔥` : `${w.thisWeek}/${w.target}`}</b><span>${w.streak ? "hafta ketma-ket" : "bu hafta"}</span></div>
    <div class="stat"><b>${st.learned}</b><span>yaxshi esda</span></div></div>`));

  const max = Math.max(1, ...Object.values(s.skills));
  el.append(h(`<div class="sec"><h3>Koʻnikmalar</h3></div>`));
  el.append(h(`<div class="panel skills enter">${["listen", "speak", "read", "write"].map(k => `<div class="sk"><span>${{ listen: "🎧", speak: "🗣️", read: "📖", write: "✍️" }[k]} ${SKILL_LABEL[k]}</span><i><u style="width:${Math.round(((s.skills[k] || 0) / max) * 100)}%"></u></i><b>${s.skills[k] || 0}</b></div>`).join("")}<p class="small muted">Bajarilgan mashqlar soni.</p></div>`));

  const errs = Object.entries(s.errors).sort((a, b) => b[1] - a[1]).slice(0, 4);
  el.append(h(`<div class="sec"><h3>Eng koʻp xatolar</h3></div>`));
  el.append(errs.length
    ? h(`<div class="panel enter">${errs.map(([t, n]) => `<div class="err"><span>${esc(plan.TAGS[t] || t)}</span><span class="chip">${n}</span></div>`).join("")}<p class="small muted">Takrorlash shu mavzularga koʻproq eʼtibor beradi.</p></div>`)
    : h(`<div class="panel enter muted">Hali xatolar yoʻq.</div>`));
  view.append(el);
}

/* ---------- settings ---------- */
function renderSettings() {
  const s = store.get();
  const p = s.profile;
  const el = h(`<div class="wrap"><div class="pagehead enter"><h1>Sozlamalar</h1></div>
    <div class="sec"><h3>Profil</h3></div>
    <a class="rowcard" href="#/onboard/1"><span class="ico">🙋</span><span><b>${esc(p.name)}</b><small>${esc(jobOf(p)?.uz || "")} · ${esc(p.city?.uz || "")}</small></span><span class="go">Tahrirlash ›</span></a>
    <div class="sec"><h3>Koʻrinish</h3></div><div class="panel tp"></div>
    <div class="sec"><h3>Ovoz</h3></div>
    <div class="panel">
      <label class="setting"><span>Tezlik</span><select class="field" data-k="rate">${[0.8, 0.9, 1].map(v => `<option value="${v}" ${Number(s.settings.rate) === v ? "selected" : ""}>${v === 1 ? "Oddiy" : v + "×"}</option>`).join("")}</select></label>
      <label class="setting"><span>Qurilma ovozi</span><select class="field" data-k="voiceURI"></select></label>
      <p class="small muted">Asosiy ovoz — tayyor audio yozuvlar. Ular yoʻq joyda iPhone ovozi ishlatiladi. Nemischa ovoz boʻlmasa: Sozlamalar → Universal kirish → Oʻqib berish → Ovozlar → Nemis tili (masalan, Anna).</p>
    </div>
    <div class="sec"><h3>Xato haqida xabarlar</h3></div><div class="panel reports"></div>
    <div class="sec"><h3>Zaxira nusxa</h3></div>
    <div class="panel"><p class="small muted">Natijalar faqat shu telefonda saqlanadi va iOS ularni oʻchirib yuborishi mumkin. Vaqti-vaqti bilan faylga saqlang (Fayllar / iCloud).</p>
      <div class="row"><button class="btn ghost" type="button" data-export>Faylga saqlash</button><label class="btn ghost">Fayldan tiklash<input type="file" accept="application/json,.json" data-import hidden></label></div></div>
    <div class="panel"><button class="btn danger" type="button" data-reset>Barcha natijalarni oʻchirish</button></div>
    <p class="small muted about">Versiya ${APP_VERSION}. Videolar: YourGermanTeacher va Max Yoko kanallari — ilova ularni faqat joylashtiradi (YouTube). Rasmlar: emoji.</p></div>`);
  el.querySelector(".tp").append(themePicker());
  const vs = el.querySelector('[data-k="voiceURI"]');
  const fill = () => { const list = germanVoices(); vs.innerHTML = `<option value="">Avtomatik</option>` + list.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.settings.voiceURI ? "selected" : ""}>${esc(v.name)}</option>`).join(""); };
  fill(); setTimeout(fill, 700);
  el.querySelectorAll("[data-k]").forEach(inp => inp.addEventListener("change", () => {
    const k = inp.dataset.k;
    store.setSetting(k, k === "rate" ? Number(inp.value) : inp.value);
    speak("Guten Tag! Wie geht es Ihnen?");
  }));
  const rep = el.querySelector(".reports");
  if (!s.reports.length) rep.append(h(`<p class="muted small">Hozircha yoʻq. Dars vaqtida ⚑ tugmasini bosing.</p>`));
  else {
    s.reports.slice().reverse().forEach(r => rep.append(h(`<div class="rep"><div class="small muted">${esc(r.where)}</div><div>${esc(r.text)}</div></div>`)));
    const cp = h(`<button class="btn" type="button">Hammasini nusxalash</button>`);
    cp.addEventListener("click", async () => toast((await copyText("German app — content reports:\n\n" + s.reports.map((r, i) => `${i + 1}. [${r.where}] ${r.text}`).join("\n"))) ? "Nusxalandi." : "Nusxalab boʻlmadi."));
    const clr = h(`<button class="btn ghost" type="button">Roʻyxatni tozalash</button>`);
    clr.addEventListener("click", () => { s.reports = []; store.save(); route(); });
    rep.append(h(`<div class="row"></div>`)); rep.lastChild.append(cp, clr);
  }
  el.querySelector("[data-export]").addEventListener("click", () => {
    const blob = new Blob([store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `nemis-tili-zaxira-${store.dayKey()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  el.querySelector("[data-import]").addEventListener("change", async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try { store.importJSON(await f.text()); applyTheme(); toast("Tiklandi."); route(); }
    catch (err) { toast("Bu fayl zaxira nusxaga oʻxshamaydi."); }
  });
  el.querySelector("[data-reset]").addEventListener("click", () => {
    const box = h(`<div><h3>Hammasini oʻchirasizmi?</h3><p>Profil, natijalar va kartalar oʻchiriladi. Buni qaytarib boʻlmaydi (agar zaxira nusxa boʻlmasa).</p><div class="row end"><button class="btn ghost" type="button" data-c>Bekor qilish</button><button class="btn danger" type="button" data-y>Oʻchirish</button></div></div>`);
    const close = modal(box);
    box.querySelector("[data-c]").addEventListener("click", close);
    box.querySelector("[data-y]").addEventListener("click", () => { store.resetAll(); close(); applyTheme(); location.hash = "#/onboard"; });
  });
  view.append(el);
}

boot();
