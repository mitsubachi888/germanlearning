// Generate German audio with ElevenLabs for every German text in content/*.json (+ fixed profile sentences).
//
//   node tools/gen-audio.mjs --dry-run                 count characters that still need audio (no API call)
//   node tools/gen-audio.mjs --voice <VOICE_ID>        generate missing files
//   options: --model eleven_multilingual_v2 (default) · --only d01,d02 · --limit 50 · --lang de (force language_code)
//
// The API key is read from the environment variable ELEVENLABS_API_KEY and is never printed or written anywhere.
// File name = sha1(sentText + voiceId + model) → audio/<hash>.mp3 — existing files are skipped (no characters spent twice).
// audio/manifest.json maps the displayed text → file, which the app plays (slow = playbackRate 0.75).
// tools/pronunciation-fixes.json: { "displayed text": "text sent to the API" } to fix a mispronunciation
// (e.g. add a pause) while the app keeps showing the original text.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const ROOT = new URL("../", import.meta.url);
const arg = name => { const i = process.argv.indexOf("--" + name); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); };
const DRY = !!arg("dry-run");
const MODEL = arg("model") || "eleven_multilingual_v2";
const VOICE = arg("voice") || process.env.ELEVENLABS_VOICE_ID || "";
const ONLY = arg("only") ? String(arg("only")).split(",") : null;
const LIMIT = Number(arg("limit")) || Infinity;
// language_code is only accepted by some models; send it for those (or when forced with --lang).
const LANG = arg("lang") || (/^eleven_(turbo|flash)_v2_5$/.test(MODEL) ? "de" : null);

const normKey = t => String(t ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const readJSON = p => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));

/* ---------- collect texts ---------- */
const texts = new Map(); // key -> { text, where:Set }
function add(t, where) {
  const k = normKey(t);
  if (!k || !/\p{L}/u.test(k)) return;
  if (!texts.has(k)) texts.set(k, { text: k, where: new Set() });
  texts.get(k).where.add(where);
}

const course = readJSON("content/course.json");
for (const l of course.lessons) {
  if (ONLY && !ONLY.includes(l.id)) continue;
  if (l.hero && !l.hero.includes("…")) add(l.hero, l.id);
  if (!l.file) continue;
  const j = readJSON(`content/${l.id}.json`);
  for (const it of Object.values(j.items)) { add(it.de, l.id); if (it.plural) add(it.plural, l.id); }
  for (const s of j.sessions) for (const st of s.steps) {
    (st.letters || []).forEach(L => add(L.say, l.id));
    (st.lines || []).forEach(L => L.de && add(L.de, l.id));
    (st.prompts || []).forEach(p => { add(p.q, l.id); if (p.example) add(p.example, l.id); });
    (st.items || []).forEach(c => typeof c === "object" && c.example && add(c.example, l.id));
    if (st.model) st.model.split(/(?<=[.!?])\s+/).forEach(x => !x.includes("·") && add(x, l.id));
    (st.questions || []).forEach(q => {
      if (q.say) add(q.say, l.id);
      if (q.answer && typeof q.answer === "string") add(q.answer, l.id);
      if (q.deOptions) q.options.forEach(o => add(o, l.id));
    });
  }
}
// Fixed profile sentences (everything except name and city, which are typed by the learner).
if (!ONLY) {
  const src = readFileSync(new URL("js/profile.js", ROOT), "utf8");
  const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  add("Ich komme aus Usbekistan.", "profile");
  for (const j of mod.JOBS) for (const t of [j.m, j.f]) add(j.beruf ? `Ich bin ${t} von Beruf.` : `Ich bin ${t}.`, "profile");
  for (const hb of mod.HOBBIES) add(hb.de, "profile");
  ["Ich bin verheiratet.", "Ich bin ledig.", "Ich habe keine Kinder.", "Ich habe keine Geschwister."].forEach(t => add(t, "profile"));
  const base = { name: "X", form: "m", hobbies: [] };
  for (let n = 1; n <= 5; n++) for (const [b, s] of [[n, 0], [0, n]]) {
    mod.aboutMe({ ...base, family: { kids: n, brothers: b, sisters: s } }).filter(x => x.id === "me.kids" || x.id === "me.sibl").forEach(x => add(x.de, "profile"));
  }
}

/* ---------- plan ---------- */
const fixes = existsSync(new URL("tools/pronunciation-fixes.json", ROOT)) ? readJSON("tools/pronunciation-fixes.json") : {};
const fileFor = sent => createHash("sha1").update(`${sent}|${VOICE || "VOICE"}|${MODEL}`).digest("hex").slice(0, 16) + ".mp3";
mkdirSync(new URL("audio/", ROOT), { recursive: true });
const have = new Set(readdirSync(new URL("audio/", ROOT)).filter(f => f.endsWith(".mp3")));
const manifestPath = new URL("audio/manifest.json", ROOT);
const manifest = existsSync(manifestPath) ? (readJSON("audio/manifest.json").files || {}) : {};

const todo = [];
let allChars = 0;
for (const { text } of texts.values()) {
  const sent = fixes[text] || text;
  allChars += sent.length;
  const f = fileFor(sent);
  if (VOICE && have.has(f)) { manifest[text] = "audio/" + f; continue; }
  todo.push({ text, sent, file: f });
}
const todoChars = todo.reduce((n, t) => n + t.sent.length, 0);

const byLesson = {};
for (const { text } of todo) for (const w of texts.get(text).where) byLesson[w] = (byLesson[w] || 0) + (fixes[text] || text).length;
console.log(`Texts: ${texts.size} unique · ${allChars} characters in total`);
console.log(`Missing audio: ${todo.length} texts · ${todoChars} characters${VOICE ? "" : " (no voice chosen yet — counting everything)"}`);
console.log("By lesson (a text used in several lessons is counted in each):", Object.entries(byLesson).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log(`Model: ${MODEL}${LANG ? ` · language_code=${LANG}` : ""}`);
if (DRY) process.exit(0);

/* ---------- generate ---------- */
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("ELEVENLABS_API_KEY is not set in this environment. Restart the terminal / Claude Code after creating it."); process.exit(1); }
if (!VOICE) { console.error("Choose a voice first: --voice <VOICE_ID>"); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function tts(t) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: t.sent, model_id: MODEL, ...(LANG ? { language_code: LANG } : {}), voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const body = (await r.text()).slice(0, 300);
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * attempt); continue; }
    throw new Error(`HTTP ${r.status}: ${body}`);
  }
  throw new Error("too many retries");
}

let done = 0, spent = 0;
const queue = todo.slice(0, LIMIT);
const save = () => writeFileSync(manifestPath, JSON.stringify({ voice: VOICE, model: MODEL, files: manifest }, null, 1));
async function worker() {
  while (queue.length) {
    const t = queue.shift();
    try {
      writeFileSync(new URL("audio/" + t.file, ROOT), await tts(t));
      manifest[t.text] = "audio/" + t.file;
      done++; spent += t.sent.length;
      if (done % 20 === 0) { save(); console.log(`  ${done} files · ${spent} characters`); }
    } catch (e) { console.error(`  ✗ "${t.text}": ${e.message}`); }
  }
}
await Promise.all([worker(), worker()]);
save();
console.log(`Done: ${done} files, ${spent} characters used.`);
