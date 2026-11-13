import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-white/[0.07]">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            Lunar Horizon
          </div>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">
            A hackathon workbench for comparing lunar south-pole landing sites.
            Terrain from LRO LOLA, local Sun/Earth geometry from a bundled IAU
            ephemeris model, and a grounded mission copilot. The geometry runs
            in your browser; the optional AI layer only rephrases it.
          </p>
          <p className="mt-3 max-w-md text-[11px] leading-relaxed text-dim">
            Not for flight operations. Illumination and link results are
            geometric estimates for exploration and education.
          </p>
        </div>

        <div>
          <div className="label">Explore</div>
          <ul className="mt-3 space-y-2 text-[13px] text-muted">
            <li>
              <Link className="hover:text-ink" href="/">
                Landing site planner
              </Link>
            </li>
            <li>
              <Link className="hover:text-ink" href="/compare">
                Site comparison
              </Link>
            </li>
            <li>
              <Link className="hover:text-ink" href="/learn">
                Lunar south pole primer
              </Link>
            </li>
            <li>
              <Link className="hover:text-ink" href="/methods">
                Methods &amp; data provenance
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <div className="label">Data</div>
          <ul className="mt-3 space-y-2 text-[13px] text-muted">
            <li>LRO LOLA LDEM_80S_80M</li>
            <li>LRO LOLA LDEM_75S_240M</li>
            <li>IAU WGCCRE 2009 lunar orientation</li>
            <li>Meeus solar &amp; lunar ephemerides</li>
          </ul>
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
            Built for the NASA hackathon · 2026
          </div>
        </div>
      </div>
    </footer>
  );
}
