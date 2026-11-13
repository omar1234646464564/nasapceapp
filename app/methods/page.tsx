import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Compass,
  Database,
  GitCompareArrows,
  Info,
  Layers,
  Radio,
  ScanLine,
  Sun,
  Telescope,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Methods",
  description:
    "Data provenance, coordinate frames, ephemeris models, terrain horizon algorithms, visibility criteria, and limitations behind Lunar Horizon, including how the Luna copilot stays grounded.",
};

const PIPELINE = [
  {
    icon: Database,
    title: "LOLA terrain",
    text: "Polar stereographic elevation grids from LRO's Lunar Orbiter Laser Altimeter, resampled to a 1 km browser bundle and precomputed 0.5° horizons for curated sites.",
  },
  {
    icon: Telescope,
    title: "Local ephemeris",
    text: "Meeus solar and lunar series plus the IAU WGCCRE 2009 lunar rotation model produce Sun and Earth vectors in the Moon-fixed frame at each instant.",
  },
  {
    icon: Layers,
    title: "Horizon intersection",
    text: "Each body's azimuth selects a terrain horizon elevation. Visibility is a geometric comparison of body center elevation against that horizon.",
  },
  {
    icon: Zap,
    title: "Power & link metrics",
    text: "Solar geometry becomes a relative power index. Earth geometry becomes a direct-to-Earth window. Both are summarised over the following 30 days.",
  },
];

const REFERENCES = [
  {
    label: "Meeus, J. (1998). Astronomical Algorithms, 2nd ed.",
    note: "Solar coordinates (ch. 25) and the lunar periodic series (ch. 47).",
  },
  {
    label: "Archinal, B. A. et al. (2011). Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2009.",
    note: "Lunar rotation model and body-fixed frame definition.",
    href: "https://doi.org/10.1007/s10569-010-9320-4",
  },
  {
    label: "Smith, D. E. et al. (2010). The Lunar Orbiter Laser Altimeter investigation on the Lunar Reconnaissance Orbiter mission.",
    note: "LOLA instrument and polar topographic products.",
    href: "https://doi.org/10.1029/2009GL040674",
  },
  {
    label: "PDS Geosciences Node. LRO-L-LOLA-4-GDR-V1.0.",
    note: "LDEM_80S_80M and LDEM_75S_240M digital elevation models.",
    href: "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
  },
  {
    label: "NASA (2022). Artemis III candidate landing regions.",
    note: "Context for the Artemis III site names and general regions.",
    href: "https://www.nasa.gov/artemis-iii-candidate-landing-regions/",
  },
  {
    label: "Colaprete, A. et al. (2010). Detection of water in the LCROSS ejecta plume.",
    note: "Context for Cabeus and permanently shadowed regions.",
    href: "https://doi.org/10.1126/science.1186986",
  },
];

export default function Page() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <section className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-amber">
            <ScanLine size={10} />
            Methods
          </span>
          <span className="chip">Local engine · optional AI Gateway</span>
        </div>
        <h1 className="mt-3 max-w-4xl text-[clamp(30px,4.4vw,50px)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">
          How the numbers are made.
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">
          Lunar Horizon is a geometric planning tool, not a flight dynamics
          system. This page documents the data, frames, algorithms, and
          heuristics so the results can be interpreted honestly — and reproduced.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" className="btn btn-primary">
            <Compass size={13} />
            Open the planner
            <ArrowRight size={13} />
          </Link>
          <Link href="/compare" className="btn">
            <GitCompareArrows size={13} />
            Compare
          </Link>
        </div>
      </section>

      {/* Pipeline --------------------------------------------------------- */}
      <section className="mt-9">
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE.map(({ icon: Icon, title, text }, i) => (
            <article key={title} className="panel relative p-4">
              <div className="flex items-center justify-between">
                <Icon size={18} className="text-amber" strokeWidth={1.6} />
                <span className="value text-[10px] text-dim">
                  0{i + 1}
                </span>
              </div>
              <h2 className="mt-2.5 text-[13.5px] font-semibold text-ink">
                {title}
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Copilot ---------------------------------------------------------- */}
      <section className="mt-9 overflow-hidden rounded-2xl border border-earth/20 bg-gradient-to-br from-earth/[0.06] via-transparent to-amber/[0.05] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Radio size={15} className="text-earth" />
          <span className="label text-earth">Luna copilot</span>
        </div>
        <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] text-ink">
          The chat layer rephrases; the local engine computes.
        </h2>
        <div className="mt-2 grid gap-4 text-[12px] leading-relaxed text-muted md:grid-cols-2">
          <p>
            Every copilot question is first parsed and answered by the same
            TypeScript modules that drive the planner: site aliases resolve to
            catalog entries, dates resolve to UTC instants, and rankings,
            comparisons, rise/set searches, and mission scans call
            <code className="mx-1 rounded bg-white/[0.06] px-1 py-px font-mono text-[11px] text-ink">
              lib/scenario.ts
            </code>
            against the bundled LOLA horizons.
          </p>
          <p>
            When an AI Gateway credential is present, <code className="rounded bg-white/[0.06] px-1 py-px font-mono text-[11px] text-ink">POST /api/chat</code> sends the computed
            context to an LLM with instructions to use those numbers exactly.
            If the gateway is missing or errors, the deterministic local answer
            is shown unchanged and the badge reads <strong className="text-ink">Local engine</strong>.
            The model has no tools and cannot alter the terrain or ephemeris
            results.
          </p>
        </div>
      </section>

      <div className="prose-lunar mt-10 max-w-none">
        {/* Data ----------------------------------------------------------- */}
        <section>
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-amber/60" />
            <span className="label text-amber">Data provenance</span>
          </div>
          <h2 className="!mt-2">Terrain</h2>
          <p>
            Elevations come from NASA's Lunar Reconnaissance Orbiter Laser
            Altimeter (LOLA). Two PDS products are used:{" "}
            <code>LDEM_80S_80M</code> (80 m/pixel, 80°S–90°S) and{" "}
            <code>LDEM_75S_240M</code> (240 m/pixel, 75°S–90°S). Both are
            south-polar stereographic grids of signed 16-bit integers; the
            height scale is 0.5 m per DN relative to a 1737.4 km reference
            sphere.
          </p>
          <p>
            A build script composites the two products into a 915 × 915, 1 km
            grid and writes it to <code>public/data/lola_south_pole_1km.bin</code>{" "}
            (about 1.7 MB). The 80 m product is used inside 80°S, the 240 m
            product outside it, with a short blend across the boundary. The
            same script precomputes 720-azimuth horizon profiles for all
            curated sites, using the native-resolution DEMs rather than the
            browser grid. That bundle is about 170 KB.
          </p>
          <div className="not-prose mt-3 grid gap-2 sm:grid-cols-3">
            <Fact label="Reference sphere" value="1737.4 km" />
            <Fact label="Height scale" value="0.5 m / DN" />
            <Fact label="Projection" value="Polar stereographic" />
          </div>
        </section>

        {/* Frames --------------------------------------------------------- */}
        <section>
          <div className="mt-9 flex items-center gap-2">
            <span className="h-px w-6 bg-earth/60" />
            <span className="label text-earth">Frames &amp; geometry</span>
          </div>
          <h2 className="!mt-2">Coordinate conventions</h2>
          <p>
            The selenographic body-fixed frame is right-handed: <code>+x</code>{" "}
            points at (0°E, 0°N), <code>+y</code> at (90°E, 0°N), and{" "}
            <code>+z</code> at the north pole. Longitude is positive east. A
            site's local horizontal frame is built from its latitude and
            longitude, with azimuth measured clockwise from north and elevation
            from the local horizontal plane.
          </p>
          <p>
            In the south-polar DEM, 0°E is at the top of the image and east is
            to the right. Pixel coordinates follow the PDS stereographic
            convention: <code>row = center − r·cos(lon)/pixel</code>,{" "}
            <code>col = center + r·sin(lon)/pixel</code>, where{" "}
            <code>r = 2R·tan((90° + lat)/2)</code>. Getting this orientation
            wrong mirrors every horizon, so it is covered by the repository's
            orientation checks.
          </p>
          <h3>Sun and Earth ephemerides</h3>
          <p>
            Solar coordinates use Meeus' low-precision solar theory (about
            0.01° accuracy). The Moon's geocentric position uses Meeus' 60-term
            longitude/radius and latitude series (about 10 arcseconds). The
            Moon's orientation uses the IAU WGCCRE 2009 rotation model — the
            same model behind SPICE's <code>IAU_MOON</code> frame — including
            its periodic terms. The Sun and Earth vectors are then rotated into
            the Moon-fixed frame, converted to local azimuth/elevation, and
            reduced to sub-points.
          </p>
          <p>
            Because there is no atmosphere, no refraction correction is applied.
            Topocentric parallax from the site's height above the reference
            sphere is included in the local geometry. Earth's phase is computed
            from the Sun–Earth–Moon geometry and is shown on the Earth disk.
          </p>
          <div className="not-prose mt-3 grid gap-2 sm:grid-cols-2">
            <Fact label="Solar accuracy" value="≈ 0.01°" />
            <Fact label="Lunar position accuracy" value="≈ 10 arcsec" />
            <Fact label="Orientation model" value="IAU WGCCRE 2009" />
            <Fact label="Atmospheric refraction" value="None (vacuum)" />
          </div>
        </section>

        {/* Horizon -------------------------------------------------------- */}
        <section>
          <div className="mt-9 flex items-center gap-2">
            <span className="h-px w-6 bg-mint/60" />
            <span className="label text-mint">Terrain horizon</span>
          </div>
          <h2 className="!mt-2">Ray-marching the skyline</h2>
          <p>
            For each azimuth, a ray is marched outward from the site in
            progressively coarser steps: 80 m near the site, then 200 m, 500 m,
            1 km, and 2 km out to 160 km. At every sample the elevation angle of
            the terrain is:
          </p>
          <pre className="not-prose overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11.5px] text-muted">
{`el = atan2( h(sample) − h(site) − r²/(2R), r )`}
          </pre>
          <p>
            The <code>r²/(2R)</code> term is the curvature drop of the Moon. The
            maximum angle along the ray becomes the horizon for that azimuth.
            Profiles are stored at 0.5° spacing and linearly interpolated. The
            panorama also renders layered horizons at 3, 10, 40, and 160 km so
            near-field relief can be distinguished from distant massifs.
          </p>
          <p>
            Curated polar sites use precomputed horizons from the native 80 m or
            240 m products. Custom points inside 75°S are ray-marched live from
            the 1 km browser grid, which is faster but smoother. Sites outside
            the polar DEMs — Apollo, Chang'e, Chandrayaan-3, SLIM — use a
            documented flat-horizon assumption. Their Sun and Earth elevations
            are still computed correctly; only the terrain obstruction is
            missing.
          </p>
        </section>

        {/* Visibility ----------------------------------------------------- */}
        <section>
          <div className="mt-9 flex items-center gap-2">
            <span className="h-px w-6 bg-amber/60" />
            <span className="label text-amber">Criteria &amp; metrics</span>
          </div>
          <h2 className="!mt-2">Visibility</h2>
          <p>
            A body is counted visible when the elevation of its{" "}
            <strong>center</strong> exceeds the interpolated terrain horizon at
            its azimuth. This is a deliberate simplification: the Sun's angular
            radius is about 0.27° and Earth's is about 0.95°, so a body can be
            partly visible when its center is below the horizon. The tool does
            not model limb geometry, finite disk overlap, or partial obscuration.
          </p>
          <p>
            Sunlight and direct-to-Earth percentages are sampled hourly over the
            30 days following the selected time. Transitions are refined by
            bisection to roughly one-minute resolution. The timeline uses 720
            samples across the chosen range (7 days to 1 year), which is dense
            enough to show the shape of the cycles without making scrubbing
            sluggish.
          </p>

          <h3>Power index</h3>
          <p>
            The power index is{" "}
            <code>100 × sin(solar elevation) / sin(1.543°)</code>, clipped to
            0–100 and set to zero when the Sun is below the horizon. It
            represents the relative yield of an ideal horizontal array
            normalised to the best-case solar elevation at the south pole. It is
            a comparison heuristic — not an electrical model. It ignores array
            tilt, temperature, dust, storage, eclipse history, and lander
            shading.
          </p>

          <h3>Direct-to-Earth</h3>
          <p>
            DTE is geometric line of sight to Earth's center above the terrain
            horizon. The tool does not compute link budget, frequency, antenna
            pointing, Doppler, plasma effects, or relay scheduling. A closed
            window means the geometry is open; it does not guarantee a usable
            link. The Sun–Earth angular separation is shown separately as a
            coarse interference indicator.
          </p>

          <div className="not-prose mt-3 grid gap-2 sm:grid-cols-2">
            <Fact label="Sun angular radius" value="≈ 0.27°" icon={<Sun size={12} />} />
            <Fact label="Earth angular radius" value="≈ 0.95°" icon={<Radio size={12} />} />
            <Fact label="Window sampling" value="1 hour" />
            <Fact label="Transition refinement" value="≈ 1 minute" />
          </div>
        </section>

        {/* Accuracy ------------------------------------------------------- */}
        <section>
          <div className="mt-9 flex items-center gap-2">
            <span className="h-px w-6 bg-rose/60" />
            <span className="label text-rose">Accuracy &amp; limits</span>
          </div>
          <h2 className="!mt-2">What to trust, and what not to</h2>
          <div className="not-prose space-y-2.5">
            {[
              {
                title: "Good for",
                tone: "border-mint/25 bg-mint/[0.04] text-mint",
                items: [
                  "Relative site comparison at the same date",
                  "Recognising illumination and link cycles",
                  "Teaching the geometry of polar illumination",
                  "First-order mission architecture trades",
                ],
              },
              {
                title: "Not for",
                tone: "border-rose/25 bg-rose/[0.04] text-rose",
                items: [
                  "Flight operations or navigation",
                  "Power budgeting for real hardware",
                  "Link budget or antenna pointing",
                  "Landing hazard or slope assessment",
                ],
              },
            ].map((block) => (
              <div
                key={block.title}
                className={`rounded-xl border p-3.5 ${block.tone}`}
              >
                <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <Info size={12} />
                  {block.title}
                </div>
                <ul className="mt-1.5 grid gap-1 text-[11.5px] text-muted sm:grid-cols-2">
                  {block.items.map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3">
            The dominant uncertainty for polar sites is the terrain model and
            the horizon search distance, not the ephemeris. A 1 km grid smooths
            small ridges that can matter at grazing Sun angles. Curated sites
            use higher-resolution precomputed profiles, but even 80 m data
            cannot resolve every boulder or lander-scale obstruction. Sites
            outside the polar DEMs are explicitly flagged as flat-horizon
            approximations.
          </p>
          <p>
            Treat the numbers as a consistent, transparent geometric baseline:
            excellent for ranking and intuition, insufficient for certification.
          </p>
        </section>

        {/* References ----------------------------------------------------- */}
        <section>
          <div className="mt-9 flex items-center gap-2">
            <span className="h-px w-6 bg-violet/60" />
            <span className="label text-violet">References</span>
          </div>
          <h2 className="!mt-2">Sources</h2>
          <ul className="not-prose mt-3 space-y-2">
            {REFERENCES.map((ref) => (
              <li
                key={ref.label}
                className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5"
              >
                <div className="text-[12px] leading-snug text-ink">
                  {ref.href ? (
                    <a
                      href={ref.href}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-amber-hot"
                    >
                      {ref.label}
                    </a>
                  ) : (
                    ref.label
                  )}
                </div>
                <div className="mt-0.5 text-[10.5px] text-dim">{ref.note}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-9 flex items-start gap-3 rounded-xl border border-amber/20 bg-amber/[0.04] p-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber" />
        <p className="text-[11.5px] leading-relaxed text-muted">
          <strong className="text-amber-hot">Disclaimer.</strong> Lunar Horizon
          is a hackathon prototype for exploration and education. It is not
          affiliated with or endorsed by NASA. Do not use its output for flight
          operations, hardware sizing, or safety-critical decisions.
        </p>
      </section>
    </div>
  );
}

function Fact({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-dim">
        {icon}
        {label}
      </div>
      <div className="value mt-1 text-[12px] text-ink">{value}</div>
    </div>
  );
}
