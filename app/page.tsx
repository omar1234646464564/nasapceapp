import type { Metadata } from "next";
import Planner from "@/components/Planner";

export const metadata: Metadata = {
  title: "Planner",
  description:
    "Pick a lunar south-pole landing site, scrub through dates, and read the local Sun and Earth geometry, terrain horizon, power potential, and direct-to-Earth windows.",
};

export default function Page() {
  return <Planner />;
}
