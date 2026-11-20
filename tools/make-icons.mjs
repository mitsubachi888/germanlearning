// Generates icons/icon-{180,192,512}.png without dependencies (raw PNG + zlib).
// Design: lavender square, journey road (amber) with three stops, ink "current" stop.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex("#DCD2FA"), ROAD = hex("#FFB627"), INK = hex("#241A45"), WHITE = hex("#FFFFFF");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function draw(S) {
  const px = new Array(S * S).fill(BG);
  const u = S / 100;
  // road: quadratic bezier from (20,78) via (50,20) ... approximate with two arcs sampled densely
  const P = [[22, 80], [30, 40], [70, 60], [78, 22]];
  const bez = t => { const m = 1 - t; return [0, 1].map(i => m ** 3 * P[0][i] + 3 * m * m * t * P[1][i] + 3 * m * t * t * P[2][i] + t ** 3 * P[3][i]); };
  const road = []; for (let t = 0; t <= 1; t += 0.002) road.push(bez(t));
  const stops = [bez(0), bez(0.5), bez(1)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = x / u, Y = y / u;
    let c = BG;
    let dmin = 1e9; for (const [rx, ry] of road) { const d = (rx - X) ** 2 + (ry - Y) ** 2; if (d < dmin) dmin = d; }
    if (Math.sqrt(dmin) < 6) c = ROAD;
    stops.forEach(([sx, sy], i) => {
      const d = Math.hypot(sx - X, sy - Y);
      const r = i === 2 ? 13 : 9;
      if (d < r) c = i === 2 ? INK : WHITE;
      if (i !== 2 && d < r && d > r - 3) c = INK;
    });
    px[y * S + x] = c;
  }
  const raw = Buffer.alloc((S * 3 + 1) * S);
  for (let y = 0; y < S; y++) { raw[y * (S * 3 + 1)] = 0; for (let x = 0; x < S; x++) { const o = y * (S * 3 + 1) + 1 + x * 3; const [r, g, b] = px[y * S + x]; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync(new URL("../icons/", import.meta.url), { recursive: true });
for (const s of [180, 192, 512]) writeFileSync(new URL(`../icons/icon-${s}.png`, import.meta.url), draw(s));
console.log("icons written");
