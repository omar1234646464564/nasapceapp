import {
  DEG,
  RAD,
  moonOrientation,
  ephemeris,
  sunEcliptic,
  moonEcliptic,
  eclipticDateToJ2000,
  precessionMatrix,
  julianDate,
  norm360,
  type SiteCoord,
} from "../lib/astro";

function fmt(n: number, d = 4) {
  return n.toFixed(d);
}

// --- 1. IAU_MOON matrix check at ET=1000 s (from SPICE/Fortran test) ---
const jd1000 = 2451545.0 + 1000 / 86400;
const ori = moonOrientation(jd1000);
console.log("IAU_MOON matrix at J2000+1000s:");
console.log(ori.matrix.map((r) => r.map((v) => v.toFixed(14)).join(" ")).join("\n"));
console.log("expected row 1: 0.78257369718829173 0.55976292119480831 0.27247730276942850");
console.log("expected row 2: -0.62214729926548507 0.71906872303263469 0.30963350847878057");
console.log("expected row 3: -0.022608548951909870 -0.41183205753276536 0.91097925876642116");

// --- 2. Precession check: Polaris J2000 -> 2025 ---
const T2025 = 25.0 / 100;
const p = precessionMatrix(T2025);
const polaris = [
  Math.cos(89.2641 * DEG) * Math.cos(37.9545 * DEG),
  Math.cos(89.2641 * DEG) * Math.sin(37.9545 * DEG),
  Math.sin(89.2641 * DEG),
];
const pol2025 = [
  p[0][0] * polaris[0] + p[0][1] * polaris[1] + p[0][2] * polaris[2],
  p[1][0] * polaris[0] + p[1][1] * polaris[1] + p[1][2] * polaris[2],
  p[2][0] * polaris[0] + p[2][1] * polaris[1] + p[2][2] * polaris[2],
];
const ra = norm360(Math.atan2(pol2025[1], pol2025[0]) * RAD) / 15;
const dec = Math.asin(pol2025[2]) * RAD;
console.log(`\nPolaris precessed to 2025: RA=${ra.toFixed(3)}h Dec=${dec.toFixed(3)} (expect ~2.95h, 89.35)`);

// --- 3. Ephemeris at a few dates / south pole ---
const shackleton: SiteCoord = { lat: -89.9, lon: 0, elevationKm: 0 };
const dates = [
  "2024-01-25T17:54:00Z", // full moon
  "2024-02-09T22:59:00Z", // new moon
  "2025-03-06T12:00:00Z",
  "2026-11-11T00:00:00Z",
  "2027-01-15T12:00:00Z",
  "2027-06-15T12:00:00Z",
];
for (const ds of dates) {
  const d = new Date(ds);
  const e = ephemeris(d, shackleton);
  console.log(
    `\n${ds}\n  sub-solar lat=${fmt(e.subSolarLat, 3)} lon=${fmt(e.subSolarLon, 2)}` +
      `  sub-Earth lat=${fmt(e.subEarthLat, 3)} lon=${fmt(e.subEarthLon, 2)}` +
      `  phase=${fmt(e.earthPhase, 3)}` +
      `\n  Sun az=${fmt(e.sun.azimuth, 2)} el=${fmt(e.sun.elevation, 3)} r=${fmt(e.sun.angularRadius, 3)}` +
      `\n  Earth az=${fmt(e.earth.azimuth, 2)} el=${fmt(e.earth.elevation, 3)} r=${fmt(e.earth.angularRadius, 3)}` +
      ` dist=${fmt(e.earth.distanceKm, 0)}`
  );
}

// --- 4. Sun elevation at pole vs -subsolar latitude (should match within ~0.1 deg) ---
console.log("\nConsistency: Sun elevation at pole vs -subsolar latitude");
for (let i = 0; i < 8; i++) {
  const d = new Date(Date.UTC(2027, i, 15, 12));
  const e = ephemeris(d, shackleton);
  console.log(
    d.toISOString().slice(0, 10),
    fmt(e.sun.elevation, 4),
    fmt(-e.subSolarLat, 4),
    "diff",
    fmt(e.sun.elevation + e.subSolarLat, 4)
  );
}

// --- 5. Subsolar longitude rate ---
const e1 = ephemeris(new Date("2027-01-15T00:00:00Z"), shackleton);
const e2 = ephemeris(new Date("2027-01-16T00:00:00Z"), shackleton);
console.log(
  "\nSubsolar longitude rate (deg/day):",
  norm360(e2.subSolarLon - e1.subSolarLon).toFixed(3)
);
