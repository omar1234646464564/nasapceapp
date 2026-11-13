"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  GitCompareArrows,
  Layers,
  Loader2,
  Share2,
  Sparkles,
} from "lucide-react";
import DateControls from "./DateControls";
import HorizonView from "./HorizonView";
import Metrics from "./Metrics";
import SiteMap from "./SiteMap";
import SitePicker from "./SitePicker";
import TimelinePanel from "./TimelinePanel";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  FEATURED_SITES,
  SITE_BY_ID,
  SITES,
  makeCustomSite,
  type Site,
} from "@/lib/sites";
import {
  useHorizonBundle,
  useSiteHorizon,
  useTerrainGrid,
} from "@/lib/terrain";
import {
  analyzeWindowPair,
  computeTimeline,
  snapshot,
} from "@/lib/scenario";
import { formatDateShort, formatDeg, formatLat, formatLon } from "@/lib/format";

const DEFAULT_TIME = Date.UTC(2027, 8, 1, 12);
const DAY = 86_400_000;

export default function Planner() {
  const [site, setSite] = useState<Site>(
    () => SITE_BY_ID.get("shackleton-rim") ?? FEATURED_SITES[0]
  );
  const [timeMs, setTimeMs] = useState(DEFAULT_TIME);
  const [anchorMs, setAnchorMs] = useState(DEFAULT_TIME);
  const [rangeDays, setRangeDays] = useState(30);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(24);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const { bundle, loading: bundleLoading, error: bundleError } = useHorizonBundle();
  const { terrain, loading: terrainLoading } = useTerrainGrid();
  const siteHorizon = useSiteHorizon(
    site,
    bundle,
    terrain,
    bundleLoading,
    bundleError
  );

  // Read a shared scenario from the URL once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    const sid = params.get("site");
    const lat = params.get("lat");
    const lon = params.get("lon");
    let next = DEFAULT_TIME;
    if (t) {
      const ms = Date.parse(t);
      if (Number.isFinite(ms)) next = ms;
    }
    setTimeMs(next);
    setAnchorMs(next);
    if (sid === "custom" && lat && lon) {
      const la = Number(lat);
      const lo = Number(lon);
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        setSite(makeCustomSite(la, ((lo % 360) + 360) % 360));
      }
    } else if (sid && SITE_BY_ID.has(sid)) {
      setSite(SITE_BY_ID.get(sid)!);
    }
    const r = Number(params.get("range"));
    if ([7, 30, 90, 365].includes(r)) setRangeDays(r);
    setReady(true);
  }, []);

  // Keep the URL shareable without flooding browser history.
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set("site", site.category === "Custom" ? "custom" : site.id);
      if (site.category === "Custom") {
        params.set("lat", site.lat.toFixed(5));
        params.set("lon", site.lon.toFixed(5));
      }
      params.set("t", new Date(timeMs).toISOString());
      params.set("range", String(rangeDays));
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`
      );
    }, 350);
    return () => window.clearTimeout(id);
  }, [ready, site, timeMs, rangeDays]);

  // If the selection leaves the timeline window, re-centre it.
  useEffect(() => {
    const half = (rangeDays * DAY) / 2;
    if (timeMs < anchorMs - half || timeMs > anchorMs + half) {
      setAnchorMs(timeMs);
    }
  }, [timeMs, anchorMs, rangeDays]);

  // Animate through the visible timeline window.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setTimeMs((t) => {
        const half = (rangeDays * DAY) / 2;
        const next = t + speed * 0.12 * 3_600_000;
        if (next > anchorMs + half) return anchorMs - half;
        return next;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, [playing, speed, rangeDays, anchorMs]);

  const snap = useMemo(
    () => snapshot(site, siteHorizon.profile, new Date(timeMs)),
    [site, siteHorizon.profile, timeMs]
  );

  const pair = useMemo(
    () =>
      analyzeWindowPair(site, siteHorizon.profile, new Date(timeMs), 30, 60),
    [site, siteHorizon.profile, timeMs]
  );

  const timeline = useMemo(
    () =>
      computeTimeline(
        site,
        siteHorizon.profile,
        new Date(anchorMs),
        rangeDays,
        720
      ),
    [site, siteHorizon.profile, anchorMs, rangeDays]
  );

  const selectSite = (next: Site) => {
    setSite(next);
    setAnchorMs(timeMs);
  };

  const selectCustom = (lat: number, lon: number) => {
    setSite(makeCustomSite(lat, ((lon % 360) + 360) % 360));
    setAnchorMs(timeMs);
  };

  const changeRange = (days: number) => {
    setRangeDays(days);
    setAnchorMs(timeMs);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-6 pt-6 sm:px-6 lg:px-8">
      {/* Hero ------------------------------------------------------------- */}
      <section className="animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip chip-amber">
                <Sparkles size={10} />
                NASA hackathon · lunar south pole
              </span>
              <span className="chip">LOLA terrain · local ephemeris</span>
            </div>
            <h1 className="mt-3 text-[clamp(30px,4vw,46px)] font-semibold leading-[1.03] tracking-[-0.035em] text-ink">
              Find the light.
              <span className="text-amber"> Keep the link.</span>
            </h1>
            <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
              Compare lunar south-pole landing sites by Sun and Earth geometry,
              terrain horizon, power potential, and direct-to-Earth windows.
              Pick a site, scrub a date, and see the trade-off instantly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={share}>
              {copied ? <Check size={13} className="text-mint" /> : <Share2 size={13} />}
              {copied ? "Link copied" : "Share view"}
            </button>
            <Link
              href={`/compare?site=${site.id === "custom" ? "shackleton-rim" : site.id}&t=${new Date(
                timeMs
              ).toISOString()}`}
              className="btn btn-primary"
            >
              <GitCompareArrows size={13} />
              Compare sites
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
            Featured
          </span>
          {FEATURED_SITES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSite(s)}
              aria-pressed={site.id === s.id}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] transition ${
                site.id === s.id
                  ? "border-amber/40 bg-amber/10 text-amber-hot"
                  : "border-white/10 bg-white/[0.02] text-muted hover:border-white/20 hover:text-ink"
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[s.category] }}
              />
              {s.shortName}
            </button>
          ))}
          {site.category === "Custom" && (
            <span className="chip chip-rose">Custom · {formatLat(site.lat, 2)}</span>
          )}
        </div>
      </section>

      {/* Workbench -------------------------------------------------------- */}
      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <SitePicker
            selected={site}
            onSelect={selectSite}
            onCustom={selectCustom}
          />
          <DateControls
            timeMs={timeMs}
            onChange={setTimeMs}
            playing={playing}
            onPlayingChange={setPlaying}
            speed={speed}
            onSpeedChange={setSpeed}
          />
          <SiteBrief
            site={site}
            horizon={siteHorizon}
            snap={snap}
            timeMs={timeMs}
          />
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="panel p-3.5 sm:p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Layers size={15} className="text-amber" />
                  <h2 className="text-[15px] font-semibold text-ink">
                    Local horizon
                  </h2>
                  <span
                    className={`chip ${
                      snap.sunVisible ? "chip-mint" : "chip-rose"
                    }`}
                  >
                    {snap.sunVisible ? "Sunlit" : "Shadowed"}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-dim">
                  {site.name} · {formatLat(site.lat, 3)} ·{" "}
                  {formatLon(site.lon, 3)} · {formatDateShort(new Date(timeMs))}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[site.category] }}
                  />
                  {CATEGORY_LABELS[site.category]}
                </span>
                <span className="chip">{siteHorizon.source}</span>
                {siteHorizon.loading && (
                  <span className="chip">
                    <Loader2 size={10} className="animate-spin" />
                    loading
                  </span>
                )}
              </div>
            </div>
            <HorizonView
              site={site}
              profile={siteHorizon.profile}
              snap={snap}
              timeMs={timeMs}
            />
            {siteHorizon.error && (
              <div className="mt-2 rounded-lg border border-rose/25 bg-rose/[0.06] px-3 py-2 text-[10.5px] text-rose">
                Terrain data failed to load ({siteHorizon.error}). A flat horizon
                is being used.
              </div>
            )}
          </section>

          <Metrics
            site={site}
            snap={snap}
            sunStats={pair.sun}
            earthStats={pair.earth}
            horizon={siteHorizon}
          />

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section className="panel min-w-0 p-3.5 sm:p-4">
              <TimelinePanel
                timeline={timeline}
                timeMs={timeMs}
                onTimeChange={setTimeMs}
                rangeDays={rangeDays}
                onRangeChange={changeRange}
                onCenter={() => setAnchorMs(timeMs)}
                playing={playing}
                onPlayingChange={setPlaying}
              />
            </section>

            <section className="panel min-w-0 p-3.5 sm:p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers size={15} className="text-earth" />
                    <h3 className="text-[14px] font-semibold text-ink">
                      Terrain &amp; site picker
                    </h3>
                  </div>
                  <p className="mt-0.5 text-[11px] text-dim">
                    South polar stereographic · click anywhere to test a point
                  </p>
                </div>
                <span className="chip chip-earth">LOLA 1 km</span>
              </div>
              <SiteMap
                sites={SITES}
                selected={site}
                onSelect={selectSite}
                onCustom={selectCustom}
                terrain={terrain}
                loading={terrainLoading}
                snap={snap}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function SiteBrief({
  site,
  horizon,
  snap,
  timeMs,
}: {
  site: Site;
  horizon: ReturnType<typeof useSiteHorizon>;
  snap: ReturnType<typeof snapshot>;
  timeMs: number;
}) {
  return (
    <div className="panel p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="label">Site brief</span>
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: CATEGORY_COLORS[site.category] }}
        />
      </div>
      <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">
        {site.name}
      </h3>
      <div className="mt-0.5 text-[10.5px] text-dim">{site.program}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{site.note}</p>

      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-white/[0.07] pt-2.5">
        <div>
          <div className="label text-[8.5px]">Latitude</div>
          <div className="value text-[10.5px] text-ink">
            {formatLat(site.lat, 3)}
          </div>
        </div>
        <div>
          <div className="label text-[8.5px]">Longitude</div>
          <div className="value text-[10.5px] text-ink">
            {formatLon(site.lon, 3)}
          </div>
        </div>
        <div>
          <div className="label text-[8.5px]">Elevation</div>
          <div className="value text-[10.5px] text-ink">
            {horizon.elevationM === null
              ? "—"
              : `${Math.round(horizon.elevationM).toLocaleString("en-US")} m`}
          </div>
        </div>
        <div>
          <div className="label text-[8.5px]">Horizon</div>
          <div className="value text-[10.5px] text-ink">
            {formatDeg(Math.max(...Array.from(horizon.profile.elevation), 0), 1)}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-2.5 text-[9.5px]">
        <span className="text-dim">
          Sun {formatDeg(snap.ephem.sun.elevation, 1)} · Earth{" "}
          {formatDeg(snap.ephem.earth.elevation, 1)}
        </span>
        <span className="font-mono text-dim/70">
          {formatDateShort(new Date(timeMs))}
        </span>
      </div>

      <Link
        href={`/compare?site=${site.id === "custom" ? "shackleton-rim" : site.id}&t=${new Date(
          timeMs
        ).toISOString()}`}
        className="mt-2.5 flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-[10.5px] text-muted transition hover:border-amber/30 hover:text-amber-hot"
      >
        Compare this scenario
        <ArrowRight size={12} />
      </Link>

      {horizon.flat && (
        <p className="mt-2 text-[9px] leading-snug text-amber/80">
          Outside the 75°S–90°S terrain products: horizon assumed flat. Sun and
          Earth elevations are still computed from the full ephemeris.
        </p>
      )}
    </div>
  );
}
