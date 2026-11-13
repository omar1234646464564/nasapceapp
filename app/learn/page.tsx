import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BatteryCharging,
  BookOpen,
  Clock,
  Compass,
  Earth,
  GitCompareArrows,
  Mountain,
  Orbit,
  Radio,
  Snowflake,
  Sun,
  Telescope,
  Zap,
} from "lucide-react";
import { CATEGORY_COLORS, FEATURED_SITES } from "@/lib/sites";
import { formatLat, formatLon } from "@/lib/format";

export const metadata: Metadata = {
  title: "Learn",
  description:
    "A practical primer on lunar south-pole illumination, permanently shadowed regions, Earth visibility, and how to read the Lunar Horizon planner.",
};

const PRIMER = [
  {
    icon: Sun,
    accent: "text-amber",
    title: "The Sun never rises high",
    body: "The Moon's spin axis is tilted only about 1.5° to the ecliptic. Seen from the south pole, the Sun skims the horizon, climbing and falling by roughly ±1.54° over a year. There is no ordinary day: light is a slow, seasonal tide.",
    tag: "±1.54° annual solar elevation",
  },
  {
    icon: Mountain,
    accent: "text-mint",
    title: "Terrain does the shading",
    body: "Because the Sun is so low, a crater rim a few kilometres away can block it entirely. Illumination is decided by local topography — ridges stay lit while adjacent crater floors never see direct Sun. That is why real LOLA terrain matters.",
    tag: "Horizon relief, not latitude, dominates",
  },
  {
    icon: Earth,
    accent: "text-earth",
    title: "Earth nods up and down",
    body: "Lunar libration moves Earth through about ±6.9° in the sky as seen from the pole. Combined with the horizon, that produces roughly two-week on/off direct-to-Earth cycles — even at sites that are otherwise ideal.",
    tag: "±6.9° libration-driven link cycles",
  },
];

const WINDOWS = [
  {
    icon: Zap,
    title: "Sunlight & power",
    text: "Solar arrays need the Sun above the local terrain horizon. Near the pole the elevation is low, so even a clear Sun produces only a fraction of equatorial power. The planner's power index normalises yield to the best-case polar Sun.",
    color: "amber",
  },
  {
    icon: Snowflake,
    title: "Permanently shadowed regions",
    text: "PSRs are terrain that never receives direct sunlight. They are cold traps for water ice and other volatiles — scientifically valuable, but they also define where a lander cannot rely on solar power. Good sites sit on the boundary: light on the rim, ice in the crater.",
    color: "violet",
  },
  {
    icon: Radio,
    title: "Direct-to-Earth link",
    text: "A direct link requires geometric line of sight from the site to Earth. At the south pole Earth hovers near the horizon, so local terrain and libration both matter. A relay can close the gap, but it costs mass, power, and complexity.",
    color: "earth",
  },
];

const GUIDE = [
  {
    step: "01",
    title: "Choose a site",
    text: "Use the catalog, a featured chip, or the map. Clicking the terrain drops a custom pin; coordinates can also be typed directly. Curated polar sites use precomputed LOLA horizons; custom points are ray-marched from the bundled 1 km grid.",
  },
  {
    step: "02",
    title: "Set the date",
    text: "Pick a UTC date and time, jump to a mission-relevant preset, or animate time. The Sun's declination changes slowly, so a day or two rarely transforms a site — but a month can.",
  },
  {
    step: "03",
    title: "Read the horizon",
    text: "The panorama shows the Sun and Earth against the actual terrain silhouette. Layered shading represents horizons at 3, 10, 40, and 160 km. Drag to pan; scroll or use the buttons to change field of view.",
  },
  {
    step: "04",
    title: "Check the windows",
    text: "The power and link cards report current geometry plus the next 30 days. The timeline plots solar and Earth elevation against their horizons; the bands beneath show exactly when each is visible.",
  },
  {
    step: "05",
    title: "Compare the trade",
    text: "Send a scenario to the comparison view. Put a sun-rich ridge next to a link-rich massif and look at the scatter plot: the best mission site is rarely best on every axis.",
  },
];

const NUMBERS = [
  { value: "1.54°", label: "Solar elevation swing at the pole", tone: "text-amber-hot" },
  { value: "6.9°", label: "Sub-Earth latitude range from libration", tone: "text-earth" },
  { value: "27.3 d", label: "Sidereal month · lunar day cycle", tone: "text-ink" },
  { value: "0.27°", label: "Sun's angular radius as seen from the Moon", tone: "text-amber" },
  { value: "0.95°", label: "Earth's angular radius as seen from the Moon", tone: "text-earth" },
  { value: "≈ 1.3 s", label: "One-way light time, Moon to Earth", tone: "text-mint" },
];

const GLOSSARY = [
  {
    term: "Permanently shadowed region (PSR)",
    def: "Terrain that never receives direct solar illumination over the relevant period. Cold enough to trap water ice and other volatiles.",
  },
  {
    term: "Terrain horizon",
    def: "The maximum elevation angle of the surrounding landscape in a given direction, including the curvature of the Moon. A body is visible when its center is above this angle.",
  },
  {
    term: "Sub-solar point",
    def: "The point on the Moon where the Sun is directly overhead. Its latitude equals the solar declination and its longitude drifts about 12.2° per day.",
  },
  {
    term: "Sub-Earth point",
    def: "The point on the Moon where Earth is directly overhead. Its latitude changes with libration, which is why polar Earth visibility is not constant.",
  },
  {
    term: "Libration",
    def: "The apparent wobble of the Moon as seen from Earth, caused by eccentricity, orbital inclination, and the Moon's rotation. It moves Earth by about ±6.9° in lunar latitude.",
  },
  {
    term: "Direct-to-Earth (DTE)",
    def: "A communication link that goes straight between the landed asset and Earth, without a relay orbiter or surface relay.",
  },
  {
    term: "Solar incidence angle",
    def: "The angle between the Sun's rays and the local surface normal. Low incidence angles spread the same sunlight over more ground and reduce array yield.",
  },
  {
    term: "LOLA",
    def: "Lunar Orbiter Laser Altimeter on NASA's Lunar Reconnaissance Orbiter. Its polar digital elevation models underpin the terrain and horizon calculations here.",
  },
];

export default function Page() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      {/* Hero ------------------------------------------------------------- */}
      <section className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-amber">
            <BookOpen size={10} />
            Field guide
          </span>
          <span className="chip">No prior lunar geometry required</span>
        </div>
        <h1 className="mt-3 max-w-4xl text-[clamp(30px,4.4vw,50px)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">
          At the south pole, the horizon is the mission.
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">
          The lunar south pole is not a place where the Sun rises and sets on a
          familiar schedule. It is a landscape of grazing light, deep cold, and
          an Earth that bobs near the skyline. This guide explains the geometry
          behind the planner, then shows how to read it quickly.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" className="btn btn-primary">
            <Compass size={13} />
            Open the planner
            <ArrowRight size={13} />
          </Link>
          <Link href="/compare" className="btn">
            <GitCompareArrows size={13} />
            Compare scenarios
          </Link>
          <Link href="/methods" className="btn">
            <Telescope size={13} />
            Methods &amp; data
          </Link>
        </div>
      </section>

      {/* Primer ----------------------------------------------------------- */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-amber/60" />
          <span className="label text-amber">The short version</span>
        </div>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">
          Three facts explain almost everything
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {PRIMER.map(({ icon: Icon, accent, title, body, tag }) => (
            <article key={title} className="panel p-4">
              <Icon size={20} className={accent} strokeWidth={1.6} />
              <h3 className="mt-3 text-[15px] font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                {body}
              </p>
              <div className="mt-3 border-t border-white/[0.07] pt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-dim">
                {tag}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Windows ---------------------------------------------------------- */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-earth/60" />
          <span className="label text-earth">The three windows</span>
        </div>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">
          What a mission actually has to trade
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {WINDOWS.map(({ icon: Icon, title, text, color }) => {
            const tone =
              color === "amber"
                ? "text-amber border-amber/25 bg-amber/[0.04]"
                : color === "violet"
                  ? "text-violet border-violet/25 bg-violet/[0.04]"
                  : "text-earth border-earth/25 bg-earth/[0.04]";
            return (
              <article key={title} className={`rounded-2xl border p-4 ${tone}`}>
                <Icon size={18} strokeWidth={1.6} />
                <h3 className="mt-2.5 text-[15px] font-semibold text-ink">
                  {title}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  {text}
                </p>
              </article>
            );
          })}
        </div>
        <div className="panel mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 p-3.5 text-[11.5px] text-muted">
          <span className="flex items-center gap-2">
            <BatteryCharging size={14} className="text-amber" />
            Power wants a high, unblocked Sun.
          </span>
          <span className="flex items-center gap-2">
            <Snowflake size={14} className="text-violet" />
            Science wants access to cold traps.
          </span>
          <span className="flex items-center gap-2">
            <Radio size={14} className="text-earth" />
            Operations want a clear Earth line of sight.
          </span>
          <span className="flex items-center gap-2">
            <Clock size={14} className="text-mint" />
            The planner shows how each changes with date.
          </span>
        </div>
      </section>

      {/* Guide ------------------------------------------------------------ */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-mint/60" />
          <span className="label text-mint">How to use it</span>
        </div>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">
          Five steps through the workbench
        </h2>
        <ol className="mt-4 space-y-2.5">
          {GUIDE.map(({ step, title, text }) => (
            <li
              key={step}
              className="panel flex items-start gap-3 p-3.5 sm:gap-4 sm:p-4"
            >
              <span className="value mt-0.5 shrink-0 rounded-lg border border-amber/25 bg-amber/[0.06] px-2 py-1 text-[11px] text-amber-hot">
                {step}
              </span>
              <div>
                <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                  {text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Numbers ---------------------------------------------------------- */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-amber/60" />
          <span className="label text-amber">Orders of magnitude</span>
        </div>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">
          Numbers worth carrying around
        </h2>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {NUMBERS.map((n) => (
            <div
              key={n.label}
              className="panel-flat flex items-baseline gap-3 p-3.5"
            >
              <span className={`value text-[22px] font-semibold ${n.tone}`}>
                {n.value}
              </span>
              <span className="text-[11px] leading-snug text-muted">
                {n.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Site trade-offs -------------------------------------------------- */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-earth/60" />
          <span className="label text-earth">The catalog</span>
        </div>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">
          Four archetypes, not four winners
        </h2>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
          Every site is a different answer to the same question. These are the
          featured sites in the planner; the full catalog also includes CLPS,
          international, Apollo, and science targets.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {FEATURED_SITES.map((site) => (
            <article key={site.id} className="panel p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[site.category] }}
                    />
                    <h3 className="text-[15px] font-semibold text-ink">
                      {site.name}
                    </h3>
                  </div>
                  <div className="mt-0.5 font-mono text-[9.5px] text-dim">
                    {formatLat(site.lat, 3)} · {formatLon(site.lon, 3)} ·{" "}
                    {site.program}
                  </div>
                </div>
                <span className="chip text-[8px]">{site.coverage === "none" ? "flat" : site.coverage}</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {site.note}
              </p>
              <Link
                href={`/?site=${site.id}`}
                className="mt-2.5 inline-flex items-center gap-1 text-[10.5px] text-amber-hot hover:underline"
              >
                Open in planner <ArrowRight size={10} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Glossary --------------------------------------------------------- */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-violet/60" />
          <span className="label text-violet">Reference</span>
        </div>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">
          Glossary
        </h2>
        <div className="panel mt-4 overflow-hidden">
          <dl className="divide-y divide-white/[0.06]">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
                <dt className="text-[12.5px] font-semibold text-ink">
                  {g.term}
                </dt>
                <dd className="text-[12px] leading-relaxed text-muted">
                  {g.def}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA -------------------------------------------------------------- */}
      <section className="mt-10 overflow-hidden rounded-2xl border border-amber/20 bg-gradient-to-br from-amber/[0.07] via-transparent to-earth/[0.06] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <Orbit size={16} className="text-amber" />
              <span className="label text-amber">Try it</span>
            </div>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.025em] text-ink">
              Pick a ridge. Move the date. Watch the trade change.
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Everything runs locally from bundled LOLA terrain and a local
              ephemeris. No account and no waiting on a server. Ask Luna when
              you want the geometry applied to your own mission.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="btn btn-primary">
              <Compass size={13} />
              Start planning
            </Link>
            <Link href="/compare" className="btn">
              <GitCompareArrows size={13} />
              Compare
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
