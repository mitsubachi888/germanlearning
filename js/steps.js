// Lesson step renderers. Each renderer: (step, body, ctx) where ctx = { item(id), cleanup[], key, profile }.
import { esc, de, md, norm, sameButUmlauts, wordDiff, diffHtml, shuffle, hintLine } from "./text.js";
import { h, toast, playBtn, recorderUI, copyText, sec } from "./ui.js";
import { speak } from "./speech.js";
import { ensureCard, exerciseResult } from "./srs.js";
import * as store from "./store.js";

export const SKILL = {
  video: "listen", dialogue: "listen", listen: "listen",
  phrases: "read", compare: "read", letters: "read", gender: "read", picquiz: "read", note: "read", situation: "read", quiz: "read",
  shadow: "speak", pattern: "speak", roleplay: "speak",
  type: "write", build: "write", write: "write"
};
export const SKILL_LABEL = { listen: "Tinglash", speak: "Gapirish", read: "Oʻqish", write: "Yozish" };

const STEP = {};
export default STEP;

/* ---------- shared pieces ---------- */
function deLine(it) {
  return `<span class="de">${de(it.de)}</span>`;
}
function pluralLine(it) {
  return it.plural ? `<div class="plural">koʻplik: <span class="de">${de(it.plural)}</span></div>` : "";
}
function feedback(ok, html = "") {
  const el = h(`<div class="feedback ${ok ? "ok" : "bad"}"><b>${ok ? "Toʻgʻri!" : "Xato."}</b>${html ? `<div class="fb-more">${html}</div>` : ""}</div>`);
  return el;
}
function bump(el, ok) { el.classList.remove("pop", "shake"); void el.offsetWidth; el.classList.add(ok ? "pop" : "shake"); }

function counter(n, i) {
  return h(`<div class="q-count" aria-label="${i + 1} / ${n}">${Array.from({ length: n }, (_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("")}</div>`);
}

function quizRunner(s, body, { renderQ, onAnswer }) {
  const qs = s.questions;
  let i = 0, right = 0;
  const box = h(`<div class="quiz"></div>`);
  body.append(box);
  const show = () => {
    box.innerHTML = "";
    if (i >= qs.length) {
      const all = right === qs.length;
      box.append(h(`<div class="result enter"><div class="score">${right}<small>/${qs.length}</small></div><p><b>${all ? "Barchasi toʻgʻri — zoʻr!" : "toʻgʻri javob"}</b></p><p class="muted small">${all ? "Davom etishingiz mumkin." : "Xato javoblar takrorlash kartalariga qoʻshildi."}</p></div>`));
      const again = h(`<button class="btn ghost" type="button">Qaytadan</button>`);
      again.addEventListener("click", () => { i = 0; right = 0; show(); });
      box.append(again);
      store.logEvent("quiz_completed", s.title, { right, total: qs.length });
      return;
    }
    const q = qs[i];
    box.append(counter(qs.length, i));
    const card = h(`<div class="q enter"></div>`);
    box.append(card);
    renderQ(q, card, ok => {
      if (ok) right++;
      onAnswer?.(q, ok);
      const nx = h(`<button class="btn" type="button">${i + 1 < qs.length ? "Keyingi savol" : "Natijani koʻrish"}</button>`);
      nx.addEventListener("click", () => { i++; show(); });
      card.append(nx);
      nx.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };
  show();
}

function choice(card, done, { options, answer, explain, render = o => esc(o) }) {
  const opts = h(`<div class="options"></div>`);
  const order = shuffle(options.map((_, k) => k));
  order.forEach((k, pos) => {
    const b = h(`<button class="opt" type="button"><kbd>${"ABCDEF"[pos]}</kbd><span>${render(options[k])}</span></button>`);
    b.addEventListener("click", () => {
      opts.querySelectorAll(".opt").forEach(x => (x.disabled = true));
      const ok = k === answer;
      b.classList.add(ok ? "correct" : "wrong"); bump(b, ok);
      if (!ok) [...opts.children][order.indexOf(answer)].classList.add("correct");
      opts.querySelectorAll(".opt:not(.correct):not(.wrong)").forEach(x => x.classList.add("dim"));
      card.append(feedback(ok, explain ? md(explain) : ""));
      done(ok);
    });
    opts.append(b);
  });
  card.append(opts);
}

/* ---------- step types ---------- */
STEP.note = (s, body) => { body.append(h(`<div class="panel md">${md(s.md)}</div>`)); };

STEP.video = (s, body) => {
  const p = new URLSearchParams({ rel: "0", playsinline: "1", modestbranding: "1" });
  if (s.start) p.set("start", String(s.start));
  if (s.end) p.set("end", String(s.end));
  const range = s.end ? `${sec(s.start || 0)} – ${sec(s.end)}` : s.start ? `${sec(s.start)} dan` : "toʻliq video";
  if (navigator.onLine === false) body.append(h(`<div class="video off">Videoni koʻrish uchun internet kerak. Boshqa mashqlar internetsiz ishlaydi.</div>`));
  else body.append(h(`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.videoId)}?${p}" title="${esc(s.title || "Video")}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`));
  body.append(h(`<p class="small muted vmeta"><span>${esc(s.channel || "")}</span><span>${range} · <a href="https://www.youtube.com/watch?v=${encodeURIComponent(s.videoId)}${s.start ? `&t=${s.start}s` : ""}" target="_blank" rel="noopener">YouTube’da ochish</a></span></p>`));
  if (s.note) body.append(h(`<div class="panel md">${md(s.note)}</div>`));
};

STEP.phrases = (s, body, ctx) => {
  if (s.intro) body.append(h(`<p class="muted">${esc(s.intro)}</p>`));
  const list = h(`<div class="cards"></div>`);
  s.items.forEach((id, k) => {
    const it = ctx.item(id); if (!it) return;
    ensureCard(id);
    const row = h(`<div class="pcard enter" style="--d:${k * 40}ms">
      ${it.pic ? `<div class="pic" aria-hidden="true">${it.pic}</div>` : ""}
      <div class="txt">
        <div class="big">${deLine(it)}</div>
        ${it.ipa ? `<div class="ipa">[${esc(it.ipa)}]</div>` : ""}
        ${pluralLine(it)}
        <div class="uz">${esc(it.uz)}</div>
        ${it.en ? `<div class="en">${esc(it.en)}</div>` : ""}
        ${it.note ? `<div class="note md">${md(it.note)}</div>` : ""}
      </div>
      <div class="btns"></div></div>`);
    row.querySelector(".btns").append(playBtn(it.de), playBtn(it.de, { slow: true }));
    list.append(row);
  });
  body.append(list);
};

// Alphabet grid. letters: [{ ch, say, item }] — tap: hear the letter name, then the example word.
STEP.letters = (s, body, ctx) => {
  if (s.intro) body.append(h(`<p class="muted">${esc(s.intro)}</p>`));
  const grid = h(`<div class="letters"></div>`);
  const detail = h(`<div class="letter-detail" hidden></div>`);
  s.letters.forEach((L, k) => {
    const it = L.item ? ctx.item(L.item) : null;
    if (L.item) ensureCard(L.item);
    const b = h(`<button type="button" class="letter enter" style="--d:${k * 15}ms"><span class="de">${esc(L.ch)}</span></button>`);
    b.addEventListener("click", () => {
      grid.querySelectorAll(".letter").forEach(x => x.classList.toggle("on", x === b));
      b.classList.add("heard");
      detail.hidden = false;
      detail.innerHTML = "";
      detail.append(h(`<div class="ld"><span class="ld-ch de">${esc(L.ch)}</span><span class="ld-name">„${esc(L.name || L.say)}“</span>${it ? `<span class="ld-ex">${it.pic || ""} <span class="de">${de(it.de)}</span> · ${esc(it.uz)}</span>` : ""}</div>`));
      const r = h(`<div class="row"></div>`);
      r.append(playBtn(L.say));
      if (it) r.append(playBtn(it.de));
      detail.append(r);
      speakThen(L.say, () => { if (it) setTimeout(() => speak(it.de), 300); });
    });
    grid.append(b);
  });
  body.append(detail, grid);
};

// Pronunciation vs English. item: { de, sound, en?, example?, none?, mouth? }
STEP.compare = (s, body) => {
  if (s.intro) body.append(h(`<p class="muted">${esc(s.intro)}</p>`));
  s.items.forEach((c, k) => {
    const el = h(`<div class="cmp enter" style="--d:${k * 40}ms">
      <div class="cmp-head"><span class="cmp-letter de">${esc(c.letter)}</span><span class="cmp-ex de">${de(c.example || "")}</span></div>
      ${c.none
        ? `<div class="cmp-badge none">No English equivalent</div><div class="md">${md(c.mouth || "")}</div>`
        : `<div class="cmp-badge">≈ English ${esc(c.en)}</div>${c.mouth ? `<div class="md">${md(c.mouth)}</div>` : ""}`}
      <div class="row"></div></div>`);
    if (c.example) el.querySelector(".row").append(playBtn(c.example), playBtn(c.example, { slow: true }));
    body.append(el);
  });
};

STEP.quiz = (s, body, ctx) => {
  quizRunner(s, body, {
    renderQ: (q, card, done) => {
      if (q.kind === "listen") {
        const p = h(`<div class="q-prompt"><p>Tinglang va toʻgʻrisini tanlang:</p><div class="row center"></div></div>`);
        p.querySelector(".row").append(playBtn(q.say, { big: true }), playBtn(q.say, { slow: true }));
        card.append(p);
        setTimeout(() => speak(q.say), 300);
      } else {
        card.append(h(`<div class="q-prompt md">${md(q.prompt)}</div>`));
      }
      choice(card, done, { options: q.options, answer: q.answer, explain: q.explain, render: o => (q.deOptions ? `<span class="de">${de(o)}</span>` : esc(o)) });
    },
    onAnswer: (q, ok) => {
      if (q.item) exerciseResult(q.item, ok);
      store.result(q.tag, ok);
      store.logEvent("answered", q.item || q.prompt || q.say, { ok });
    }
  });
};
STEP.situation = STEP.quiz;

// der / die / das with gender colours. questions: [{ item }] — item needs gender + plural.
STEP.gender = (s, body, ctx) => {
  quizRunner(s, body, {
    renderQ: (q, card, done) => {
      const it = ctx.item(q.item);
      const noun = it.de.replace(/^(der|die|das)\s+/i, "");
      card.append(h(`<div class="g-word"><div class="pic">${it.pic || ""}</div><div class="w de">${esc(noun)}</div><div class="uz">${esc(it.uz)}</div></div>`));
      card.querySelector(".g-word").append(playBtn(it.de));
      card.append(h(`<div class="ask">Qaysi artikl?</div>`));
      const row = h(`<div class="arts"></div>`);
      ["der", "die", "das"].forEach(a => {
        const b = h(`<button class="art-btn ${a}" type="button">${a}</button>`);
        b.addEventListener("click", () => {
          row.querySelectorAll("button").forEach(x => (x.disabled = true));
          const ok = a === it.gender;
          b.classList.add(ok ? "correct" : "wrong"); bump(b, ok);
          if (!ok) row.querySelector("." + it.gender).classList.add("correct");
          card.append(feedback(ok, `<span class="de">${de(it.de)}</span>${it.plural ? ` → <span class="de">${de(it.plural)}</span>` : ""}`));
          speak(it.de);
          done(ok);
        });
        row.append(b);
      });
      card.append(row);
    },
    onAnswer: (q, ok) => { exerciseResult(q.item, ok); store.result("gender", ok); store.logEvent("gender", q.item, { ok }); }
  });
};

function umlautKeys(inp) {
  const row = h(`<div class="keys">${["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"].map(k => `<button type="button" data-k="${k}">${k}</button>`).join("")}</div>`);
  row.addEventListener("pointerdown", e => e.preventDefault()); // keep focus/keyboard open
  row.addEventListener("click", e => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    const { selectionStart: a, selectionEnd: z, value } = inp;
    inp.value = value.slice(0, a) + b.dataset.k + value.slice(z);
    inp.setSelectionRange(a + 1, a + 1);
    inp.dispatchEvent(new Event("input"));
  });
  return row;
}

// Listen (or read the Uzbek meaning) and type the German.
STEP.type = (s, body, ctx) => {
  if (s.intro) body.append(h(`<p class="muted">${esc(s.intro)}</p>`));
  quizRunner(s, body, {
    renderQ: (q, card, done) => {
      const it = q.item ? ctx.item(q.item) : null;
      const answer = q.answer || it?.de;
      const say = q.say || answer;
      const p = h(`<div class="q-prompt"><p>${q.ask ? esc(q.ask) : q.hear === false ? "Nemischa yozing:" : "Tinglang va nemischa yozing."} Maʼnosi: <b>${esc(q.uz || it?.uz || "")}</b></p><div class="row"></div></div>`);
      if (q.hear !== false) { p.querySelector(".row").append(playBtn(say), playBtn(say, { slow: true })); setTimeout(() => speak(say), 300); }
      card.append(p);
      const inp = h(`<input class="field de" lang="de" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Shu yerga yozing…" aria-label="Javob">`);
      const check = h(`<button class="btn" type="button">Tekshirish</button>`);
      card.append(inp, umlautKeys(inp), check);
      const go = () => {
        if (!inp.value.trim()) { toast("Avval javobni yozing."); inp.focus(); return; }
        const exact = norm(inp.value) === norm(answer);
        const near = !exact && sameButUmlauts(inp.value, answer);
        inp.disabled = true; check.remove(); card.querySelector(".keys")?.remove();
        bump(inp, exact);
        const d = wordDiff(answer, inp.value);
        card.append(feedback(exact, `<span class="de">${de(answer)}</span>${near ? `<div class="small">Deyarli! Faqat ä / ö / ü / ß harflariga eʼtibor bering.</div>` : exact ? "" : `<div class="diff small">${diffHtml(d.ops)}</div>`}`));
        q._near = near;
        done(exact);
      };
      check.addEventListener("click", go);
      inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    },
    onAnswer: (q, ok) => {
      if (q.item) exerciseResult(q.item, ok);
      store.result(q._near ? "spell" : (q.tag || "spell"), ok);
      store.logEvent("typed", q.item || q.answer, { ok });
    }
  });
};

function lineItem(ctx, l) { return (l.item && ctx.item(l.item)) || { de: l.de || "", uz: l.uz || "" }; }

STEP.shadow = (s, body, ctx) => {
  let i = 0, level = 1;
  const LEVELS = ["Tinglab takrorlash", "Yordam bilan", "Mustaqil"];
  body.append(h(`<p class="muted">Har bir gap 3 bosqichda: toʻliq matn bilan → baʼzi soʻzlar yashiringan → faqat bosh harflar. Namunani tinglang, ovozingizni yozing, solishtiring.</p>`));
  const box = h(`<div></div>`);
  body.append(box);
  const show = () => {
    box.innerHTML = "";
    if (i >= s.items.length) {
      box.append(h(`<div class="result enter"><div class="score">${s.items.length}</div><p><b>ta gap mashq qilindi</b></p></div>`));
      const again = h(`<button class="btn ghost" type="button">Qaytadan</button>`); again.addEventListener("click", () => { i = 0; level = 1; show(); }); box.append(again);
      return;
    }
    const it = lineItem(ctx, { item: s.items[i] });
    box.append(counter(s.items.length, i));
    const card = h(`<div class="shadow enter"></div>`);
    card.append(h(`<div class="lvls">${LEVELS.map((l, k) => `<span class="${k + 1 === level ? "on" : k + 1 < level ? "past" : ""}">${k + 1} · ${l}</span>`).join("")}</div>`));
    card.append(h(`<div class="line de">${hintLine(it.de, level)}</div>`));
    card.append(h(`<div class="uz">${esc(it.uz)}</div>`));
    const r = h(`<div class="row center"></div>`); r.append(playBtn(it.de, { big: true }), playBtn(it.de, { slow: true })); card.append(r);
    card.append(recorderUI(ctx.cleanup));
    const nav = h(`<div class="row"></div>`);
    if (level < 3) {
      const nx = h(`<button class="btn" type="button">${level + 1}-bosqich</button>`);
      nx.addEventListener("click", () => { level++; show(); });
      nav.append(nx);
    } else {
      const reveal = h(`<button class="btn ghost" type="button">Toʻliq gapni koʻrsatish</button>`);
      reveal.addEventListener("click", () => { card.querySelector(".line").innerHTML = de(it.de); reveal.remove(); });
      const good = h(`<button class="btn" type="button">Ayta oldim</button>`);
      const bad = h(`<button class="btn ghost" type="button">Hali qiyin</button>`);
      const next = ok => { if (s.items[i]) exerciseResult(s.items[i], ok); store.result("pron", ok); store.logEvent("shadowed", s.items[i], { ok }); i++; level = 1; show(); };
      good.addEventListener("click", () => next(true));
      bad.addEventListener("click", () => next(false));
      nav.append(reveal, bad, good);
    }
    card.append(nav);
    box.append(card);
  };
  show();
};

// Sentence building with word tiles.
STEP.build = (s, body) => {
  if (s.intro) body.append(h(`<p class="muted">${esc(s.intro)}</p>`));
  quizRunner(s, body, {
    renderQ: (q, card, done) => {
      card.append(h(`<div class="q-prompt"><p>Gapni tuzing:</p><h3>${esc(q.uz)}</h3></div>`));
      const target = q.answer.normalize("NFC").split(/\s+/).filter(Boolean);
      const pool = shuffle([...target, ...(q.extra || [])]);
      const line = h(`<div class="build-line" aria-label="Tuzilayotgan gap"></div>`);
      const tray = h(`<div class="tray"></div>`);
      const chosen = [];
      const render = () => {
        line.innerHTML = chosen.length ? "" : `<span class="muted small">Pastdagi soʻzlarni bosing…</span>`;
        chosen.forEach((ti, pos) => {
          const t = h(`<button type="button" class="tile on de">${esc(pool[ti])}</button>`);
          t.addEventListener("click", () => { chosen.splice(pos, 1); render(); });
          line.append(t);
        });
        tray.querySelectorAll(".tile").forEach(t => { t.classList.toggle("used", chosen.includes(Number(t.dataset.i))); t.disabled = chosen.includes(Number(t.dataset.i)); });
      };
      pool.forEach((w, i) => {
        const t = h(`<button type="button" class="tile de" data-i="${i}">${esc(w)}</button>`);
        t.addEventListener("click", () => { chosen.push(i); render(); });
        tray.append(t);
      });
      const check = h(`<button class="btn" type="button">Tekshirish</button>`);
      card.append(line, tray, check);
      render();
      check.addEventListener("click", () => {
        if (!chosen.length) { toast("Avval soʻzlarni tanlang."); return; }
        const ok = norm(chosen.map(i => pool[i]).join(" ")) === norm(q.answer);
        check.remove();
        card.querySelectorAll(".tile").forEach(t => (t.disabled = true));
        bump(line, ok);
        card.append(feedback(ok, `<span class="de">${de(q.answer)}</span>${q.note ? `<div class="small md">${md(q.note)}</div>` : ""}`));
        speak(q.answer);
        done(ok);
      });
    },
    onAnswer: (q, ok) => { store.result(q.tag || "order", ok); store.logEvent("built", q.answer, { ok }); }
  });
};

STEP.picquiz = (s, body, ctx) => {
  quizRunner(s, body, {
    renderQ: (q, card, done) => {
      const target = ctx.item(q.item);
      const opts = q.options.map(id => ctx.item(id)).filter(Boolean);
      const answer = q.options.indexOf(q.item);
      card.append(h(`<div class="q-prompt"><p>Tinglang va rasmni tanlang.</p><div class="row center"></div></div>`));
      card.querySelector(".row").append(playBtn(target.de, { big: true }), playBtn(target.de, { slow: true }));
      setTimeout(() => speak(target.de), 300);
      const grid = h(`<div class="picgrid"></div>`);
      const order = shuffle(opts.map((_, k) => k));
      order.forEach(k => {
        const o = opts[k];
        const b = h(`<button class="picopt" type="button" aria-label="${esc(o.uz)}"><span class="pic">${o.pic || "❓"}</span><span class="small">${esc(o.uz)}</span></button>`);
        b.addEventListener("click", () => {
          grid.querySelectorAll(".picopt").forEach(x => (x.disabled = true));
          const ok = k === answer;
          b.classList.add(ok ? "correct" : "wrong"); bump(b, ok);
          if (!ok) [...grid.children][order.indexOf(answer)].classList.add("correct");
          card.append(feedback(ok, `<span class="de">${de(target.de)}</span> — ${esc(target.uz)}`));
          done(ok);
        });
        grid.append(b);
      });
      card.append(grid);
    },
    onAnswer: (q, ok) => { exerciseResult(q.item, ok); store.logEvent("answered", q.item, { ok }); }
  });
};

function speakThen(text, cb) {
  let fired = false;
  const fire = () => { if (!fired) { fired = true; clearTimeout(t); cb(); } };
  const t = setTimeout(fire, 2500 + String(text).length * 110);
  speak(text, { onend: fire });
}

STEP.dialogue = (s, body, ctx) => {
  if (s.intro) body.append(h(`<p class="muted">${esc(s.intro)}</p>`));
  const chat = h(`<div class="chat"></div>`);
  let token = 0;
  const rows = s.lines.map((l, k) => {
    const it = lineItem(ctx, l);
    if (l.item) ensureCard(l.item);
    const row = h(`<button type="button" class="bubble ${l.who === "A" ? "left" : "right"}"><span class="who">${esc(l.name || l.who)}</span><span class="b-de de">${de(it.de)}</span><span class="b-uz">${esc(it.uz)}</span></button>`);
    row.addEventListener("click", () => { token++; mark(k); speak(it.de); });
    chat.append(row);
    return row;
  });
  const mark = k => rows.forEach((r, j) => r.classList.toggle("on", j === k));
  const bar = h(`<div class="row"></div>`);
  const all = h(`<button class="btn" type="button">▶ Butun suhbatni tinglash</button>`);
  all.addEventListener("click", () => {
    const my = ++token;
    const next = k => {
      if (my !== token) return;
      if (k >= s.lines.length) { mark(-1); return; }
      mark(k); rows[k].scrollIntoView({ block: "nearest", behavior: "smooth" });
      speakThen(lineItem(ctx, s.lines[k]).de, () => setTimeout(() => next(k + 1), 450));
    };
    next(0);
  });
  const hide = h(`<button class="chipbtn" type="button">Tarjimani yashirish</button>`);
  hide.addEventListener("click", () => { chat.classList.toggle("no-uz"); hide.textContent = chat.classList.contains("no-uz") ? "Tarjimani koʻrsatish" : "Tarjimani yashirish"; });
  bar.append(all, hide);
  body.append(bar, chat);
  ctx.cleanup.push(() => { token++; });
};

STEP.roleplay = (s, body, ctx) => {
  const roles = [...new Set(s.lines.map(l => l.who))];
  const nameOf = w => s.lines.find(l => l.who === w)?.name || w;
  if (s.intro) body.append(h(`<p class="muted">${esc(s.intro)}</p>`));
  const pick = h(`<div class="panel"><p><b>Qaysi rolni oʻynaysiz?</b></p><div class="row"></div><p class="small muted">Sherigingiz ovoz bilan gapiradi. Sizning gapingiz yordamchi matn sifatida chiqadi — baland ovozda ayting.</p></div>`);
  roles.forEach(r => { const b = h(`<button class="btn" type="button">${esc(nameOf(r))}</button>`); b.addEventListener("click", () => run(r)); pick.querySelector(".row").append(b); });
  const stage = h(`<div></div>`);
  body.append(pick, stage);
  let token = 0;
  const run = me => {
    pick.hidden = true; stage.innerHTML = "";
    const chat = h(`<div class="chat"></div>`), ctrl = h(`<div></div>`);
    stage.append(chat, ctrl);
    const my = ++token;
    const step = k => {
      if (my !== token) return;
      ctrl.innerHTML = "";
      if (k >= s.lines.length) {
        ctrl.append(h(`<div class="result enter"><div class="score">✓</div><p><b>${esc(nameOf(me))} roli tugadi</b></p></div>`));
        const other = roles.find(r => r !== me);
        if (other) { const b = h(`<button class="btn" type="button">Rolni almashtirish: ${esc(nameOf(other))}</button>`); b.addEventListener("click", () => run(other)); ctrl.append(b); }
        store.logEvent("roleplay_completed", s.title, { role: me });
        return;
      }
      const l = s.lines[k], it = lineItem(ctx, l), side = l.who === roles[0] ? "left" : "right";
      if (l.who !== me) {
        chat.append(h(`<div class="bubble ${side} on enter"><span class="who">${esc(l.name)}</span><span class="b-de de">${de(it.de)}</span><span class="b-uz">${esc(it.uz)}</span></div>`));
        chat.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
        ctrl.append(h(`<p class="small muted">${esc(l.name)} gapiryapti…</p>`));
        speakThen(it.de, () => setTimeout(() => step(k + 1), 400));
      } else {
        const card = h(`<div class="shadow enter"><div class="small muted">Sizning navbatingiz · ${esc(it.uz)}</div><div class="line de">${hintLine(it.de, 2)}</div></div>`);
        card.append(recorderUI(ctx.cleanup));
        const r = h(`<div class="row"></div>`);
        const reveal = h(`<button class="btn ghost" type="button">Koʻrsatish va tinglash</button>`);
        reveal.addEventListener("click", () => { card.querySelector(".line").innerHTML = de(it.de); speak(it.de); });
        const next = h(`<button class="btn" type="button">Keyingi gap</button>`);
        next.addEventListener("click", () => { chat.append(h(`<div class="bubble ${side} mine enter"><span class="who">${esc(l.name)} (siz)</span><span class="b-de de">${de(it.de)}</span></div>`)); step(k + 1); });
        r.append(reveal, next); card.append(r); ctrl.append(card);
      }
    };
    step(0);
  };
  ctx.cleanup.push(() => { token++; });
};

// Speaking with a pattern; prompts may reference the learner's own sentences via item "me.*".
STEP.pattern = (s, body, ctx) => {
  if (s.intro) body.append(h(`<div class="panel">${esc(s.intro)}</div>`));
  s.prompts.forEach((p, k) => {
    const ans = p.item ? ctx.item(p.item) : null;
    const card = h(`<div class="panel enter" style="--d:${k * 50}ms"><div class="small muted">${k + 1}-savol</div><div class="row nowrap"><div class="grow"><div class="big de">${de(p.q)}</div>${p.uz ? `<div class="small muted">${esc(p.uz)}</div>` : ""}</div></div></div>`);
    card.querySelector(".row").append(playBtn(p.q));
    card.append(recorderUI(ctx.cleanup));
    const ex = h(`<button class="chipbtn" type="button">Namuna javob</button>`);
    ex.addEventListener("click", () => {
      const t = p.spellMe ? [...(ctx.profile?.name || "").toUpperCase().replace(/\s+/g, "")].join(" – ") : ans?.de || p.example; const r = h(`<div class="row"><span class="de big">${de(t)}</span></div>`); r.append(playBtn(t)); ex.replaceWith(r); });
    card.append(ex);
    body.append(card);
  });
};

function aiPrompt(s, text) {
  return `You are a friendly German teacher. My native language is Uzbek and I understand English well. I am a beginner (level A1).

Task: ${s.promptEn || s.prompt}

My text:
"${text}"

Please:
1. List each mistake as: my sentence → corrected sentence · type (article/gender, verb ending, word order, case, spelling ä/ö/ü/ß, vocabulary) · a one-line explanation in simple English.
2. Rewrite my whole text correctly and naturally, at A1 level.
3. Give me one tip for next time.
If you are not sure about something, say so instead of guessing.`;
}

STEP.write = (s, body, ctx) => {
  const st = store.get();
  body.append(h(`<div class="panel"><p><b>${esc(s.prompt)}</b></p>${s.hint ? `<p class="small muted">${esc(s.hint)}</p>` : ""}</div>`));
  const ta = h(`<textarea class="field de" lang="de" autocapitalize="sentences" spellcheck="false" rows="5" placeholder="Nemischa yozing…" aria-label="Matn"></textarea>`);
  ta.value = st.drafts[ctx.key] || "";
  const count = h(`<div class="small muted"></div>`);
  const upd = () => { const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; count.textContent = `${n} ta soʻz${s.minWords ? ` (kamida ${s.minWords})` : ""}`; };
  ta.addEventListener("input", () => { st.drafts[ctx.key] = ta.value; store.save(); upd(); });
  upd();
  body.append(ta, umlautKeys(ta), count);
  const acts = h(`<div class="row"></div>`);
  const cmp = h(`<button class="btn ghost" type="button">Namuna bilan solishtirish</button>`);
  const ai = h(`<button class="btn" type="button">AI uchun nusxalash</button>`);
  acts.append(cmp, ai);
  body.append(acts);
  const out = h(`<div></div>`); body.append(out);
  cmp.addEventListener("click", () => {
    out.innerHTML = "";
    if (s.checklist) out.append(h(`<div class="panel"><h3>Oʻzingizni tekshiring</h3><ul class="checklist">${s.checklist.map((c, k) => `<li><input type="checkbox" id="wc${k}"><label for="wc${k}">${esc(c)}</label></li>`).join("")}</ul></div>`));
    const model = s.modelItems ? s.modelItems.map(id => ctx.item(id)?.de).filter(Boolean).join(" ") : s.model;
    if (model) out.append(h(`<div class="panel"><h3>Namuna</h3><p class="de big">${de(model)}</p></div>`));
    store.logEvent("writing_submitted", ctx.key, { words: ta.value.trim().split(/\s+/).length });
  });
  ai.addEventListener("click", async () => {
    if (ta.value.trim().length < 3) { toast("Avval matn yozing."); return; }
    toast((await copyText(aiPrompt(s, ta.value.trim()))) ? "Nusxalandi. Claude yoki ChatGPT’ga joylang." : "Nusxalab boʻlmadi.");
  });
};
