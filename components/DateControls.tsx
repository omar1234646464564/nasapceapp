"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  formatDateShort,
  formatUTC,
  hoursOfDayUTC,
  isoDate,
  utcDateWithHours,
} from "@/lib/format";

interface DateControlsProps {
  timeMs: number;
  onChange: (ms: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

const PRESETS = [
  { label: "Artemis ’27", ms: Date.UTC(2027, 8, 1, 12) },
  { label: "IM-2 ’25", ms: Date.UTC(2025, 2, 6, 12) },
  { label: "Dec solstice", ms: Date.UTC(2026, 11, 21, 12) },
  { label: "Jun solstice", ms: Date.UTC(2026, 5, 21, 12) },
];

export default function DateControls({
  timeMs,
  onChange,
  playing,
  onPlayingChange,
  speed,
  onSpeedChange,
}: DateControlsProps) {
  const date = new Date(timeMs);
  const dateStr = isoDate(date);
  const hours = hoursOfDayUTC(date);

  return (
    <div className="panel p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-amber" />
          <h2 className="text-[13px] font-semibold text-ink">Time &amp; season</h2>
        </div>
        <button
          type="button"
          className="btn px-2 py-1 text-[10px]"
          onClick={() => onChange(Date.now())}
          title="Jump to the current time"
        >
          <RotateCcw size={11} />
          Now
        </button>
      </div>

      <div className="mt-2.5 rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2.5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="value text-[25px] font-semibold leading-none text-ink">
              {formatUTC(date, { withDate: false })}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              {formatDateShort(date)}
            </div>
          </div>
          <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-dim">
            <Clock3 size={11} />
            UTC
          </div>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.12em] text-dim">
          Date
          <span className="text-dim/60">UTC</span>
        </span>
        <input
          type="date"
          value={dateStr}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange(utcDateWithHours(e.target.value, hours).getTime());
          }}
          className="field"
          aria-label="Selected date in UTC"
        />
      </label>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.12em] text-dim">
          <span>Time of day</span>
          <span className="value text-muted">
            {String(date.getUTCHours()).padStart(2, "0")}:
            {String(date.getUTCMinutes()).padStart(2, "0")}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={24}
          step={1 / 12}
          value={hours}
          onChange={(e) =>
            onChange(utcDateWithHours(dateStr, Number(e.target.value)).getTime())
          }
          className="range"
          aria-label="Time of day in UTC hours"
        />
        <div className="flex justify-between px-0.5 font-mono text-[8px] text-dim/70">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-4 gap-1">
        <button
          type="button"
          className="btn px-1.5 py-1.5 text-[10px]"
          onClick={() => onChange(timeMs - 86_400_000)}
          title="One day earlier"
        >
          <ChevronLeft size={11} />
          <span>1d</span>
        </button>
        <button
          type="button"
          className="btn px-1.5 py-1.5 text-[10px]"
          onClick={() => onChange(timeMs - 3_600_000)}
          title="One hour earlier"
        >
          <ChevronLeft size={11} />
          <span>1h</span>
        </button>
        <button
          type="button"
          className="btn px-1.5 py-1.5 text-[10px]"
          onClick={() => onChange(timeMs + 3_600_000)}
          title="One hour later"
        >
          <span>1h</span>
          <ChevronRight size={11} />
        </button>
        <button
          type="button"
          className="btn px-1.5 py-1.5 text-[10px]"
          onClick={() => onChange(timeMs + 86_400_000)}
          title="One day later"
        >
          <span>1d</span>
          <ChevronRight size={11} />
        </button>
      </div>

      <div className="mt-2.5">
        <div className="label mb-1.5">Jump to</div>
        <div className="grid grid-cols-2 gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1.5 text-left text-[10px] text-muted transition hover:border-amber/30 hover:bg-amber/[0.05] hover:text-amber-hot"
              onClick={() => onChange(p.ms)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={`btn px-2 py-1.5 ${playing ? "is-active" : ""}`}
              onClick={() => onPlayingChange(!playing)}
              aria-pressed={playing}
              title={playing ? "Pause time animation" : "Animate time"}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {playing ? "Pause" : "Animate"}
            </button>
            <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-dim">
              {speed} h/s
            </span>
          </div>
          <div className="seg">
            {[6, 24, 72].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => onSpeedChange(s)}
                className="!px-1.5 !text-[9px]"
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-[9px] leading-snug text-dim">
          Animation loops through the visible timeline window. Drag the timeline
          to scrub.
        </p>
      </div>
    </div>
  );
}
