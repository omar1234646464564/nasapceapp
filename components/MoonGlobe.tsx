import { DEG } from "@/lib/astro";

interface MoonGlobeProps {
  lat: number;
  lon: number;
  size?: number;
  className?: string;
}

/**
 * Small orthographic locator. This is deliberately schematic: it shows
 * where a site sits on the Moon, not real terrain.
 */
export default function MoonGlobe({
  lat,
  lon,
  size = 150,
  className,
}: MoonGlobeProps) {
  const cx = 100;
  const cy = 100;
  const R = 78;
  const lat0 = Math.max(-55, Math.min(55, lat));
  const lon0 = lon;

  const project = (la: number, lo: number) => {
    const phi = la * DEG;
    const lambda = (lo - lon0) * DEG;
    const phi0 = lat0 * DEG;
    const x = Math.cos(phi) * Math.sin(lambda);
    const y =
      Math.cos(phi0) * Math.sin(phi) -
      Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda);
    const z =
      Math.sin(phi0) * Math.sin(phi) +
      Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
    return { x: cx + x * R, y: cy - y * R, z };
  };

  const meridians: string[] = [];
  for (let lo = 0; lo < 360; lo += 30) {
    let d = "";
    let pen = false;
    for (let la = -90; la <= 90; la += 3) {
      const p = project(la, lo);
      if (p.z > 0) {
        d += `${pen ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
        pen = true;
      } else {
        pen = false;
      }
    }
    if (d) meridians.push(d);
  }

  const parallels: string[] = [];
  for (let la = -60; la <= 60; la += 30) {
    let d = "";
    let pen = false;
    for (let lo = 0; lo <= 360; lo += 3) {
      const p = project(la, lo);
      if (p.z > 0) {
        d += `${pen ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
        pen = true;
      } else {
        pen = false;
      }
    }
    if (d) parallels.push(d);
  }

  const site = project(lat, lon);

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Schematic lunar globe with the site at ${Math.abs(
        lat
      ).toFixed(1)} degrees ${lat < 0 ? "south" : "north"}, ${Math.abs(
        ((lon + 180) % 360) - 180
      ).toFixed(1)} degrees ${lon > 180 ? "west" : "east"}.`}
    >
      <defs>
        <radialGradient id="globe-fill" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#2a3647" />
          <stop offset="55%" stopColor="#151f2c" />
          <stop offset="100%" stopColor="#080d14" />
        </radialGradient>
        <clipPath id="globe-clip">
          <circle cx={cx} cy={cy} r={R} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="url(#globe-fill)" />
      <g clipPath="url(#globe-clip)">
        {meridians.map((d, i) => (
          <path
            key={`m${i}`}
            d={d}
            fill="none"
            stroke="rgba(148,163,184,0.16)"
            strokeWidth="0.7"
          />
        ))}
        {parallels.map((d, i) => (
          <path
            key={`p${i}`}
            d={d}
            fill="none"
            stroke="rgba(148,163,184,0.13)"
            strokeWidth="0.7"
          />
        ))}
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke="rgba(148,163,184,0.2)"
          strokeWidth="0.7"
        />
      </g>
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke="rgba(200,214,232,0.28)"
        strokeWidth="1"
      />
      <circle
        cx={site.x}
        cy={site.y}
        r="6.5"
        fill="rgba(246,196,83,0.16)"
        className="animate-soft-pulse"
      />
      <circle cx={site.x} cy={site.y} r="2.6" fill="#f6c453" />
      <circle
        cx={site.x}
        cy={site.y}
        r="2.6"
        fill="none"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="0.6"
      />
      <text
        x={cx}
        y={cy + R + 15}
        textAnchor="middle"
        fill="rgba(143,161,184,0.75)"
        fontSize="8"
        fontFamily="ui-monospace, monospace"
        letterSpacing="1"
      >
        SCHEMATIC LOCATOR
      </text>
    </svg>
  );
}
