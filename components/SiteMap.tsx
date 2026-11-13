"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Move, X } from "lucide-react";
import {
  DEM_CENTER,
  latLonToPixel,
  pixelToLatLon,
  sampleDem,
  type DemGrid,
} from "@/lib/dem";
import {
  azimuthLabel,
  clamp,
  formatDeg,
  formatLat,
  formatLon,
} from "@/lib/format";
import type { Snapshot } from "@/lib/scenario";
import {
  CATEGORY_COLORS,
  type Site,
} from "@/lib/sites";
import MoonGlobe from "./MoonGlobe";

const CROP_KM = 340;
const MAP_RES = 460;
const SIZE = 915;
const PIXEL_KM = 1;

interface SiteMapProps {
  sites: Site[];
  selected: Site;
  onSelect: (site: Site) => void;
  onCustom: (lat: number, lon: number) => void;
  terrain: DemGrid | null;
  loading: boolean;
  snap: Snapshot;
}

function sampleGrid(grid: DemGrid, row: number, col: number): number | null {
  if (row < 0 || row > grid.size - 1 || col < 0 || col > grid.size - 1) {
    return null;
  }
  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const r1 = Math.min(grid.size - 1, r0 + 1);
  const c1 = Math.min(grid.size - 1, c0 + 1);
  const fr = row - r0;
  const fc = col - c0;
  const v00 = grid.data[r0 * grid.size + c0];
  const v10 = grid.data[r1 * grid.size + c0];
  const v01 = grid.data[r0 * grid.size + c1];
  const v11 = grid.data[r1 * grid.size + c1];
  if (v00 === -32768 || v10 === -32768 || v01 === -32768 || v11 === -32768) {
    return null;
  }
  return (
    v00 * (1 - fr) * (1 - fc) +
    v10 * fr * (1 - fc) +
    v01 * (1 - fr) * fc +
    v11 * fr * fc
  );
}

const RAMP: [number, number, number][] = [
  [10, 18, 28],
  [18, 31, 44],
  [35, 50, 61],
  [72, 80, 82],
  [139, 137, 120],
  [214, 204, 181],
];

function rampColor(t: number): [number, number, number] {
  const x = clamp(t, 0, 1) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  return [
    RAMP[i][0] + (RAMP[i + 1][0] - RAMP[i][0]) * f,
    RAMP[i][1] + (RAMP[i + 1][1] - RAMP[i][1]) * f,
    RAMP[i][2] + (RAMP[i + 1][2] - RAMP[i][2]) * f,
  ];
}

export default function SiteMap({
  sites,
  selected,
  onSelect,
  onCustom,
  terrain,
  loading,
  snap,
}: SiteMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 520, h: 520 });
  const [draft, setDraft] = useState<{
    lat: number;
    lon: number;
    elev: number | null;
  } | null>(null);
  const [hover, setHover] = useState<{
    lat: number;
    lon: number;
    elev: number | null;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) {
        const s = Math.round(Math.min(r.width, r.height));
        setSize({ w: s, h: s });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sunLat = snap.ephem.subSolarLat;
  const sunLon = snap.ephem.subSolarLon;
  const sunEl = snap.ephem.sun.elevation;

  // Lighting only needs the Sun direction to about half a degree. Quantising
  // the dependencies stops the 460 × 460 hillshade from rebuilding on every
  // animation tick.
  const shadeLat = Math.round(sunLat * 2) / 2;
  const shadeLon = Math.round(sunLon * 2) / 2;
  const shadeEl = Math.round(sunEl * 20) / 20;

  // Sample heights and slopes once per terrain bundle; the per-frame work is
  // then a cheap lighting pass rather than a full DEM resample.
  const relief = useMemo(() => {
    if (!terrain) return null;
    const count = MAP_RES * MAP_RES;
    const heights = new Float32Array(count);
    const slopeX = new Float32Array(count);
    const slopeY = new Float32Array(count);
    const center = DEM_CENTER(SIZE);

    for (let y = 0; y < MAP_RES; y++) {
      const row = center + ((y + 0.5) / MAP_RES - 0.5) * 2 * CROP_KM;
      for (let x = 0; x < MAP_RES; x++) {
        const col = center + ((x + 0.5) / MAP_RES - 0.5) * 2 * CROP_KM;
        const h = sampleGrid(terrain, row, col);
        heights[y * MAP_RES + x] = h === null ? Number.NaN : h;
      }
    }

    for (let y = 0; y < MAP_RES; y++) {
      for (let x = 0; x < MAP_RES; x++) {
        const i = y * MAP_RES + x;
        const h = heights[i];
        if (Number.isNaN(h)) continue;
        const left = x > 0 ? heights[i - 1] : h;
        const right = x < MAP_RES - 1 ? heights[i + 1] : h;
        const up = y > 0 ? heights[i - MAP_RES] : h;
        const down = y < MAP_RES - 1 ? heights[i + MAP_RES] : h;
        slopeX[i] =
          ((Number.isNaN(right) ? h : right) -
            (Number.isNaN(left) ? h : left)) /
          2000;
        slopeY[i] =
          ((Number.isNaN(down) ? h : down) - (Number.isNaN(up) ? h : up)) /
          2000;
      }
    }

    return { heights, slopeX, slopeY };
  }, [terrain]);

  const terrainImage = useMemo(() => {
    if (!terrain || !relief) return null;
    const canvas = document.createElement("canvas");
    canvas.width = MAP_RES;
    canvas.height = MAP_RES;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(MAP_RES, MAP_RES);
    const center = DEM_CENTER(SIZE);
    const sub = latLonToPixel(shadeLat, shadeLon, SIZE, PIXEL_KM);
    const minM = terrain.meta?.minM ?? -7000;
    const maxM = terrain.meta?.maxM ?? 7000;
    const cosEl = Math.cos((Math.max(-2, shadeEl) * Math.PI) / 180);
    const sinEl = Math.sin((Math.max(-2, shadeEl) * Math.PI) / 180);
    const { heights, slopeX, slopeY } = relief;

    for (let y = 0; y < MAP_RES; y++) {
      const row = center + ((y + 0.5) / MAP_RES - 0.5) * 2 * CROP_KM;
      for (let x = 0; x < MAP_RES; x++) {
        const i = (y * MAP_RES + x) * 4;
        const h = heights[y * MAP_RES + x];
        if (Number.isNaN(h)) {
          img.data[i] = 5;
          img.data[i + 1] = 8;
          img.data[i + 2] = 13;
          img.data[i + 3] = 255;
          continue;
        }
        const col = center + ((x + 0.5) / MAP_RES - 0.5) * 2 * CROP_KM;

        let lx = sub.col - col;
        let ly = sub.row - row;
        const ll = Math.hypot(lx, ly) || 1;
        lx /= ll;
        ly /= ll;
        const Lx = cosEl * lx;
        const Ly = cosEl * ly;
        const Lz = sinEl;
        const nx = -slopeX[y * MAP_RES + x];
        const ny = -slopeY[y * MAP_RES + x];
        const nz = 1;
        const nl = Math.hypot(nx, ny, nz);
        const dot = (nx * Lx + ny * Ly + nz * Lz) / nl;
        const shade = clamp(0.26 + 0.8 * Math.max(0, dot), 0.08, 1.18);

        const t = (h - minM) / Math.max(1, maxM - minM);
        const [r, g, b] = rampColor(t);
        img.data[i] = clamp(r * shade, 0, 255);
        img.data[i + 1] = clamp(g * shade, 0, 255);
        img.data[i + 2] = clamp(b * shade * 1.04, 0, 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }, [terrain, relief, shadeLat, shadeLon, shadeEl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !terrainImage) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = size.w;
    const h = size.h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(terrainImage, 0, 0, w, h);

    const pxPerKm = w / (2 * CROP_KM);
    const cx = w / 2;
    const cy = h / 2;
    const center = DEM_CENTER(SIZE);

    // Graticule.
    ctx.lineWidth = 1;
    for (const lat of [-80, -85, -88, -89]) {
      const { rKm } = latLonToPixel(lat, 0, SIZE, PIXEL_KM);
      const rr = rKm * pxPerKm;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(148,163,184,0.13)";
      ctx.stroke();
      ctx.fillStyle = "rgba(143,161,184,0.55)";
      ctx.font = "9px ui-monospace, SFMono-Regular, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Math.abs(lat)}°S`, cx + rr * 0.72, cy - rr * 0.72);
    }

    for (let lon = 0; lon < 360; lon += 45) {
      const a = (lon * Math.PI) / 180;
      const r = Math.min(w, h) * 0.52;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
      ctx.strokeStyle = "rgba(148,163,184,0.09)";
      ctx.stroke();
    }

    // Longitude labels.
    ctx.font = "9px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.fillStyle = "rgba(143,161,184,0.6)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rLabel = Math.min(w, h) * 0.465;
    for (const [lon, label] of [
      [0, "0°E"],
      [90, "90°E"],
      [180, "180°"],
      [270, "270°E"],
    ] as const) {
      const a = (lon * Math.PI) / 180;
      ctx.fillText(
        label,
        cx + Math.sin(a) * rLabel,
        cy - Math.cos(a) * rLabel
      );
    }

    // Markers.
    const toDisplay = (lat: number, lon: number) => {
      const p = latLonToPixel(lat, lon, SIZE, PIXEL_KM);
      return {
        x: ((p.col - center) / (2 * CROP_KM) + 0.5) * w,
        y: ((p.row - center) / (2 * CROP_KM) + 0.5) * h,
        rKm: p.rKm,
      };
    };

    for (const site of sites) {
      const p = toDisplay(site.lat, site.lon);
      if (p.rKm > CROP_KM + 4) continue;
      const isSelected = site.id === selected.id;
      const color = CATEGORY_COLORS[site.category];
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(246,196,83,0.75)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSelected ? 4 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(3,7,12,0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (isSelected || site.featured) {
        const label = site.shortName;
        ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
        const tw = ctx.measureText(label).width;
        const lx = p.x + 8;
        const ly = p.y - 8;
        ctx.fillStyle = "rgba(3,7,12,0.68)";
        ctx.fillRect(lx - 3, ly - 8, tw + 6, 13);
        ctx.fillStyle = isSelected ? "#ffe0a0" : "rgba(210,222,238,0.82)";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, lx, ly - 1);
      }
    }

    // Local Sun/Earth directions at the selected site.
    const sp = toDisplay(selected.lat, selected.lon);
    if (sp.rKm <= CROP_KM + 4) {
      const nRaw = [sp.x - cx, sp.y - cy];
      const nLen = Math.hypot(nRaw[0], nRaw[1]) || 1;
      const nx = nRaw[0] / nLen;
      const ny = nRaw[1] / nLen;
      const ex = -ny;
      const ey = nx;
      const arrow = (
        az: number,
        color: string,
        label: string,
        length: number
      ) => {
        const a = (az * Math.PI) / 180;
        const dx = nx * Math.cos(a) + ex * Math.sin(a);
        const dy = ny * Math.cos(a) + ey * Math.sin(a);
        const x2 = sp.x + dx * length;
        const y2 = sp.y + dy * length;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        const head = 5;
        const ang = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - Math.cos(ang - 0.45) * head,
          y2 - Math.sin(ang - 0.45) * head
        );
        ctx.lineTo(
          x2 - Math.cos(ang + 0.45) * head,
          y2 - Math.sin(ang + 0.45) * head
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.font = "8px ui-monospace, SFMono-Regular, Consolas, monospace";
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x2 + dx * 10, y2 + dy * 10);
      };
      arrow(snap.ephem.sun.azimuth, "#f6c453", "SUN", 42);
      arrow(snap.ephem.earth.azimuth, "#6fb7ff", "EARTH", 34);
    }

    // Draft pin.
    if (draft) {
      const dp = toDisplay(draft.lat, draft.lon);
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251,113,133,0.18)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = "#fb7185";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Edge vignette.
    const vg = ctx.createRadialGradient(cx, cy, w * 0.22, cx, cy, w * 0.72);
    vg.addColorStop(0, "rgba(3,6,11,0)");
    vg.addColorStop(1, "rgba(3,6,11,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Scale bar (100 km).
    const bar = 100 * pxPerKm;
    ctx.strokeStyle = "rgba(220,232,246,0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(14, h - 16);
    ctx.lineTo(14 + bar, h - 16);
    ctx.moveTo(14, h - 20);
    ctx.lineTo(14, h - 12);
    ctx.moveTo(14 + bar, h - 20);
    ctx.lineTo(14 + bar, h - 12);
    ctx.stroke();
    ctx.fillStyle = "rgba(220,232,246,0.75)";
    ctx.font = "9px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("100 km", 14, h - 22);
  }, [terrainImage, size, sites, selected, snap, draft]);

  const selectedPixel = latLonToPixel(selected.lat, selected.lon, SIZE, PIXEL_KM);
  const outside = selectedPixel.rKm > CROP_KM + 4;

  const handleClick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const center = DEM_CENTER(SIZE);

    for (const site of sites) {
      const p = latLonToPixel(site.lat, site.lon, SIZE, PIXEL_KM);
      if (p.rKm > CROP_KM + 4) continue;
      const px = ((p.col - center) / (2 * CROP_KM) + 0.5) * rect.width;
      const py = ((p.row - center) / (2 * CROP_KM) + 0.5) * rect.height;
      if (Math.hypot(px - x, py - y) < 13) {
        setDraft(null);
        onSelect(site);
        return;
      }
    }

    const col = center + (x / rect.width - 0.5) * 2 * CROP_KM;
    const row = center + (y / rect.height - 0.5) * 2 * CROP_KM;
    const { lat, lon } = pixelToLatLon(row, col, SIZE, PIXEL_KM);
    const elev = terrain ? sampleDem(terrain, lat, lon) : null;
    setDraft({ lat, lon, elev });
  };

  const handleMove = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const center = DEM_CENTER(SIZE);
    const col = center + (x / rect.width - 0.5) * 2 * CROP_KM;
    const row = center + (y / rect.height - 0.5) * 2 * CROP_KM;
    if (row < 0 || row > SIZE - 1 || col < 0 || col > SIZE - 1) {
      setHover(null);
      return;
    }
    const { lat, lon } = pixelToLatLon(row, col, SIZE, PIXEL_KM);
    const elev = terrain ? sampleDem(terrain, lat, lon) : null;
    setHover({ lat, lon, elev });
  };

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#05080d]"
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair"
          role="img"
          aria-label="South polar terrain map with landing sites. Click terrain to choose custom coordinates."
          onClick={(e) => handleClick(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseLeave={() => setHover(null)}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <div className="rounded-md border border-white/10 bg-black/45 px-2 py-1 backdrop-blur-md">
            <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-dim">
              Polar stereographic
            </div>
            <div className="value text-[10px] text-ink">0°E up · east right</div>
          </div>
          {outside && (
            <div className="rounded-md border border-amber/25 bg-black/55 px-2 py-1 text-right backdrop-blur-md">
              <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-amber">
                Outside terrain model
              </div>
              <div className="value text-[9px] text-muted">
                {Math.round(selectedPixel.rKm)} km from pole
              </div>
            </div>
          )}
        </div>

        {outside && (
          <div className="pointer-events-none absolute right-2.5 top-14 rounded-lg border border-white/10 bg-black/55 p-1 backdrop-blur-md">
            <MoonGlobe lat={selected.lat} lon={selected.lon} size={112} />
          </div>
        )}

        <div className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-md border border-white/10 bg-black/45 px-2 py-1 text-right backdrop-blur-md">
          <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-dim">
            {hover ? "Cursor" : "Selected"}
          </div>
          <div className="value text-[9px] text-ink">
            {hover
              ? `${formatLat(hover.lat, 2)} · ${formatLon(hover.lon, 2)}`
              : `${formatLat(selected.lat, 2)} · ${formatLon(selected.lon, 2)}`}
          </div>
          <div className="value text-[9px] text-muted">
            {hover
              ? hover.elev === null
                ? "no DEM"
                : `${Math.round(hover.elev)} m`
              : `${azimuthLabel(snap.ephem.sun.azimuth)} · Sun ${formatDeg(
                  snap.ephem.sun.elevation,
                  1
                )}`}
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-[#05080d]/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <span className="h-3 w-3 animate-spin rounded-full border border-amber/30 border-t-amber" />
              Loading LOLA terrain…
            </div>
          </div>
        )}

        {draft && (
          <div className="absolute inset-x-2.5 bottom-2.5 rounded-lg border border-rose/30 bg-[#0a0f18]/95 p-3 shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="label text-rose">Custom point</div>
                <div className="value mt-1 text-[12px] text-ink">
                  {formatLat(draft.lat, 3)} · {formatLon(draft.lon, 3)}
                </div>
                <div className="mt-0.5 text-[10px] text-dim">
                  {draft.elev === null
                    ? "Outside terrain grid"
                    : `${Math.round(draft.elev)} m elevation · 1 km LOLA sample`}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost btn p-1"
                onClick={() => setDraft(null)}
                aria-label="Cancel custom point"
              >
                <X size={13} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => {
                  onCustom(draft.lat, draft.lon);
                  setDraft(null);
                }}
              >
                <MapPin size={13} />
                Use this point
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-dim">
        <span className="flex items-center gap-1">
          <Move size={11} /> Click terrain to drop a pin
        </span>
        <span>·</span>
        <span>340 km across</span>
        <span className="ml-auto hidden sm:inline">
          Sun arrows show local azimuth
        </span>
      </div>
    </div>
  );
}
