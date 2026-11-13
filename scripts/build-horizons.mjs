/**
 * Precompute terrain horizon profiles for every curated landing site.
 *
 * Source data (PDS Geosciences Node, LRO-L-LOLA-4-GDR-V1.0):
 *   LDEM_80S_80M.IMG   7600 x 7600,  80 m/px, 80S-90S
 *   LDEM_75S_240M.IMG  3812 x 3812, 240 m/px, 75S-90S
 *
 * For each site we march ~200 radial samples along 720 azimuths out to
 * 160 km, accounting for lunar curvature, and keep the maximum elevation
 * angle. The profile is stored as a base64 int16 array in hundredths of
 * a degree, which keeps the shipped payload around 170 KB.
 *
 * Sites outside the terrain products get a flat (0 deg) horizon and are
 * marked `coverage: "none"` so the UI can explain the limitation.
 */
import fs from "node:fs";
import path from "node:path";

const R_KM = 1737.4;
const SCALE = 0.5;
const STEP_DEG = 0.5;
const MAX_DIST_KM = 160;
const LAYERS_KM = [3, 10, 40, 160];

const SRC80 = path.resolve("data/ldem_80s_80m.img");
const SRC75 = path.resolve("data/ldem_75s_240m.img");
const OUT = path.resolve("public/data/horizons.json");

const N80 = 7600;
const N75 = 3812;
const C80 = 3799.5;
const C75 = 1905.5;

console.log("Loading LOLA DEMs ...");
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
  const r0 = Math.floor(row),
    c0 = Math.floor(col);
  const r1 = Math.min(n - 1, r0 + 1),
    c1 = Math.min(n - 1, c0 + 1);
  const fr = row - r0,
    fc = col - c0;
  const v =
    data[r0 * n + c0] * (1 - fr) * (1 - fc) +
    data[r1 * n + c0] * fr * (1 - fc) +
    data[r0 * n + c1] * (1 - fr) * fc +
    data[r1 * n + c1] * fr * fc;
  return v * SCALE;
}

/** Composite sampler: 80 m product first, 240 m outside its square. */
function sampleTerrain(lat, lon) {
  if (lat <= -80.05) {
    const hi = bilinear(d80, N80, C80, 0.08, lat, lon);
    if (hi !== null) return hi;
  }
  return bilinear(d75, N75, C75, 0.24, lat, lon);
}

function destination(lat, lon, azimuthDeg, distanceKm) {
  const phi1 = (lat * Math.PI) / 180;
  const lam1 = (lon * Math.PI) / 180;
  const theta = (azimuthDeg * Math.PI) / 180;
  const delta = distanceKm / R_KM;
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lam2 =
    lam1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * sinPhi2
    );
  return { lat: (phi2 * 180) / Math.PI, lon: (((lam2 * 180) / Math.PI) % 360 + 360) % 360 };
}

function computeHorizon(lat, lon) {
  const siteElevationM = sampleTerrain(lat, lon);
  const hasTerrain = siteElevationM !== null;
  const siteH = siteElevationM ?? 0;
  const n = Math.round(360 / STEP_DEG);
  const full = new Float32Array(n);
  const layers = LAYERS_KM.map(() => new Float32Array(n));
  let complete = hasTerrain;

  if (!hasTerrain) {
    return { siteElevationM: 0, full, layers, complete: false, coverage: "none" };
  }

  for (let i = 0; i < n; i++) {
    const az = i * STEP_DEG;
    let maxEl = -90;
    let layerIdx = 0;
    let hadGap = false;

    let r = 80;
    while (r <= MAX_DIST_KM * 1000) {
      const p = destination(lat, lon, az, r / 1000);
      const h = sampleTerrain(p.lat, p.lon);
      if (h !== null) {
        const drop = (r * r) / (2 * R_KM * 1000);
        const el = (Math.atan2(h - siteH - drop, r) * 180) / Math.PI;
        if (el > maxEl) maxEl = el;
      } else if (r < 150_000) {
        hadGap = true;
      }

      while (layerIdx < LAYERS_KM.length && r >= LAYERS_KM[layerIdx] * 1000) {
        layers[layerIdx][i] = maxEl;
        layerIdx++;
      }

      if (r < 3000) r += 80;
      else if (r < 10_000) r += 200;
      else if (r < 30_000) r += 500;
      else if (r < 80_000) r += 1000;
      else r += 2000;
    }
    while (layerIdx < LAYERS_KM.length) {
      layers[layerIdx][i] = maxEl;
      layerIdx++;
    }
    if (hadGap) complete = false;
    full[i] = maxEl;
  }

  return {
    siteElevationM: Math.round(siteH),
    full,
    layers,
    complete,
    coverage: lat <= -80 ? "80m" : "240m",
  };
}

function encode(arr) {
  const q = new Int16Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    q[i] = Math.max(-32767, Math.min(32767, Math.round(arr[i] * 100)));
  }
  return Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString("base64");
}

// Keep this list in sync with lib/sites.ts. Only polar sites have terrain.
const SITES = [
  ["shackleton-rim", -89.61, 187.326],
  ["connecting-ridge", -89.45, 222.69],
  ["peak-shackleton", -89.0054, 125.3092],
  ["de-gerlache-rim-2", -88.516, 298.833],
  ["faustini-rim-a", -88.087, 98.355],
  ["nobile-rim-2", -84.20156, 60.69989],
  ["amundsen-rim", -84.1918, 67.229],
  ["malapert-massif", -86.0, 0.0],
  ["mons-mouton", -84.78, 29.13],
  ["malapert-a", -80.13, 1.44],
  ["cabeus-b", -82.4, 297.7],
  ["haworth", -87.4, 355.6],
  ["apollo-11", 0.674, 23.473],
  ["apollo-17", 20.191, 30.772],
  ["chandrayaan-3", -69.373, 32.319],
  ["chang-e-4", -45.444, 177.599],
  ["chang-e-6", -41.638, 206.015],
  ["slim", -13.316, 25.251],
];

const out = {
  stepDeg: STEP_DEG,
  maxDistanceKm: MAX_DIST_KM,
  layerDistancesKm: LAYERS_KM,
  generated: new Date().toISOString(),
  source:
    "LRO LOLA LDEM_80S_80M (80 m) and LDEM_75S_240M (240 m), PDS Geosciences Node",
  sites: {},
};

for (const [id, lat, lon] of SITES) {
  const t0 = Date.now();
  const h = computeHorizon(lat, lon);
  const flat = h.coverage === "none";
  out.sites[id] = {
    siteElevationM: h.siteElevationM,
    complete: h.complete,
    coverage: h.coverage,
    h: encode(h.full),
    l: h.layers.map(encode),
  };
  let maxEl = -90;
  for (const v of h.full) if (v > maxEl) maxEl = v;
  console.log(
    `${id.padEnd(18)} elev ${String(h.siteElevationM).padStart(6)} m  ` +
      `max horizon ${maxEl.toFixed(2).padStart(7)} deg  ` +
      `${flat ? "FLAT (no terrain)" : h.complete ? "full" : "partial"}  ` +
      `${Date.now() - t0} ms`
  );
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const size = fs.statSync(OUT).size;
console.log(`\nWrote ${OUT}`);
console.log(`  ${(size / 1024).toFixed(0)} KiB, ${Object.keys(out.sites).length} sites`);
