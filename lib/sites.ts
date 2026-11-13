export type SiteCategory =
  | "Artemis III"
  | "CLPS"
  | "International"
  | "Legacy"
  | "Science"
  | "Custom";

export interface Site {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lon: number;
  category: SiteCategory;
  program: string;
  note: string;
  featured?: boolean;
  /** Latitude coverage of the bundled LOLA terrain model. */
  coverage: "80m" | "240m" | "none";
}

function coverageFor(lat: number): Site["coverage"] {
  if (lat <= -80) return "80m";
  if (lat <= -75) return "240m";
  return "none";
}

function site(s: Omit<Site, "coverage">): Site {
  return { ...s, coverage: coverageFor(s.lat) };
}

export const SITES: Site[] = [
  site({
    id: "shackleton-rim",
    name: "Shackleton Rim",
    shortName: "Shackleton",
    lat: -89.61,
    lon: 187.326,
    category: "Artemis III",
    program: "Artemis III · Site 004",
    note: "High ground on Shackleton's rim. Long solar exposure and direct access to permanently shadowed terrain.",
    featured: true,
  }),
  site({
    id: "connecting-ridge",
    name: "Connecting Ridge",
    shortName: "Connecting",
    lat: -89.45,
    lon: 222.69,
    category: "Artemis III",
    program: "Artemis III · Site 001",
    note: "Broad ridge linking Shackleton and de Gerlache. The classic illumination-versus-PSR trade-off.",
    featured: true,
  }),
  site({
    id: "peak-shackleton",
    name: "Peak Near Shackleton",
    shortName: "Shackleton Peak",
    lat: -89.0054,
    lon: 125.3092,
    category: "Artemis III",
    program: "Artemis III · Site 007",
    note: "One of the highest points in the Artemis exploration zone. Excellent illumination, steep surroundings.",
  }),
  site({
    id: "de-gerlache-rim-2",
    name: "de Gerlache Rim 2",
    shortName: "de Gerlache",
    lat: -88.516,
    lon: 298.833,
    category: "Artemis III",
    program: "Artemis III · SL2",
    note: "Rim of de Gerlache crater, immediately adjacent to a large permanently shadowed floor.",
  }),
  site({
    id: "faustini-rim-a",
    name: "Faustini Rim A",
    shortName: "Faustini",
    lat: -88.087,
    lon: 98.355,
    category: "Artemis III",
    program: "Artemis III · LM7",
    note: "Rim of Faustini, one of the coldest and most persistently shadowed traps near the pole.",
  }),
  site({
    id: "nobile-rim-2",
    name: "Nobile Rim 2",
    shortName: "Nobile",
    lat: -84.20156,
    lon: 60.69989,
    category: "Artemis III",
    program: "Artemis III · DM2",
    note: "Top-ranked in a 2024 multi-criteria study. Broad, relatively smooth terrain with a balanced power/comms profile.",
    featured: true,
  }),
  site({
    id: "amundsen-rim",
    name: "Amundsen Rim",
    shortName: "Amundsen",
    lat: -84.1918,
    lon: 67.229,
    category: "Artemis III",
    program: "Artemis III · DM1",
    note: "Rim of Amundsen crater. A lower-latitude alternative with a different Earth-view geometry.",
  }),
  site({
    id: "malapert-massif",
    name: "Malapert Massif",
    shortName: "Malapert",
    lat: -86.0,
    lon: 0.0,
    category: "Artemis III",
    program: "Artemis III · Site 023",
    note: "A high massif with exceptional Earth visibility, but far enough from the pole to change the lighting story.",
    featured: true,
  }),
  site({
    id: "mons-mouton",
    name: "Mons Mouton",
    shortName: "Mons Mouton",
    lat: -84.78,
    lon: 29.13,
    category: "CLPS",
    program: "IM-2 Athena · 2025",
    note: "A roughly 6 km-high plateau targeted by Intuitive Machines' IM-2 Athena lander.",
    featured: true,
  }),
  site({
    id: "malapert-a",
    name: "Malapert A",
    shortName: "Malapert A",
    lat: -80.13,
    lon: 1.44,
    category: "CLPS",
    program: "IM-1 Odysseus · 2024",
    note: "Intuitive Machines' first landing site, near Malapert crater at the edge of the polar terrain model.",
  }),
  site({
    id: "cabeus-b",
    name: "Cabeus B",
    shortName: "Cabeus B",
    lat: -82.4,
    lon: 297.7,
    category: "Science",
    program: "LCROSS · 2009",
    note: "Near the Cabeus permanently shadowed region, where LCROSS confirmed water ice in 2009.",
  }),
  site({
    id: "haworth",
    name: "Haworth",
    shortName: "Haworth",
    lat: -87.4,
    lon: 355.6,
    category: "Artemis III",
    program: "Artemis III · Haworth",
    note: "Rim of Haworth crater, a large permanently shadowed region close to the pole.",
  }),
  site({
    id: "apollo-11",
    name: "Apollo 11",
    shortName: "Apollo 11",
    lat: 0.674,
    lon: 23.473,
    category: "Legacy",
    program: "Apollo · 1969",
    note: "Sea of Tranquility. The familiar benchmark: monthly sunrises, and Earth almost always in view.",
    featured: true,
  }),
  site({
    id: "apollo-17",
    name: "Apollo 17",
    shortName: "Apollo 17",
    lat: 20.191,
    lon: 30.772,
    category: "Legacy",
    program: "Apollo · 1972",
    note: "Taurus-Littrow valley. Rugged mountains and long, low-Sun photography.",
  }),
  site({
    id: "chandrayaan-3",
    name: "Chandrayaan-3",
    shortName: "Chandrayaan-3",
    lat: -69.373,
    lon: 32.319,
    category: "International",
    program: "ISRO · 2023",
    note: "India's Shiv Shakti Point, a high-latitude site outside the continuous polar terrain model.",
  }),
  site({
    id: "chang-e-4",
    name: "Chang'e 4",
    shortName: "Chang'e 4",
    lat: -45.444,
    lon: 177.599,
    category: "International",
    program: "CNSA · 2019",
    note: "First far-side landing. Earth is permanently below the horizon: a relay is mandatory.",
  }),
  site({
    id: "chang-e-6",
    name: "Chang'e 6",
    shortName: "Chang'e 6",
    lat: -41.638,
    lon: 206.015,
    category: "International",
    program: "CNSA · 2024",
    note: "Far-side sample return landing in the Apollo basin. No direct-to-Earth line of sight.",
  }),
  site({
    id: "slim",
    name: "SLIM",
    shortName: "SLIM",
    lat: -13.316,
    lon: 25.251,
    category: "International",
    program: "JAXA · 2024",
    note: "Japan's precision lander near Shioli crater, in the equatorial nearside region.",
  }),
];

export function makeCustomSite(lat: number, lon: number): Site {
  return {
    id: "custom",
    name: "Custom coordinates",
    shortName: "Custom",
    lat,
    lon,
    category: "Custom",
    program: "User-defined site",
    note: "A user-selected point. Terrain horizons are ray-marched from the bundled 1 km LOLA grid when inside 75°S; otherwise a flat horizon is assumed.",
    coverage: coverageFor(lat),
  };
}

export const FEATURED_SITES = SITES.filter((s) => s.featured);

export const SITE_BY_ID = new Map(SITES.map((s) => [s.id, s]));

export const CATEGORY_LABELS: Record<SiteCategory, string> = {
  "Artemis III": "Artemis III candidate",
  CLPS: "CLPS / commercial",
  International: "International",
  Legacy: "Apollo legacy",
  Science: "Science target",
  Custom: "Custom coordinates",
};

export const CATEGORY_COLORS: Record<SiteCategory, string> = {
  "Artemis III": "#f6c453",
  CLPS: "#7dd3fc",
  International: "#c4b5fd",
  Legacy: "#94a3b8",
  Science: "#86efac",
  Custom: "#fb7185",
};

export function formatLat(lat: number): string {
  const dir = lat < 0 ? "S" : "N";
  return `${Math.abs(lat).toFixed(3)}° ${dir}`;
}

export function formatLon(lon: number): string {
  const l = ((lon % 360) + 360) % 360;
  const dir = l > 180 ? "W" : "E";
  const v = l > 180 ? 360 - l : l;
  return `${v.toFixed(3)}° ${dir}`;
}

export function siteSubtitle(site: Site): string {
  return `${formatLat(site.lat)} · ${formatLon(site.lon)}`;
}
