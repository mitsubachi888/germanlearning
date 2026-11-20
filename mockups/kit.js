// Mockup chrome: theme / light-dark / screen switcher. Not part of the real app.
const THEMES = [
  ["lavender", "#DCD2FA", "#FFB627", "Tím nhạt"],
  ["rose", "#F8CFDC", "#FF6A3D", "Hồng"],
  ["sky", "#CBE5FB", "#FF5C8A", "Xanh trời"],
  ["butter", "#FFEFA3", "#6D4AFF", "Vàng"],
  ["mint", "#CFF0DC", "#D9367F", "Xanh lá nhạt"]
];
const PAGES = [["a.html", "A · Hành trình"], ["b.html", "B · Bàn học"], ["c.html", "C · Poster"]];
const root = document.documentElement;
const store = {
  get(k, d) { try { return localStorage.getItem("mock-" + k) || d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("mock-" + k, v); } catch (e) {} }
};
const mq = window.matchMedia("(prefers-color-scheme: dark)");

function applyMode() {
  const m = store.get("mode", "auto");
  root.dataset.mode = m === "auto" ? (mq.matches ? "dark" : "light") : m;
}
root.dataset.theme = store.get("theme", "lavender");
applyMode();
mq.addEventListener?.("change", applyMode);

const here = location.pathname.split("/").pop() || "index.html";
const bar = document.createElement("div");
bar.className = "kit";
bar.innerHTML = `
  <nav style="display:flex;gap:14px">${PAGES.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
  <div class="dots">${THEMES.map(([id, air, acc, name]) =>
    `<button class="dot" data-t="${id}" title="${name}" aria-label="${name}" style="background:linear-gradient(135deg,${air} 55%,${acc} 55%)"></button>`).join("")}</div>
  <div class="seg" data-g="mode"><button data-m="light">Sáng</button><button data-m="dark">Tối</button><button data-m="auto">Tự động</button></div>
  <div class="seg view-switch" data-g="view"><button data-v="0">Màn hình chính</button><button data-v="1">Bài học</button></div>`;
document.body.prepend(bar);

function sync() {
  bar.querySelectorAll(".dot").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === root.dataset.theme));
  bar.querySelectorAll("[data-m]").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === store.get("mode", "auto")));
  const v = store.get("view", "0");
  bar.querySelectorAll("[data-v]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v));
  document.querySelectorAll(".stage > figure").forEach((f, i) => f.classList.toggle("active", String(i) === v));
}
bar.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.t) { root.dataset.theme = b.dataset.t; store.set("theme", b.dataset.t); }
  if (b.dataset.m) { store.set("mode", b.dataset.m); applyMode(); }
  if (b.dataset.v) { store.set("view", b.dataset.v); window.scrollTo(0, 0); }
  sync();
});
sync();

// Tiny interactions shared by mockups: tap-to-answer der/die/das and option buttons.
document.addEventListener("click", e => {
  const o = e.target.closest("[data-ok]");
  if (!o) return;
  const group = o.closest("[data-q]");
  if (!group || group.dataset.done) return;
  group.dataset.done = "1";
  group.querySelectorAll("[data-ok]").forEach(x => {
    if (x.dataset.ok === "1") x.classList.add("is-right");
    else if (x === o) x.classList.add("is-wrong");
    else x.classList.add("is-dim");
  });
  const fb = group.querySelector(".feedback");
  if (fb) { fb.hidden = false; fb.textContent = o.dataset.ok === "1" ? "Toʻgʻri! 🎉" : "Xato. Toʻgʻri javob yashil rangda."; }
});
