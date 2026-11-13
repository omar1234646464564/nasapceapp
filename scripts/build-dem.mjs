/**
 * Build the web-friendly LOLA south polar DEM.
 *
 * Sources (PDS Geosciences Node, LRO-L-LOLA-4-GDR-V1.0):
 *   LDEM_80S_80M.IMG   7600 x 7600, 80 m/px  (80S-90S)
 *   LDEM_75S_240M.IMG  3812 x 3812, 240 m/px (75S-90S)
 *
 * Both are int16 little-endian, height = DN * 0.5 m relative to a
 * 1737.4 km sphere, south polar stereographic, 0E at the top.
 *
 * Output: public/data/lola_south_pole_1km.bin
 *   915 x 915, 1 km/px, int16 little-endian, elevation in metres.
 *   Uses the 80 m product inside 80S and the 240 m product outside,
 *   with a short blend across the 80S boundary.
 */
import fs from "node:fs";
import path from "node:path";

const R_KM = 1737.4;
const SCALE = 0.5;

const SRC80 = path.resolve("data/ldem_80s_80m.img");
const SRC75 = path.resolve("data/ldem_75s_240m.img");
const OUT = path.resolve("public/data/lola_south_pole_1km.bin");

const N80 = 7600;
const N75 = 3812;
const C80 = 3799.5;
const C75 = 1905.5;

const OUT_SIZE = 915;
const PIXEL_KM = 1.0;
const OUT_C = (OUT_SIZE - 1) / 2;

const buf80 = fs.readFileSync(SRC80);
const buf75 = fs.readFileSync(SRC75);
const d80 = new Int16Array(buf80.buffer, buf80.byteOffset, N80 * N80);
const d75 = new Int16Array(buf75.buffer, buf75.byteOffset, N75 * N75);

function bilinear(data, n, center, pixelKm, lat, lon) {
  const c = ((90 + lat) * Math.PI) / 180;
  const r = 2 * R_KM * Math.tan(c / 2);
  const a = (lon * Math.PI) / 180;
  const row = center - (r * Math.cos(a)) / pixelKm;
  const col = center + (r * Math.sin(a)) / pixelKm;
  if (row < 0 || row > n - 1 || col < 0 || col > n - 1) return null;
  const r0 = Math.floor(row), c0 = Math.floor(col);
  const r1 = Math.min(n - 1, r0 + 1), c1 = Math.min(n - 1, c0 + 1);
  const fr = row - r0, fc = col - c0;
  const v =
    data[r0 * n + c0] * (1 - fr) * (1 - fc) +
    data[r1 * n + c0] * fr * (1 - fc) +
    data[r0 * n + c1] * (1 - fr) * fc +
    data[r1 * n + c1] * fr * fc;
  return v * SCALE;
}

const out = new Int16Array(OUT_SIZE * OUT_SIZE);
let min = Infinity, max = -Infinity, valid = 0;

for (let row = 0; row < OUT_SIZE; row++) {
  for (let col = 0; col < OUT_SIZE; col++) {
    const x = (col - OUT_C) * PIXEL_KM;
    const y = -(row - OUT_C) * PIXEL_KM;
    const r = Math.hypot(x, y);
    const lat = -90 + 2 * Math.atan(r / (2 * R_KM)) * (180 / Math.PI);
    const lon = (Math.atan2(x, y) * 180) / Math.PI;

    let v = null;
    if (r <= 457.5) {
      const hi = bilinear(d80, N80, C80, 0.08, lat, lon);
      const lo = bilinear(d75, N75, C75, 0.24, lat, lon);
      if (lat <= -80.2) v = hi ?? lo;
      else if (lat >= -79.8) v = lo ?? hi;
      else {
        const t = (lat + 80.2) / 0.4;
        v = (hi ?? lo) * (1 - t) + (lo ?? hi) * t;
      }
    }

    if (v === null || !Number.isFinite(v)) {
      out[row * OUT_SIZE + col] = -32768;
    } else {
      const q = Math.max(-32767, Math.min(32767, Math.round(v)));
      out[row * OUT_SIZE + col] = q;
      if (q < min) min = q;
      if (q > max) max = q;
      valid++;
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(out.buffer, out.byteOffset, out.byteLength));

function sampleAt(lat, lon) {
  const x = (() => {
    const c = ((90 + lat) * Math.PI) / 180;
    return 2 * R_KM * Math.tan(c / 2);
  })();
  const row = Math.round(OUT_C - (x * Math.cos((lon * Math.PI) / 180)) / PIXEL_KM);
  const col = Math.round(OUT_C + (x * Math.sin((lon * Math.PI) / 180)) / PIXEL_KM);
  if (row < 0 || row >= OUT_SIZE || col < 0 || col >= OUT_SIZE) return null;
  const v = out[row * OUT_SIZE + col];
  return v === -32768 ? null : v;
}

console.log(`Wrote ${OUT}`);
console.log(`  ${OUT_SIZE}x${OUT_SIZE}, ${(out.byteLength / 1024).toFixed(0)} KiB, ${valid} valid px`);
console.log(`  min ${min} m, max ${max} m`);

const checks = [
  ["Shackleton Rim", -89.61, 187.326],
  ["Connecting Ridge", -89.45, 222.69],
  ["de Gerlache Rim 2", -88.516, 298.833],
  ["Nobile Rim 2", -84.2016, 60.6999],
  ["Mons Mouton", -84.78, 29.13],
  ["Malapert A", -80.13, 1.44],
  ["Cabeus B", -82.4, 297.7],
  ["Haworth", -87.4, 355.6],
];
for (const [name, lat, lon] of checks) {
  console.log(`  ${name.padEnd(18)} ${String(sampleAt(lat, lon)).padStart(7)} m`);
}
