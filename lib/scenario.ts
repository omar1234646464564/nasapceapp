import {
  DEG,
  angularSeparation,
  ephemeris,
  type BodyPosition,
  type Ephemeris,
} from "./astro";
import { horizonAt, type HorizonProfile } from "./dem";
import type { Site } from "./sites";

export type BodyKey = "sun" | "earth";

export interface Snapshot {
  date: Date;
  ephem: Ephemeris;
  sunHorizon: number;
  earthHorizon: number;
  sunClearance: number;
  earthClearance: number;
  sunVisible: boolean;
  earthVisible: boolean;
  powerIndex: number;
  sunEarthSeparation: number;
}

export function bodyHorizon(
  body: BodyPosition,
  profile: HorizonProfile
): number {
  return horizonAt(profile, body.azimuth);
}

export function bodyVisible(
  body: BodyPosition,
  profile: HorizonProfile
): boolean {
  return body.elevation > horizonAt(profile, body.azimuth);
}

/**
 * Relative horizontal-array yield, normalised to the best-case solar
 * elevation at the south pole (1.543°). This is a planning heuristic,
 * not a hardware power model.
 */
export function powerIndexForElevation(
  elevation: number,
  visible: boolean
): number {
  if (!visible) return 0;
  const sinEl = Math.sin(Math.max(0, elevation) * DEG);
  const best = Math.sin(1.543 * DEG);
  return Math.max(0, Math.min(100, (sinEl / best) * 100));
}

export function powerIndex(
  sun: BodyPosition,
  visible: boolean
): number {
  return powerIndexForElevation(sun.elevation, visible);
}

export function snapshot(
  site: Site,
  profile: HorizonProfile,
  date: Date
): Snapshot {
  const ephem = ephemeris(date, {
    lat: site.lat,
    lon: site.lon,
    elevationKm: (profile.siteElevationM || 0) / 1000,
  });
  const sunHorizon = bodyHorizon(ephem.sun, profile);
  const earthHorizon = bodyHorizon(ephem.earth, profile);
  const sunVisible = ephem.sun.elevation > sunHorizon;
  const earthVisible = ephem.earth.elevation > earthHorizon;
  return {
    date,
    ephem,
    sunHorizon,
    earthHorizon,
    sunClearance: ephem.sun.elevation - sunHorizon,
    earthClearance: ephem.earth.elevation - earthHorizon,
    sunVisible,
    earthVisible,
    powerIndex: powerIndex(ephem.sun, sunVisible),
    sunEarthSeparation: angularSeparation(
      ephem.sun.azimuth,
      ephem.sun.elevation,
      ephem.earth.azimuth,
      ephem.earth.elevation
    ),
  };
}

export interface Change {
  date: Date;
  toVisible: boolean;
}

const DAY_MS = 86_400_000;

function visibilityAt(
  site: Site,
  profile: HorizonProfile,
  t: number,
  key: BodyKey
): boolean {
  const e = ephemeris(new Date(t), {
    lat: site.lat,
    lon: site.lon,
    elevationKm: (profile.siteElevationM || 0) / 1000,
  });
  return key === "sun"
    ? e.sun.elevation > horizonAt(profile, e.sun.azimuth)
    : e.earth.elevation > horizonAt(profile, e.earth.azimuth);
}

/** Find the next rise or set by scanning forward, then bisecting to ~1 min. */
export function findNextChange(
  site: Site,
  profile: HorizonProfile,
  start: Date,
  key: BodyKey,
  maxDays = 45,
  stepMinutes = 30
): Change | null {
  const step = stepMinutes * 60_000;
  const t0 = start.getTime();
  const end = t0 + maxDays * DAY_MS;
  let prev = visibilityAt(site, profile, t0, key);
  let lastT = t0;
  for (let t = t0 + step; t <= end; t += step) {
    const vis = visibilityAt(site, profile, t, key);
    if (vis !== prev) {
      let lo = lastT;
      let hi = t;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (visibilityAt(site, profile, mid, key) === prev) lo = mid;
        else hi = mid;
      }
      return { date: new Date(hi), toVisible: vis };
    }
    prev = vis;
    lastT = t;
  }
  return null;
}

/** Find the previous rise or set by scanning backward, then bisecting. */
export function findPreviousChange(
  site: Site,
  profile: HorizonProfile,
  start: Date,
  key: BodyKey,
  maxDays = 45,
  stepMinutes = 60
): Change | null {
  const step = stepMinutes * 60_000;
  const t0 = start.getTime();
  const end = t0 - maxDays * DAY_MS;
  let prev = visibilityAt(site, profile, t0, key);
  let lastT = t0;
  for (let t = t0 - step; t >= end; t -= step) {
    const vis = visibilityAt(site, profile, t, key);
    if (vis !== prev) {
      let lo = t;
      let hi = lastT;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (visibilityAt(site, profile, mid, key) === vis) lo = mid;
        else hi = mid;
      }
      return { date: new Date(hi), toVisible: prev };
    }
    prev = vis;
    lastT = t;
  }
  return null;
}

export interface WindowSample {
  t: number;
  visible: boolean;
  elevation: number;
  azimuth: number;
  horizon: number;
}

export interface WindowStats {
  key: BodyKey;
  start: number;
  end: number;
  samples: WindowSample[];
  visibleHours: number;
  percent: number;
  longestHours: number;
  longestStart: number | null;
  longestEnd: number | null;
  currentVisible: boolean;
  currentStart: number | null;
  currentEnd: number | null;
  nextChange: Change | null;
}

export interface WindowPair {
  sun: WindowStats;
  earth: WindowStats;
}

function refineTransition(
  site: Site,
  profile: HorizonProfile,
  key: BodyKey,
  before: number,
  after: number,
  beforeVisible: boolean
): Change {
  let lo = before;
  let hi = after;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (visibilityAt(site, profile, mid, key) === beforeVisible) lo = mid;
    else hi = mid;
  }
  return { date: new Date(hi), toVisible: !beforeVisible };
}

function summarise(
  site: Site,
  profile: HorizonProfile,
  key: BodyKey,
  samples: WindowSample[],
  t0: number,
  end: number,
  days: number,
  step: number
): WindowStats {
  let visibleCount = 0;
  let longest = 0;
  let longestStart: number | null = null;
  let longestEnd: number | null = null;
  let runStart: number | null = null;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.visible) {
      visibleCount++;
      if (runStart === null) runStart = s.t;
      const runHours = Math.min(
        days * 24,
        (s.t - runStart) / 3_600_000 + step / 3_600_000
      );
      if (runHours > longest) {
        longest = runHours;
        longestStart = runStart;
        longestEnd = Math.min(end, s.t + step);
      }
    } else {
      runStart = null;
    }
  }

  const currentVisible = samples[0]?.visible ?? false;
  let nextChange: Change | null = null;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].visible !== samples[i - 1].visible) {
      nextChange = refineTransition(
        site,
        profile,
        key,
        samples[i - 1].t,
        samples[i].t,
        samples[i - 1].visible
      );
      break;
    }
  }

  return {
    key,
    start: t0,
    end,
    samples,
    visibleHours: (visibleCount / samples.length) * days * 24,
    percent: (visibleCount / samples.length) * 100,
    longestHours: longest,
    longestStart,
    longestEnd,
    currentVisible,
    currentStart: null,
    currentEnd:
      currentVisible && nextChange && !nextChange.toVisible
        ? nextChange.date.getTime()
        : null,
    nextChange,
  };
}

/**
 * Analyse solar and Earth visibility together. Sharing the ephemeris
 * evaluation keeps this cheap enough to recompute while scrubbing.
 */
export function analyzeWindowPair(
  site: Site,
  profile: HorizonProfile,
  start: Date,
  days = 30,
  stepMinutes = 60
): WindowPair {
  const step = stepMinutes * 60_000;
  const t0 = start.getTime();
  const end = t0 + days * DAY_MS;
  const count = Math.max(2, Math.round((end - t0) / step) + 1);
  const sunSamples: WindowSample[] = [];
  const earthSamples: WindowSample[] = [];

  for (let i = 0; i < count; i++) {
    const t = Math.min(end, t0 + i * step);
    const e = ephemeris(new Date(t), {
      lat: site.lat,
      lon: site.lon,
      elevationKm: (profile.siteElevationM || 0) / 1000,
    });
    const sunHorizon = horizonAt(profile, e.sun.azimuth);
    const earthHorizon = horizonAt(profile, e.earth.azimuth);
    sunSamples.push({
      t,
      visible: e.sun.elevation > sunHorizon,
      elevation: e.sun.elevation,
      azimuth: e.sun.azimuth,
      horizon: sunHorizon,
    });
    earthSamples.push({
      t,
      visible: e.earth.elevation > earthHorizon,
      elevation: e.earth.elevation,
      azimuth: e.earth.azimuth,
      horizon: earthHorizon,
    });
  }

  return {
    sun: summarise(site, profile, "sun", sunSamples, t0, end, days, step),
    earth: summarise(site, profile, "earth", earthSamples, t0, end, days, step),
  };
}

/**
 * Analyse visibility for one body over a forward window. Prefer
 * analyzeWindowPair when both bodies are needed.
 */
export function analyzeWindow(
  site: Site,
  profile: HorizonProfile,
  start: Date,
  key: BodyKey,
  days = 30,
  stepMinutes = 60
): WindowStats {
  return analyzeWindowPair(site, profile, start, days, stepMinutes)[key];
}

export interface TimelineSample {
  t: number;
  sunEl: number;
  earthEl: number;
  sunAz: number;
  earthAz: number;
  sunHorizon: number;
  earthHorizon: number;
  sunVis: boolean;
  earthVis: boolean;
}

export interface Timeline {
  start: number;
  end: number;
  samples: TimelineSample[];
}

export function computeTimeline(
  site: Site,
  profile: HorizonProfile,
  center: Date,
  rangeDays: number,
  sampleCount = 720
): Timeline {
  const half = (rangeDays * DAY_MS) / 2;
  const start = center.getTime() - half;
  const end = center.getTime() + half;
  const step = (end - start) / (sampleCount - 1);
  const samples: TimelineSample[] = new Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const t = start + i * step;
    const e = ephemeris(new Date(t), {
      lat: site.lat,
      lon: site.lon,
      elevationKm: (profile.siteElevationM || 0) / 1000,
    });
    const sunHorizon = horizonAt(profile, e.sun.azimuth);
    const earthHorizon = horizonAt(profile, e.earth.azimuth);
    samples[i] = {
      t,
      sunEl: e.sun.elevation,
      earthEl: e.earth.elevation,
      sunAz: e.sun.azimuth,
      earthAz: e.earth.azimuth,
      sunHorizon,
      earthHorizon,
      sunVis: e.sun.elevation > sunHorizon,
      earthVis: e.earth.elevation > earthHorizon,
    };
  }

  return { start, end, samples };
}

/** 24-hour az/el trail for the horizon panorama. */
export function computeTrail(
  site: Site,
  profile: HorizonProfile,
  around: Date,
  key: BodyKey,
  hours = 24,
  samples = 72
): { az: number; el: number }[] {
  const out: { az: number; el: number }[] = [];
  const start = around.getTime() - (hours / 2) * 3_600_000;
  for (let i = 0; i < samples; i++) {
    const t = start + (i / (samples - 1)) * hours * 3_600_000;
    const e = ephemeris(new Date(t), {
      lat: site.lat,
      lon: site.lon,
      elevationKm: (profile.siteElevationM || 0) / 1000,
    });
    const body = key === "sun" ? e.sun : e.earth;
    out.push({ az: body.azimuth, el: body.elevation });
  }
  return out;
}
