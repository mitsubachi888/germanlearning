// Text helpers: escaping, normalisation for answer checking, hint masking, word diff, tiny markdown.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Strict: keeps umlauts and ß (spelling errors with ä/ö/ü/ß count), ignores case, punctuation and spacing.
export function norm(s) {
  return String(s ?? "").normalize("NFC").toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[.,!?;:«»"“”„()\-–—…¿¡]/g, " ")
    .replace(/\s+/g, " ").trim();
}
// Loose: also maps ae/oe/ue/ss so we can tell "right word, wrong umlaut" apart from a real mistake.
export function loose(s) {
  return norm(s).replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}
// Same word if we ignore umlaut dots / ß entirely (Tschuss ≈ Tschüss, Strasse ≈ Straße).
export function sameButUmlauts(a, b) {
  const bare = s => norm(s).replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
  return loose(a) === loose(b) || bare(a) === bare(b);
}

export const ARTICLE_CLASS = { der: "der", die: "die", das: "das" };
// Wrap a leading der/die/das in its gender colour.
export function de(text) {
  const t = esc(String(text ?? "").normalize("NFC"));
  return t.replace(/^(der|die|das|Der|Die|Das)(\s)/, (_, a, sp) => `<span class="art ${a.toLowerCase()}">${a}</span>${sp}`);
}

function isWord(t) { return /\p{L}/u.test(t); }
function maskWord(w, keep) {
  const m = w.match(/^([\p{L}\-']+)(.*)$/u);
  if (!m) return esc(w);
  const letters = [...m[1]];
  if (letters.length <= keep) return esc(w);
  return `${esc(letters.slice(0, keep).join(""))}<span class="mask">${"_".repeat(letters.length - keep)}</span>${esc(m[2])}`;
}
// Shadowing hints. 1: full; 2: hide ~1/3 of the longer words; 3: first letter only.
export function hintLine(sentence, level) {
  if (level <= 1) return de(sentence);
  const parts = String(sentence).normalize("NFC").split(/(\s+)/);
  const wordIdx = parts.map((t, i) => (isWord(t) ? i : -1)).filter(i => i >= 0);
  if (level === 2) {
    const ranked = wordIdx.filter(i => parts[i].length >= 3).sort((a, b) => parts[b].length - parts[a].length);
    const hide = new Set(ranked.slice(0, Math.max(1, Math.round(wordIdx.length / 3))));
    return parts.map((t, i) => (hide.has(i) ? maskWord(t, t.length >= 6 ? 3 : 2) : esc(t))).join("");
  }
  return parts.map(t => (isWord(t) ? maskWord(t, 1) : esc(t))).join("");
}

export function wordDiff(expected, given) {
  const a = norm(expected).split(" ").filter(Boolean);
  const b = norm(given).split(" ").filter(Boolean);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { ops.push({ t: "ok", w: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "miss", w: a[i] }); i++; }
    else { ops.push({ t: "extra", w: b[j] }); j++; }
  }
  while (i < a.length) ops.push({ t: "miss", w: a[i++] });
  while (j < b.length) ops.push({ t: "extra", w: b[j++] });
  const ok = ops.filter(o => o.t === "ok").length;
  return { ops, exact: ok === a.length && b.length === a.length };
}
export function diffHtml(ops) {
  return ops.map(o => `<span class="${o.t === "ok" ? "okw" : o.t === "miss" ? "miss" : "extra"}">${esc(o.w)}</span>`).join(" ");
}

// Tiny markdown: paragraphs, "- " lists, **bold**, *italic*, {de:...} German with article colour.
export function md(src) {
  const inline = s => esc(s)
    .replace(/\{de:([^}]+)\}/g, (_, x) => `<span class="de">${de(x.replace(/&#39;/g, "'").replace(/&quot;/g, '"'))}</span>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>");
  return String(src ?? "").trim().split(/\n{2,}/).map(b => {
    const lines = b.split("\n");
    if (lines.every(l => /^\s*[-•]\s+/.test(l))) return "<ul>" + lines.map(l => `<li>${inline(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("") + "</ul>";
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export function enDate(d = new Date(), { weekday = false } = {}) {
  return `${weekday ? DAYS[d.getDay()] + ", " : ""}${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function enMonthYear(d) { return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
