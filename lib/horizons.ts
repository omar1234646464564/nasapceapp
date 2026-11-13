import type { HorizonProfile } from "./dem";
import { HORIZON_LAYER_DISTANCES_KM } from "./dem";

export interface StoredHorizon {
  siteElevationM: number;
  complete: boolean;
  coverage: "80m" | "240m" | "none";
  /** base64 int16, hundredths of a degree, 720 samples at 0.5 deg. */
  h: string;
  l: string[];
}

export interface HorizonBundle {
  stepDeg: number;
  maxDistanceKm: number;
  layerDistancesKm: number[];
  generated: string;
  source: string;
  sites: Record<string, StoredHorizon>;
}

let bundlePromise: Promise<HorizonBundle> | null = null;
const decoded = new Map<string, HorizonProfile>();

/** Load the precomputed horizon bundle exactly once per page session. */
export function loadHorizonBundle(): Promise<HorizonBundle> {
  if (!bundlePromise) {
    bundlePromise = fetch("/data/horizons.json", { cache: "force-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`Horizon data unavailable (${r.status})`);
        return r.json() as Promise<HorizonBundle>;
      })
      .catch((err) => {
        bundlePromise = null;
        throw err;
      });
  }
  return bundlePromise;
}

function decodeArray(b64: string): Float32Array {
  if (typeof atob === "undefined") {
    return new Float32Array(0);
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getInt16(i * 2, true) / 100;
  }
  return out;
}

/** Decode and memoise a stored site horizon. */
export function getStoredHorizon(
  bundle: HorizonBundle,
  siteId: string
): HorizonProfile | null {
  const cached = decoded.get(siteId);
  if (cached) return cached;
  const stored = bundle.sites[siteId];
  if (!stored) return null;
  const elevation = decodeArray(stored.h);
  const layers = stored.l.map((s) => decodeArray(s));
  if (elevation.length === 0) return null;
  const profile: HorizonProfile = {
    stepDeg: bundle.stepDeg,
    elevation,
    layers: layers.length
      ? layers
      : HORIZON_LAYER_DISTANCES_KM.map(() => elevation),
    siteElevationM: stored.siteElevationM,
    maxDistanceKm: bundle.maxDistanceKm,
    complete: stored.complete,
  };
  decoded.set(siteId, profile);
  return profile;
}

export function flatHorizon(
  stepDeg = 0.5,
  maxDistanceKm = 160,
  siteElevationM = 0
): HorizonProfile {
  const n = Math.round(360 / stepDeg);
  const elevation = new Float32Array(n);
  return {
    stepDeg,
    elevation,
    layers: HORIZON_LAYER_DISTANCES_KM.map(() => new Float32Array(n)),
    siteElevationM,
    maxDistanceKm,
    complete: false,
  };
}

export type HorizonSource =
  | "LOLA 80 m"
  | "LOLA 240 m"
  | "LOLA 1 km"
  | "Flat assumption";

export function sourceForCoverage(
  coverage: StoredHorizon["coverage"] | "custom-1km"
): HorizonSource {
  switch (coverage) {
    case "80m":
      return "LOLA 80 m";
    case "240m":
      return "LOLA 240 m";
    case "custom-1km":
      return "LOLA 1 km";
    default:
      return "Flat assumption";
  }
}
