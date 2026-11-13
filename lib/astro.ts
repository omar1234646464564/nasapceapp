/**
 * Lunar astronomy engine.
 *
 * Reference frames
 * ----------------
 * - ICRF / J2000 mean equator & equinox: all vectors handed to the Moon
 *   orientation model live here.
 * - Selenographic body-fixed frame: +x at (0E, 0N), +y at (90E, 0N),
 *   +z at the north pole. Longitude is positive east.
 *
 * Ephemerides
 * -----------
 * Sun: Meeus, Astronomical Algorithms, low-precision solar coordinates
 *      (ch. 25) - good to ~0.01 deg.
 * Moon: Meeus ch. 47 periodic series (60 longitude/radius terms and
 *      60 latitude terms) - good to ~10 arcsec.
 * Moon orientation: IAU WGCCRE 2009 lunar rotation model (the same model
 *      used by SPICE's IAU_MOON frame), with 13 periodic terms.
 *
 * The resulting selenographic positions are typically within a few
 * hundredths of a degree of JPL/SPICE values. The limiting factor for
 * horizon work is the terrain model, not the ephemeris.
 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const MOON_RADIUS_KM = 1737.4;
export const EARTH_RADIUS_KM = 6378.137;
export const SUN_RADIUS_KM = 695700;
export const AU_KM = 149597870.7;
export const C_KM_S = 299792.458;

export type Vec3 = [number, number, number];

export function norm360(x: number): number {
  const y = x % 360;
  return y < 0 ? y + 360 : y;
}

export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

export function dateFromJulian(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function normalize(a: Vec3): Vec3 {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n === 0 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** Multiply a 3x3 row-major matrix by a column vector. */
function mul(m: number[][], v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Apply a row-major 3x3 matrix to a vector. */
export function transform(m: number[][], v: Vec3): Vec3 {
  return mul(m, v);
}

function matMul(a: number[][], b: number[][]): number[][] {
  const out: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out[i][j] =
        a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return out;
}

function rotX(a: number): number[][] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

function rotZ(a: number): number[][] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

export function transpose(m: number[][]): number[][] {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

// ---------------------------------------------------------------------------
// Sun
// ---------------------------------------------------------------------------

export interface SunEcliptic {
  lambda: number; // deg, mean ecliptic of date
  beta: number; // deg
  distanceAU: number;
}

export function sunEcliptic(jd: number): SunEcliptic {
  const n = jd - 2451545.0;
  const L = norm360(280.46 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n) * DEG;
  const lambda = norm360(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const distanceAU =
    1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return { lambda, beta: 0, distanceAU };
}

// ---------------------------------------------------------------------------
// Moon (Meeus ch. 47)
// ---------------------------------------------------------------------------

// [D, M, M', F, sumL(1e-6 deg), sumR(1e-3 km)]
const MOON_LR: number[][] = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950],
  [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616],
  [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117],
  [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423],
  [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571],
  [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
  [2, 0, -1, -2, 0, 8752],
];

// [D, M, M', F, sumB(1e-6 deg)]
const MOON_B: number[][] = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
  [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777],
  [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596],
  [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439],
  [2, 0, 2, 1, 422],
  [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351],
  [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315],
  [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229],
  [1, 1, 0, -1, 223],
  [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220],
  [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177],
  [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119],
  [4, -1, 0, -1, 115],
  [2, -2, 0, 1, 107],
];

export interface MoonEcliptic {
  lambda: number; // deg, mean ecliptic of date
  beta: number; // deg
  distanceKm: number;
}

export function moonEcliptic(jd: number): MoonEcliptic {
  const T = (jd - 2451545.0) / 36525;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  const Lp = norm360(
    218.3164477 +
      481267.88123421 * T -
      0.0015786 * T2 +
      T3 / 538841 -
      T4 / 65194000
  );
  const D = norm360(
    297.8501921 +
      445267.1114034 * T -
      0.0018819 * T2 +
      T3 / 545868 -
      T4 / 113065000
  );
  const M = norm360(
    357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000
  );
  const Mp = norm360(
    134.9633964 +
      477198.8675055 * T +
      0.0087414 * T2 +
      T3 / 69699 -
      T4 / 14712000
  );
  const F = norm360(
    93.272095 +
      483202.0175233 * T -
      0.0036539 * T2 -
      T3 / 3526000 +
      T4 / 863310000
  );

  const A1 = norm360(119.75 + 131.849 * T);
  const A2 = norm360(53.09 + 479264.29 * T);
  const A3 = norm360(313.45 + 481266.484 * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  let sumL = 0;
  let sumR = 0;
  let sumB = 0;

  for (const [d, m, mp, f, l, r] of MOON_LR) {
    const arg = (d * D + m * M + mp * Mp + f * F) * DEG;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumL += l * ecc * Math.sin(arg);
    sumR += r * ecc * Math.cos(arg);
  }
  for (const [d, m, mp, f, b] of MOON_B) {
    const arg = (d * D + m * M + mp * Mp + f * F) * DEG;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumB += b * ecc * Math.sin(arg);
  }

  sumL +=
    3958 * Math.sin(A1 * DEG) +
    1962 * Math.sin((Lp - F) * DEG) +
    318 * Math.sin(A2 * DEG);
  sumB +=
    -2235 * Math.sin(Lp * DEG) +
    382 * Math.sin(A3 * DEG) +
    175 * Math.sin((A1 - F) * DEG) +
    175 * Math.sin((A1 + F) * DEG) +
    127 * Math.sin((Lp - Mp) * DEG) -
    115 * Math.sin((Lp + Mp) * DEG);

  return {
    lambda: norm360(Lp + sumL / 1e6),
    beta: sumB / 1e6,
    distanceKm: 385000.56 + sumR / 1000,
  };
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

export function meanObliquity(T: number): number {
  return 23.439291111 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}

export function eclipticToEquatorial(
  lambdaDeg: number,
  betaDeg: number,
  obliquityDeg: number
): Vec3 {
  const l = lambdaDeg * DEG;
  const b = betaDeg * DEG;
  const e = obliquityDeg * DEG;
  return [
    Math.cos(b) * Math.cos(l),
    Math.cos(b) * Math.sin(l) * Math.cos(e) - Math.sin(b) * Math.sin(e),
    Math.cos(b) * Math.sin(l) * Math.sin(e) + Math.sin(b) * Math.cos(e),
  ];
}

/** Mean J2000 -> mean equator/equinox of date precession matrix. */
export function precessionMatrix(T: number): number[][] {
  const zeta =
    (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) / 3600;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) / 3600;
  const theta =
    (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) / 3600;
  const cz = Math.cos(zeta * DEG);
  const sz = Math.sin(zeta * DEG);
  const cZ = Math.cos(z * DEG);
  const sZ = Math.sin(z * DEG);
  const ct = Math.cos(theta * DEG);
  const st = Math.sin(theta * DEG);
  return [
    [cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ],
    [cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ],
    [cz * st, -sz * st, ct],
  ];
}

/** Convert an ecliptic-of-date position (AU or km) to a J2000 equatorial vector. */
export function eclipticDateToJ2000(
  lambdaDeg: number,
  betaDeg: number,
  distance: number,
  T: number
): Vec3 {
  const ofDate = eclipticToEquatorial(
    lambdaDeg,
    betaDeg,
    meanObliquity(T)
  );
  const p = precessionMatrix(T);
  // date -> J2000 is the transpose of J2000 -> date
  const j2000 = mul(transpose(p), ofDate);
  return scale(j2000, distance);
}

// ---------------------------------------------------------------------------
// Moon orientation (IAU WGCCRE 2009)
// ---------------------------------------------------------------------------

export interface MoonOrientation {
  alpha0: number; // deg
  delta0: number; // deg
  W: number; // deg
  matrix: number[][]; // ICRF -> body-fixed
}

export function moonOrientation(jd: number): MoonOrientation {
  const d = jd - 2451545.0;
  const T = d / 36525;

  const e1 = (125.045 - 0.0529921 * d) * DEG;
  const e2 = (250.089 - 0.1059842 * d) * DEG;
  const e3 = (260.008 + 13.0120009 * d) * DEG;
  const e4 = (176.625 + 13.3407154 * d) * DEG;
  const e5 = (357.529 + 0.9856003 * d) * DEG;
  const e6 = (311.589 + 26.4057084 * d) * DEG;
  const e7 = (134.963 + 13.064993 * d) * DEG;
  const e8 = (276.617 + 0.3287146 * d) * DEG;
  const e9 = (34.226 + 1.7484877 * d) * DEG;
  const e10 = (15.134 - 0.1589763 * d) * DEG;
  const e11 = (119.743 + 0.0036096 * d) * DEG;
  const e12 = (239.961 + 0.1643573 * d) * DEG;
  const e13 = (25.053 + 12.9590088 * d) * DEG;

  const alpha0 =
    269.9949 +
    0.0031 * T -
    3.8787 * Math.sin(e1) -
    0.1204 * Math.sin(e2) +
    0.07 * Math.sin(e3) -
    0.0172 * Math.sin(e4) +
    0.0072 * Math.sin(e6) -
    0.0052 * Math.sin(e10) +
    0.0043 * Math.sin(e13);

  const delta0 =
    66.5392 +
    0.013 * T +
    1.5419 * Math.cos(e1) +
    0.0239 * Math.cos(e2) -
    0.0278 * Math.cos(e3) +
    0.0068 * Math.cos(e4) -
    0.0029 * Math.cos(e6) +
    0.0009 * Math.cos(e7) +
    0.0008 * Math.cos(e10) -
    0.0009 * Math.cos(e13);

  const W =
    38.3213 +
    13.17635815 * d -
    1.4e-12 * d * d +
    3.561 * Math.sin(e1) +
    0.1208 * Math.sin(e2) -
    0.0642 * Math.sin(e3) +
    0.0158 * Math.sin(e4) +
    0.0252 * Math.sin(e5) -
    0.0066 * Math.sin(e6) -
    0.0047 * Math.sin(e7) -
    0.0046 * Math.sin(e8) +
    0.0028 * Math.sin(e9) +
    0.0052 * Math.sin(e10) +
    0.004 * Math.sin(e11) +
    0.0019 * Math.sin(e12) -
    0.0044 * Math.sin(e13);

  // Build the body axes directly in ICRF. Rows of the matrix are the
  // body-fixed x, y and z axes expressed in ICRF coordinates.
  //   z = pole direction
  //   N = ascending node of the lunar equator on the ICRF equator
  //   x = N cos W + (z x N) sin W
  // This avoids Euler-order sign conventions and is exactly the IAU
  // definition of the prime meridian.
  const a = alpha0 * DEG;
  const dec = delta0 * DEG;
  const zAxis: Vec3 = [
    Math.cos(dec) * Math.cos(a),
    Math.cos(dec) * Math.sin(a),
    Math.sin(dec),
  ];
  const node: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  const q = cross(zAxis, node);
  const w = W * DEG;
  const xAxis = add(scale(node, Math.cos(w)), scale(q, Math.sin(w)));
  const yAxis = cross(zAxis, xAxis);

  const matrix = [xAxis, yAxis, zAxis];

  return { alpha0, delta0, W, matrix };
}

// ---------------------------------------------------------------------------
// Local horizon coordinates
// ---------------------------------------------------------------------------

export interface SiteCoord {
  lat: number; // planetocentric, deg south negative
  lon: number; // deg east 0..360
  elevationKm: number; // height above 1737.4 km reference sphere
}

export interface BodyPosition {
  azimuth: number; // deg, 0 = north, 90 = east
  elevation: number; // deg
  distanceKm: number;
  vectorBodyFixed: Vec3;
  angularRadius: number; // deg
}

export function siteBodyFixed(site: SiteCoord): Vec3 {
  const r = MOON_RADIUS_KM + site.elevationKm;
  const phi = site.lat * DEG;
  const lam = site.lon * DEG;
  return [
    r * Math.cos(phi) * Math.cos(lam),
    r * Math.cos(phi) * Math.sin(lam),
    r * Math.sin(phi),
  ];
}

/** Convert a body-fixed direction (from the site) to az/el at the site. */
export function bodyFixedToAzEl(
  dir: Vec3,
  lat: number,
  lon: number
): { azimuth: number; elevation: number } {
  const phi = lat * DEG;
  const lam = lon * DEG;
  const east: Vec3 = [-Math.sin(lam), Math.cos(lam), 0];
  const north: Vec3 = [
    -Math.sin(phi) * Math.cos(lam),
    -Math.sin(phi) * Math.sin(lam),
    Math.cos(phi),
  ];
  const up: Vec3 = [
    Math.cos(phi) * Math.cos(lam),
    Math.cos(phi) * Math.sin(lam),
    Math.sin(phi),
  ];
  const e = dot(dir, east);
  const n = dot(dir, north);
  const u = dot(dir, up);
  return {
    azimuth: norm360(Math.atan2(e, n) * RAD),
    elevation: Math.asin(Math.max(-1, Math.min(1, u))) * RAD,
  };
}

/** Position of a body as seen from a site. Vectors are J2000 equatorial km. */
export function topocentricPosition(
  bodyGeocentric: Vec3,
  site: SiteCoord,
  orientation: MoonOrientation
): BodyPosition {
  const observerBody = siteBodyFixed(site);
  const observerJ2000 = mul(transpose(orientation.matrix), observerBody);
  const rel = sub(bodyGeocentric, observerJ2000);
  const distanceKm = length(rel);
  const bodyFixed = mul(orientation.matrix, normalize(rel));
  const { azimuth, elevation } = bodyFixedToAzEl(bodyFixed, site.lat, site.lon);
  return {
    azimuth,
    elevation,
    distanceKm,
    vectorBodyFixed: bodyFixed,
    angularRadius: 0,
  };
}

export interface Ephemeris {
  jd: number;
  sun: BodyPosition;
  earth: BodyPosition;
  sunDistanceAU: number;
  moonDistanceKm: number;
  subSolarLat: number;
  subSolarLon: number;
  subEarthLat: number;
  subEarthLon: number;
  earthPhase: number; // 0 = new, 1 = full
  orientation: MoonOrientation;
}

/** Compute topocentric Sun and Earth positions for a site at a Date. */
export function ephemeris(date: Date, site: SiteCoord): Ephemeris {
  const jd = julianDate(date);
  const T = (jd - 2451545.0) / 36525;

  const sunEcl = sunEcliptic(jd);
  const moonEcl = moonEcliptic(jd);

  // Light-time: use the Moon's retarded geocentric position for each body.
  const sunLightTimeDays =
    (sunEcl.distanceAU * AU_KM) / C_KM_S / 86400;
  const earthLightTimeDays = moonEcl.distanceKm / C_KM_S / 86400;

  const sunRetarded = sunEcliptic(jd - sunLightTimeDays);
  const moonForSun = moonEcliptic(jd - sunLightTimeDays);
  const moonForEarth = moonEcliptic(jd - earthLightTimeDays);

  const sunGeo = eclipticDateToJ2000(
    sunRetarded.lambda,
    sunRetarded.beta,
    sunRetarded.distanceAU * AU_KM,
    T - sunLightTimeDays / 36525
  );
  const moonGeoForSun = eclipticDateToJ2000(
    moonForSun.lambda,
    moonForSun.beta,
    moonForSun.distanceKm,
    T - sunLightTimeDays / 36525
  );
  const moonGeoForEarth = eclipticDateToJ2000(
    moonForEarth.lambda,
    moonForEarth.beta,
    moonForEarth.distanceKm,
    T - earthLightTimeDays / 36525
  );
  const moonGeo = eclipticDateToJ2000(
    moonEcl.lambda,
    moonEcl.beta,
    moonEcl.distanceKm,
    T
  );

  const sunRelMoon = sub(sunGeo, moonGeoForSun);
  const earthRelMoon = scale(moonGeoForEarth, -1);

  const orientation = moonOrientation(jd);
  const sun = topocentricPosition(sunRelMoon, site, orientation);
  const earth = topocentricPosition(earthRelMoon, site, orientation);

  sun.angularRadius =
    Math.asin(SUN_RADIUS_KM / sun.distanceKm) * RAD;
  earth.angularRadius =
    Math.asin(EARTH_RADIUS_KM / earth.distanceKm) * RAD;

  const subSolar = bodyFixedToLatLon(sun.vectorBodyFixed);
  const subEarth = bodyFixedToLatLon(earth.vectorBodyFixed);

  // Earth phase as seen from the Moon: angle Sun-Earth as seen from Moon.
  const sunFromMoon = normalize(sunRelMoon);
  const earthFromMoon = normalize(earthRelMoon);
  const phaseAngle = Math.acos(
    Math.max(-1, Math.min(1, dot(sunFromMoon, earthFromMoon)))
  );
  const earthPhase = (1 + Math.cos(phaseAngle)) / 2;

  return {
    jd,
    sun,
    earth,
    sunDistanceAU: sunRetarded.distanceAU,
    moonDistanceKm: moonEcl.distanceKm,
    subSolarLat: subSolar.lat,
    subSolarLon: subSolar.lon,
    subEarthLat: subEarth.lat,
    subEarthLon: subEarth.lon,
    earthPhase,
    orientation,
  };
}

export function bodyFixedToLatLon(v: Vec3): { lat: number; lon: number } {
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, v[2]))) * RAD,
    lon: norm360(Math.atan2(v[1], v[0]) * RAD),
  };
}

// ---------------------------------------------------------------------------
// Utilities for angle/time formatting
// ---------------------------------------------------------------------------

export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function angularSeparation(
  az1: number,
  el1: number,
  az2: number,
  el2: number
): number {
  const a1 = az1 * DEG;
  const e1 = el1 * DEG;
  const a2 = az2 * DEG;
  const e2 = el2 * DEG;
  const c =
    Math.sin(e1) * Math.sin(e2) +
    Math.cos(e1) * Math.cos(e2) * Math.cos(a1 - a2);
  return Math.acos(Math.max(-1, Math.min(1, c))) * RAD;
}

/** Moon's mean synodic month in days. */
export const SYNODIC_MONTH = 29.530588853;
/** Moon's sidereal rotation period in days. */
export const LUNAR_DAY = 29.530588853;
/** Amplitude of the Moon's axial tilt to the ecliptic. */
export const LUNAR_AXIAL_TILT = 1.543;
