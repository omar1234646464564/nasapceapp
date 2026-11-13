import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Copilot from "@/components/Copilot";

export const metadata: Metadata = {
  metadataBase: new URL("https://lunarhorizon.vercel.app"),
  title: {
    default: "Lunar Horizon · South Pole Landing Site Planner",
    template: "%s · Lunar Horizon",
  },
  description:
    "Compare lunar south-pole landing sites by sunlight, horizon geometry, power potential, and direct-to-Earth communication windows. Real LOLA terrain, local ephemeris, and a grounded mission copilot.",
  applicationName: "Lunar Horizon",
  authors: [{ name: "Lunar Horizon" }],
  keywords: [
    "Moon",
    "lunar south pole",
    "Artemis",
    "landing site",
    "illumination",
    "LOLA",
    "direct-to-Earth",
    "space mission planning",
  ],
  openGraph: {
    title: "Lunar Horizon · South Pole Landing Site Planner",
    description:
      "An interactive mission-planning workbench for lunar south-pole illumination and Earth-link geometry.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#05080d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only sr-only-focusable">
          Skip to main content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
        <Copilot />
      </body>
    </html>
  );
}
