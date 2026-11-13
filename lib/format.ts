/** Shared formatting helpers. All displayed times are UTC unless stated. */

const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function formatDeg(value: number, digits = 1, signed = true): string {
  const s = value.toFixed(digits);
  if (!signed) return `${s}°`;
  return `${value > 0 ? "+" : ""}${s}°`;
}

export function formatLat(lat: number, digits = 3): string {
  const dir = lat < 0 ? "S" : "N";
  return `${Math.abs(lat).toFixed(digits)}° ${dir}`;
}

export function formatLon(lon: number, digits = 3): string {
  const l = ((lon % 360) + 360) % 360;
  const dir = l > 180 ? "W" : "E";
  const v = l > 180 ? 360 - l : l;
  return `${v.toFixed(digits)}° ${dir}`;
}

export function formatUTC(
  when: Date,
  opts: { seconds?: boolean; withDate?: boolean } = {}
): string {
  const { seconds = false, withDate = true } = opts;
  const y = withDate
    ? `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(
        when.getUTCDate()
      )} `
    : "";
  const t = `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}${
    seconds ? `:${pad(when.getUTCSeconds())}` : ""
  }`;
  return `${y}${t} UTC`;
}

export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateCompact(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function formatTimeUTC(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatDurationHours(hours: number, compact = false): string {
  if (!Number.isFinite(hours)) return "—";
  const sign = hours < 0 ? "−" : "";
  const h = Math.abs(hours);
  if (h < 1 / 60) return "now";
  if (h < 1) return `${sign}${Math.max(1, Math.round(h * 60))}${compact ? "m" : " min"}`;
  if (h < 48) {
    const whole = Math.floor(h);
    const mins = Math.round((h - whole) * 60);
    if (compact) return `${sign}${whole}h${mins ? ` ${mins}m` : ""}`;
    return `${sign}${whole} h${mins ? ` ${mins} m` : ""}`;
  }
  const days = Math.floor(h / 24);
  const rem = Math.round(h - days * 24);
  if (compact) return `${sign}${days}d${rem ? ` ${rem}h` : ""}`;
  return `${sign}${days} d${rem ? ` ${rem} h` : ""}`;
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatKm(km: number): string {
  if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(2)} million km`;
  if (km >= 1000) return `${(km / 1000).toFixed(1)} thousand km`;
  return `${Math.round(km)} km`;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isoDateTime(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/** Parse a UTC "YYYY-MM-DD" + hours-of-day into a Date. */
export function utcDateWithHours(dateStr: string, hours: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return new Date(base + hours * 3_600_000);
}

export function hoursOfDayUTC(date: Date): number {
  return (
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3_600_000
  );
}

/** Compass point name for an azimuth. */
export function compassPoint(az: number): string {
  const names = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const i = Math.round((((az % 360) + 360) % 360) / 22.5) % 16;
  return names[i];
}

export function azimuthLabel(az: number): string {
  const a = ((az % 360) + 360) % 360;
  return `${a.toFixed(0).padStart(3, "0")}° ${compassPoint(a)}`;
}
