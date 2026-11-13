"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Copy,
  GitCompareArrows,
  LayoutGrid,
  Loader2,
  Plus,
  Rows3,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  FEATURED_SITES,
  SITE_BY_ID,
  SITES,
  type Site,
  type SiteCategory,
} from "@/lib/sites";
import {
  flatHorizon,
  getStoredHorizon,
  sourceForCoverage,
} from "@/lib/horizons";
import { useHorizonBundle } from "@/lib/terrain";
import {
  analyzeWindowPair,
  snapshot,
  type Snapshot,
  type WindowPair,
} from "@/lib/scenario";
import type { HorizonProfile } from "@/lib/dem";
import {
  formatDateShort,
  formatDeg,
  formatDurationHours,
  formatLat,
  formatLon,
  formatPercent,
} from "@/lib/format";

const DAY = 86_400_000;
const DEFAULT_TIME = Date.UTC(2027, 8, 1, 12);

interface Scenario {
  id: string;
  siteId: string;
  timeMs: number;
}

interface Row {
  scenario: Scenario;
  site: Site;
  profile: HorizonProfile;
  snap: Snapshot;
  pair: WindowPair;
  source: string;
}

const CATEGORY_ORDER: SiteCategory[] = [
  "Artemis III",
  "CLPS",
  "Science",
  "International",
  "Legacy",
];

function toLocalInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const normalized = value.length === 16 ? `${value}:00Z` : `${value}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function relativeHours(target: number | null, now: number): string {
  if (target === null) return "no change in 30 d";
  const h = (target - now) / 3_600_000;
  if (h <= 0.02) return "now";
  return `in ${formatDurationHours(h)}`;
}

function nextSunText(row: Row): string {
  const change = row.pair.sun.nextChange;
  if (!change) return "no change in 30 d";
  const label = change.toVisible ? "Sunrise" : "Sunset";
  return `${label} ${relativeHours(change.date.getTime(), row.scenario.timeMs)}`;
}

function nextEarthText(row: Row): string {
  const change = row.pair.earth.nextChange;
  if (!change) return "no change in 30 d";
  const label = change.toVisible ? "Earthrise" : "Earthset";
  return `${label} ${relativeHours(change.date.getTime(), row.scenario.timeMs)}`;
}

function initialScenarios(): Scenario[] {
  return [
    { id: "s1", siteId: "shackleton-rim", timeMs: DEFAULT_TIME },
    { id: "s2", siteId: "connecting-ridge", timeMs: DEFAULT_TIME },
    { id: "s3", siteId: "nobile-rim-2", timeMs: DEFAULT_TIME },
    { id: "s4", siteId: "apollo-11", timeMs: DEFAULT_TIME },
  ];
}

function parseScenarios(raw: string | null): Scenario[] | null {
  if (!raw) return null;
  const parts = raw.split(",").filter(Boolean);
  const out: Scenario[] = [];
  for (const [i, part] of parts.entries()) {
    const at = part.lastIndexOf("@");
    if (at < 1) continue;
    const siteId = part.slice(0, at);
    const ms = Date.parse(part.slice(at + 1));
    if (!SITE_BY_ID.has(siteId) || !Number.isFinite(ms)) continue;
    out.push({ id: `s${i + 1}`, siteId, timeMs: ms });
    if (out.length >= 6) break;
  }
  return out.length ? out : null;
}

export default function CompareView() {
  const { bundle, loading, error } = useHorizonBundle();
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [commonDate, setCommonDate] = useState(() => toLocalInput(DEFAULT_TIME));
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const counter = useRef(6);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsed = parseScenarios(params.get("s"));
    if (parsed) {
      setScenarios(parsed);
      setCommonDate(toLocalInput(parsed[0].timeMs));
    } else {
      const siteId = params.get("site");
      const t = params.get("t");
      const ms = t ? Date.parse(t) : NaN;
      if (siteId && SITE_BY_ID.has(siteId)) {
        const base = Number.isFinite(ms) ? ms : DEFAULT_TIME;
        setScenarios((prev) => [
          { id: "s1", siteId, timeMs: base },
          ...prev.filter((s) => s.siteId !== siteId).slice(0, 3),
        ]);
        setCommonDate(toLocalInput(base));
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const handle = window.setTimeout(() => {
      const encoded = scenarios
        .map((s) => `${s.siteId}@${new Date(s.timeMs).toISOString()}`)
        .join(",");
      const params = new URLSearchParams(window.location.search);
      // The s= payload supersedes the single-scenario handoff params.
      params.delete("site");
      params.delete("t");
      params.set("s", encoded);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`
      );
    }, 350);
    return () => window.clearTimeout(handle);
  }, [ready, scenarios]);

  const rows = useMemo<Row[]>(() => {
    return scenarios.map((scenario) => {
      const site = SITE_BY_ID.get(scenario.siteId) ?? SITES[0];
      const stored = bundle?.sites[site.id];
      const profile =
        (bundle && getStoredHorizon(bundle, site.id)) || flatHorizon();
      const date = new Date(scenario.timeMs);
      const snap = snapshot(site, profile, date);
      const pair = analyzeWindowPair(site, profile, date, 30, 120);
      return {
        scenario,
        site,
        profile,
        snap,
        pair,
        source: stored ? sourceForCoverage(stored.coverage) : "Flat assumption",
      };
    });
  }, [scenarios, bundle]);

  const leaders = useMemo(() => {
    let sun: Row | null = null;
    let earth: Row | null = null;
    let power: Row | null = null;
    for (const row of rows) {
      if (!sun || row.pair.sun.percent > sun.pair.sun.percent) sun = row;
      if (!earth || row.pair.earth.percent > earth.pair.earth.percent)
        earth = row;
      if (!power || row.snap.powerIndex > power.snap.powerIndex) power = row;
    }
    return { sun, earth, power };
  }, [rows]);

  const updateScenario = (id: string, patch: Partial<Scenario>) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const addScenario = () => {
    if (scenarios.length >= 6) return;
    const used = new Set(scenarios.map((s) => s.siteId));
    const next =
      FEATURED_SITES.find((s) => !used.has(s.id)) ??
      SITES.find((s) => !used.has(s.id)) ??
      SITES[0];
    counter.current += 1;
    setScenarios((prev) => [
      ...prev,
      {
        id: `s${counter.current}`,
        siteId: next.id,
        timeMs: scenarios[0]?.timeMs ?? DEFAULT_TIME,
      },
    ]);
  };

  const removeScenario = (id: string) => {
    setScenarios((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  };

  const applyCommonDate = () => {
    const ms = fromLocalInput(commonDate);
    if (ms === null) return;
    setScenarios((prev) => prev.map((s) => ({ ...s, timeMs: ms })));
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
    <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <section className="animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip chip-amber">
                <GitCompareArrows size={10} />
                Scenario comparison
              </span>
              <span className="chip">Up to 6 sites · independent dates</span>
            </div>
            <h1 className="mt-3 text-[clamp(28px,3.8vw,42px)] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">
              Trade light against the link.
            </h1>
            <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
              Put candidate sites side by side. Each row is an independent
              site/date scenario, evaluated with the same LOLA horizon and
              ephemeris model used in the planner. Sunlight and direct-to-Earth
              percentages cover the 30 days following each date.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="seg" role="group" aria-label="Comparison layout">
              <button
                type="button"
                aria-pressed={view === "cards"}
                onClick={() => setView("cards")}
              >
                <LayoutGrid size={11} className="mr-1 inline" />
                Cards
              </button>
              <button
                type="button"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <Rows3 size={11} className="mr-1 inline" />
                Table
              </button>
            </div>
            <button type="button" className="btn" onClick={share}>
              {copied ? (
                <Check size={13} className="text-mint" />
              ) : (
                <Copy size={13} />
              )}
              {copied ? "Link copied" : "Share"}
            </button>
            <Link href="/" className="btn">
              <ArrowLeft size={13} />
              Planner
            </Link>
          </div>
        </div>
      </section>

      {/* Controls --------------------------------------------------------- */}
      <section className="panel mt-4 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <CalendarClock size={13} className="text-amber" />
              <span className="label">Common date</span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-dim">
              Apply one UTC date to every scenario, then fine-tune each card.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="sr-only">Common date and time in UTC</span>
              <input
                type="datetime-local"
                value={commonDate}
                onChange={(e) => setCommonDate(e.target.value)}
                className="field w-[210px]"
              />
            </label>
            <button type="button" className="btn" onClick={applyCommonDate}>
              Apply to all
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={addScenario}
              disabled={scenarios.length >= 6}
            >
              <Plus size={13} />
              Add scenario
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.07] pt-3">
          <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
            Quick add
          </span>
          {FEATURED_SITES.map((site) => {
            const active = scenarios.some((s) => s.siteId === site.id);
            return (
              <button
                key={site.id}
                type="button"
                disabled={active || scenarios.length >= 6}
                onClick={() => {
                  if (active || scenarios.length >= 6) return;
                  counter.current += 1;
                  setScenarios((prev) => [
                    ...prev,
                    {
                      id: `s${counter.current}`,
                      siteId: site.id,
                      timeMs: scenarios[0]?.timeMs ?? DEFAULT_TIME,
                    },
                  ]);
                }}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "border-amber/40 bg-amber/10 text-amber-hot"
                    : "border-white/10 bg-white/[0.02] text-muted hover:border-white/25 hover:text-ink"
                }`}
                aria-pressed={active}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[site.category] }}
                />
                {site.shortName}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="mt-3 rounded-xl border border-rose/25 bg-rose/[0.06] px-4 py-3 text-[12px] text-rose">
          Horizon data failed to load ({error}). Scenarios use a flat horizon,
          so the comparison will not reflect local terrain relief.
        </div>
      )}

      {/* Summary + scatter ------------------------------------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="panel p-3.5 sm:p-4">
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-amber" />
            <h2 className="text-[14px] font-semibold text-ink">
              Scenario leaders
            </h2>
            {loading && (
              <span className="chip">
                <Loader2 size={10} className="animate-spin" />
                loading terrain
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <LeaderCard
              title="Most sunlight"
              value={leaders.sun ? formatPercent(leaders.sun.pair.sun.percent) : "—"}
              site={leaders.sun?.site.shortName ?? "—"}
              color="amber"
              note={
                leaders.sun
                  ? `${formatDurationHours(leaders.sun.pair.sun.longestHours)} longest window`
                  : undefined
              }
            />
            <LeaderCard
              title="Most DTE"
              value={
                leaders.earth ? formatPercent(leaders.earth.pair.earth.percent) : "—"
              }
              site={leaders.earth?.site.shortName ?? "—"}
              color="earth"
              note={
                leaders.earth
                  ? `${formatDurationHours(leaders.earth.pair.earth.longestHours)} longest window`
                  : undefined
              }
            />
            <LeaderCard
              title="Highest power index"
              value={
                leaders.power
                  ? `${leaders.power.snap.powerIndex.toFixed(0)} / 100`
                  : "—"
              }
              site={leaders.power?.site.shortName ?? "—"}
              color="mint"
              note={
                leaders.power
                  ? `Sun ${formatDeg(leaders.power.snap.ephem.sun.elevation, 1)}`
                  : undefined
              }
            />
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-dim">
            Power index is a relative horizontal-array yield, not a hardware
            model. A site can lead on sunlight and still be link-poor: the two
            constraints are driven by different geometry.
          </p>
        </section>

        <section className="panel p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-semibold text-ink">
                Sunlight vs direct-to-Earth
              </h2>
              <p className="mt-0.5 text-[10.5px] text-dim">
                Each point is one scenario over its next 30 days
              </p>
            </div>
            <span className="chip">% of window</span>
          </div>
          <ScatterPlot rows={rows} />
        </section>
      </div>

      {/* Rows ------------------------------------------------------------- */}
      {view === "cards" ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) => (
            <ScenarioCard
              key={row.scenario.id}
              row={row}
              canRemove={scenarios.length > 1}
              onChangeSite={(siteId) =>
                updateScenario(row.scenario.id, { siteId })
              }
              onChangeTime={(timeMs) =>
                updateScenario(row.scenario.id, { timeMs })
              }
              onRemove={() => removeScenario(row.scenario.id)}
            />
          ))}
          {scenarios.length < 6 && (
            <button
              type="button"
              onClick={addScenario}
              className="group flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-white/15 bg-white/[0.015] p-6 text-dim transition hover:border-amber/40 hover:bg-amber/[0.03] hover:text-amber-hot"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/[0.03] transition group-hover:border-amber/40">
                <Plus size={18} />
              </span>
              <span className="text-[12px] font-medium">Add scenario</span>
              <span className="text-[10px]">
                {6 - scenarios.length} slot{6 - scenarios.length === 1 ? "" : "s"}{" "}
                remaining
              </span>
            </button>
          )}
        </div>
      ) : (
        <section className="panel mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-lunar min-w-[1020px]">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Date (UTC)</th>
                  <th>Power</th>
                  <th>Sun elev.</th>
                  <th>Sunlight · 30 d</th>
                  <th>DTE · 30 d</th>
                  <th>Longest sun</th>
                  <th>Next sun</th>
                  <th>Next link</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.scenario.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              CATEGORY_COLORS[row.site.category],
                          }}
                        />
                        <div>
                          <div className="font-medium text-ink">
                            {row.site.name}
                          </div>
                          <div className="font-mono text-[9.5px] text-dim">
                            {formatLat(row.site.lat, 2)} ·{" "}
                            {formatLon(row.site.lon, 2)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[11px] text-muted">
                      {formatDateShort(new Date(row.scenario.timeMs))}
                      <div className="text-[9.5px] text-dim">
                        {new Date(row.scenario.timeMs).toISOString().slice(11, 16)}{" "}
                        UTC
                      </div>
                    </td>
                    <td>
                      <span className="value text-[15px] text-amber-hot">
                        {row.snap.powerIndex.toFixed(0)}
                      </span>
                    </td>
                    <td
                      className={`value ${
                        row.snap.sunVisible ? "text-mint" : "text-rose"
                      }`}
                    >
                      {formatDeg(row.snap.ephem.sun.elevation, 2)}
                    </td>
                    <td>
                      <PercentCell
                        value={row.pair.sun.percent}
                        color="amber"
                      />
                    </td>
                    <td>
                      <PercentCell
                        value={row.pair.earth.percent}
                        color="earth"
                      />
                    </td>
                    <td className="value text-[11px] text-muted">
                      {formatDurationHours(row.pair.sun.longestHours)}
                    </td>
                    <td className="text-[10.5px] text-muted">
                      {nextSunText(row)}
                    </td>
                    <td className="text-[10.5px] text-muted">
                      {nextEarthText(row)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost btn p-1.5"
                        onClick={() => removeScenario(row.scenario.id)}
                        disabled={scenarios.length <= 1}
                        aria-label={`Remove ${row.site.name} scenario`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <p className="text-[11px] leading-relaxed text-dim">
          Need a coordinate that is not in the catalog? The planner accepts any
          lunar latitude/longitude and ray-marches a horizon from the 1 km LOLA
          grid inside 75°S.
        </p>
        <Link href="/" className="btn">
          Open custom site in planner
          <ArrowRight size={13} />
        </Link>
      </section>
    </div>
  );
}

function LeaderCard({
  title,
  value,
  site,
  color,
  note,
}: {
  title: string;
  value: string;
  site: string;
  color: "amber" | "earth" | "mint";
  note?: string;
}) {
  const tone =
    color === "amber"
      ? "text-amber-hot"
      : color === "earth"
        ? "text-earth"
        : "text-mint";
  const glow =
    color === "amber"
      ? "bg-amber/[0.07]"
      : color === "earth"
        ? "bg-earth/[0.08]"
        : "bg-mint/[0.07]";
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${glow}`}
      />
      <div className="label text-[9px]">{title}</div>
      <div className={`value mt-1 text-[24px] font-semibold leading-none ${tone}`}>
        {value}
      </div>
      <div className="mt-1 truncate text-[10.5px] text-muted">{site}</div>
      {note && <div className="mt-0.5 text-[9px] text-dim">{note}</div>}
    </div>
  );
}

function PercentCell({
  value,
  color,
}: {
  value: number;
  color: "amber" | "earth";
}) {
  const bar =
    color === "amber"
      ? "from-amber/35 to-amber"
      : "from-earth/35 to-earth";
  const text = color === "amber" ? "text-amber-hot" : "text-earth";
  return (
    <div className="min-w-[92px]">
      <div className={`value text-[11.5px] ${text}`}>
        {formatPercent(value)}
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${bar}`}
          style={{ width: `${Math.max(1, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function ScenarioCard({
  row,
  canRemove,
  onChangeSite,
  onChangeTime,
  onRemove,
}: {
  row: Row;
  canRemove: boolean;
  onChangeSite: (siteId: string) => void;
  onChangeTime: (timeMs: number) => void;
  onRemove: () => void;
}) {
  const { site, snap, pair, scenario } = row;
  return (
    <article className="panel relative overflow-hidden p-3.5">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${CATEGORY_COLORS[site.category]}, transparent)`,
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <label className="block">
            <span className="sr-only">Landing site for this scenario</span>
            <select
              value={scenario.siteId}
              onChange={(e) => onChangeSite(e.target.value)}
              className="field !border-transparent !bg-transparent !px-0 !py-0 text-[15px] font-semibold text-ink focus:!border-transparent focus:!shadow-none"
            >
              {CATEGORY_ORDER.map((category) => {
                const group = SITES.filter((s) => s.category === category);
                if (!group.length) return null;
                return (
                  <optgroup
                    key={category}
                    label={CATEGORY_LABELS[category]}
                  >
                    {group.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[site.category] }}
            />
            <span className="font-mono text-[9.5px] text-dim">
              {formatLat(site.lat, 2)} · {formatLon(site.lon, 2)}
            </span>
            <span className="chip text-[8px]">{row.source}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost btn shrink-0 p-1.5"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remove ${site.name} scenario`}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="mt-2.5">
        <label className="block">
          <span className="sr-only">Scenario date and time in UTC</span>
          <input
            type="datetime-local"
            value={toLocalInput(scenario.timeMs)}
            onChange={(e) => {
              const ms = fromLocalInput(e.target.value);
              if (ms !== null) onChangeTime(ms);
            }}
            className="field !py-1.5 text-[11px]"
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
          <div className="label text-[8px]">Power</div>
          <div className="value mt-1 text-[19px] font-semibold leading-none text-amber-hot">
            {snap.powerIndex.toFixed(0)}
          </div>
          <div className="mt-0.5 text-[8.5px] text-dim">/ 100</div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
          <div className="label text-[8px]">Sun · 30 d</div>
          <div className="value mt-1 text-[19px] font-semibold leading-none text-amber">
            {formatPercent(pair.sun.percent)}
          </div>
          <div className="mt-0.5 text-[8.5px] text-dim">
            {formatDurationHours(pair.sun.longestHours, true)} longest
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
          <div className="label text-[8px]">DTE · 30 d</div>
          <div className="value mt-1 text-[19px] font-semibold leading-none text-earth">
            {formatPercent(pair.earth.percent)}
          </div>
          <div className="mt-0.5 text-[8.5px] text-dim">
            {formatDurationHours(pair.earth.longestHours, true)} longest
          </div>
        </div>
      </div>

      <div className="mt-2.5 space-y-1 border-t border-white/[0.07] pt-2.5">
        <RowLine
          label="Sun elevation"
          value={formatDeg(snap.ephem.sun.elevation, 2)}
          tone={snap.sunVisible ? "text-mint" : "text-rose"}
        />
        <RowLine
          label="Earth elevation"
          value={formatDeg(snap.ephem.earth.elevation, 2)}
          tone={snap.earthVisible ? "text-earth" : "text-rose"}
        />
        <RowLine label="Next sun change" value={nextSunText(row)} />
        <RowLine label="Next link change" value={nextEarthText(row)} />
      </div>

      <Link
        href={`/?site=${site.id}&t=${new Date(
          scenario.timeMs
        ).toISOString()}`}
        className="mt-2.5 flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[10px] text-muted transition hover:border-amber/30 hover:text-amber-hot"
      >
        Open in planner
        <ArrowRight size={11} />
      </Link>
    </article>
  );
}

function RowLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[9.5px] text-dim">{label}</span>
      <span className={`value text-[10px] ${tone ?? "text-muted"}`}>
        {value}
      </span>
    </div>
  );
}

function ScatterPlot({ rows }: { rows: Row[] }) {
  const W = 440;
  const H = 300;
  const M = { left: 42, right: 14, top: 16, bottom: 38 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const xFor = (v: number) => M.left + (v / 100) * plotW;
  const yFor = (v: number) => M.top + plotH - (v / 100) * plotH;

  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="mt-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Scatter plot of sunlight percentage versus direct-to-Earth percentage for each scenario."
      >
        <rect
          x={M.left}
          y={M.top}
          width={plotW}
          height={plotH}
          fill="rgba(5,9,15,0.5)"
          stroke="rgba(148,163,184,0.12)"
        />
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="rgba(148,163,184,0.08)"
            />
            <line
              x1={xFor(tick)}
              x2={xFor(tick)}
              y1={M.top}
              y2={M.top + plotH}
              stroke="rgba(148,163,184,0.06)"
            />
            <text
              x={M.left - 7}
              y={yFor(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="rgba(143,161,184,0.65)"
              fontSize="8.5"
              fontFamily="ui-monospace, monospace"
            >
              {tick}
            </text>
            <text
              x={xFor(tick)}
              y={H - M.bottom + 13}
              textAnchor="middle"
              fill="rgba(143,161,184,0.65)"
              fontSize="8.5"
              fontFamily="ui-monospace, monospace"
            >
              {tick}
            </text>
          </g>
        ))}

        <line
          x1={xFor(50)}
          x2={xFor(50)}
          y1={M.top}
          y2={M.top + plotH}
          stroke="rgba(148,163,184,0.22)"
          strokeDasharray="4 4"
        />
        <line
          x1={M.left}
          x2={W - M.right}
          y1={yFor(50)}
          y2={yFor(50)}
          stroke="rgba(148,163,184,0.22)"
          strokeDasharray="4 4"
        />

        <text
          x={M.left + 6}
          y={M.top + 12}
          fill="rgba(143,161,184,0.5)"
          fontSize="8"
          fontFamily="ui-monospace, monospace"
        >
          LINK-RICH · SHADOWED
        </text>
        <text
          x={W - M.right - 6}
          y={M.top + 12}
          textAnchor="end"
          fill="rgba(143,161,184,0.5)"
          fontSize="8"
          fontFamily="ui-monospace, monospace"
        >
          LIT · LINK-RICH
        </text>
        <text
          x={W - M.right - 6}
          y={M.top + plotH - 6}
          textAnchor="end"
          fill="rgba(143,161,184,0.5)"
          fontSize="8"
          fontFamily="ui-monospace, monospace"
        >
          LIT · LINK-POOR
        </text>

        <text
          x={M.left + plotW / 2}
          y={H - 4}
          textAnchor="middle"
          fill="rgba(200,214,232,0.75)"
          fontSize="9"
          fontFamily="ui-monospace, monospace"
          letterSpacing="1"
        >
          SUNLIGHT · % OF 30 DAYS
        </text>
        <text
          x={12}
          y={M.top + plotH / 2}
          textAnchor="middle"
          fill="rgba(200,214,232,0.75)"
          fontSize="9"
          fontFamily="ui-monospace, monospace"
          letterSpacing="1"
          transform={`rotate(-90 12 ${M.top + plotH / 2})`}
        >
          DIRECT-TO-EARTH · %
        </text>

        {rows.map((row) => {
          const x = xFor(Math.max(0, Math.min(100, row.pair.sun.percent)));
          const y = yFor(Math.max(0, Math.min(100, row.pair.earth.percent)));
          const color = CATEGORY_COLORS[row.site.category];
          const isHover = hover === row.scenario.id;
          return (
            <g
              key={row.scenario.id}
              onMouseEnter={() => setHover(row.scenario.id)}
              onMouseLeave={() => setHover(null)}
            >
              <circle
                cx={x}
                cy={y}
                r={isHover ? 10 : 7}
                fill={color}
                fillOpacity={isHover ? 0.3 : 0.16}
              />
              <circle
                cx={x}
                cy={y}
                r={4}
                fill={color}
                stroke="rgba(3,7,12,0.8)"
                strokeWidth="1"
              />
              <text
                x={x + 9}
                y={y - 6}
                fill={isHover ? "#ffffff" : "rgba(200,214,232,0.8)"}
                fontSize="9"
                fontFamily="ui-monospace, monospace"
              >
                {row.site.shortName}
              </text>
              <title>
                {`${row.site.name}: ${formatPercent(
                  row.pair.sun.percent
                )} sunlight, ${formatPercent(
                  row.pair.earth.percent
                )} DTE`}
              </title>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-dim">
        {CATEGORY_ORDER.map((category) => (
          <span key={category} className="flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[category] }}
            />
            {CATEGORY_LABELS[category]}
          </span>
        ))}
      </div>
    </div>
  );
}
