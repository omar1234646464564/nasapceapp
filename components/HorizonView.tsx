"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Crosshair,
  Earth as EarthIcon,
  Maximize2,
  Minus,
  Plus,
  Sun as SunIcon,
} from "lucide-react";
import {
  RAD,
  angleDiff,
  bodyFixedToAzEl,
  transform,
  type Vec3,
} from "@/lib/astro";
import {
  horizonAt,
  horizonLayerAt,
  type HorizonProfile,
} from "@/lib/dem";
import { azimuthLabel, clamp, formatDeg } from "@/lib/format";
import type { Snapshot } from "@/lib/scenario";
import { computeTrail } from "@/lib/scenario";
import type { Site } from "@/lib/sites";

interface Star {
  ra: number;
  dec: number;
  mag: number;
}

/** Deterministic, softly distributed background stars (J2000). */
const STARS: Star[] = (() => {
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: Star[] = [];
  for (let i = 0; i < 260; i++) {
    out.push({
      ra: rnd() * 360,
      dec: Math.asin(2 * rnd() - 1) * RAD,
      mag: 6.4 * Math.pow(rnd(), 2.4) - 0.8,
    });
  }
  return out;
})();

interface HorizonViewProps {
  site: Site;
  profile: HorizonProfile;
  snap: Snapshot;
  timeMs: number;
}

function azToX(az: number, viewAz: number, fov: number, width: number): number {
  return width / 2 + (angleDiff(az, viewAz) / fov) * width;
}

function elToY(el: number, horizonY: number, pxPerDeg: number): number {
  return horizonY - el * pxPerDeg;
}

export default function HorizonView({
  site,
  profile,
  snap,
  timeMs,
}: HorizonViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 420 });
  const [viewAz, setViewAz] = useState(180);
  const [fov, setFov] = useState(100);
  const [hover, setHover] = useState<{ az: number; el: number } | null>(null);
  const drag = useRef<{ x: number; az: number } | null>(null);

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

  const trailAnchor = Math.floor(timeMs / (6 * 3_600_000)) * 6 * 3_600_000;
  const sunTrail = useMemo(
    () =>
      computeTrail(site, profile, new Date(trailAnchor), "sun", 24, 96),
    [site, profile, trailAnchor]
  );
  const earthTrail = useMemo(
    () =>
      computeTrail(site, profile, new Date(trailAnchor), "earth", 24, 96),
    [site, profile, trailAnchor]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, size.w);
    const h = Math.max(260, size.h);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const horizonY = h * 0.79;
    const pxPerDeg = w / fov;
    const sun = snap.ephem.sun;
    const earth = snap.ephem.earth;
    const sunVisible = snap.sunVisible;
    const sunX = azToX(sun.azimuth, viewAz, fov, w);
    const sunY = elToY(sun.elevation, horizonY, pxPerDeg);
    const earthX = azToX(earth.azimuth, viewAz, fov, w);
    const earthY = elToY(earth.elevation, horizonY, pxPerDeg);

    // --- Sky ---------------------------------------------------------------
    const day = clamp((sun.elevation + 4) / 8, 0, 1);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#02050b");
    sky.addColorStop(0.45, `rgb(${5 + 4 * day},${10 + 7 * day},${19 + 9 * day})`);
    sky.addColorStop(0.82, `rgb(${8 + 18 * day},${14 + 14 * day},${24 + 8 * day})`);
    sky.addColorStop(1, `rgb(${10 + 34 * day},${17 + 22 * day},${27 + 10 * day})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Warm twilight near the Sun's azimuth, even when it is just below.
    const twilight = clamp(1 - Math.abs(sun.elevation) / 7, 0, 1);
    if (twilight > 0.01 && sunX > -w * 0.5 && sunX < w * 1.5) {
      const g = ctx.createRadialGradient(
        sunX,
        Math.min(horizonY, sunY),
        0,
        sunX,
        Math.min(horizonY, sunY),
        Math.max(180, w * 0.32)
      );
      g.addColorStop(0, `rgba(255,205,120,${0.16 * twilight})`);
      g.addColorStop(0.35, `rgba(240,150,70,${0.07 * twilight})`);
      g.addColorStop(1, "rgba(240,150,70,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // --- Stars -------------------------------------------------------------
    const m = snap.ephem.orientation.matrix;
    const starAlpha = sunVisible ? 0.28 : 0.9;
    for (const s of STARS) {
      const ra = (s.ra * Math.PI) / 180;
      const dec = (s.dec * Math.PI) / 180;
      const v: Vec3 = [
        Math.cos(dec) * Math.cos(ra),
        Math.cos(dec) * Math.sin(ra),
        Math.sin(dec),
      ];
      const bf = transform(m, v);
      const { azimuth, elevation } = bodyFixedToAzEl(bf, site.lat, site.lon);
      if (elevation < horizonAt(profile, azimuth) + 0.2) continue;
      const x = azToX(azimuth, viewAz, fov, w);
      if (x < -10 || x > w + 10) continue;
      const y = elToY(elevation, horizonY, pxPerDeg);
      if (y < -10 || y > h) continue;
      const alpha = clamp((1 - s.mag / 6.5) * starAlpha, 0.08, 0.92);
      const r = clamp(1.35 - s.mag * 0.13, 0.45, 1.5);
      ctx.beginPath();
      ctx.fillStyle = `rgba(210,225,255,${alpha})`;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Sky grid ----------------------------------------------------------
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textBaseline = "middle";

    for (let az = 0; az < 360; az += 30) {
      const x = azToX(az, viewAz, fov, w);
      if (x < 0 || x > w) continue;
      ctx.strokeStyle = "rgba(148,163,184,0.075)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = "rgba(143,161,184,0.55)";
      ctx.textAlign = "center";
      ctx.fillText(`${az}°`, x, 13);
    }

    for (let el = -10; el <= 80; el += 10) {
      const y = elToY(el, horizonY, pxPerDeg);
      if (y < 16 || y > h - 14) continue;
      ctx.strokeStyle =
        el === 0 ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.06)";
      ctx.setLineDash(el === 0 ? [4, 5] : []);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(143,161,184,0.5)";
      ctx.textAlign = "left";
      ctx.fillText(`${el > 0 ? "+" : ""}${el}°`, 6, y - 7);
    }

    // --- 24-hour trails ----------------------------------------------------
    const drawTrail = (
      pts: { az: number; el: number }[],
      color: string
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.15;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      let prevAz: number | null = null;
      let drawing = false;
      for (const p of pts) {
        if (p.el < -6) {
          drawing = false;
          prevAz = p.az;
          continue;
        }
        const x = azToX(p.az, viewAz, fov, w);
        const y = elToY(p.el, horizonY, pxPerDeg);
        const jump = prevAz !== null && Math.abs(angleDiff(p.az, prevAz)) > 90;
        if (!drawing || jump) {
          ctx.moveTo(x, y);
          drawing = true;
        } else {
          ctx.lineTo(x, y);
        }
        prevAz = p.az;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawTrail(sunTrail, "rgba(246,196,83,0.42)");
    drawTrail(earthTrail, "rgba(111,183,255,0.38)");

    // --- Bodies ------------------------------------------------------------
    const drawSun = () => {
      if (sunX < -80 || sunX > w + 80) return;
      const r = Math.max(2.4, sun.angularRadius * pxPerDeg);
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 54);
      glow.addColorStop(0, "rgba(255,230,160,0.75)");
      glow.addColorStop(0.18, "rgba(255,200,100,0.32)");
      glow.addColorStop(1, "rgba(255,180,60,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "#fff4ce";
      ctx.arc(sunX, sunY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,225,150,0.9)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,228,160,0.92)";
      ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`SUN ${formatDeg(sun.elevation, 1)}`, sunX, sunY - 16);
    };

    const drawEarth = () => {
      if (earthX < -80 || earthX > w + 80) return;
      const r = Math.max(5, earth.angularRadius * pxPerDeg);
      const glow = ctx.createRadialGradient(earthX, earthY, 0, earthX, earthY, r * 4.5);
      glow.addColorStop(0, "rgba(120,190,255,0.4)");
      glow.addColorStop(1, "rgba(70,140,230,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(earthX, earthY, r * 4.5, 0, Math.PI * 2);
      ctx.fill();

      const angle = Math.atan2(sunY - earthY, sunX - earthX);
      const cosPhase = 2 * snap.ephem.earthPhase - 1;
      ctx.save();
      ctx.translate(earthX, earthY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "#08111e";
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      const lit = ctx.createLinearGradient(-r, 0, r, 0);
      lit.addColorStop(0, "#2f77b8");
      lit.addColorStop(0.55, "#6fb7ff");
      lit.addColorStop(1, "#c7e6ff");
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = lit;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.abs(cosPhase) * r, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = cosPhase >= 0 ? lit : "#08111e";
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(160,210,255,0.55)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "rgba(160,210,255,0.92)";
      ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`EARTH ${formatDeg(earth.elevation, 1)}`, earthX, earthY - r - 8);
    };

    drawSun();
    drawEarth();

    // Off-screen direction markers.
    const edgeMarker = (
      x: number,
      y: number,
      side: "left" | "right",
      color: string,
      label: string
    ) => {
      if (y < 12 || y > h - 12) return;
      const px = side === "left" ? 10 : w - 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (side === "left") {
        ctx.moveTo(px - 5, y);
        ctx.lineTo(px + 5, y - 5);
        ctx.lineTo(px + 5, y + 5);
      } else {
        ctx.moveTo(px + 5, y);
        ctx.lineTo(px - 5, y - 5);
        ctx.lineTo(px - 5, y + 5);
      }
      ctx.closePath();
      ctx.fill();
      ctx.font = "9px ui-monospace, SFMono-Regular, Consolas, monospace";
      ctx.textAlign = side === "left" ? "left" : "right";
      ctx.fillText(label, side === "left" ? px + 10 : px - 10, y);
    };
    if (sunX < 0) edgeMarker(0, sunY, "left", "#f6c453", `SUN ${Math.round(sun.azimuth)}°`);
    if (sunX > w) edgeMarker(0, sunY, "right", "#f6c453", `SUN ${Math.round(sun.azimuth)}°`);
    if (earthX < 0) edgeMarker(0, earthY, "left", "#6fb7ff", `EARTH ${Math.round(earth.azimuth)}°`);
    if (earthX > w) edgeMarker(0, earthY, "right", "#6fb7ff", `EARTH ${Math.round(earth.azimuth)}°`);

    // --- Terrain silhouette ------------------------------------------------
    const sampleTop = (layer: number, x: number) => {
      const az = viewAz + ((x - w / 2) / w) * fov;
      return horizonLayerAt(profile, layer, az);
    };

    const layerColors = [
      "rgba(28,45,60,0.98)",
      "rgba(22,36,49,0.98)",
      "rgba(15,26,37,0.99)",
      "rgba(9,17,26,1)",
    ];

    for (let layer = 3; layer >= 0; layer--) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 2) {
        const el = sampleTop(layer, x);
        ctx.lineTo(x, elToY(el, horizonY, pxPerDeg));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = layerColors[layer];
      ctx.fill();
      ctx.strokeStyle = "rgba(137,174,204,0.09)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Rim light along the true horizon.
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const az = viewAz + ((x - w / 2) / w) * fov;
      const el = horizonAt(profile, az);
      const y = elToY(el, horizonY, pxPerDeg);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = sunVisible
      ? "rgba(246,196,83,0.45)"
      : "rgba(120,160,195,0.22)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Compass labels along the bottom.
    ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let az = 0; az < 360; az += 15) {
      const x = azToX(az, viewAz, fov, w);
      if (x < 12 || x > w - 12) continue;
      const major = az % 90 === 0;
      ctx.strokeStyle = major
        ? "rgba(148,163,184,0.4)"
        : "rgba(148,163,184,0.14)";
      ctx.beginPath();
      ctx.moveTo(x, h - (major ? 12 : 7));
      ctx.lineTo(x, h - 2);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = "rgba(200,214,232,0.8)";
        ctx.fillText(`${az}°`, x, h - 16);
      }
    }

    // Vignette.
    const vg = ctx.createLinearGradient(0, 0, w, 0);
    vg.addColorStop(0, "rgba(2,5,10,0.55)");
    vg.addColorStop(0.08, "rgba(2,5,10,0)");
    vg.addColorStop(0.92, "rgba(2,5,10,0)");
    vg.addColorStop(1, "rgba(2,5,10,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }, [size, viewAz, fov, snap, site.lat, site.lon, profile, sunTrail, earthTrail]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setFov((f) => clamp(f * (e.deltaY > 0 ? 1.12 : 0.89), 24, 170));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const pointToSky = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const az = viewAz + ((x - w / 2) / w) * fov;
    const horizonY = h * 0.79;
    const el = ((horizonY - y) * fov) / w;
    return {
      az: ((az % 360) + 360) % 360,
      el,
    };
  };

  const centerOn = (az: number) => setViewAz(az);

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative h-[350px] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#02050b] sm:h-[430px] xl:h-[470px]"
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          role="img"
          aria-label={`Panoramic horizon at ${site.name}. Sun at ${sunLabel(
            snap
          )}. Earth at ${earthLabel(snap)}.`}
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, az: viewAz };
          }}
          onPointerMove={(e) => {
            if (drag.current) {
              const rect = e.currentTarget.getBoundingClientRect();
              const dx = e.clientX - drag.current.x;
              setViewAz(drag.current.az - (dx / rect.width) * fov);
            }
            const p = pointToSky(e.clientX, e.clientY);
            if (p) setHover(p);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerLeave={() => {
            drag.current = null;
            setHover(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setViewAz((a) => a - fov * 0.08);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              setViewAz((a) => a + fov * 0.08);
            } else if (e.key === "ArrowUp" || e.key === "+" || e.key === "=") {
              e.preventDefault();
              setFov((f) => clamp(f * 0.9, 24, 170));
            } else if (e.key === "ArrowDown" || e.key === "-") {
              e.preventDefault();
              setFov((f) => clamp(f * 1.1, 24, 170));
            } else if (e.key === "Home") {
              e.preventDefault();
              setViewAz(180);
              setFov(100);
            }
          }}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 backdrop-blur-md">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
              Looking
            </div>
            <div className="value text-[11px] text-ink">
              {azimuthLabel(viewAz)} · {Math.round(fov)}° FOV
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-right backdrop-blur-md">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
              {hover ? "Cursor" : "Horizon"}
            </div>
            <div className="value text-[11px] text-ink">
              {hover
                ? `${Math.round(hover.az)}° ${hover.el >= 0 ? "+" : ""}${hover.el.toFixed(
                    1
                  )}°`
                : `0.0° · ${profile.siteElevationM >= 0 ? "+" : ""}${(
                    profile.siteElevationM / 1000
                  ).toFixed(2)} km`}
            </div>
          </div>
        </div>

        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="btn bg-black/40 backdrop-blur-md"
            onClick={() => centerOn(snap.ephem.sun.azimuth)}
            title="Center on the Sun"
          >
            <SunIcon size={13} className="text-amber" />
            Sun
          </button>
          <button
            type="button"
            className="btn bg-black/40 backdrop-blur-md"
            onClick={() => centerOn(snap.ephem.earth.azimuth)}
            title="Center on Earth"
          >
            <EarthIcon size={13} className="text-earth" />
            Earth
          </button>
          <button
            type="button"
            className="btn bg-black/40 backdrop-blur-md"
            onClick={() => {
              setViewAz(180);
              setFov(100);
            }}
            title="Reset view"
          >
            <Crosshair size={13} />
            Reset
          </button>
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-1">
          <button
            type="button"
            className="btn bg-black/40 backdrop-blur-md"
            onClick={() => setFov((f) => clamp(f * 1.12, 24, 170))}
            aria-label="Zoom out"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="btn bg-black/40 backdrop-blur-md"
            onClick={() => setFov((f) => clamp(f * 0.89, 24, 170))}
            aria-label="Zoom in"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            className="btn bg-black/40 backdrop-blur-md"
            onClick={() => setFov(170)}
            aria-label="Show wide panorama"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" /> Sun &amp; 24 h
          trail
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-earth" /> Earth &amp; 24
          h trail
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-sm bg-[#1c2d3c]" /> Terrain
          silhouettes (3 / 10 / 40 / 160 km)
        </span>
        <span className="ml-auto hidden sm:inline">
          Drag to pan · scroll to zoom · arrows to move
        </span>
      </div>
    </div>
  );
}

function sunLabel(snap: Snapshot): string {
  return `${formatDeg(snap.ephem.sun.elevation, 1)} elevation, ${
    snap.sunVisible ? "above" : "below"
  } the local horizon`;
}

function earthLabel(snap: Snapshot): string {
  return `${formatDeg(snap.ephem.earth.elevation, 1)} elevation, ${
    snap.earthVisible ? "above" : "below"
  } the local horizon`;
}
