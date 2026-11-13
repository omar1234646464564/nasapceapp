import type { Metadata } from "next";
import CompareView from "@/components/CompareView";

export const metadata: Metadata = {
  title: "Compare",
  description:
    "Compare up to six lunar south-pole landing sites and dates by sunlight, power potential, terrain horizon, and direct-to-Earth communication windows.",
};

export default function Page() {
  return <CompareView />;
}
