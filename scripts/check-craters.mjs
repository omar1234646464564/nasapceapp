import fs from "node:fs";

const N = 7600;
const data = new Int16Array(fs.readFileSync("data/ldem_80s_80m.img").buffer, 0, N * N);
const R = 1737.4;
const CX = 3799.5, CY = 3799.5;

function project(lat, lon, variant) {
  const c = ((90 + lat) * Math.PI) / 180;
  const r = (2 * R * Math.tan(c / 2)) / 0.08;
  const a = (lon * Math.PI) / 180;
  const sx = Math.sin(a), sy = Math.cos(a);
  switch (variant) {
    case 0: return [CX + r * sx, CY - r * sy];
    case 1: return [CX + r * sx, CY + r * sy];
    case 2: return [CX - r * sx, CY - r * sy];
    case 3: return [CX - r * sx, CY + r * sy];
  }
}
function elev(lat, lon, variant) {
  const [col, row] = project(lat, lon, variant);
  const rr = Math.round(row), cc = Math.round(col);
  if (rr < 0 || rr >= N || cc < 0 || cc >= N) return null;
  return data[rr * N + cc] * 0.5;
}
function stats(lat, lon, radiusDeg, variant) {
  let inner = 0, ni = 0, outer = 0, no = 0;
  for (let dlat = -2.5; dlat <= 2.5; dlat += 0.02) {
    for (let dlon = -2.5; dlon <= 2.5; dlon += 0.02) {
      const d = Math.hypot(dlat, dlon);
      const v = elev(lat + dlat, lon + dlon, variant);
      if (v === null) continue;
      if (d <= radiusDeg * 0.5) { inner += v; ni++; }
      else if (d >= radiusDeg * 1.3 && d <= radiusDeg * 1.9) { outer += v; no++; }
    }
  }
  return { inner: inner / ni, outer: outer / no, diff: inner / ni - outer / no, ni, no };
}

const craters = [
  ["Cabeus", -85.33, 317.87, 1.6],
  ["Amundsen", -84.5, 82.8, 1.7],
  ["Faustini", -87.3, 84.9, 0.64],
  ["de Gerlache", -88.5, 272.9, 0.51],
  ["Shoemaker", -88.1, 44.9, 0.83],
  ["Nobile", -85.2, 53.5, 1.2],
  ["Cabeus B", -82.4, 297.7, 0.66],
  ["Haworth", -87.4, 355.6, 0.84],
  ["Malapert", -84.9, 12.9, 1.14],
];
for (let variant = 0; variant < 4; variant++) {
  console.log(`\n=== variant ${variant} ===`);
  let total = 0;
  for (const [name, lat, lon, rad] of craters) {
    const s = stats(lat, lon, rad, variant);
    total += s.diff;
    console.log(name.padEnd(12), "inner", s.inner.toFixed(0).padStart(6), "outer", s.outer.toFixed(0).padStart(6), "diff", s.diff.toFixed(0).padStart(6));
  }
  console.log("TOTAL diff", total.toFixed(0));
}
