// List candidate voices (key from ELEVENLABS_API_KEY, never printed).
//   node tools/list-voices.mjs            → voices in your account
//   node tools/list-voices.mjs --shared   → German female voices from the shared Voice Library
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("ELEVENLABS_API_KEY is not set."); process.exit(1); }
const H = { "xi-api-key": KEY };
const shared = process.argv.includes("--shared");

if (!shared) {
  const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: H });
  if (!r.ok) { console.error("HTTP", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const { voices } = await r.json();
  for (const v of voices) console.log([v.voice_id, v.name, v.category, JSON.stringify(v.labels || {})].join(" | "));
  const s = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: H });
  if (s.ok) {
    const j = await s.json();
    const reset = j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "?";
    console.log(`\nPlan: ${j.tier} · characters used ${j.character_count}/${j.character_limit} · resets ${reset}`);
  }
} else {
  const u = new URL("https://api.elevenlabs.io/v1/shared-voices");
  Object.entries({ language: "de", gender: "female", page_size: "30", sort: "usage_character_count_1y" }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: H });
  if (!r.ok) { console.error("HTTP", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const { voices } = await r.json();
  for (const v of voices) console.log([v.voice_id, v.public_owner_id, v.name, v.accent, v.age, v.use_case, v.descriptive || "", `uses1y=${v.usage_character_count_1y}`, (v.description || "").replace(/\s+/g, " ").slice(0, 90)].join(" | "));
}
