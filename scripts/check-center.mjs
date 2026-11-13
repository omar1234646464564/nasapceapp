import fs from "node:fs";
const N = 7600;
const data = new Int16Array(fs.readFileSync("data/ldem_80s_80m.img").buffer, 0, N * N);
const CX = 3799.5, CY = 3799.5;
let min = 1e9, max = -1e9, minRC = [0, 0], maxRC = [0, 0];
for (let row = Math.floor(CY - 375); row <= CY + 375; row++) {
  for (let col = Math.floor(CX - 375); col <= CX + 375; col++) {
    const dr = row - CY, dc = col - CX;
    if (dr * dr + dc * dc > 375 * 375) continue;
    const v = data[row * N + col] * 0.5;
    if (v < min) { min = v; minRC = [row, col]; }
    if (v > max) { max = v; maxRC = [row, col]; }
  }
}
const R = 1737.4;
function inv(row, col) {
  const x = (col - CX) * 0.08, y = (row - CY) * 0.08;
  const r = Math.hypot(x, y);
  const lat = -90 + 2 * Math.atan(r / (2 * R)) * 180 / Math.PI;
  const lon = Math.atan2(x, y) * 180 / Math.PI;
  return { lat, lon, r };
}
console.log("min", min, minRC, inv(...minRC));
console.log("max", max, maxRC, inv(...maxRC));
for (const ang of [0, 90, 180, 270]) {
  const a = ang * Math.PI / 180;
  const line = [];
  for (let r = 0; r <= 400; r += 20) {
    const row = Math.round(CY + r * Math.cos(a));
    const col = Math.round(CX + r * Math.sin(a));
    line.push(data[row * N + col] * 0.5);
  }
  console.log(ang, line.join(","));
}
