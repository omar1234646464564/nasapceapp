/**
 * Luna — the local mission-copilot engine.
 *
 * The copilot is deliberately grounded: intent parsing, site/date
 * resolution, and every number in an answer come from the same LOLA
 * terrain and local ephemeris code as the planner. The optional LLM
 * layer only rephrases this computed context; it never invents metrics.
 */

import type { HorizonProfile } from "./dem";
import {
  analyzeWindowPair,
  findNextChange,
  powerIndexForElevation,
  snapshot,
  type Change,
  type Snapshot,
  type WindowPair,
  type WindowStats,
} from "./scenario";
import { SITES, SITE_BY_ID, makeCustomSite, type Site } from "./sites";
import {
  formatDateShort,
  formatDeg,
  formatDurationHours,
  formatLat,
  formatLon,
  formatPercent,
  formatUTC,
} from "./format";

const DAY_MS = 86_400_000;
const POLAR_SITES = SITES.filter((site) => site.lat <= -75);

function rankingPool(question: string): Site[] {
  const text = normalize(question);
  const wantsFullCatalog =
    /\b(all sites|anywhere|equator|equatorial|legacy|apollo|change|chandrayaan|slim|international|full catalog)\b/.test(
      text
    );
  return wantsFullCatalog ? SITES : POLAR_SITES;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export type CopilotIntent =
  | "help"
  | "site"
  | "conditions"
  | "ranking"
  | "compare"
  | "next"
  | "concept"
  | "mission"
  | "scenario"
  | "fallback";

export type RankCriterion =
  | "sunlight"
  | "dte"
  | "power"
  | "balanced"
  | "science"
  | "artemis";

export interface CopilotAction {
  label: string;
  href: string;
}

export interface CopilotScenario {
  site: Site;
  date: Date;
  rangeDays: number;
}

export interface SiteMetrics {
  site: Site;
  start: Date;
  days: number;
  snap: Snapshot;
  pair: WindowPair;
  sunPercent: number;
  earthPercent: number;
  avgPower: number;
  score: number;
  flat: boolean;
}

export interface MissionPlan {
  site: Site;
  start: Date;
  durationDays: number;
  metrics: SiteMetrics;
  alternatives: SiteMetrics[];
  scanWindowDays: number;
}

export interface CopilotReply {
  text: string;
  actions: CopilotAction[];
  intent: CopilotIntent;
  date: Date;
  sites: Site[];
  metrics?: SiteMetrics[];
  ranking?: SiteMetrics[];
  mission?: MissionPlan;
  context: CopilotContext;
}

export interface CopilotOptions {
  now: Date;
  scenario?: CopilotScenario | null;
  getProfile: (site: Site) => HorizonProfile | null;
}

export interface CopilotContext {
  intent: CopilotIntent;
  resolvedDate: string;
  dateWasExplicit: boolean;
  scenario: {
    siteId: string;
    siteName: string;
    date: string;
    rangeDays: number;
  } | null;
  sites: Array<{
    id: string;
    name: string;
    category: string;
    program: string;
    lat: number;
    lon: number;
    note: string;
  }>;
  metrics: Array<ReturnType<typeof metricsSummary>>;
  ranking: Array<ReturnType<typeof rankingSummary>>;
  mission: {
    siteId: string;
    siteName: string;
    start: string;
    durationDays: number;
    scanWindowDays: number;
    alternatives: Array<{ id: string; name: string; score: number }>;
  } | null;
  capabilities: string[];
  localAnswer: string;
}

/* -------------------------------------------------------------------------- */
/* Site and coordinate resolution                                             */
/* -------------------------------------------------------------------------- */

const SITE_ALIASES: Array<{ alias: string; id: string }> = [];

function addAlias(alias: string, id: string) {
  const clean = alias.toLowerCase().replace(/[’']/g, "").trim();
  if (clean) SITE_ALIASES.push({ alias: clean, id });
}

for (const site of SITES) {
  addAlias(site.id, site.id);
  addAlias(site.name, site.id);
  addAlias(site.shortName, site.id);
}

const EXTRA_ALIASES: Record<string, string> = {
  "site 004": "shackleton-rim",
  "connecting": "connecting-ridge",
  "site 001": "connecting-ridge",
  "peak near shackleton": "peak-shackleton",
  "shackleton peak": "peak-shackleton",
  "site 007": "peak-shackleton",
  "de gerlache": "de-gerlache-rim-2",
  "degerlache": "de-gerlache-rim-2",
  "de gerlache rim": "de-gerlache-rim-2",
  sl2: "de-gerlache-rim-2",
  faustini: "faustini-rim-a",
  "faustini rim": "faustini-rim-a",
  lm7: "faustini-rim-a",
  nobile: "nobile-rim-2",
  "nobile rim": "nobile-rim-2",
  dm2: "nobile-rim-2",
  amundsen: "amundsen-rim",
  "amundsen rim": "amundsen-rim",
  dm1: "amundsen-rim",
  "malapert massif": "malapert-massif",
  malapert: "malapert-massif",
  "site 023": "malapert-massif",
  "mons mouton": "mons-mouton",
  mouton: "mons-mouton",
  "malapert a": "malapert-a",
  "cabeus b": "cabeus-b",
  cabeus: "cabeus-b",
  lcross: "cabeus-b",
  haworth: "haworth",
  "apollo 11": "apollo-11",
  apollo11: "apollo-11",
  tranquility: "apollo-11",
  "apollo 17": "apollo-17",
  apollo17: "apollo-17",
  "taurus littrow": "apollo-17",
  "chandrayaan 3": "chandrayaan-3",
  chandrayaan: "chandrayaan-3",
  "shiv shakti": "chandrayaan-3",
  "change 4": "chang-e-4",
  "chang e 4": "chang-e-4",
  "change 6": "chang-e-6",
  "chang e 6": "chang-e-6",
  slim: "slim",
  shioli: "slim",
};

for (const [alias, id] of Object.entries(EXTRA_ALIASES)) addAlias(alias, id);

SITE_ALIASES.sort((a, b) => b.alias.length - a.alias.length);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9°+\-.,/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find every curated site mentioned, in text order, without overlaps. */
export function resolveSites(input: string): Site[] {
  const text = normalize(input);
  if (!text) return [];

  const found: Array<{ id: string; index: number; length: number }> = [];
  for (const { alias, id } of SITE_ALIASES) {
    const index = text.indexOf(alias);
    if (index < 0) continue;
    const before = index === 0 ? " " : text[index - 1];
    const after = index + alias.length >= text.length ? " " : text[index + alias.length];
    if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;
    found.push({ id, index, length: alias.length });
  }

  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const accepted: typeof found = [];
  for (const candidate of found) {
    const overlaps = accepted.some(
      (a) =>
        candidate.index < a.index + a.length &&
        a.index < candidate.index + candidate.length
    );
    if (overlaps) continue;
    if (accepted.some((a) => a.id === candidate.id)) continue;
    accepted.push(candidate);
  }

  return accepted
    .map((a) => SITE_BY_ID.get(a.id))
    .filter((s): s is Site => Boolean(s));
}

/** Parse a bare or labelled latitude/longitude pair into a custom site. */
export function parseCustomCoordinates(input: string): Site | null {
  const text = input.replace(/[’']/g, "").replace(/\s+/g, " ").trim();

  const labeled = text.match(
    /(?:lat(?:itude)?)\s*(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NSns])?.*?(?:lon(?:gitude)?)\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EWew])?/i
  );
  const bare = text.match(
    /(?<![\d.])(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NSns])?\s*(?:,|\/|\s)\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EWew])?(?![\d.])/
  );
  const match = labeled ?? bare;
  if (!match) return null;

  let lat = Number(match[1]);
  let lon = Number(match[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const latHemi = match[2]?.toLowerCase();
  const lonHemi = match[4]?.toLowerCase();
  if (latHemi === "s") lat = -Math.abs(lat);
  else if (latHemi === "n") lat = Math.abs(lat);
  if (lonHemi === "w") lon = 360 - Math.abs(lon);
  else if (lonHemi === "e") lon = Math.abs(lon);

  if (Math.abs(lat) > 90 || Math.abs(lon) > 360) return null;

  // This is a south-polar tool. A bare positive latitude of 60+ is far
  // more likely to mean south than north.
  if (!latHemi && !lonHemi && lat > 0 && lat >= 60) lat = -lat;

  return makeCustomSite(lat, ((lon % 360) + 360) % 360);
}

/* -------------------------------------------------------------------------- */
/* Date and duration resolution                                               */
/* -------------------------------------------------------------------------- */

function monthIndex(token: string): number | null {
  const clean = token.toLowerCase().replace(/\./g, "");
  const idx = MONTHS.findIndex(
    (m) => m === clean || (clean.length >= 3 && m.startsWith(clean))
  );
  return idx >= 0 ? idx : null;
}

function utcNoon(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month, day, 12));
}

function nextSeason(month: number, day: number, fallback: Date): Date {
  const year = fallback.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month, day, 12));
  return candidate.getTime() < fallback.getTime() - 7 * DAY_MS
    ? new Date(Date.UTC(year + 1, month, day, 12))
    : candidate;
}

export function resolveDate(
  input: string,
  fallback: Date
): { date: Date; explicit: boolean } {
  const text = normalize(input);

  const iso = text.match(
    /\b(\d{4})-(\d{2})-(\d{2})(?:[t ](\d{2}):(\d{2}))?\b/
  );
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    const hour = iso[4] === undefined ? 12 : Number(iso[4]);
    const minute = iso[5] === undefined ? 0 : Number(iso[5]);
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return {
        date: new Date(Date.UTC(year, month, day, hour, minute)),
        explicit: true,
      };
    }
  }

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slash) {
    let a = Number(slash[1]);
    let b = Number(slash[2]);
    const year = Number(slash[3]);
    let month = a - 1;
    let day = b;
    if (a > 12 && b <= 12) {
      month = b - 1;
      day = a;
    }
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return { date: utcNoon(year, month, day), explicit: true };
    }
  }

  const dayMonthYear = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/
  );
  if (dayMonthYear) {
    const mi = monthIndex(dayMonthYear[2]);
    const day = Number(dayMonthYear[1]);
    const year = Number(dayMonthYear[3]);
    if (mi !== null && day >= 1 && day <= 31) {
      return { date: utcNoon(year, mi, day), explicit: true };
    }
  }

  const monthDayYear = text.match(
    /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/
  );
  if (monthDayYear) {
    const mi = monthIndex(monthDayYear[1]);
    const day = Number(monthDayYear[2]);
    const year = Number(monthDayYear[3]);
    if (mi !== null && day >= 1 && day <= 31) {
      return { date: utcNoon(year, mi, day), explicit: true };
    }
  }

  const monthYear = text.match(/\b([a-z]{3,9})\.?\s+(\d{4})\b/);
  if (monthYear) {
    const mi = monthIndex(monthYear[1]);
    if (mi !== null) {
      return { date: utcNoon(Number(monthYear[2]), mi), explicit: true };
    }
  }

  const nextMonth = text.match(/\bnext\s+([a-z]{3,9})\b/);
  if (nextMonth) {
    const mi = monthIndex(nextMonth[1]);
    if (mi !== null) {
      let year = fallback.getUTCFullYear();
      if (utcNoon(year, mi).getTime() <= fallback.getTime()) year += 1;
      return { date: utcNoon(year, mi), explicit: true };
    }
  }

  if (/\b(today|now|this moment|currently)\b/.test(text)) {
    return { date: fallback, explicit: false };
  }

  if (/\btomorrow\b/.test(text)) {
    return { date: new Date(fallback.getTime() + DAY_MS), explicit: true };
  }
  if (/\byesterday\b/.test(text)) {
    return { date: new Date(fallback.getTime() - DAY_MS), explicit: true };
  }

  const relative = text.match(
    /\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months|year|years)\b/
  );
  if (relative) {
    const amount = numberWord(relative[1]);
    const unit = relative[2];
    const days =
      unit.startsWith("day") ? amount
        : unit.startsWith("week") ? amount * 7
          : unit.startsWith("month") ? amount * 30
            : amount * 365;
    return { date: new Date(fallback.getTime() + days * DAY_MS), explicit: true };
  }

  if (/\bnext week\b/.test(text)) {
    return { date: new Date(fallback.getTime() + 7 * DAY_MS), explicit: true };
  }
  if (/\bnext month\b/.test(text)) {
    return { date: new Date(fallback.getTime() + 30 * DAY_MS), explicit: true };
  }
  if (/\bnext year\b/.test(text)) {
    return { date: new Date(fallback.getTime() + 365 * DAY_MS), explicit: true };
  }

  if (/\b(summer)\b/.test(text)) {
    return { date: nextSeason(11, 21, fallback), explicit: true };
  }
  if (/\b(winter)\b/.test(text)) {
    return { date: nextSeason(5, 21, fallback), explicit: true };
  }
  if (/\b(spring)\b/.test(text)) {
    return { date: nextSeason(8, 21, fallback), explicit: true };
  }
  if (/\b(autumn|fall)\b/.test(text)) {
    return { date: nextSeason(2, 21, fallback), explicit: true };
  }

  const prepositionalMonth = text.match(
    /\b(?:in|during|around|for|by|early|late|mid)\s+([a-z]{3,9})\b/
  );
  if (prepositionalMonth) {
    const mi = monthIndex(prepositionalMonth[1]);
    if (mi !== null) {
      let year = fallback.getUTCFullYear();
      const candidate = utcNoon(year, mi);
      if (candidate.getTime() < fallback.getTime() - 7 * DAY_MS) year += 1;
      return { date: utcNoon(year, mi), explicit: true };
    }
  }

  const bareYear = text.match(/\b(20\d{2})\b/);
  if (bareYear) {
    return { date: utcNoon(Number(bareYear[1]), 0), explicit: true };
  }

  return { date: fallback, explicit: false };
}

function numberWord(token: string): number {
  const n = Number(token);
  if (Number.isFinite(n)) return n;
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  return words[token.toLowerCase()] ?? 0;
}

export function extractDurationDays(input: string): number | null {
  const text = normalize(input);
  const match = text.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*[- ]?\s*(day|days|d|week|weeks|w|month|months|hour|hours|h)\b/
  );
  if (!match) return null;
  const amount = numberWord(match[1]);
  if (!amount) return null;
  const unit = match[2];
  const days =
    unit.startsWith("hour") || unit === "h"
      ? amount / 24
      : unit.startsWith("week") || unit === "w"
        ? amount * 7
        : unit.startsWith("month")
          ? amount * 30
          : amount;
  return Math.max(1, Math.min(365, Math.round(days)));
}

/* -------------------------------------------------------------------------- */
/* Metrics, ranking, and mission planning                                     */
/* -------------------------------------------------------------------------- */

const metricsCache = new Map<string, SiteMetrics>();
const MAX_CACHE = 240;

function metricsKey(site: Site, start: Date, days: number, stepMinutes: number) {
  return `${site.id}:${site.lat.toFixed(4)}:${site.lon.toFixed(4)}:${start.getTime()}:${days}:${stepMinutes}`;
}

function averagePower(stats: WindowStats): number {
  if (!stats.samples.length) return 0;
  let sum = 0;
  for (const sample of stats.samples) {
    sum += powerIndexForElevation(sample.elevation, sample.visible);
  }
  return sum / stats.samples.length;
}

export function metricsFor(
  site: Site,
  profile: HorizonProfile,
  start: Date,
  days = 30,
  stepMinutes = 120
): SiteMetrics {
  const key = metricsKey(site, start, days, stepMinutes);
  const cached = metricsCache.get(key);
  if (cached) return cached;

  const pair = analyzeWindowPair(site, profile, start, days, stepMinutes);
  const snap = snapshot(site, profile, start);
  const sunPercent = pair.sun.percent;
  const earthPercent = pair.earth.percent;
  const avgPower = averagePower(pair.sun);
  const metrics: SiteMetrics = {
    site,
    start,
    days,
    snap,
    pair,
    sunPercent,
    earthPercent,
    avgPower,
    score: 0.4 * sunPercent + 0.35 * earthPercent + 0.25 * avgPower,
    flat: site.coverage === "none",
  };

  if (metricsCache.size >= MAX_CACHE) {
    const oldest = metricsCache.keys().next().value;
    if (oldest !== undefined) metricsCache.delete(oldest);
  }
  metricsCache.set(key, metrics);
  return metrics;
}

function scienceBonus(site: Site): number {
  let bonus = 0;
  if (site.category === "Science") bonus += 18;
  if (/ice|water|volatile|shadow|cold|psr/i.test(`${site.note} ${site.program}`)) {
    bonus += 10;
  }
  if (site.category === "Artemis III") bonus += 4;
  return bonus;
}

export function rankSites(options: {
  criterion: RankCriterion;
  date: Date;
  days: number;
  getProfile: (site: Site) => HorizonProfile | null;
  stepMinutes?: number;
  pool?: Site[];
}): SiteMetrics[] {
  const {
    criterion,
    date,
    days,
    getProfile,
    stepMinutes = 180,
    pool = SITES,
  } = options;

  const candidates =
    criterion === "artemis"
      ? pool.filter((s) => s.category === "Artemis III")
      : pool;

  const metrics: SiteMetrics[] = [];
  for (const site of candidates) {
    const profile = getProfile(site);
    if (!profile) continue;
    metrics.push(metricsFor(site, profile, date, days, stepMinutes));
  }

  metrics.sort((a, b) => {
    switch (criterion) {
      case "sunlight":
        return b.sunPercent - a.sunPercent || b.pair.sun.longestHours - a.pair.sun.longestHours;
      case "dte":
        return b.earthPercent - a.earthPercent || b.pair.earth.longestHours - a.pair.earth.longestHours;
      case "power":
        return b.avgPower - a.avgPower || b.sunPercent - a.sunPercent;
      case "science":
        return (
          b.score + scienceBonus(b.site) - (a.score + scienceBonus(a.site))
        );
      case "artemis":
      case "balanced":
      default:
        return b.score - a.score;
    }
  });

  return metrics;
}

function missionScore(metrics: SiteMetrics): number {
  // A mission should not "win" by starting in a shadow or a comms
  // blackout. Give a small bonus for a good first day while keeping
  // the whole-window score dominant.
  const sunSamples = metrics.pair.sun.samples.slice(0, 5);
  const earthSamples = metrics.pair.earth.samples.slice(0, 5);
  const firstSun =
    sunSamples.length > 0
      ? sunSamples.filter((s) => s.visible).length / sunSamples.length
      : 0;
  const firstDte =
    earthSamples.length > 0
      ? earthSamples.filter((s) => s.visible).length / earthSamples.length
      : 0;
  return metrics.score + 6 * firstSun + 4 * firstDte;
}

export function buildMissionPlan(options: {
  date: Date;
  durationDays: number;
  criterion: RankCriterion;
  getProfile: (site: Site) => HorizonProfile | null;
  site?: Site;
  pool?: Site[];
  scanWindowDays?: number;
}): MissionPlan | null {
  const {
    date,
    durationDays,
    criterion,
    getProfile,
    site,
    pool = POLAR_SITES,
    scanWindowDays = 120,
  } = options;
  const duration = Math.max(1, Math.min(90, Math.round(durationDays)));
  const rankingDays = Math.max(14, Math.min(30, duration));

  const candidatePool = site ? [site] : pool;
  const ranking = rankSites({
    criterion,
    date,
    days: rankingDays,
    getProfile,
    stepMinutes: 180,
    pool: candidatePool,
  });
  if (!ranking.length) return null;

  const candidates = ranking.slice(0, site ? 1 : 3);
  let best:
    | { site: Site; start: Date; score: number; metrics: SiteMetrics }
    | null = null;

  for (const candidate of candidates) {
    const profile = getProfile(candidate.site);
    if (!profile) continue;
    for (let offset = 0; offset <= scanWindowDays; offset += 5) {
      const start = new Date(date.getTime() + offset * DAY_MS);
      const metrics = metricsFor(
        candidate.site,
        profile,
        start,
        duration,
        360
      );
      const score = missionScore(metrics);
      if (!best || score > best.score) {
        best = {
          site: candidate.site,
          start,
          score,
          metrics,
        };
      }
    }
  }

  if (!best) return null;

  // Refine the best start date at daily resolution, then recompute the
  // final answer with a finer sampling step.
  const profile = getProfile(best.site);
  if (profile) {
    const center = best.start.getTime();
    for (let offset = -4; offset <= 4; offset++) {
      if (!offset) continue;
      const start = new Date(center + offset * DAY_MS);
      const metrics = metricsFor(best.site, profile, start, duration, 240);
      const score = missionScore(metrics);
      if (score > best.score) {
        best = { site: best.site, start, score, metrics };
      }
    }
    best = {
      ...best,
      metrics: metricsFor(best.site, profile, best.start, duration, 120),
    };
  }

  return {
    site: best.site,
    start: best.start,
    durationDays: duration,
    metrics: best.metrics,
    alternatives: ranking.slice(0, 3),
    scanWindowDays,
  };
}

/* -------------------------------------------------------------------------- */
/* Answer formatting helpers                                                  */
/* -------------------------------------------------------------------------- */

function durationText(hours: number): string {
  if (!Number.isFinite(hours) || hours < 1 / 60) return "0 h";
  return formatDurationHours(hours);
}

function siteHeading(site: Site): string {
  return `**${site.name}** — ${site.program}`;
}

function siteLine(site: Site): string {
  return `${formatLat(site.lat)} · ${formatLon(site.lon)}`;
}

function horizonNote(metrics: SiteMetrics): string {
  return metrics.flat
    ? "\n\n*Horizon note:* this site is outside the polar DEM, so the app uses a documented flat-horizon assumption. Sun and Earth elevations still come from the full ephemeris."
    : "";
}

function eventLabel(key: "sun" | "earth", change: Change): string {
  if (key === "sun") return change.toVisible ? "sunrise" : "sunset";
  return change.toVisible ? "Earthrise" : "Earthset";
}

function nextEventText(
  key: "sun" | "earth",
  change: Change | null,
  scanDays: number
): string {
  if (!change) {
    return `No ${key === "sun" ? "Sun" : "Earth"} rise or set within ${scanDays} days.`;
  }
  return `Next **${eventLabel(key, change)}**: **${formatUTC(change.date)}**.`;
}

function findNextEvent(
  site: Site,
  profile: HorizonProfile,
  start: Date,
  key: "sun" | "earth",
  direction: boolean | null
): Change | null {
  const maxDays = key === "sun" ? 220 : 60;
  const stepMinutes = key === "sun" ? 360 : 120;
  let cursor = start;
  for (let i = 0; i < 6; i++) {
    const change = findNextChange(
      site,
      profile,
      cursor,
      key,
      maxDays,
      stepMinutes
    );
    if (!change) return null;
    if (direction === null || change.toVisible === direction) return change;
    cursor = new Date(change.date.getTime() + 60_000);
  }
  return null;
}

function metricBullets(metrics: SiteMetrics, windowDays: number): string[] {
  const snap = metrics.snap;
  const sunState = snap.sunVisible ? "sunlit" : "shadowed";
  const earthState = snap.earthVisible ? "DTE available" : "no DTE";
  return [
    `- Sun: **${formatDeg(snap.ephem.sun.elevation)}** elevation vs **${formatDeg(snap.sunHorizon)}** terrain horizon → **${sunState}**, power index **${Math.round(snap.powerIndex)}**.`,
    `- Earth: **${formatDeg(snap.ephem.earth.elevation)}** vs **${formatDeg(snap.earthHorizon)}** horizon → **${earthState}**.`,
    `- ${windowDays}-day window: Sun **${formatPercent(metrics.sunPercent)}**, Earth **${formatPercent(metrics.earthPercent)}**, average power **${Math.round(metrics.avgPower)}**.`,
    `- Longest Sun run: **${durationText(metrics.pair.sun.longestHours)}**; longest Earth run: **${durationText(metrics.pair.earth.longestHours)}**.`,
  ];
}

function supportedRange(days: number): number {
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  if (days <= 90) return 90;
  return 365;
}

function plannerHref(site: Site, date: Date, rangeDays = 30): string {
  const range = supportedRange(rangeDays);
  if (site.category === "Custom") {
    return `/?site=custom&lat=${site.lat.toFixed(5)}&lon=${site.lon.toFixed(5)}&t=${date.toISOString()}&range=${range}`;
  }
  return `/?site=${site.id}&t=${date.toISOString()}&range=${range}`;
}

function compareHref(a: Site, b: Site, date: Date): string {
  return `/compare?s=${a.id}@${date.toISOString()},${b.id}@${date.toISOString()}`;
}

function plannerAction(site: Site, date: Date, rangeDays = 30): CopilotAction {
  return { label: `Open ${site.shortName} in planner`, href: plannerHref(site, date, rangeDays) };
}

function compareAction(a: Site, b: Site, date: Date): CopilotAction {
  return {
    label: `Compare ${a.shortName} vs ${b.shortName}`,
    href: compareHref(a, b, date),
  };
}

const LEARN_ACTION: CopilotAction = { label: "Read the primer", href: "/learn" };
const METHODS_ACTION: CopilotAction = { label: "Methods & limits", href: "/methods" };
const PLANNER_ACTION: CopilotAction = { label: "Open planner", href: "/" };

function metricsSummary(metrics: SiteMetrics) {
  const snap = metrics.snap;
  return {
    id: metrics.site.id,
    name: metrics.site.name,
    category: metrics.site.category,
    start: metrics.start.toISOString(),
    days: metrics.days,
    sunPercent: Math.round(metrics.sunPercent * 10) / 10,
    earthPercent: Math.round(metrics.earthPercent * 10) / 10,
    avgPower: Math.round(metrics.avgPower * 10) / 10,
    score: Math.round(metrics.score * 10) / 10,
    sunElevation: Math.round(snap.ephem.sun.elevation * 100) / 100,
    sunHorizon: Math.round(snap.sunHorizon * 100) / 100,
    earthElevation: Math.round(snap.ephem.earth.elevation * 100) / 100,
    earthHorizon: Math.round(snap.earthHorizon * 100) / 100,
    sunVisible: snap.sunVisible,
    earthVisible: snap.earthVisible,
    powerIndex: Math.round(snap.powerIndex),
    longestSunHours: Math.round(metrics.pair.sun.longestHours * 10) / 10,
    longestEarthHours: Math.round(metrics.pair.earth.longestHours * 10) / 10,
    nextSun: metrics.pair.sun.nextChange
      ? {
          type: metrics.pair.sun.nextChange.toVisible ? "sunrise" : "sunset",
          at: metrics.pair.sun.nextChange.date.toISOString(),
        }
      : null,
    nextEarth: metrics.pair.earth.nextChange
      ? {
          type: metrics.pair.earth.nextChange.toVisible ? "Earthrise" : "Earthset",
          at: metrics.pair.earth.nextChange.date.toISOString(),
        }
      : null,
    flatHorizon: metrics.flat,
  };
}

function rankingSummary(metrics: SiteMetrics, index: number) {
  return {
    rank: index + 1,
    ...metricsSummary(metrics),
  };
}

function siteSummary(site: Site) {
  return {
    id: site.id,
    name: site.name,
    category: site.category,
    program: site.program,
    lat: site.lat,
    lon: site.lon,
    note: site.note,
  };
}

const CAPABILITIES = [
  "Plan a surface mission by duration, power, sunlight, Earth link, science, or Artemis relevance.",
  "Rank all 18 curated sites over a chosen 7–365 day window.",
  "Compare two sites on the same date with sunlight, DTE, power, and longest windows.",
  "Find the next sunrise, sunset, Earthrise, or Earthset at a site.",
  "Explain permanently shadowed regions, libration, power index, DTE geometry, and other concepts.",
  "Open the exact scenario in the planner or compare view.",
];

function buildContext(options: {
  intent: CopilotIntent;
  date: Date;
  dateWasExplicit: boolean;
  scenario: CopilotScenario | null;
  sites: Site[];
  metrics?: SiteMetrics[];
  ranking?: SiteMetrics[];
  mission?: MissionPlan | null;
  localAnswer: string;
}): CopilotContext {
  return {
    intent: options.intent,
    resolvedDate: options.date.toISOString(),
    dateWasExplicit: options.dateWasExplicit,
    scenario: options.scenario
      ? {
          siteId: options.scenario.site.id,
          siteName: options.scenario.site.name,
          date: options.scenario.date.toISOString(),
          rangeDays: options.scenario.rangeDays,
        }
      : null,
    sites: options.sites.map(siteSummary),
    metrics: (options.metrics ?? []).map(metricsSummary),
    ranking: (options.ranking ?? []).slice(0, 6).map(rankingSummary),
    mission: options.mission
      ? {
          siteId: options.mission.site.id,
          siteName: options.mission.site.name,
          start: options.mission.start.toISOString(),
          durationDays: options.mission.durationDays,
          scanWindowDays: options.mission.scanWindowDays,
          alternatives: options.mission.alternatives.map((m) => ({
            id: m.site.id,
            name: m.site.name,
            score: Math.round(m.score * 10) / 10,
          })),
        }
      : null,
    capabilities: CAPABILITIES,
    localAnswer: options.localAnswer,
  };
}

/* -------------------------------------------------------------------------- */
/* Reply builders                                                             */
/* -------------------------------------------------------------------------- */

function helpReply(date = new Date()): CopilotReply {
  const text = [
    "**I'm Luna**, the mission copilot for Lunar Horizon. I work from the same LOLA terrain and local Sun/Earth ephemeris as the planner, so every number is grounded in the app.",
    "",
    "I can help you:",
    "- **Plan a mission** by duration, power, sunlight, Earth link, science, or Artemis relevance.",
    "- **Rank sites** over a 7–365 day window.",
    "- **Compare two sites** on the same date.",
    "- **Find the next sunrise, sunset, Earthrise, or Earthset**.",
    "- **Explain the physics** behind a metric.",
    "",
    "Try: *Plan a 14-day mission with strong power and Earth link.*",
  ].join("\n");
  return {
    text,
    actions: [PLANNER_ACTION, LEARN_ACTION, METHODS_ACTION],
    intent: "help",
    date,
    sites: [],
    context: buildContext({
      intent: "help",
      date,
      dateWasExplicit: false,
      scenario: null,
      sites: [],
      localAnswer: text,
    }),
  };
}

function conceptReply(question: string, date: Date): CopilotReply {
  const text = normalize(question);
  let title = "How the planner thinks about it";
  let body = "";
  let actions: CopilotAction[] = [LEARN_ACTION, METHODS_ACTION];

  if (/\b(psr|permanently shadowed|permanent shadow|shadowed region)\b/.test(text)) {
    title = "Permanently shadowed regions (PSRs)";
    body =
      "A PSR is terrain that never receives direct sunlight because the local horizon blocks the Sun at every solar azimuth. Near the lunar south pole the Sun grazes the surface, so even a modest ridge can cast a shadow that persists for an entire lunar day. PSRs are cold traps: water ice and other volatiles can survive there for billions of years. In the planner, a site is **shadowed** when the Sun's center elevation is below the interpolated terrain horizon at the Sun's azimuth.";
  } else if (/\b(libration)\b/.test(text)) {
    title = "Libration and the Earth view";
    body =
      "The Moon is tidally locked, but its orbit is elliptical and tilted, so the Earth appears to wobble around a small patch of the lunar sky. That wobble is **libration**. Near the south pole the Earth stays close to the horizon, and libration is what pushes it above or below the local terrain horizon over a roughly monthly cycle. That is why direct-to-Earth links can come and go even when the site itself is fixed.";
  } else if (/\b(direct.?to.?earth|dte|earth link|earth visibility|relay|blackout)\b/.test(text)) {
    title = "Direct-to-Earth (DTE) geometry";
    body =
      "A direct-to-Earth window is a period when the Earth is above the local terrain horizon, so a lander can point an antenna at Earth without a relay. Near the south pole the Earth sits near the skyline; small changes in libration and local topography can switch the link on or off. A **blackout** is the opposite: Earth is below the horizon, and a relay (or stored data) is required. The planner reports Earth elevation versus the terrain horizon at Earth's azimuth, plus the percentage of a window with DTE.";
  } else if (/\b(power index|solar power|array|energy|battery)\b/.test(text)) {
    title = "The power index";
    body =
      "The power index is a **relative** planning heuristic, not a hardware model. It compares the sine of the Sun's elevation at the site with the best-case south-pole solar elevation of 1.543°, then scales to 0–100. A value of 100 means the Sun is as high as it ever gets at the pole; 0 means the Sun is below the horizon. It ignores array tilt, temperature, dust, storage, and load. Use it to compare sites and dates, not to size a power system.";
  } else if (/\b(horizon|terrain|skyline|topography)\b/.test(text)) {
    title = "The terrain horizon";
    body =
      "For each azimuth, the app marches a ray outward across the LOLA elevation grid. At every sample it computes the elevation angle of the terrain, including the curvature drop r²/(2R), and keeps the maximum. That maximum is the **horizon** in that direction. A body is visible when its center elevation exceeds the horizon at its azimuth. Curated polar sites use precomputed 0.5° profiles from native-resolution LOLA data; custom points inside 75°S use the bundled 1 km grid. Outside the polar DEMs, the app assumes a flat horizon.";
  } else if (/\b(earth phase|phase of the earth|full earth|new earth)\b/.test(text)) {
    title = "Earth phase";
    body =
      "Earth phase is the illuminated fraction of Earth as seen from the Moon. It is the complement of the Moon's phase as seen from Earth: when the Moon is new from Earth, Earth is full from the Moon. Near the south pole the Earth is always close to the horizon, but its phase still changes over the month. The planner computes it from the Sun–Earth–Moon geometry; it is separate from whether the Earth is above the local terrain horizon.";
  } else if (/\b(south pole|why.*pole|polar)\b/.test(text)) {
    title = "Why the south pole is different";
    body =
      "The lunar spin axis is tilted only about 1.543° from the ecliptic normal, so at the poles the Sun never rises high: it skims the horizon and circles around the sky once per lunar day. Topography therefore dominates. A site on a high ridge can stay sunlit for most of the year while a nearby crater floor stays in permanent shadow. The same geometry makes Earth sit near the skyline, creating fragile direct-to-Earth windows. That combination — energy, cold traps, and comms — is why the south pole is the focus for Artemis.";
  } else if (/\b(artemis|crew|astronaut|human landing)\b/.test(text)) {
    title = "Artemis and the south pole";
    body =
      "Artemis targets the lunar south pole because it offers access to both long-duration sunlight and permanently shadowed regions that may hold water ice. The planner includes the Artemis III candidate sites plus CLPS, international, legacy, and science sites so you can compare the trade-offs. The Artemis III label is a catalog category, not a flight selection; the app's numbers are geometric estimates for planning and education.";
  } else if (/\b(lola|data|terrain data|dem|resolution|accuracy|limitation|trust)\b/.test(text)) {
    title = "Data and accuracy";
    body =
      "Terrain comes from LRO LOLA polar DEMs: 80 m/pixel inside 80°S and 240 m/pixel from 75°S to 90°S, composited into a 1 km browser grid. Curated sites use higher-resolution precomputed horizons. The ephemeris is a local implementation of Meeus solar and lunar series plus the IAU WGCCRE 2009 lunar orientation. The model does not resolve boulders, lander-scale obstructions, hardware, dust, temperature, antenna pointing, or link budgets. It is a consistent geometric baseline, not a flight-certification tool.";
    actions = [METHODS_ACTION, LEARN_ACTION];
  } else {
    body =
      "Lunar Horizon separates **geometry** from **mission hardware**. The geometry — Sun and Earth elevation, terrain horizon, visibility, and window length — is computed locally from LOLA terrain and a bundled ephemeris. Power and DTE are derived planning metrics, not hardware simulations. Ask me about a specific site, date, or mission duration and I can apply that geometry to your case.";
  }

  const textOut = [`**${title}**`, "", body].join("\n");
  return {
    text: textOut,
    actions,
    intent: "concept",
    date,
    sites: [],
    context: buildContext({
      intent: "concept",
      date,
      dateWasExplicit: false,
      scenario: null,
      sites: [],
      localAnswer: textOut,
    }),
  };
}

function siteReply(
  site: Site,
  date: Date,
  dateWasExplicit: boolean,
  options: CopilotOptions
): CopilotReply {
  const profile = options.getProfile(site);
  if (!profile) {
    const text = `I couldn't resolve a terrain profile for **${site.name}** in this session. Try opening the planner for that site, or ask about a curated polar site.`;
    return {
      text,
      actions: [PLANNER_ACTION, METHODS_ACTION],
      intent: "site",
      date,
      sites: [site],
      context: buildContext({
        intent: "site",
        date,
        dateWasExplicit,
        scenario: options.scenario ?? null,
        sites: [site],
        localAnswer: text,
      }),
    };
  }

  const metrics = metricsFor(site, profile, date, 30, 120);
  const nextSun = findNextEvent(site, profile, date, "sun", null);
  const nextEarth = findNextEvent(site, profile, date, "earth", null);
  const shadowNote =
    bestHorizon(profile) > MAX_POLAR_SUN_ELEVATION
      ? "**Permanent shadow:** the Sun's maximum polar elevation (+1.5°) never clears this site's lowest horizon, so it never sees direct sunlight."
      : "";

  const text = [
    siteHeading(site),
    siteLine(site),
    "",
    `At **${formatUTC(date)}**:`,
    ...metricBullets(metrics, 30),
    `- ${nextEventText("sun", nextSun, 220)}`,
    `- ${nextEventText("earth", nextEarth, 60)}`,
    shadowNote,
    "",
    `**Why it matters:** ${site.note}`,
    horizonNote(metrics),
  ]
    .filter(Boolean)
    .join("\n");

  const actions: CopilotAction[] = [plannerAction(site, date)];
  const partner = SITES.find((s) => s.id !== site.id && s.featured);
  if (partner && site.category !== "Custom") {
    actions.push(compareAction(site, partner, date));
  }
  actions.push(METHODS_ACTION);

  return {
    text,
    actions,
    intent: "site",
    date,
    sites: [site],
    metrics: [metrics],
    context: buildContext({
      intent: "site",
      date,
      dateWasExplicit,
      scenario: options.scenario ?? null,
      sites: [site],
      metrics: [metrics],
      localAnswer: text,
    }),
  };
}

function compareReply(
  a: Site,
  b: Site,
  date: Date,
  dateWasExplicit: boolean,
  options: CopilotOptions
): CopilotReply {
  const profileA = options.getProfile(a);
  const profileB = options.getProfile(b);
  if (!profileA || !profileB) {
    const text = "I couldn't load one of the terrain profiles for that comparison. Try two curated polar sites, or open the compare view directly.";
    return {
      text,
      actions: [PLANNER_ACTION, METHODS_ACTION],
      intent: "compare",
      date,
      sites: [a, b],
      context: buildContext({
        intent: "compare",
        date,
        dateWasExplicit,
        scenario: options.scenario ?? null,
        sites: [a, b],
        localAnswer: text,
      }),
    };
  }

  const ma = metricsFor(a, profileA, date, 30, 120);
  const mb = metricsFor(b, profileB, date, 30, 120);
  const sunWinner = ma.sunPercent >= mb.sunPercent ? a : b;
  const earthWinner = ma.earthPercent >= mb.earthPercent ? a : b;
  const powerWinner = ma.avgPower >= mb.avgPower ? a : b;

  let verdict: string;
  if (sunWinner.id === earthWinner.id && earthWinner.id === powerWinner.id) {
    verdict = `**${sunWinner.shortName}** leads on sunlight, Earth link, and average power over this window. That is a strong all-round case, though the margin and the local terrain still matter.`;
  } else if (sunWinner.id === earthWinner.id) {
    verdict = `**${sunWinner.shortName}** leads on both sunlight and Earth link, while **${powerWinner.shortName}** has the higher average power index. Check whether your mission is energy-limited or link-limited.`;
  } else {
    verdict = `This is a real trade: **${sunWinner.shortName}** has more sunlight, while **${earthWinner.shortName}** has the stronger Earth link. **${powerWinner.shortName}** leads on average power. The right choice depends on whether you are power-limited or communications-limited.`;
  }

  const text = [
    `**${a.name} vs ${b.name}**`,
    `30-day window starting **${formatUTC(date)}**.`,
    "",
    `**${a.shortName}**`,
    ...metricBullets(ma, 30),
    "",
    `**${b.shortName}**`,
    ...metricBullets(mb, 30),
    "",
    verdict,
    horizonNote(ma) || horizonNote(mb),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text,
    actions: [
      compareAction(a, b, date),
      plannerAction(a, date),
      plannerAction(b, date),
    ],
    intent: "compare",
    date,
    sites: [a, b],
    metrics: [ma, mb],
    context: buildContext({
      intent: "compare",
      date,
      dateWasExplicit,
      scenario: options.scenario ?? null,
      sites: [a, b],
      metrics: [ma, mb],
      localAnswer: text,
    }),
  };
}

function rankingReply(
  criterion: RankCriterion,
  date: Date,
  dateWasExplicit: boolean,
  pool: Site[],
  options: CopilotOptions
): CopilotReply {
  const ranking = rankSites({
    criterion,
    date,
    days: 30,
    getProfile: options.getProfile,
    stepMinutes: 180,
    pool,
  });

  const label: Record<RankCriterion, string> = {
    sunlight: "sunlight",
    dte: "direct-to-Earth",
    power: "average power",
    balanced: "balanced mission potential",
    science: "science / volatile access",
    artemis: "Artemis III relevance",
  };

  if (!ranking.length) {
    const text = "I couldn't rank the catalog because no terrain profiles were available. Try again after the horizon bundle loads.";
    return {
      text,
      actions: [PLANNER_ACTION, METHODS_ACTION],
      intent: "ranking",
      date,
      sites: [],
      context: buildContext({
        intent: "ranking",
        date,
        dateWasExplicit,
        scenario: options.scenario ?? null,
        sites: [],
        localAnswer: text,
      }),
    };
  }

  const top = ranking.slice(0, 5);
  const lines = top.map((m, i) => {
    const rank = i + 1;
    const lead =
      criterion === "sunlight"
        ? `Sun **${formatPercent(m.sunPercent)}**, longest run **${durationText(m.pair.sun.longestHours)}**`
        : criterion === "dte"
          ? `Earth **${formatPercent(m.earthPercent)}**, longest run **${durationText(m.pair.earth.longestHours)}**`
          : criterion === "power"
            ? `average power **${Math.round(m.avgPower)}**, Sun **${formatPercent(m.sunPercent)}**`
            : `score **${Math.round(m.score)}**, Sun **${formatPercent(m.sunPercent)}**, Earth **${formatPercent(m.earthPercent)}**`;
    return `${rank}. **${m.site.name}** — ${lead}.`;
  });

  const best = top[0];
  const runnerUp = top[1];
  const metricGap = runnerUp
    ? criterion === "sunlight"
      ? best.sunPercent - runnerUp.sunPercent
      : criterion === "dte"
        ? best.earthPercent - runnerUp.earthPercent
        : criterion === "power"
          ? best.avgPower - runnerUp.avgPower
          : best.score - runnerUp.score
    : 0;
  const close = runnerUp && metricGap < 4;
  const catalogLabel = pool.length === SITES.length ? "full catalog" : "polar catalog";
  const trade = runnerUp
    ? `\n\n**Trade-off:** **${best.site.shortName}** leads this ranking${close ? ", but " : ". The next option is "}**${runnerUp.site.shortName}**${close ? " is close" : `, ${Math.round(metricGap)} points behind`}. ${criterion === "balanced" ? "The balanced score weights sunlight at 40%, Earth link at 35%, and average power at 25%." : "Use the compare view to see whether the runner-up wins on the metric you care about."}`
    : "";

  const text = [
    `**Best ${label[criterion]}** — 30-day window starting **${formatDateShort(date)}** (UTC), ${catalogLabel}.`,
    "",
    ...lines,
    trade,
    "\n*Rankings use hourly-to-3-hourly samples across the window. They are geometric estimates, not hardware or flight-dynamics results.*",
  ].join("\n");

  const actions: CopilotAction[] = [plannerAction(best.site, date)];
  if (runnerUp) actions.push(compareAction(best.site, runnerUp.site, date));
  actions.push(METHODS_ACTION);

  return {
    text,
    actions,
    intent: "ranking",
    date,
    sites: [best.site],
    ranking,
    context: buildContext({
      intent: "ranking",
      date,
      dateWasExplicit,
      scenario: options.scenario ?? null,
      sites: [best.site],
      ranking,
      localAnswer: text,
    }),
  };
}

/** Lowest terrain horizon at any azimuth — the best case for lighting. */
function bestHorizon(profile: HorizonProfile): number {
  let min = Infinity;
  for (let i = 0; i < profile.elevation.length; i++) {
    const value = profile.elevation[i]!;
    if (value < min) min = value;
  }
  return Number.isFinite(min) ? min : 0;
}

/** The Sun never rises higher than 1.543° at the lunar poles. */
const MAX_POLAR_SUN_ELEVATION = 1.543;

function nextReply(
  site: Site,
  date: Date,
  body: "sun" | "earth",
  direction: boolean | null,
  dateWasExplicit: boolean,
  options: CopilotOptions
): CopilotReply {
  const profile = options.getProfile(site);
  if (!profile) {
    const text = `I couldn't resolve the terrain horizon for **${site.name}** in this session.`;
    return {
      text,
      actions: [PLANNER_ACTION, METHODS_ACTION],
      intent: "next",
      date,
      sites: [site],
      context: buildContext({
        intent: "next",
        date,
        dateWasExplicit,
        scenario: options.scenario ?? null,
        sites: [site],
        localAnswer: text,
      }),
    };
  }

  const snap = snapshot(site, profile, date);
  const metrics = metricsFor(site, profile, date, 30, 120);
  const change = findNextEvent(site, profile, date, body, direction);
  const currentVisible = body === "sun" ? snap.sunVisible : snap.earthVisible;
  const currentEl = body === "sun" ? snap.ephem.sun.elevation : snap.ephem.earth.elevation;
  const currentHorizon = body === "sun" ? snap.sunHorizon : snap.earthHorizon;
  const scanDays = body === "sun" ? 220 : 60;
  const permanentlyShadowed =
    body === "sun" && bestHorizon(profile) > MAX_POLAR_SUN_ELEVATION;

  const eventLine = change
    ? `The next **${eventLabel(body, change)}** is **${formatUTC(change.date)}**.`
    : permanentlyShadowed
      ? `The Sun never rises here. Even at its highest the Sun only reaches **${formatDeg(MAX_POLAR_SUN_ELEVATION)}** at the pole, while the lowest point of this site's terrain horizon is **${formatDeg(bestHorizon(profile))}** — so the site stays in permanent shadow all year.`
      : `There is no ${body === "sun" ? "Sun" : "Earth"} ${direction === true ? "rise" : direction === false ? "set" : "rise or set"} within ${scanDays} days of this date.`;

  const text = [
    `**${site.name}** — next ${body === "sun" ? "Sun" : "Earth"} event`,
    siteLine(site),
    "",
    `At **${formatUTC(date)}**, ${body === "sun" ? "the Sun" : "Earth"} is at **${formatDeg(currentEl)}** versus a **${formatDeg(currentHorizon)}** terrain horizon → **${currentVisible ? "visible" : "below the horizon"}**.`,
    "",
    eventLine,
    "",
    `30-day context: ${body === "sun" ? `sunlight **${formatPercent(metrics.sunPercent)}**` : `DTE **${formatPercent(metrics.earthPercent)}**`}; average power **${Math.round(metrics.avgPower)}**.`,
    horizonNote(metrics),
  ]
    .filter(Boolean)
    .join("\n");

  const targetDate = change?.date ?? date;
  return {
    text,
    actions: [plannerAction(site, targetDate), compareAction(site, SITES.find((s) => s.id !== site.id && s.featured) ?? SITES[0], date), METHODS_ACTION],
    intent: "next",
    date,
    sites: [site],
    metrics: [metrics],
    context: buildContext({
      intent: "next",
      date,
      dateWasExplicit,
      scenario: options.scenario ?? null,
      sites: [site],
      metrics: [metrics],
      localAnswer: text,
    }),
  };
}

function missionReply(
  date: Date,
  dateWasExplicit: boolean,
  durationDays: number | null,
  criterion: RankCriterion,
  site: Site | undefined,
  pool: Site[],
  options: CopilotOptions
): CopilotReply {
  const duration = durationDays ?? 14;
  const plan = buildMissionPlan({
    date,
    durationDays: duration,
    criterion,
    getProfile: options.getProfile,
    site,
    pool,
  });

  if (!plan) {
    const text = "I couldn't build a mission plan because no terrain profiles were available. Try again after the horizon bundle loads.";
    return {
      text,
      actions: [PLANNER_ACTION, METHODS_ACTION],
      intent: "mission",
      date,
      sites: [],
      context: buildContext({
        intent: "mission",
        date,
        dateWasExplicit,
        scenario: options.scenario ?? null,
        sites: [],
        localAnswer: text,
      }),
    };
  }

  const m = plan.metrics;
  const runnerUps = plan.alternatives.filter((a) => a.site.id !== plan.site.id).slice(0, 2);
  const profileLabel: Record<RankCriterion, string> = {
    sunlight: "sunlight-first",
    dte: "Earth-link-first",
    power: "power-first",
    balanced: "balanced",
    science: "science / volatile",
    artemis: "Artemis III",
  };

  const text = [
    `**Mission concept · ${plan.durationDays} days on the surface**`,
    `Recommended site: **${plan.site.name}** — ${plan.site.program}`,
    `Best geometric start date: **${formatUTC(plan.start)}** (scanning ${plan.scanWindowDays} days from ${formatDateShort(date)}).`,
    "",
    `- Sun: **${formatPercent(m.sunPercent)}** of the mission, longest continuous run **${durationText(m.pair.sun.longestHours)}**, average power **${Math.round(m.avgPower)}**.`,
    `- Earth: **${formatPercent(m.earthPercent)}** DTE, longest continuous run **${durationText(m.pair.earth.longestHours)}**.`,
    `- At the start: Sun **${formatDeg(m.snap.ephem.sun.elevation)}** vs horizon **${formatDeg(m.snap.sunHorizon)}** → **${m.snap.sunVisible ? "sunlit" : "shadowed"}**; Earth **${formatDeg(m.snap.ephem.earth.elevation)}** vs **${formatDeg(m.snap.earthHorizon)}** → **${m.snap.earthVisible ? "DTE available" : "no DTE"}**.`,
    "",
    `**Why this site:** ${plan.site.note}`,
    runnerUps.length
      ? `\n**Runners-up by initial ranking:** ${runnerUps.map((r) => r.site.name).join(", ")}.`
      : "",
    `\n*Profile: ${profileLabel[criterion]}. The start date is a geometric best-fit, not a launch or landing certification. Check power, thermal, lighting, and link budgets against your hardware.*`,
    horizonNote(m),
  ]
    .filter(Boolean)
    .join("\n");

  const actions: CopilotAction[] = [
    plannerAction(plan.site, plan.start, plan.durationDays),
  ];
  if (runnerUps[0]) actions.push(compareAction(plan.site, runnerUps[0].site, plan.start));
  actions.push(METHODS_ACTION);

  return {
    text,
    actions,
    intent: "mission",
    date,
    sites: [plan.site],
    metrics: [m],
    ranking: plan.alternatives,
    mission: plan,
    context: buildContext({
      intent: "mission",
      date,
      dateWasExplicit,
      scenario: options.scenario ?? null,
      sites: [plan.site],
      metrics: [m],
      ranking: plan.alternatives,
      mission: plan,
      localAnswer: text,
    }),
  };
}

function scenarioReply(
  scenario: CopilotScenario,
  options: CopilotOptions
): CopilotReply {
  const profile = options.getProfile(scenario.site);
  if (!profile) {
    const text = "I can see the current scenario, but the terrain profile is still loading. Try again in a moment.";
    return {
      text,
      actions: [PLANNER_ACTION, METHODS_ACTION],
      intent: "scenario",
      date: scenario.date,
      sites: [scenario.site],
      context: buildContext({
        intent: "scenario",
        date: scenario.date,
        dateWasExplicit: false,
        scenario,
        sites: [scenario.site],
        localAnswer: text,
      }),
    };
  }

  const metrics = metricsFor(scenario.site, profile, scenario.date, 30, 120);
  const text = [
    `**Current scenario** — ${scenario.site.name}`,
    `${siteLine(scenario.site)} · ${formatUTC(scenario.date)} · ${scenario.rangeDays}-day timeline`,
    "",
    ...metricBullets(metrics, 30),
    "",
    "Ask me to compare it with another site, find the next rise/set, or plan a mission from this date.",
    horizonNote(metrics),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text,
    actions: [
      plannerAction(scenario.site, scenario.date, scenario.rangeDays),
      compareAction(scenario.site, SITES.find((s) => s.id !== scenario.site.id && s.featured) ?? SITES[0], scenario.date),
      METHODS_ACTION,
    ],
    intent: "scenario",
    date: scenario.date,
    sites: [scenario.site],
    metrics: [metrics],
    context: buildContext({
      intent: "scenario",
      date: scenario.date,
      dateWasExplicit: false,
      scenario,
      sites: [scenario.site],
      metrics: [metrics],
      localAnswer: text,
    }),
  };
}

function scenarioMissingReply(
  date: Date,
  options: CopilotOptions
): CopilotReply {
  const text = [
    "I don't see a saved scenario in this URL.",
    "",
    "Open the **Planner** and pick a site and date, or tell me the site and date here — for example: *Compare Shackleton and Nobile on 2027-09-01*.",
  ].join("\n");
  return {
    text,
    actions: [PLANNER_ACTION, LEARN_ACTION, METHODS_ACTION],
    intent: "scenario",
    date,
    sites: [],
    context: buildContext({
      intent: "scenario",
      date,
      dateWasExplicit: false,
      scenario: options.scenario ?? null,
      sites: [],
      localAnswer: text,
    }),
  };
}

function fallbackReply(
  question: string,
  date: Date,
  dateWasExplicit: boolean,
  sites: Site[],
  options: CopilotOptions
): CopilotReply {
  const text = [
    "I can help with the planner's own geometry: sunlight, terrain horizon, Earth link, power index, site ranking, comparisons, rise/set times, and mission timing.",
    "",
    "Try a question like:",
    "- *Plan a 14-day mission with strong power and Earth link.*",
    "- *Which site has the longest sunlight in 2027?*",
    "- *Compare Shackleton and Nobile in September 2027.*",
    "- *When is the next sunrise at Haworth?*",
    "",
    "If you meant a specific site or date, include the name or an ISO date (for example `2027-09-01`).",
  ].join("\n");

  return {
    text,
    actions: [PLANNER_ACTION, LEARN_ACTION, METHODS_ACTION],
    intent: "fallback",
    date,
    sites,
    context: buildContext({
      intent: "fallback",
      date,
      dateWasExplicit,
      scenario: options.scenario ?? null,
      sites,
      localAnswer: text,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Intent routing                                                             */
/* -------------------------------------------------------------------------- */

export function detectCriterion(input: string): RankCriterion {
  const text = normalize(input);
  const hits: RankCriterion[] = [];
  if (/\b(sun|sunlight|light|illumination|solar|night|dark)\b/.test(text)) hits.push("sunlight");
  if (/\b(earth|dte|comm|communication|link|relay|radio|blackout)\b/.test(text)) hits.push("dte");
  if (/\b(power|energy|battery|array|watt|electric)\b/.test(text)) hits.push("power");
  if (/\b(science|ice|water|volatile|sample|psr|shadow|cold)\b/.test(text)) hits.push("science");
  if (/\b(artemis|crew|astronaut|human)\b/.test(text)) hits.push("artemis");
  if (hits.length >= 2) return "balanced";
  return hits[0] ?? "balanced";
}

export function buildCopilotReply(
  input: string,
  options: CopilotOptions
): CopilotReply {
  const question = input.trim();
  const text = normalize(question);
  const scenario = options.scenario ?? null;
  const fallbackDate = scenario?.date ?? options.now;
  const dateInfo = resolveDate(question, fallbackDate);
  const date = dateInfo.date;
  const custom = parseCustomCoordinates(question);
  const resolved = custom ? [custom] : resolveSites(question);
  const mentionsHere = /\b(here|this site|current site|selected site|this scenario|current scenario)\b/.test(text);
  const sites = resolved.length
    ? resolved
    : mentionsHere && scenario
      ? [scenario.site]
      : [];

  if (!question) return helpReply(options.now);

  const asksHelp =
    /\b(what can you do|who are you|help|capabilities|how do i use|getting started|hello|hi|hey|good morning|good evening)\b/.test(
      text
    ) && !sites.length;
  const asksCompare = /\b(compare|versus|vs\.?|difference between|better than|trade.?off)\b/.test(text);
  const asksExplicitNext = /\b(next|rise|rises|sunrise|sunset|earthrise|earthset)\b/.test(text);
  const asksNext =
    /\b(when|next|rise|rises|set|sets|sunrise|sunset|earthrise|earthset|window|blackout)\b/.test(text) &&
    /\b(sun|sunrise|sunset|earth|earthrise|earthset|rise|set|window|blackout|link|dte)\b/.test(text);
  const asksMission = /\b(plan|mission|rover|lander|stay|duration|expedition|deploy|crew|astronaut)\b/.test(text) && !asksCompare;
  const asksRanking = /\b(best|top|rank|which site|where should|recommend|most|longest|highest|leading)\b/.test(text);
  const asksGlobalRanking = /\b(which site|best site|top site|rank|recommend a site|where should)\b/.test(text);
  const asksConcept =
    /\b(what is|what are|why|explain|meaning|how does|psr|permanently shadowed|libration|direct.?to.?earth|power index|horizon|earth phase|solar elevation|subsolar|declination|relay|blackout|accuracy|limitation|data|lola)\b/.test(
      text
    );
  const asksScenario = /\b(current scenario|this scenario|what am i looking at|what am i seeing|selected site)\b/.test(text);

  if (asksHelp && !asksMission && !asksRanking && !asksCompare && !asksNext && !asksConcept) {
    return helpReply(options.now);
  }

  if (asksCompare) {
    if (sites.length >= 2) {
      return compareReply(sites[0], sites[1], date, dateInfo.explicit, options);
    }
    if (sites.length === 1 && scenario && scenario.site.id !== sites[0].id) {
      return compareReply(sites[0], scenario.site, date, dateInfo.explicit, options);
    }
    if (sites.length === 1) {
      const partner = SITES.find((s) => s.id !== sites[0].id && s.featured) ?? SITES[0];
      return compareReply(sites[0], partner, date, dateInfo.explicit, options);
    }
    if (scenario) {
      const partner = SITES.find((s) => s.id !== scenario.site.id && s.featured) ?? SITES[0];
      return compareReply(scenario.site, partner, date, dateInfo.explicit, options);
    }
    const ranked = rankSites({
      criterion: "balanced",
      date,
      days: 30,
      getProfile: options.getProfile,
      stepMinutes: 180,
      pool: rankingPool(question),
    });
    if (ranked.length >= 2) {
      return compareReply(ranked[0].site, ranked[1].site, date, dateInfo.explicit, options);
    }
  }

  if (asksMission) {
    const site = sites[0];
    const duration = extractDurationDays(question);
    const criterion = detectCriterion(question);
    return missionReply(
      date,
      dateInfo.explicit,
      duration,
      criterion,
      site,
      rankingPool(question),
      options
    );
  }

  if (
    asksRanking &&
    (!asksExplicitNext || asksGlobalRanking) &&
    (asksGlobalRanking || !sites.length)
  ) {
    const criterion = detectCriterion(question);
    return rankingReply(
      criterion,
      date,
      dateInfo.explicit,
      rankingPool(question),
      options
    );
  }

  if (asksNext) {
    const site =
      sites[0] ??
      scenario?.site ??
      SITE_BY_ID.get("shackleton-rim") ??
      SITES[0];
    const body: "sun" | "earth" = /\b(earth|dte|link|comm|radio|relay)\b/.test(text)
      ? "earth"
      : "sun";
    const direction = /\b(rise|rises|sunrise|earthrise)\b/.test(text)
      ? true
      : /\b(set|sets|sunset|earthset)\b/.test(text)
        ? false
        : null;
    return nextReply(site, date, body, direction, dateInfo.explicit, options);
  }

  if (asksRanking) {
    const criterion = detectCriterion(question);
    return rankingReply(
      criterion,
      date,
      dateInfo.explicit,
      rankingPool(question),
      options
    );
  }

  if (asksScenario && !sites.length) {
    return scenario
      ? scenarioReply(scenario, options)
      : scenarioMissingReply(date, options);
  }

  if (asksConcept && !sites.length) {
    return conceptReply(question, date);
  }

  if (sites.length >= 2) {
    return compareReply(sites[0], sites[1], date, dateInfo.explicit, options);
  }

  if (sites.length === 1) {
    return siteReply(sites[0], date, dateInfo.explicit, options);
  }

  return fallbackReply(question, date, dateInfo.explicit, sites, options);
}

/* -------------------------------------------------------------------------- */
/* Welcome copy                                                               */
/* -------------------------------------------------------------------------- */

export function welcomeReply(): { text: string; actions: CopilotAction[] } {
  const text = [
    "**Luna here** — your mission copilot. I use the same LOLA terrain and local Sun/Earth ephemeris as the planner, so every number is grounded in the app.",
    "",
    "Ask me to:",
    "- **plan a surface mission** by duration, power, Earth link, science, or Artemis relevance",
    "- **rank sites** for sunlight, power, or direct-to-Earth",
    "- **compare two sites** on a date",
    "- **find the next sunrise, sunset, Earthrise, or Earthset**",
    "- **explain the physics** behind a metric",
  ].join("\n");
  return {
    text,
    actions: [PLANNER_ACTION, LEARN_ACTION, METHODS_ACTION],
  };
}

export const COPILOT_SUGGESTIONS = [
  "Plan a 14-day mission with strong power and Earth link",
  "Which site gets the most sunlight?",
  "Compare Shackleton and Nobile in Sep 2027",
  "When is the next sunrise at Haworth?",
  "What is a permanently shadowed region?",
];
