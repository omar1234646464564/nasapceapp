import fs from "node:fs";

const N = 7600;
const scale = 0.5;
const buf = fs.readFileSync("data/ldem_80s_80m.img");
console.log("bytes", buf.length, "expected", N * N * 2);
const data = new Int16Array(buf.buffer, buf.byteOffset, N * N);

let min = Infinity;
let max = -Infinity;
let minIdx = 0;
let maxIdx = 0;
for (let i = 0; i < data.length; i++) {
  const v = data[i];
  if (v < min) {
    min = v;
    minIdx = i;
  }
  if (v > max) {
    max = v;
    maxIdx = i;
  }
}
console.log("min DN", min, "m", min * scale, "at row,col", Math.floor(minIdx / N), minIdx % N);
console.log("max DN", max, "m", max * scale, "at row,col", Math.floor(maxIdx / N), maxIdx % N);

function sample(lat, lon) {
  // Try both longitude orientations, return values
  const R = 1737.4;
  const c = (90 + lat) * Math.PI / 180; // lat negative
  const r = 2 * R * Math.tan(c / 2);
  const x = r * Math.sin(lon * Math.PI / 180);
  const y = r * Math.cos(lon * Math.PI / 180);
  const colA = 3799.5 + x / 0.08;
  const rowA = 3799.5 - y / 0.08;
  const colB = 3799.5 + x / 0.08;
  const rowB = 3799.5 + y / 0.08;
  function at(row, col) {
    const rr = Math.round(row), cc = Math.round(col);
    if (rr < 0 || rr >= N || cc < 0 || cc >= N) return NaN;
    return data[rr * N + cc] * scale;
  }
  return { A: at(rowA, colA), B: at(rowB, colB), rowA, colA, rowB, colB };
}

const features = [
  ["Cabeus", -85.33, 317.9],
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
for (const [name, lat, lon] of features) {
  const s = sample(lat, lon);
  console.log(name.padEnd(14), "A", s.A.toFixed(0).padStart(7), "B", s.B.toFixed(0).padStart(7), "rc", s.rowA.toFixed(0), s.colA.toFixed(0));
}

// Print a coarse ASCII map of the central region to see orientation.
function getRowCol(lat, lon, flip) {
  const R = 1737.4;
  const c = (90 + lat) * Math.PI / 180;
  const r = 2 * R * Math.tan(c / 2);
  const x = r * Math.sin(lon * Math.PI / 180);
  const y = r * Math.cos(lon * Math.PI / 180);
  return [3799.5 + (flip ? y : -y) / 0.08, 3799.5 + x / 0.08];
}
for (const flip of [false, true]) {
  console.log("\nOrientation flip=", flip);
  const chars = " .:-=+*#%@";
  for (let lat = -80; lat >= -90; lat -= 0.8) {
    let line = "";
    for (let lon = 0; lon < 360; lon += 3.6) {
      const [row, col] = getRowCol(lat, lon, flip);
      const rr = Math.round(row), cc = Math.round(col);
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) { line += " "; continue; }
      const v = data[rr * N + cc] * scale;
      const t = Math.max(0, Math.min(1, (v + 9000) / 18000));
      line += chars[Math.floor(t * (chars.length - 1))];
    }
    console.log(line);
  }
}
