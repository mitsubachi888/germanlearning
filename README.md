# Nemis tili A1

Personal PWA for learning German from zero (A1, communication-focused) for one Uzbek-speaking learner on iPhone.
UI and translations in Uzbek (Latin), grammar notes in English, content in German.

Live: https://mitsubachi888.github.io/germanlearning/

- Vanilla JS, no build step. Content is JSON in `content/` (`course.json` + one file per lesson).
- Videos are only embedded (youtube-nocookie). Pictures are emoji.
- SRS: Leitner `[0,1,3,7,14,30,60,120]` days. Progress lives in localStorage; back it up from Settings.
- Audio: `tools/gen-audio.mjs` (ElevenLabs) → `audio/*.mp3` + `audio/manifest.json`; device TTS (de-DE) is the fallback.

Local test server: `node tools/serve.mjs 5173`
