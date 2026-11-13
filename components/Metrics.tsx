"use client";

import { useId } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Earth,
  Info,
  Radio,
  Sun,
  Zap,
} from "lucide-react";
import {
  formatDeg,
  formatDurationHours,
  formatLat,
  formatPercent,
} from "@/lib/format";
import type { Snapshot, WindowStats } from "@/lib/scenario";
import type { SiteHorizon } from "@/lib/terrain";
import type { Site } from "@/lib/sites";

interface MetricsProps {
  site: Site;
  snap: Snapshot;
  sunStats: WindowStats;
  earthStats: WindowStats;
  horizon: SiteHorizon;
}

function relative(date: Date | null, now: Date): string {
  if (!date) return "no change in 45 days";
  const h = (date.getTime() - now.getTime()) / 3_600_000;
  if (h <= 0.02) return "now";
  return `in ${formatDurationHours(h)}`;
}

function nextEvent(
  stats: WindowStats,
  now: Date,
  body: "sun" | "earth"
): string {
  if (!stats.nextChange) return "No change in 45 days";
  const set = stats.currentVisible;
  if (body === "sun") {
    return `${set ? "Sunset" : "Sunrise"} ${relative(
      stats.nextChange.date,
      now
    )}`;
  }
  return `${set ? "Earthset" : "Earthrise"} ${relative(
    stats.nextChange.date,
    now
  )}`;
}

function StatRow({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.055] py-1.5 last:border-0">
      <span className="flex items-center gap-1 text-[10.5px] text-dim">
        {label}
        {hint && (
          <span title={hint} className="cursor-help">
            <Info size={10} className="text-dim/70" />
          </span>
        )}
      </span>
      <span className={`value text-[11px] ${accent ?? "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

function MiniBar({
  value,
  color,
}: {
  value: number;
  color: "amber" | "earth" | "mint";
}) {
  const cls =
    color === "amber"
      ? "from-amber/40 to-amber"
      : color === "earth"
        ? "from-earth/40 to-earth"
        : "from-mint/40 to-mint";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${cls}`}
        style={{ width: `${Math.max(1, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function PhaseDisk({ phase }: { phase: number }) {
  const clipId = `phase-clip-${useId().replace(/:/g, "")}`;
  const cosPhase = 2 * phase - 1;
  const r = 10;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="#08111e" />
      <clipPath id={clipId}>
        <circle cx="12" cy="12" r={r} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="#6fb7ff" />
        <ellipse
          cx="12"
          cy="12"
          rx={Math.abs(cosPhase) * r}
          ry={r}
          fill={cosPhase >= 0 ? "#6fb7ff" : "#08111e"}
        />
      </g>
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="rgba(160,210,255,0.5)"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export default function Metrics({
  site,
  snap,
  sunStats,
  earthStats,
  horizon,
}: MetricsProps) {
  const now = snap.date;
  const maxHorizon = Math.max(
    ...Array.from(horizon.profile.elevation),
    0
  );
  const sep = snap.sunEarthSeparation;
  const sepTone =
    sep > 45 ? "text-mint" : sep > 15 ? "text-amber-hot" : "text-rose";
  const sepLabel =
    sep > 45 ? "Clear" : sep > 15 ? "Moderate" : "Interference risk";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {/* Power ---------------------------------------------------------- */}
        <div className="panel relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber/[0.07] blur-2xl" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Zap size={13} className="text-amber" />
                <span className="label">Power potential</span>
              </div>
              <div className="mt-2 flex items-end gap-1.5">
                <span className="value text-[40px] font-semibold leading-none text-amber-hot">
                  {snap.powerIndex.toFixed(0)}
                </span>
                <span className="mb-1 font-mono text-[11px] text-dim">/ 100</span>
              </div>
            </div>
            <span
              className={`chip ${
                snap.sunVisible ? "chip-mint" : "chip-rose"
              }`}
            >
              <Sun size={10} />
              {snap.sunVisible ? "Sunlit" : "Shadowed"}
            </span>
          </div>

          <div className="mt-3">
            <MiniBar value={snap.powerIndex} color="amber" />
            <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-dim">
              <span>shadow</span>
              <span>best-case polar Sun</span>
            </div>
          </div>

          <div className="mt-2">
            <StatRow
              label="Solar elevation"
              value={formatDeg(snap.ephem.sun.elevation, 2)}
              accent="text-amber-hot"
              hint="Geometric elevation of the Sun's center above the local horizontal."
            />
            <StatRow
              label="Horizon at Sun"
              value={formatDeg(snap.sunHorizon, 2)}
              hint="Terrain horizon elevation in the Sun's azimuth, including lunar curvature."
            />
            <StatRow
              label="Clearance"
              value={formatDeg(snap.sunClearance, 2)}
              accent={snap.sunVisible ? "text-mint" : "text-rose"}
              hint="Solar elevation minus the terrain horizon. Positive means the Sun's center is visible."
            />
            <StatRow
              label="Next lighting change"
              value={nextEvent(sunStats, now, "sun")}
            />
          </div>

          <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-dim">Sunlight · next 30 days</span>
              <span className="value text-amber-hot">
                {formatPercent(sunStats.percent)}
              </span>
            </div>
            <div className="mt-1.5">
              <MiniBar value={sunStats.percent} color="amber" />
            </div>
            <div className="mt-1.5 flex justify-between text-[9px] text-dim">
              <span>
                Longest window{" "}
                <span className="value text-muted">
                  {formatDurationHours(sunStats.longestHours)}
                </span>
              </span>
              <span>
                {formatDurationHours(sunStats.visibleHours)} total
              </span>
            </div>
          </div>
        </div>

        {/* Comms ---------------------------------------------------------- */}
        <div className="panel relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-earth/[0.08] blur-2xl" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Radio size={13} className="text-earth" />
                <span className="label">Earth direct link</span>
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span
                  className={`value text-[28px] font-semibold leading-none ${
                    snap.earthVisible ? "text-earth" : "text-rose"
                  }`}
                >
                  {snap.earthVisible ? "OPEN" : "CLOSED"}
                </span>
                <span className="mb-0.5 font-mono text-[10px] text-dim">
                  geometric LOS
                </span>
              </div>
            </div>
            <span
              className={`chip ${
                snap.earthVisible ? "chip-earth" : "chip-rose"
              }`}
            >
              <Earth size={10} />
              {snap.earthVisible ? "Visible" : "Occluded"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
              <div className="label text-[9px]">Earth elevation</div>
              <div className="value mt-1 text-[15px] text-earth">
                {formatDeg(snap.ephem.earth.elevation, 2)}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
              <div className="label text-[9px]">Clearance</div>
              <div
                className={`value mt-1 text-[15px] ${
                  snap.earthVisible ? "text-mint" : "text-rose"
                }`}
              >
                {formatDeg(snap.earthClearance, 2)}
              </div>
            </div>
          </div>

          <div className="mt-2">
            <StatRow
              label="Horizon at Earth"
              value={formatDeg(snap.earthHorizon, 2)}
              hint="Terrain horizon elevation in Earth's azimuth."
            />
            <StatRow
              label="Next link change"
              value={nextEvent(earthStats, now, "earth")}
            />
            <StatRow
              label="Earth phase"
              value={
                <span className="flex items-center gap-1.5">
                  <PhaseDisk phase={snap.ephem.earthPhase} />
                  {formatPercent(snap.ephem.earthPhase * 100)}
                </span>
              }
              hint="Illuminated fraction of Earth's disk as seen from the Moon."
            />
          </div>

          <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-dim">Direct-to-Earth · next 30 days</span>
              <span className="value text-earth">
                {formatPercent(earthStats.percent)}
              </span>
            </div>
            <div className="mt-1.5">
              <MiniBar value={earthStats.percent} color="earth" />
            </div>
            <div className="mt-1.5 flex justify-between text-[9px] text-dim">
              <span>
                Longest window{" "}
                <span className="value text-muted">
                  {formatDurationHours(earthStats.longestHours)}
                </span>
              </span>
              <span>
                {formatDurationHours(earthStats.visibleHours)} total
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary stats -------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="panel-flat p-3">
          <div className="label">Sun–Earth angle</div>
          <div className={`value mt-1.5 text-[20px] ${sepTone}`}>
            {sep.toFixed(1)}°
          </div>
          <div className="mt-1 flex items-center gap-1 text-[9.5px] text-dim">
            <span className={`h-1.5 w-1.5 rounded-full ${
              sep > 45 ? "bg-mint" : sep > 15 ? "bg-amber" : "bg-rose"
            }`} />
            {sepLabel} · solar interference
          </div>
        </div>

        <div className="panel-flat p-3">
          <div className="label">Season &amp; libration</div>
          <div className="mt-1.5 space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-dim">Sub-solar</span>
              <span className="value text-amber-hot">
                {formatLat(snap.ephem.subSolarLat, 2)}
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-dim">Sub-Earth</span>
              <span className="value text-earth">
                {formatLat(snap.ephem.subEarthLat, 2)}
              </span>
            </div>
          </div>
          <div className="mt-1 text-[9.5px] leading-snug text-dim">
            ±1.54° solar · ±6.9° libration
          </div>
        </div>

        <div className="panel-flat p-3">
          <div className="label">Terrain model</div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="value text-[20px] text-ink">
              {horizon.elevationM === null
                ? "—"
                : `${Math.round(horizon.elevationM).toLocaleString("en-US")} m`}
            </span>
            <span className="chip text-[8px]">{horizon.source}</span>
          </div>
          <div className="mt-1 text-[9.5px] text-dim">
            Max horizon{" "}
            <span className="value text-muted">
              {formatDeg(maxHorizon, 1)}
            </span>{" "}
            · {horizon.profile.complete ? "full coverage" : "partial"}
          </div>
          {horizon.flat && (
            <div className="mt-1.5 flex items-start gap-1 rounded border border-amber/20 bg-amber/[0.05] px-1.5 py-1 text-[9px] leading-snug text-amber-hot">
              <AlertTriangle size={9} className="mt-0.5 shrink-0" />
              Flat horizon assumed outside the polar DEM.
            </div>
          )}
        </div>

        <div className="panel-flat p-3">
          <div className="label">Window character</div>
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1 text-dim">
                {snap.sunVisible ? (
                  <ArrowUpRight size={10} className="text-mint" />
                ) : (
                  <ArrowDownRight size={10} className="text-rose" />
                )}
                Sun
              </span>
              <span className="value text-muted">
                {sunStats.currentVisible ? "in window" : "dark"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1 text-dim">
                {snap.earthVisible ? (
                  <ArrowUpRight size={10} className="text-mint" />
                ) : (
                  <ArrowDownRight size={10} className="text-rose" />
                )}
                Earth
              </span>
              <span className="value text-muted">
                {earthStats.currentVisible ? "in window" : "occluded"}
              </span>
            </div>
          </div>
          <div className="mt-1 text-[9.5px] leading-snug text-dim">
            {site.category === "Custom"
              ? "Custom site · 1 km horizon ray-march"
              : `${site.program}`}
          </div>
        </div>
      </div>
    </div>
  );
}
