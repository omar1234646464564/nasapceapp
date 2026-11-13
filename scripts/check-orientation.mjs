import fs from "node:fs";

const N = 7600;
const scale = 0.5;
const data = new Int16Array(
  fs.readFileSync("data/ldem_80s_80m.img").buffer,
  0,
  N * N
);
const R = 1737.4;
const CX = 3799.5;
const CY = 3799.5;

function xy(lat, lon, variant) {
  const c = ((90 + lat) * Math.PI) / 180;
  const r = (2 * R * Math.tan(c / 2)) / 0.08;
  const a = (lon * Math.PI) / 180;
  const sx = Math.sin(a);
  const sy = Math.cos(a);
  switch (variant) {
    case 0: return [CX + r * sx, CY - r * sy];
    case 1: return [CX + r * sx, CY + r * sy];
    case 2: return [CX - r * sx, CY - r * sy];
    case 3: return [CX - r * sx, CY + r * sy];
  }
}

function elev(lat, lon, variant) {
  const [col, row] = xy(lat, lon, variant);
  const rr = Math.round(row), cc = Math.round(col);
  if (rr < 0 || rr >= N || cc < 0 || cc >= N) return NaN;
  return data[rr * N + cc] * scale;
}

function stats(lat, lon, variant, boxDeg = 1.2) {
  let min = Infinity, max = -Infinity, sum = 0, n = 0;
  const step = 0.08;
  for (let dlat = -boxDeg; dlat <= boxDeg; dlat += step) {
    for (let dlon = -boxDeg; dlon <= boxDeg; dlon += step) {
      const v = elev(lat + dlat, lon + dlon, variant);
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v; n++;
    }
  }
  return { center: elev(lat, lon, variant), min, max, mean: sum / n };
}

const features = [
  ["Cabeus", -85.33, 317.87],
  ["Amundsen", -84.5, 82.8],
  ["Faustini", -87.3, 84.9],
  ["de Gerlache", -88.5, 272.9],
  ["Shackleton", -89.9, 0],
  ["Shoemaker", -88.1, 44.9],
  ["Malapert", -84.9, 12.9],
  ["Nobile", -85.2, 53.5],
  ["Haworth", -87.4, 355.6],
  ["Cabeus B", -82.4, 297.7],
];

for (let variant = 0; variant < 4; variant++) {
  console.log(`\n=== variant ${variant} ===`);
  for (const [name, lat, lon] of features) {
    const s = stats(lat, lon, variant);
    console.log(
      name.padEnd(14),
      "center", s.center.toFixed(0).padStart(6),
      "min", s.min.toFixed(0).padStart(6),
      "max", s.max.toFixed(0).padStart(6),
      "mean", s.mean.toFixed(0).padStart(6)
    );
  }
}
