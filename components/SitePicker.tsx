"use client";

import { useMemo, useState } from "react";
import { Check, Crosshair, MapPin, Search } from "lucide-react";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  SITES,
  type Site,
  type SiteCategory,
} from "@/lib/sites";
import { formatLat, formatLon } from "@/lib/format";

interface SitePickerProps {
  selected: Site;
  onSelect: (site: Site) => void;
  onCustom: (lat: number, lon: number) => void;
}

const FILTERS: { id: "all" | SiteCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Artemis III", label: "Artemis" },
  { id: "CLPS", label: "CLPS" },
  { id: "International", label: "Intl" },
  { id: "Legacy", label: "Apollo" },
  { id: "Science", label: "Science" },
];

export default function SitePicker({
  selected,
  onSelect,
  onCustom,
}: SitePickerProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | SiteCategory>("all");
  const [latText, setLatText] = useState("-89.50");
  const [lonText, setLonText] = useState("0.00");
  const [customError, setCustomError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SITES.filter((s) => {
      if (filter !== "all" && s.category !== filter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.shortName.toLowerCase().includes(q) ||
        s.program.toLowerCase().includes(q) ||
        s.note.toLowerCase().includes(q)
      );
    });
  }, [query, filter]);

  const submitCustom = () => {
    const lat = Number(latText);
    const lon = Number(lonText);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCustomError("Latitude must be between −90° and +90°.");
      return;
    }
    if (!Number.isFinite(lon) || lon < -360 || lon > 360) {
      setCustomError("Longitude must be between −360° and +360°.");
      return;
    }
    setCustomError(null);
    onCustom(lat, ((lon % 360) + 360) % 360);
  };

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-white/[0.07] p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-amber" />
            <h2 className="text-[13px] font-semibold text-ink">Landing sites</h2>
          </div>
          <span className="chip text-[9px]">{filtered.length}</span>
        </div>

        <div className="relative mt-2.5">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites, programs, notes…"
            className="field pl-8"
            aria-label="Search landing sites"
          />
        </div>

        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] transition ${
                filter === f.id
                  ? "border-amber/40 bg-amber/10 text-amber-hot"
                  : "border-white/10 bg-white/[0.02] text-dim hover:text-ink"
              }`}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[390px] overflow-y-auto p-1.5">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-[12px] text-dim">
            No sites match “{query}”.
          </div>
        )}
        {filtered.map((site) => {
          const active = site.id === selected.id;
          return (
            <button
              key={site.id}
              type="button"
              onClick={() => onSelect(site)}
              aria-pressed={active}
              className={`group flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${
                active
                  ? "border-amber/35 bg-amber/[0.08]"
                  : "border-transparent hover:border-white/10 hover:bg-white/[0.035]"
              }`}
            >
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-black/40"
                style={{ backgroundColor: CATEGORY_COLORS[site.category] }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`truncate text-[12.5px] font-medium ${
                      active ? "text-amber-hot" : "text-ink"
                    }`}
                  >
                    {site.name}
                  </span>
                  {site.featured && (
                    <span className="shrink-0 rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.1em] text-dim">
                      featured
                    </span>
                  )}
                  {active && <Check size={11} className="ml-auto shrink-0 text-amber" />}
                </span>
                <span className="mt-0.5 block font-mono text-[9.5px] text-dim">
                  {formatLat(site.lat, 2)} · {formatLon(site.lon, 2)}
                </span>
                <span className="mt-0.5 block truncate text-[9.5px] text-dim/80">
                  {CATEGORY_LABELS[site.category]} · {site.program}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-1.5">
          <Crosshair size={12} className="text-rose" />
          <span className="label">Custom coordinates</span>
          {selected.category === "Custom" && (
            <span className="chip chip-rose ml-auto text-[8px]">active</span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <label className="block">
            <span className="mb-1 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-dim">
              Latitude
            </span>
            <input
              value={latText}
              onChange={(e) => setLatText(e.target.value)}
              className="field"
              inputMode="decimal"
              aria-label="Custom latitude in degrees, south negative"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-dim">
              Longitude E
            </span>
            <input
              value={lonText}
              onChange={(e) => setLonText(e.target.value)}
              className="field"
              inputMode="decimal"
              aria-label="Custom longitude in degrees east"
            />
          </label>
        </div>
        {customError && (
          <div className="mt-1.5 text-[9.5px] leading-snug text-rose">
            {customError}
          </div>
        )}
        <button
          type="button"
          onClick={submitCustom}
          className="btn mt-2 w-full"
        >
          <Crosshair size={12} />
          Set custom site
        </button>
        <p className="mt-1.5 text-[9px] leading-snug text-dim">
          South negative. Polar points use the 1 km LOLA grid; sites outside
          75°S use a flat-horizon assumption.
        </p>
      </div>
    </div>
  );
}
