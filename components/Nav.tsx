"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, GitCompareArrows, GraduationCap, ScanLine } from "lucide-react";

const LINKS = [
  { href: "/", label: "Planner", icon: Compass },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/methods", label: "Methods", icon: ScanLine },
];

function Mark() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle
        cx="16"
        cy="16"
        r="11.5"
        stroke="#f6c453"
        strokeWidth="1.4"
        strokeOpacity="0.85"
      />
      <path
        d="M2.5 21.5c3.2-2.1 6.4-3.1 9.6-3.1 3.6 0 6.9 1.2 9.8 3.6 2.3-1.7 4.8-2.5 7.6-2.5"
        stroke="#6fb7ff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
      <circle cx="23.2" cy="10.6" r="2.1" fill="#6fb7ff" />
      <circle cx="12.4" cy="12.6" r="1.15" fill="#f6c453" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#05080d]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-lg py-1 pr-2"
        >
          <span className="relative">
            <span className="absolute inset-0 rounded-full bg-amber/20 blur-lg opacity-0 transition group-hover:opacity-100" />
            <Mark />
          </span>
          <span className="leading-none">
            <span className="block text-[15px] font-semibold tracking-[0.14em] text-ink">
              LUNAR<span className="text-amber">HORIZON</span>
            </span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.22em] text-dim">
              South pole site planner
            </span>
          </span>
        </Link>

        <nav
          className="ml-auto flex items-center gap-0.5 overflow-x-auto sm:gap-1"
          aria-label="Primary"
        >
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition sm:px-3 ${
                  active
                    ? "text-ink"
                    : "text-muted hover:bg-white/[0.04] hover:text-ink"
                }`}
              >
                <Icon
                  size={14}
                  className={active ? "text-amber" : "text-dim"}
                  strokeWidth={1.8}
                />
                <span>{label}</span>
                {active && (
                  <span className="absolute inset-x-2.5 -bottom-[13px] h-px bg-amber/80 sm:inset-x-3" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-2 hidden items-center gap-2 lg:flex">
          <span className="chip">
            <span className="h-1.5 w-1.5 rounded-full bg-mint animate-soft-pulse" />
            Local ephemeris
          </span>
        </div>
      </div>
    </header>
  );
}
