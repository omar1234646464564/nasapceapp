import fs from "node:fs";
import { PNG } from "pngjs";

const N = 760;
const data = new Int16Array(
  fs.readFileSync("public/data/lola_south_pole_800m.bin").buffer,
  0,
  N * N
);

const png = new PNG({ width: N, height: N });
const R = 1737.4;
const scale = 0.8; // km per pixel
const sunAz = 315 * Math.PI / 180;
const sunEl = 20 * Math.PI / 180;

let min = Infinity, max = -Infinity;
for (const v of data) { if (v < min) min = v; if (v > max) max = v; }

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const v = data[i];
    const t = (v - min) / (max - min);
    // hillshade
    const dzdx = (data[y * N + Math.min(N - 1, x + 1)] - data[y * N + Math.max(0, x - 1)]) / (2 * scale * 1000);
    const dzdy = (data[Math.min(N - 1, y + 1) * N + x] - data[Math.max(0, y - 1) * N + x]) / (2 * scale * 1000);
    const nx = -dzdx, ny = -dzdy, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const lx = Math.cos(sunEl) * Math.sin(sunAz);
    const ly = Math.cos(sunEl) * Math.cos(sunAz);
    const lz = Math.sin(sunEl);
    const shade = Math.max(0, (nx * lx + ny * ly + nz * lz) / len);

    // terrain colour ramp: dark grey -> warm grey -> white
    const r = Math.round(40 + 180 * t * (0.55 + 0.45 * shade));
    const g = Math.round(44 + 160 * t * (0.55 + 0.45 * shade));
    const b = Math.round(52 + 140 * t * (0.55 + 0.45 * shade));
    const idx = (y * N + x) * 4;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = 255;
  }
}

// Draw the 80S circle and site markers
function project(lat, lon) {
  const c = ((90 + lat) * Math.PI) / 180;
  const r = (2 * R * Math.tan(c / 2)) / scale;
  const a = (lon * Math.PI) / 180;
  return [379.5 + r * Math.sin(a), 379.5 + r * Math.cos(a)];
}
function dot(lat, lon, col) {
  const [x, y] = project(lat, lon);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dy * dy > 9) continue;
    const xx = Math.round(x + dx), yy = Math.round(y + dy);
    if (xx < 0 || xx >= N || yy < 0 || yy >= N) continue;
    const idx = (yy * N + xx) * 4;
    png.data[idx] = col[0]; png.data[idx + 1] = col[1]; png.data[idx + 2] = col[2];
  }
}
const sites = [
  ["Shackleton", -89.61, 187.326, [255, 210, 80]],
  ["Connecting", -89.45, 222.69, [255, 120, 80]],
  ["deGerlache", -88.516, 298.833, [120, 220, 255]],
  ["Nobile2", -84.2016, 60.6999, [140, 255, 140]],
  ["MonsMouton", -84.78, 29.13, [255, 120, 255]],
  ["CabeusB", -82.4, 297.7, [255, 255, 255]],
  ["Haworth", -87.4, 355.6, [255, 60, 60]],
];
for (const [name, lat, lon, col] of sites) dot(lat, lon, col);

fs.writeFileSync("data/dem-preview.png", PNG.sync.write(png));
console.log("wrote data/dem-preview.png", min, max);
for (const [name, lat, lon] of sites) {
  const [x, y] = project(lat, lon);
  console.log(name, x.toFixed(0), y.toFixed(0));
}
