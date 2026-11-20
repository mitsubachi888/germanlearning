// Small DOM/UI helpers shared by screens and step renderers.
import { esc } from "./text.js";
import { speak, Recorder } from "./speech.js";

// One root element → that element; several roots → a DocumentFragment with all of them.
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

export function modal(contentEl, { onClose } = {}) {
  const root = document.getElementById("modal-root");
  const back = h(`<div class="modal-back" role="dialog" aria-modal="true"><div class="modal"></div></div>`);
  back.querySelector(".modal").append(contentEl);
  const close = () => { back.classList.add("out"); setTimeout(() => back.remove(), 180); onClose?.(); };
  back.addEventListener("click", e => { if (e.target === back) close(); });
  root.append(back);
  return close;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove(); return ok;
  }
}

export function playBtn(text, { slow = false, big = false } = {}) {
  const b = h(`<button class="play${slow ? " slow" : ""}${big ? " big" : ""}" type="button" aria-label="${slow ? "Sekin tinglash" : "Tinglash"}">${slow ? "🐢" : "▶"}</button>`);
  b.addEventListener("click", () => {
    b.classList.add("playing");
    if (!speak(text, { slow, onend: () => b.classList.remove("playing") })) {
      b.classList.remove("playing");
      toast("Nemischa ovoz topilmadi. Sozlamalardagi yoʻriqnomani koʻring.");
    }
  });
  return b;
}

export function sec(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

// Recorder bar: record (manual stop, max 60 s) + play own voice. cleanupList gets a stop function.
export function recorderUI(cleanupList, onDone) {
  const wrap = h(`<div class="rec-bar"></div>`);
  if (!Recorder.supported()) { wrap.append(h(`<span class="small muted">Bu qurilmada ovoz yozish ishlamaydi.</span>`)); return wrap; }
  const btn = h(`<button class="rec" type="button" aria-label="Ovoz yozish"><span>🎙</span></button>`);
  const time = h(`<span class="rec-time">0:00</span>`);
  const mine = h(`<button class="chipbtn" type="button" disabled>🔁 Oʻzimni tinglash</button>`);
  let rec = null;
  btn.addEventListener("click", async () => {
    if (rec && rec.recording) { rec.stop(); return; }
    rec = new Recorder({
      max: 60,
      onTick: s => { time.textContent = sec(s); },
      onStop: r => { btn.classList.remove("on"); btn.setAttribute("aria-label", "Qayta yozish"); mine.disabled = false; onDone?.(r); }
    });
    try { await rec.start(); btn.classList.add("on"); btn.setAttribute("aria-label", "Toʻxtatish"); time.textContent = "0:00"; }
    catch (e) { toast("Mikrofonga ruxsat berilmagan. iPhone sozlamalarida ruxsat bering."); }
  });
  mine.addEventListener("click", () => rec?.play());
  cleanupList.push(() => rec?.stop());
  wrap.append(btn, h(`<div class="rec-info"></div>`));
  wrap.lastChild.append(time, h(`<span class="small muted">Toʻxtatish uchun yana bosing · 60 soniyagacha</span>`));
  wrap.append(mine);
  return wrap;
}

export { esc };
