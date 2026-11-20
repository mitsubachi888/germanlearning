// Controlled lists for personalised example sentences. Every German form here is fixed, so sentences
// built from the learner's profile are always grammatical (no free text inside German sentences except city names).

// m / f = job title for a man / a woman. beruf: false → "Ich bin Student." (no "von Beruf"). en includes the article.
export const JOBS = [
  { id: "student",    m: "Student",        f: "Studentin",        en: "a student",            beruf: false, pic: "🎓" },
  { id: "schueler",   m: "Schüler",        f: "Schülerin",        en: "a pupil",              beruf: false, pic: "🎒" },
  { id: "lehrer",     m: "Lehrer",         f: "Lehrerin",         en: "a teacher",            beruf: true,  pic: "👩‍🏫" },
  { id: "arzt",       m: "Arzt",           f: "Ärztin",           en: "a doctor",             beruf: true,  pic: "🩺" },
  { id: "pfleger",    m: "Krankenpfleger", f: "Krankenpflegerin", en: "a nurse",              beruf: true,  pic: "🏥" },
  { id: "ingenieur",  m: "Ingenieur",      f: "Ingenieurin",      en: "an engineer",          beruf: true,  pic: "🏗️" },
  { id: "programm",   m: "Programmierer",  f: "Programmiererin",  en: "a programmer",         beruf: true,  pic: "💻" },
  { id: "verkaeufer", m: "Verkäufer",      f: "Verkäuferin",      en: "a shop assistant",     beruf: true,  pic: "🛒" },
  { id: "koch",       m: "Koch",           f: "Köchin",           en: "a cook",               beruf: true,  pic: "👨‍🍳" },
  { id: "kellner",    m: "Kellner",        f: "Kellnerin",        en: "a waiter",             beruf: true,  pic: "🍽️" },
  { id: "fahrer",     m: "Fahrer",         f: "Fahrerin",         en: "a driver",             beruf: true,  pic: "🚗" },
  { id: "mechaniker", m: "Mechaniker",     f: "Mechanikerin",     en: "a mechanic",           beruf: true,  pic: "🔧" },
  { id: "elektriker", m: "Elektriker",     f: "Elektrikerin",     en: "an electrician",       beruf: true,  pic: "💡" },
  { id: "buchhalter", m: "Buchhalter",     f: "Buchhalterin",     en: "an accountant",        beruf: true,  pic: "📊" },
  { id: "friseur",    m: "Friseur",        f: "Friseurin",        en: "a hairdresser",        beruf: true,  pic: "💇" },
  { id: "manager",    m: "Manager",        f: "Managerin",        en: "a manager",            beruf: true,  pic: "💼" }
];
export const jobLabel = j => j.en.replace(/^an? /, "");

// de = full sentence; en = English translation; label = short name for the picker.
export const HOBBIES = [
  { id: "lesen",    de: "Ich lese gern.",            en: "I like reading.",             label: "reading",      pic: "📚" },
  { id: "kochen",   de: "Ich koche gern.",           en: "I like cooking.",             label: "cooking",      pic: "🍲" },
  { id: "fussball", de: "Ich spiele gern Fußball.",  en: "I like playing football.",    label: "football",     pic: "⚽" },
  { id: "reisen",   de: "Ich reise gern.",           en: "I like travelling.",          label: "travelling",   pic: "✈️" },
  { id: "musik",    de: "Ich höre gern Musik.",      en: "I like listening to music.",  label: "music",        pic: "🎧" },
  { id: "schwimmen",de: "Ich schwimme gern.",        en: "I like swimming.",            label: "swimming",     pic: "🏊" },
  { id: "tanzen",   de: "Ich tanze gern.",           en: "I like dancing.",             label: "dancing",      pic: "💃" },
  { id: "singen",   de: "Ich singe gern.",           en: "I like singing.",             label: "singing",      pic: "🎤" },
  { id: "foto",     de: "Ich fotografiere gern.",    en: "I like taking photos.",       label: "photography",  pic: "📷" },
  { id: "malen",    de: "Ich male gern.",            en: "I like painting.",            label: "painting",     pic: "🎨" },
  { id: "schach",   de: "Ich spiele gern Schach.",   en: "I like playing chess.",       label: "chess",        pic: "♟️" },
  { id: "filme",    de: "Ich sehe gern Filme.",      en: "I like watching films.",      label: "films",        pic: "🎬" },
  { id: "wandern",  de: "Ich wandere gern.",         en: "I like hiking.",              label: "hiking",       pic: "🥾" },
  { id: "rad",      de: "Ich fahre gern Fahrrad.",   en: "I like cycling.",             label: "cycling",      pic: "🚲" }
];

// German exonyms for cities. The learner may also type another city name (used only after "in").
export const CITIES = [
  { de: "Taschkent", en: "Tashkent" }, { de: "Samarkand", en: "Samarkand" }, { de: "Buchara", en: "Bukhara" },
  { de: "Namangan", en: "Namangan" }, { de: "Andischan", en: "Andijan" }, { de: "Fergana", en: "Fergana" },
  { de: "Karschi", en: "Qarshi" }, { de: "Nukus", en: "Nukus" }, { de: "Termez", en: "Termez" },
  { de: "Urgentsch", en: "Urgench" }, { de: "Chiwa", en: "Khiva" },
  { de: "Berlin", en: "Berlin" }, { de: "München", en: "Munich" }, { de: "Hamburg", en: "Hamburg" },
  { de: "Frankfurt", en: "Frankfurt" }, { de: "Köln", en: "Cologne" }
];

const NUM = ["", "ein", "zwei", "drei", "vier", "fünf"];
const EN_NUM = ["no", "one", "two", "three", "four", "five"];

function count(n, sg, pl, art) {
  // art: "en" (einen Bruder), "e" (eine Schwester), "" (ein Kind)
  return n === 1 ? `${NUM[1]}${art} ${sg}` : `${NUM[n]} ${pl}`;
}
const enCount = (n, sg, pl) => `${EN_NUM[n]} ${n === 1 ? sg : pl}`;

export function jobOf(p) { return JOBS.find(j => j.id === p?.job); }

// Returns [{ id, de, en, pic }] sentences about the learner.
export function aboutMe(p) {
  if (!p) return [];
  const out = [];
  out.push({ id: "me.name", de: `Ich heiße ${p.name}.`, en: `My name is ${p.name}.`, pic: "👋" });
  out.push({ id: "me.from", de: "Ich komme aus Usbekistan.", en: "I'm from Uzbekistan.", pic: "🇺🇿" });
  if (p.city?.de) out.push({ id: "me.city", de: `Ich wohne in ${p.city.de}.`, en: `I live in ${p.city.en || p.city.de}.`, pic: "🏙️" });
  const j = jobOf(p);
  if (j) {
    const t = p.form === "f" ? j.f : j.m;
    out.push({ id: "me.job", de: j.beruf ? `Ich bin ${t} von Beruf.` : `Ich bin ${t}.`, en: `I'm ${j.en}.`, pic: j.pic });
  }
  for (const hid of p.hobbies || []) {
    const hb = HOBBIES.find(x => x.id === hid);
    if (hb) out.push({ id: "me.hobby." + hid, de: hb.de, en: hb.en, pic: hb.pic });
  }
  const f = p.family;
  if (f) {
    if (f.married === true) out.push({ id: "me.married", de: "Ich bin verheiratet.", en: "I'm married.", pic: "💍" });
    if (f.married === false) out.push({ id: "me.single", de: "Ich bin ledig.", en: "I'm single.", pic: "🙂" });
    if (Number.isInteger(f.kids)) out.push(f.kids === 0
      ? { id: "me.kids", de: "Ich habe keine Kinder.", en: "I don't have any children.", pic: "🧒" }
      : { id: "me.kids", de: `Ich habe ${count(f.kids, "Kind", "Kinder", "")}.`, en: `I have ${enCount(f.kids, "child", "children")}.`, pic: "🧒" });
    const b = f.brothers, s = f.sisters;
    if (Number.isInteger(b) && Number.isInteger(s)) {
      if (b === 0 && s === 0) out.push({ id: "me.sibl", de: "Ich habe keine Geschwister.", en: "I don't have any brothers or sisters.", pic: "👤" });
      else {
        const de = [], en = [];
        if (b) { de.push(count(b, "Bruder", "Brüder", "en")); en.push(enCount(b, "brother", "brothers")); }
        if (s) { de.push(count(s, "Schwester", "Schwestern", "e")); en.push(enCount(s, "sister", "sisters")); }
        out.push({ id: "me.sibl", de: `Ich habe ${de.join(" und ")}.`, en: `I have ${en.join(" and ")}.`, pic: "👫" });
      }
    }
  }
  return out;
}
