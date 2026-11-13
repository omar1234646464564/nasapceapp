import fs from "node:fs";
const R = 1737.4;
const b80 = fs.readFileSync("data/ldem_80s_80m.img");
const d80 = new Int16Array(b80.buffer, b80.byteOffset, 7600 * 7600);
const b75 = fs.readFileSync("data/ldem_75s_240m.img");
const d75 = new Int16Array(b75.buffer, b75.byteOffset, 3812 * 3812);
function bil(data, n, c, p, lat, lon) {
  const cc = ((90 + lat) * Math.PI) / 180, r = 2 * R * Math.tan(cc / 2), a = (lon * Math.PI) / 180;
  const row = c - (r * Math.cos(a)) / p, col = c + (r * Math.sin(a)) / p;
  if (row < 0 || row > n - 1 || col < 0 || col > n - 1) return null;
  const r0 = Math.floor(row), c0 = Math.floor(col), r1 = Math.min(n - 1, r0 + 1), c1 = Math.min(n - 1, c0 + 1), fr = row - r0, fc = col - c0;
  return (data[r0 * n + c0] * (1 - fr) * (1 - fc) + data[r1 * n + c0] * fr * (1 - fc) + data[r0 * n + c1] * (1 - fr) * fc + data[r1 * n + c1] * fr * fc) * 0.5;
}
function st(lat, lon) {
  if (lat <= -80.05) { const h = bil(d80, 7600, 3799.5, 0.08, lat, lon); if (h !== null) return h; }
  return bil(d75, 3812, 1905.5, 0.24, lat, lon);
}
function dest(lat, lon, az, d) {
  const p1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180, t = (az * Math.PI) / 180, dd = d / R;
  const sp = Math.sin(p1) * Math.cos(dd) + Math.cos(p1) * Math.sin(dd) * Math.cos(t);
  const p2 = Math.asin(sp);
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(dd) * Math.cos(p1), Math.cos(dd) - Math.sin(p1) * sp);
  return { lat: (p2 * 180) / Math.PI, lon: (((l2 * 180) / Math.PI) % 360 + 360) % 360 };
}
const lat = -80.13, lon = 1.44;
let gaps = [];
for (let i = 0; i < 720; i++) {
  const az = i * 0.5; let r = 80;
  while (r <= 160000) {
    const p = dest(lat, lon, az, r / 1000);
    const h = st(p.lat, p.lon);
    if (h === null) { gaps.push({ az, r, lat: p.lat, lon: p.lon }); break; }
    if (r < 3000) r += 80; else if (r < 10000) r += 200; else if (r < 30000) r += 500; else if (r < 80000) r += 1000; else r += 2000;
  }
}
console.log("gaps", gaps.length, gaps.slice(0, 6));
console.log("site", st(lat, lon));
