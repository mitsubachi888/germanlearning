// Validates content JSON: parses, every referenced item exists, nouns have gender (+ plural or a note),
// quiz answers are in range, session ids match course.json. Usage: node tools/check-content.mjs
import { readFileSync } from "node:fs";

const read = f => JSON.parse(readFileSync(new URL(`../content/${f}.json`, import.meta.url), "utf8"));
const course = read("course");
let problems = 0;
const warn = (...a) => { problems++; console.log("  ✗", ...a); };

const seen = new Map(); // item ids are global in the app: the same id must mean the same thing everywhere
for (const l of course.lessons.filter(l => l.file)) {
  const j = read(l.id);
  for (const [id, it] of Object.entries(j.items)) {
    const prev = seen.get(id);
    if (prev && (prev.it.de !== it.de || prev.it.en !== it.en)) warn(`${id}: defined differently in ${prev.lesson} and ${l.id}`);
    seen.set(id, { it, lesson: l.id });
  }
  console.log(`${l.id}: ${Object.keys(j.items).length} items, ${j.sessions.length} session(s)`);
  const ids = new Set(Object.keys(j.items));
  // items from earlier lessons may be reused (the app keeps one global item map)
  const ref = (id, where) => { if (!id.startsWith("me.") && !ids.has(id) && !seen.has(id)) warn(`${where}: missing item ${id}`); };
  const want = l.sessions === 2 ? ["A", "B"] : ["A"];
  if (JSON.stringify(j.sessions.map(s => s.id)) !== JSON.stringify(want)) warn(`sessions ${j.sessions.map(s => s.id)} ≠ ${want}`);
  for (const [id, it] of Object.entries(j.items)) {
    if (!it.de || !it.en) warn(`${id}: needs de + en`);
    if (/^(der|die|das) /.test(it.de) && id.startsWith("n.")) {
      if (it.gender !== it.de.split(" ")[0]) warn(`${id}: gender field ≠ article`);
      if (!it.plural && !/plural/i.test(it.note || "")) warn(`${id}: noun without plural or "no plural" note`);
    }
  }
  for (const s of j.sessions) for (const [k, st] of s.steps.entries()) {
    const w = `${s.id}.${k} ${st.type}`;
    (s.said || []).forEach(id => ref(id, `${s.id} said`));
    (st.items && Array.isArray(st.items) && typeof st.items[0] === "string") && st.items.forEach(id => ref(id, w));
    (st.letters || []).forEach(L => L.item && ref(L.item, w));
    (st.lines || []).forEach(L => L.item && ref(L.item, w));
    (st.prompts || []).forEach(p => p.item && ref(p.item, w));
    (st.modelItems || []).forEach(id => ref(id, w));
    (st.questions || []).forEach((q, n) => {
      if (q.item) ref(q.item, w);
      (q.options || []).forEach(o => st.type === "picquiz" && ref(o, w));
      if (q.options && st.type !== "picquiz" && !(q.answer >= 0 && q.answer < q.options.length)) warn(`${w} q${n}: answer out of range`);
      if (st.type === "picquiz" && !q.options.includes(q.item)) warn(`${w} q${n}: target not in options`);
    });
    if (st.type === "video" && !(st.end > (st.start || 0))) warn(`${w}: bad start/end`);
  }
}
console.log(problems ? `\n${problems} problem(s)` : "\nOK");
process.exitCode = problems ? 1 : 0;
