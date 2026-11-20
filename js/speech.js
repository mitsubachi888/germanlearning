// German audio: pre-generated mp3 (ElevenLabs, audio/manifest.json) first, device TTS (de-DE) as fallback.
// Plus microphone recording (manual stop, max 60 s).
import { get } from "./store.js";

let manifest = {};           // normalised text -> "audio/<hash>.mp3"
let current = null;          // playing HTMLAudioElement
let voices = [];

export function normKey(t) { return String(t ?? "").normalize("NFC").replace(/\s+/g, " ").trim(); }

export async function loadManifest() {
  try {
    const r = await fetch("audio/manifest.json", { cache: "no-cache" });
    if (r.ok) { const m = await r.json(); manifest = m.files || m; }
  } catch (e) { manifest = {}; }
}

function loadVoices() { try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
if (typeof window !== "undefined" && window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

export function germanVoices() { loadVoices(); return voices.filter(v => /^de(-|_|$)/i.test(v.lang)); }
export function hasMp3(text) { return !!manifest[normKey(text)]; }

export function stop() {
  try { current?.pause(); } catch (e) {}
  current = null;
  try { window.speechSynthesis?.cancel(); } catch (e) {}
}

export function speak(text, { slow = false, onend } = {}) {
  stop();
  const file = manifest[normKey(text)];
  const done = () => onend?.();
  if (file) {
    const a = new Audio(file);
    a.playbackRate = slow ? 0.75 : Number(get().settings.rate) || 1;
    a.onended = done; a.onerror = () => tts(text, slow, done);
    current = a;
    a.play().catch(() => tts(text, slow, done));
    return true;
  }
  return tts(text, slow, done);
}

function tts(text, slow, done) {
  if (!window.speechSynthesis) { done(); return false; }
  try {
    const u = new SpeechSynthesisUtterance(normKey(text));
    u.lang = "de-DE";
    const list = germanVoices();
    const pref = get().settings.voiceURI;
    const v = list.find(x => x.voiceURI === pref) || list.find(x => /anna/i.test(x.name)) || list.find(x => x.lang === "de-DE") || list[0];
    if (v) u.voice = v;
    const base = Number(get().settings.rate) || 1;
    u.rate = slow ? Math.max(0.45, base * 0.7) : base * 0.95;
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
    return true;
  } catch (e) { done(); return false; }
}

export class Recorder {
  constructor({ max = 60, onTick, onStop } = {}) { Object.assign(this, { max, onTick, onStop, chunks: [], url: null, timer: null, secs: 0 }); }
  static supported() { return !!(navigator.mediaDevices && window.MediaRecorder); }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(t => MediaRecorder.isTypeSupported?.(t)) || "";
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.rec.mimeType || "audio/mp4" });
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(blob);
      this.stream.getTracks().forEach(t => t.stop());
      clearInterval(this.timer);
      this.onStop?.(this);
    };
    this.secs = 0;
    this.rec.start();
    this.timer = setInterval(() => { this.secs++; this.onTick?.(this.secs); if (this.secs >= this.max) this.stop(); }, 1000);
  }
  stop() { if (this.rec && this.rec.state === "recording") this.rec.stop(); }
  get recording() { return this.rec?.state === "recording"; }
  play() { if (this.url) { stop(); const a = new Audio(this.url); current = a; a.play().catch(() => {}); } }
}
