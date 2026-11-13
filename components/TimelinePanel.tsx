"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Crosshair, Pause, Play } from "lucide-react";
import {
  formatDateCompact,
  formatDeg,
  formatUTC,
  clamp,
} from "@/lib/format";
import type { Timeline } from "@/lib/scenario";

interface TimelinePanelProps {
  timeline: Timeline;
  timeMs: number;
  onTimeChange: (ms: number) => void;
  rangeDays: number;
  onRangeChange: (days: number) => void;
  onCenter: () => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}

const M = { left: 40, right: 12, top: 16, bottom: 54 };

function runsOf(samples: Timeline["samples"], key: "sunVis" | "earthVis") {
  const runs: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i][key]) {
      if (start === null) start = samples[i].t;
      if (i === samples.length - 1) {
        runs.push({ start, end: samples[i].t });
      }
    } else if (start !== null) {
      runs.push({ start, end: samples[i - 1].t });
      start = null;
    }
  }
  return runs;
}

export default function TimelinePanel({
  timeline,
  timeMs,
  onTimeChange,
  rangeDays,
  onRangeChange,
  onCenter,
  playing,
  onPlayingChange,
}: TimelinePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const [size, setSize] = useState({ w: 760, h: 250 });
  const [hover, setHover] = useState<{
    x: number;
    t: number;
    sunEl: number;
    earthEl: number;
    sunVis: boolean;
    earthVis: boolean;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stats = useMemo(() => {
    const n = timeline.samples.length || 1;
    const sun = timeline.samples.filter((s) => s.sunVis).length;
    const earth = timeline.samples.filter((s) => s.earthVis).length;
    return {
      sunPct: (sun / n) * 100,
      earthPct: (earth / n) * 100,
    };
  }, [timeline]);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const s of timeline.samples) {
      m = Math.max(m, Math.abs(s.sunEl), Math.abs(s.earthEl));
    }
    return Math.min(90, Math.max(8, Math.ceil(m / 5) * 5));
  }, [timeline]);

  const xFor = (t: number, w: number) =>
    M.left +
    ((t - timeline.start) / (timeline.end - timeline.start)) *
      (w - M.left - M.right);

  const tFor = (x: number, w: number) =>
    timeline.start +
    ((x - M.left) / (w - M.left - M.right)) *
      (timeline.end - timeline.start);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, size.w);
    const h = Math.max(210, size.h);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const plotW = w - M.left - M.right;
    const plotH = h - M.top - M.bottom;
    const yFor = (el: number) =>
      M.top + plotH / 2 - (clamp(el, -maxAbs, maxAbs) / maxAbs) * (plotH / 2);

    // Background.
    ctx.fillStyle = "rgba(5,9,15,0.55)";
    ctx.fillRect(M.left, M.top, plotW, plotH);

    // Full-height window bands.
    const sunRuns = runsOf(timeline.samples, "sunVis");
    const earthRuns = runsOf(timeline.samples, "earthVis");
    for (const r of sunRuns) {
      const x0 = xFor(r.start, w);
      const x1 = xFor(r.end, w);
      ctx.fillStyle = "rgba(246,196,83,0.055)";
      ctx.fillRect(x0, M.top, Math.max(1, x1 - x0), plotH);
    }
    for (const r of earthRuns) {
      const x0 = xFor(r.start, w);
      const x1 = xFor(r.end, w);
      ctx.fillStyle = "rgba(111,183,255,0.05)";
      ctx.fillRect(x0, M.top, Math.max(1, x1 - x0), plotH);
    }

    // Horizontal grid.
    ctx.font = "9px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textBaseline = "middle";
    for (const frac of [-1, -0.5, 0, 0.5, 1]) {
      const el = frac * maxAbs;
      const y = yFor(el);
      ctx.strokeStyle =
        frac === 0 ? "rgba(148,163,184,0.3)" : "rgba(148,163,184,0.08)";
      ctx.setLineDash(frac === 0 ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(M.left, y);
      ctx.lineTo(w - M.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(143,161,184,0.6)";
      ctx.textAlign = "right";
      ctx.fillText(`${formatDeg(el, 0)}`, M.left - 6, y);
    }

    // X ticks.
    const tickCount = rangeDays <= 7 ? 7 : rangeDays <= 30 ? 6 : rangeDays <= 90 ? 7 : 6;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i < tickCount; i++) {
      const t = timeline.start + (i / (tickCount - 1)) * (timeline.end - timeline.start);
      const x = xFor(t, w);
      ctx.strokeStyle = "rgba(148,163,184,0.1)";
      ctx.beginPath();
      ctx.moveTo(x, M.top);
      ctx.lineTo(x, M.top + plotH);
      ctx.stroke();
      ctx.fillStyle = "rgba(143,161,184,0.6)";
      ctx.fillText(formatDateCompact(new Date(t)), x, h - 46);
    }

    // Curves.
    const drawCurve = (
      key: "sunEl" | "earthEl",
      color: string,
      glow: string
    ) => {
      ctx.beginPath();
      for (let i = 0; i < timeline.samples.length; i++) {
        const s = timeline.samples[i];
        const x = xFor(s.t, w);
        const y = yFor(s[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = glow;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    drawCurve("sunEl", "#f6c453", "rgba(246,196,83,0.12)");
    drawCurve("earthEl", "#6fb7ff", "rgba(111,183,255,0.1)");

    // Bottom window strips.
    const sunY = h - 34;
    const earthY = h - 24;
    ctx.fillStyle = "rgba(148,163,184,0.08)";
    ctx.fillRect(M.left, sunY, plotW, 6);
    ctx.fillRect(M.left, earthY, plotW, 6);
    for (const r of sunRuns) {
      const x0 = xFor(r.start, w);
      const x1 = xFor(r.end, w);
      ctx.fillStyle = "#f6c453";
      ctx.fillRect(x0, sunY, Math.max(1, x1 - x0), 6);
    }
    for (const r of earthRuns) {
      const x0 = xFor(r.start, w);
      const x1 = xFor(r.end, w);
      ctx.fillStyle = "#6fb7ff";
      ctx.fillRect(x0, earthY, Math.max(1, x1 - x0), 6);
    }
    ctx.font = "8px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(246,196,83,0.85)";
    ctx.fillText("SUN", M.left - 6, sunY + 3);
    ctx.fillStyle = "rgba(111,183,255,0.85)";
    ctx.fillText("DTE", M.left - 6, earthY + 3);

    // Selected time.
    if (timeMs >= timeline.start && timeMs <= timeline.end) {
      const x = xFor(timeMs, w);
      ctx.strokeStyle = "rgba(232,238,247,0.6)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, M.top);
      ctx.lineTo(x, M.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      const nearest = nearestSample(timeline, timeMs);
      if (nearest) {
        for (const [key, color] of [
          ["sunEl", "#f6c453"],
          ["earthEl", "#6fb7ff"],
        ] as const) {
          ctx.beginPath();
          ctx.arc(x, yFor(nearest[key]), 3.2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = "rgba(5,9,15,0.9)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // Border.
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(M.left, M.top, plotW, plotH);
  }, [timeline, timeMs, size, maxAbs, rangeDays]);

  const updateFromClientX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(clientX - rect.left, M.left, rect.width - M.right);
    const t = clamp(tFor(x, rect.width), timeline.start, timeline.end);
    onTimeChange(t);
  };

  const setHoverFromClientX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < M.left || x > rect.width - M.right) {
      setHover(null);
      return;
    }
    const t = tFor(x, rect.width);
    const nearest = nearestSample(timeline, t);
    if (!nearest) return;
    setHover({
      x,
      t: nearest.t,
      sunEl: nearest.sunEl,
      earthEl: nearest.earthEl,
      sunVis: nearest.sunVis,
      earthVis: nearest.earthVis,
    });
  };

  const hoverLeft = hover
    ? clamp(hover.x, 96, size.w - 96)
    : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <CalendarRange size={15} className="text-amber" />
            <h3 className="text-[14px] font-semibold text-ink">
              Temporal dynamics
            </h3>
          </div>
          <p className="mt-0.5 text-[11px] text-dim">
            Sunlight and direct-to-Earth windows across the selected range
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="seg" role="group" aria-label="Timeline range">
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={rangeDays === d}
                onClick={() => onRangeChange(d)}
              >
                {d === 365 ? "1y" : `${d}d`}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            onClick={onCenter}
            title="Center the timeline on the selected time"
          >
            <Crosshair size={13} />
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onPlayingChange(!playing)}
            aria-pressed={playing}
            title={playing ? "Pause animation" : "Animate through the window"}
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="relative mt-3 h-[250px] w-full">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair touch-none rounded-lg border border-white/[0.06]"
          role="img"
          aria-label="Timeline of solar and Earth visibility. Drag to change the selected time."
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = true;
            updateFromClientX(e.clientX);
            setHoverFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            setHoverFromClientX(e.clientX);
            if (drag.current) updateFromClientX(e.clientX);
          }}
          onPointerUp={() => {
            drag.current = false;
          }}
          onPointerCancel={() => {
            drag.current = false;
          }}
          onPointerLeave={() => {
            if (!drag.current) setHover(null);
          }}
          onKeyDown={(e) => {
            const step = (timeline.end - timeline.start) / 120;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              onTimeChange(clamp(timeMs - step, timeline.start, timeline.end));
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              onTimeChange(clamp(timeMs + step, timeline.start, timeline.end));
            } else if (e.key === "PageUp") {
              e.preventDefault();
              onTimeChange(clamp(timeMs + 86_400_000, timeline.start, timeline.end));
            } else if (e.key === "PageDown") {
              e.preventDefault();
              onTimeChange(clamp(timeMs - 86_400_000, timeline.start, timeline.end));
            }
          }}
        />
        {hover && (
          <>
            <div
              className="pointer-events-none absolute bottom-[54px] top-[16px] w-px bg-white/25"
              style={{ left: hover.x }}
            />
            <div
              className="pointer-events-none absolute top-2 z-10 w-[190px] -translate-x-1/2 rounded-lg border border-white/12 bg-[#080d16]/95 p-2.5 shadow-xl backdrop-blur-md"
              style={{ left: hoverLeft }}
            >
              <div className="value text-[10px] text-ink">
                {formatUTC(new Date(hover.t))}
              </div>
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                    Sun
                  </span>
                  <span className="value text-[10px] text-ink">
                    {formatDeg(hover.sunEl, 1)}{" "}
                    <span className={hover.sunVis ? "text-mint" : "text-rose"}>
                      {hover.sunVis ? "up" : "down"}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-earth" />
                    Earth
                  </span>
                  <span className="value text-[10px] text-ink">
                    {formatDeg(hover.earthEl, 1)}{" "}
                    <span className={hover.earthVis ? "text-mint" : "text-rose"}>
                      {hover.earthVis ? "up" : "down"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" /> Sun elevation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-earth" /> Earth elevation
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span>
            Sunlight{" "}
            <span className="value text-amber-hot">
              {stats.sunPct.toFixed(0)}%
            </span>
          </span>
          <span>
            DTE{" "}
            <span className="value text-earth">
              {stats.earthPct.toFixed(0)}%
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

function nearestSample(timeline: Timeline, t: number) {
  if (!timeline.samples.length) return null;
  const x =
    ((t - timeline.start) / (timeline.end - timeline.start)) *
    (timeline.samples.length - 1);
  const i = Math.max(
    0,
    Math.min(timeline.samples.length - 1, Math.round(x))
  );
  return timeline.samples[i];
}
