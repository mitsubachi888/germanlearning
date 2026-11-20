// Controlled lists for personalised example sentences. Every German form here is fixed, so sentences
// built from the learner's profile are always grammatical (no free text inside German sentences except city names).

// m / f = job title for a man / a woman. beruf: false → "Ich bin Student." (no "von Beruf").
export const JOBS = [
  { id: "student",    m: "Student",        f: "Studentin",        uz: "talaba",          beruf: false, pic: "🎓" },
  { id: "schueler",   m: "Schüler",        f: "Schülerin",        uz: "oʻquvchi",        beruf: false, pic: "🎒" },
  { id: "lehrer",     m: "Lehrer",         f: "Lehrerin",         uz: "oʻqituvchi",      beruf: true,  pic: "👩‍🏫" },
  { id: "arzt",       m: "Arzt",           f: "Ärztin",           uz: "shifokor",        beruf: true,  pic: "🩺" },
  { id: "pfleger",    m: "Krankenpfleger", f: "Krankenpflegerin", uz: "hamshira / tibbiyot xodimi",        beruf: true,  pic: "🏥" },
  { id: "ingenieur",  m: "Ingenieur",      f: "Ingenieurin",      uz: "muhandis",        beruf: true,  pic: "🏗️" },
  { id: "programm",   m: "Programmierer",  f: "Programmiererin",  uz: "dasturchi",       beruf: true,  pic: "💻" },
  { id: "verkaeufer", m: "Verkäufer",      f: "Verkäuferin",      uz: "sotuvchi",        beruf: true,  pic: "🛒" },
  { id: "koch",       m: "Koch",           f: "Köchin",           uz: "oshpaz",          beruf: true,  pic: "👨‍🍳" },
  { id: "kellner",    m: "Kellner",        f: "Kellnerin",        uz: "ofitsiant",       beruf: true,  pic: "🍽️" },
  { id: "fahrer",     m: "Fahrer",         f: "Fahrerin",         uz: "haydovchi",       beruf: true,  pic: "🚗" },
  { id: "mechaniker", m: "Mechaniker",     f: "Mechanikerin",     uz: "mexanik",         beruf: true,  pic: "🔧" },
  { id: "elektriker", m: "Elektriker",     f: "Elektrikerin",     uz: "elektrik",        beruf: true,  pic: "💡" },
  { id: "buchhalter", m: "Buchhalter",     f: "Buchhalterin",     uz: "buxgalter",       beruf: true,  pic: "📊" },
  { id: "friseur",    m: "Friseur",        f: "Friseurin",        uz: "sartarosh",       beruf: true,  pic: "💇" },
  { id: "manager",    m: "Manager",        f: "Managerin",        uz: "menejer",         beruf: true,  pic: "💼" }
];

// de = full sentence; uz = verbal noun in accusative + "yaxshi koʻraman" is appended.
export const HOBBIES = [
  { id: "lesen",    de: "Ich lese gern.",            uz: "kitob oʻqishni",        pic: "📚" },
  { id: "kochen",   de: "Ich koche gern.",           uz: "ovqat pishirishni",     pic: "🍲" },
  { id: "fussball", de: "Ich spiele gern Fußball.",  uz: "futbol oʻynashni",      pic: "⚽" },
  { id: "reisen",   de: "Ich reise gern.",           uz: "sayohat qilishni",      pic: "✈️" },
  { id: "musik",    de: "Ich höre gern Musik.",      uz: "musiqa tinglashni",     pic: "🎧" },
  { id: "schwimmen",de: "Ich schwimme gern.",        uz: "suzishni",              pic: "🏊" },
  { id: "tanzen",   de: "Ich tanze gern.",           uz: "raqs tushishni",        pic: "💃" },
  { id: "singen",   de: "Ich singe gern.",           uz: "qoʻshiq aytishni",      pic: "🎤" },
  { id: "foto",     de: "Ich fotografiere gern.",    uz: "suratga olishni",       pic: "📷" },
  { id: "malen",    de: "Ich male gern.",            uz: "rasm chizishni",        pic: "🎨" },
  { id: "schach",   de: "Ich spiele gern Schach.",   uz: "shaxmat oʻynashni",     pic: "♟️" },
  { id: "filme",    de: "Ich sehe gern Filme.",      uz: "film koʻrishni",        pic: "🎬" },
  { id: "wandern",  de: "Ich wandere gern.",         uz: "togʻda sayr qilishni",  pic: "🥾" },
  { id: "rad",      de: "Ich fahre gern Fahrrad.",   uz: "velosiped haydashni",   pic: "🚲" }
];

// German exonyms for cities. Learner may also type another city name (used only after "in").
export const CITIES = [
  { de: "Taschkent", uz: "Toshkent" }, { de: "Samarkand", uz: "Samarqand" }, { de: "Buchara", uz: "Buxoro" },
  { de: "Namangan", uz: "Namangan" }, { de: "Andischan", uz: "Andijon" }, { de: "Fergana", uz: "Fargʻona" },
  { de: "Karschi", uz: "Qarshi" }, { de: "Nukus", uz: "Nukus" }, { de: "Termez", uz: "Termiz" },
  { de: "Urgentsch", uz: "Urganch" }, { de: "Chiwa", uz: "Xiva" },
  { de: "Berlin", uz: "Berlin" }, { de: "München", uz: "Myunxen" }, { de: "Hamburg", uz: "Gamburg" },
  { de: "Frankfurt", uz: "Frankfurt" }, { de: "Köln", uz: "Kyoln" }
];

const NUM = ["", "ein", "zwei", "drei", "vier", "fünf"];

function count(n, sg, pl, art) {
  // art: "en" (einen Bruder), "e" (eine Schwester), "" (ein Kind)
  return n === 1 ? `${NUM[1]}${art} ${sg}` : `${NUM[n]} ${pl}`;
}

export function jobOf(p) { return JOBS.find(j => j.id === p?.job); }

// Returns [{ id, de, uz, pic }] sentences about the learner.
export function aboutMe(p) {
  if (!p) return [];
  const out = [];
  out.push({ id: "me.name", de: `Ich heiße ${p.name}.`, uz: `Mening ismim ${p.name}.`, pic: "👋" });
  out.push({ id: "me.from", de: "Ich komme aus Usbekistan.", uz: "Men Oʻzbekistondanman.", pic: "🇺🇿" });
  if (p.city?.de) out.push({ id: "me.city", de: `Ich wohne in ${p.city.de}.`, uz: `Men ${p.city.uz || p.city.de} shahrida yashayman.`, pic: "🏙️" });
  const j = jobOf(p);
  if (j) {
    const t = p.form === "f" ? j.f : j.m;
    out.push({ id: "me.job", de: j.beruf ? `Ich bin ${t} von Beruf.` : `Ich bin ${t}.`, uz: `Men ${j.uz}man.`, pic: j.pic });
  }
  for (const hid of p.hobbies || []) {
    const hb = HOBBIES.find(x => x.id === hid);
    if (hb) out.push({ id: "me.hobby." + hid, de: hb.de, uz: `Men ${hb.uz} yaxshi koʻraman.`, pic: hb.pic });
  }
  const f = p.family;
  if (f) {
    if (f.married === true) out.push({ id: "me.married", de: "Ich bin verheiratet.", uz: "Men turmush qurganman.", pic: "💍" });
    if (f.married === false) out.push({ id: "me.single", de: "Ich bin ledig.", uz: "Men turmush qurmaganman.", pic: "🙂" });
    if (Number.isInteger(f.kids)) out.push(f.kids === 0
      ? { id: "me.kids", de: "Ich habe keine Kinder.", uz: "Farzandim yoʻq.", pic: "🧒" }
      : { id: "me.kids", de: `Ich habe ${count(f.kids, "Kind", "Kinder", "")}.`, uz: `Mening ${f.kids === 1 ? "bitta" : f.kids + " ta"} farzandim bor.`, pic: "🧒" });
    const b = f.brothers, s = f.sisters;
    if (Number.isInteger(b) && Number.isInteger(s)) {
      if (b === 0 && s === 0) out.push({ id: "me.sibl", de: "Ich habe keine Geschwister.", uz: "Aka-ukam ham, opa-singlim ham yoʻq.", pic: "👤" });
      else {
        const parts = [];
        if (b) parts.push(count(b, "Bruder", "Brüder", "en"));
        if (s) parts.push(count(s, "Schwester", "Schwestern", "e"));
        const uz = [
          b === 1 ? "bitta aka-ukam" : b ? `${b} ta aka-ukam` : "",
          s === 1 ? "bitta opa-singlim" : s ? `${s} ta opa-singlim` : ""
        ].filter(Boolean).join(" va ");
        out.push({ id: "me.sibl", de: `Ich habe ${parts.join(" und ")}.`, uz: `Mening ${uz} bor.`, pic: "👫" });
      }
    }
  }
  return out;
}
