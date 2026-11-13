import { DEG, MOON_RADIUS_KM, RAD, norm360 } from "./astro";

/**
 * A south-polar stereographic elevation grid.
 *
 * Pixel (row, col) maps to a point on the Moon through the same
 * spherical polar stereographic projection used by the PDS LOLA
 * polar DEMs (LDEM_80S_*). Longitude 0 is at the bottom of the grid,
 * east is to the right.
 */
export interface DemGrid {
  size: number;
  pixelKm: number;
  /** Elevation in metres relative to the 1737.4 km reference sphere. */
  data: Int16Array;
  /** Optional display resolution for quick previews. */
  meta?: {
    minM: number;
    maxM: number;
  };
  /** Optional custom sampler (e.g. a composite of several DEM products). */
  sample?: (lat: number, lon: number) => number | null;
}

export const DEM_CENTER = (size: number) => (size - 1) / 2;

export interface PixelCoord {
  row: number;
  col: number;
  rKm: number;
}

export function latLonToPixel(
  lat: number,
  lon: number,
  size: number,
  pixelKm: number
): PixelCoord {
  const c = Math.max(0, Math.min(90, 90 + lat)) * DEG;
  const rKm = 2 * MOON_RADIUS_KM * Math.tan(c / 2);
  const a = lon * DEG;
  const center = DEM_CENTER(size);
  // PDS south-polar stereographic: 0 deg longitude at the top of the
  // grid, positive (east) longitudes to the right.
  return {
    row: center - (rKm * Math.cos(a)) / pixelKm,
    col: center + (rKm * Math.sin(a)) / pixelKm,
    rKm,
  };
}

export function pixelToLatLon(
  row: number,
  col: number,
  size: number,
  pixelKm: number
): { lat: number; lon: number } {
  const center = DEM_CENTER(size);
  const x = (col - center) * pixelKm;
  const y = -(row - center) * pixelKm;
  const r = Math.hypot(x, y);
  const lat = -90 + 2 * Math.atan(r / (2 * MOON_RADIUS_KM)) * RAD;
  const lon = norm360(Math.atan2(x, y) * RAD);
  return { lat, lon };
}

/** Bilinear elevation sample in metres. Returns null outside the grid. */
export function sampleDem(
  grid: DemGrid,
  lat: number,
  lon: number
): number | null {
  if (grid.sample) return grid.sample(lat, lon);
  const { size, pixelKm, data } = grid;
  const { row, col } = latLonToPixel(lat, lon, size, pixelKm);
  if (row < 0 || row > size - 1 || col < 0 || col > size - 1) return null;

  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const r1 = Math.min(size - 1, r0 + 1);
  const c1 = Math.min(size - 1, c0 + 1);
  const fr = row - r0;
  const fc = col - c0;

  const v00 = data[r0 * size + c0];
  const v10 = data[r1 * size + c0];
  const v01 = data[r0 * size + c1];
  const v11 = data[r1 * size + c1];

  return (
    v00 * (1 - fr) * (1 - fc) +
    v10 * fr * (1 - fc) +
    v01 * (1 - fr) * fc +
    v11 * fr * fc
  );
}

/** Great-circle destination from a start point, given azimuth and distance. */
export function destination(
  lat: number,
  lon: number,
  azimuth: number,
  distanceKm: number
): { lat: number; lon: number } {
  const phi1 = lat * DEG;
  const lam1 = lon * DEG;
  const theta = azimuth * DEG;
  const delta = distanceKm / MOON_RADIUS_KM;

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

  return { lat: phi2 * RAD, lon: norm360(lam2 * RAD) };
}

/** Angular radius of the lunar horizon due to curvature at height h (metres). */
export function horizonDipDeg(heightM: number): number {
  return -Math.acos(
    MOON_RADIUS_KM / (MOON_RADIUS_KM + Math.max(0, heightM) / 1000)
  ) * RAD;
}

export const HORIZON_LAYER_DISTANCES_KM = [3, 10, 40, 160];

export interface HorizonProfile {
  /** Azimuth of each sample, degrees. Samples start at 0 and are evenly spaced. */
  stepDeg: number;
  /** Horizon elevation in degrees, for the full search distance. */
  elevation: Float32Array;
  /** Horizon at 3, 10, 40 and 160 km, for depth-layered rendering. */
  layers: Float32Array[];
  /** Elevation of the site in metres. */
  siteElevationM: number;
  /** Maximum search distance in km. */
  maxDistanceKm: number;
  /** True when every azimuth had full DEM coverage. */
  complete: boolean;
}

export interface HorizonOptions {
  stepDeg?: number;
  maxDistanceKm?: number;
  /** Height of the observer's eye above the surface, metres. */
  eyeHeightM?: number;
  /** Minimum radial sample spacing, metres. */
  minStepM?: number;
}

/**
 * Compute the local terrain horizon by ray-marching the DEM.
 *
 * At each azimuth we find the maximum elevation angle of the terrain,
 * including the curvature drop r^2 / 2R. This is the same geometry used
 * by illumination studies: a body is visible if its center is above this
 * angle.
 */
export function computeHorizon(
  grid: DemGrid,
  lat: number,
  lon: number,
  options: HorizonOptions = {}
): HorizonProfile {
  const stepDeg = options.stepDeg ?? 0.5;
  const maxDistanceKm = options.maxDistanceKm ?? 160;
  const eyeHeightM = options.eyeHeightM ?? 0;
  const minStepM = options.minStepM ?? grid.pixelKm * 1000;

  const sampled = sampleDem(grid, lat, lon);
  const siteElevationM = (sampled ?? 0) + eyeHeightM;
  const n = Math.round(360 / stepDeg);
  const elevation = new Float32Array(n);
  const layers = HORIZON_LAYER_DISTANCES_KM.map(() => new Float32Array(n));
  let complete = true;

  const layerDistances = HORIZON_LAYER_DISTANCES_KM;

  for (let i = 0; i < n; i++) {
    const az = i * stepDeg;
    let maxEl = -90;
    let layerIdx = 0;
    let hadGap = false;

    // Radial samples: dense close in, progressively coarser far out.
    let r = Math.max(80, minStepM);
    const rMax = maxDistanceKm * 1000;
    while (r <= rMax) {
      const { lat: la, lon: lo } = destination(lat, lon, az, r / 1000);
      const h = sampleDem(grid, la, lo);

      if (h !== null) {
        const drop = (r * r) / (2 * MOON_RADIUS_KM * 1000);
        const el = Math.atan2(h - siteElevationM - drop, r) * RAD;
        if (el > maxEl) maxEl = el;
      } else if (r < 150_000) {
        hadGap = true;
      }

      while (
        layerIdx < layerDistances.length &&
        r >= layerDistances[layerIdx] * 1000
      ) {
        layers[layerIdx][i] = maxEl;
        layerIdx++;
      }

      if (r < 3000) r += Math.max(80, minStepM);
      else if (r < 10_000) r += Math.max(200, minStepM * 1.5);
      else if (r < 30_000) r += Math.max(500, minStepM * 3);
      else if (r < 80_000) r += Math.max(1000, minStepM * 6);
      else r += Math.max(2000, minStepM * 10);
    }

    while (layerIdx < layerDistances.length) {
      layers[layerIdx][i] = maxEl;
      layerIdx++;
    }

    if (hadGap) complete = false;
    elevation[i] = maxEl;
  }

  return {
    stepDeg,
    elevation,
    layers,
    siteElevationM,
    maxDistanceKm,
    complete,
  };
}

/** Interpolate a horizon profile at an arbitrary azimuth. */
export function horizonAt(profile: HorizonProfile, azimuth: number): number {
  const n = profile.elevation.length;
  const x = (norm360(azimuth) / profile.stepDeg) % n;
  const i0 = Math.floor(x);
  const i1 = (i0 + 1) % n;
  const f = x - i0;
  return profile.elevation[i0] * (1 - f) + profile.elevation[i1] * f;
}

export function horizonLayerAt(
  profile: HorizonProfile,
  layer: number,
  azimuth: number
): number {
  const arr = profile.layers[layer] ?? profile.elevation;
  const n = arr.length;
  const x = (norm360(azimuth) / profile.stepDeg) % n;
  const i0 = Math.floor(x);
  const i1 = (i0 + 1) % n;
  const f = x - i0;
  return arr[i0] * (1 - f) + arr[i1] * f;
}
