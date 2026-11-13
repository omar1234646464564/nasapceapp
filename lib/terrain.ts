"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemGrid } from "./dem";
import { computeHorizon, sampleDem } from "./dem";
import {
  flatHorizon,
  getStoredHorizon,
  loadHorizonBundle,
  sourceForCoverage,
  type HorizonBundle,
  type HorizonSource,
} from "./horizons";
import type { Site } from "./sites";

let terrainPromise: Promise<DemGrid> | null = null;

/** Load the bundled 1 km south-polar LOLA composite. */
export function loadTerrainGrid(): Promise<DemGrid> {
  if (!terrainPromise) {
    terrainPromise = fetch("/data/lola_south_pole_1km.bin", {
      cache: "force-cache",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Terrain data unavailable (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        const data = new Int16Array(buf);
        let minM = Infinity;
        let maxM = -Infinity;
        for (let i = 0; i < data.length; i++) {
          const v = data[i];
          if (v === -32768) continue;
          if (v < minM) minM = v;
          if (v > maxM) maxM = v;
        }
        return {
          size: 915,
          pixelKm: 1,
          data,
          meta: { minM, maxM },
        } satisfies DemGrid;
      })
      .catch((err) => {
        terrainPromise = null;
        throw err;
      });
  }
  return terrainPromise;
}

export function useHorizonBundle(enabled = true) {
  const [bundle, setBundle] = useState<HorizonBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadHorizonBundle()
      .then((b) => alive && setBundle(b))
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Horizon data failed");
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { bundle, error, loading: enabled && !bundle && !error };
}

export function useTerrainGrid(enabled = true) {
  const [terrain, setTerrain] = useState<DemGrid | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadTerrainGrid()
      .then((t) => alive && setTerrain(t))
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Terrain data failed");
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { terrain, error, loading: enabled && !terrain && !error };
}

export interface SiteHorizon {
  profile: ReturnType<typeof flatHorizon>;
  elevationM: number | null;
  source: HorizonSource;
  complete: boolean;
  loading: boolean;
  error: string | null;
  /** True when the site has no local terrain model and a flat horizon is used. */
  flat: boolean;
}

const HORIZON_STEP_DEG = 0.75;

/**
 * Resolve the best available horizon for a site: precomputed LOLA for
 * curated polar sites, a 1 km ray-march for custom polar coordinates,
 * and a documented flat assumption everywhere else.
 *
 * This is the pure counterpart to `useSiteHorizon`, so the mission
 * copilot can resolve many sites without violating the rules of hooks.
 */
export function resolveSiteHorizon(
  site: Site,
  bundle: HorizonBundle | null,
  terrain: DemGrid | null,
  bundleLoading: boolean,
  bundleError: string | null
): SiteHorizon {
  const isCustom = site.category === "Custom";

  if (isCustom) {
    if (!terrain) {
      return {
        profile: flatHorizon(HORIZON_STEP_DEG),
        elevationM: null,
        source: "Flat assumption",
        complete: false,
        loading: true,
        error: null,
        flat: true,
      };
    }
    const sampled = sampleDem(terrain, site.lat, site.lon);
    if (sampled === null) {
      return {
        profile: flatHorizon(HORIZON_STEP_DEG),
        elevationM: null,
        source: "Flat assumption",
        complete: false,
        loading: false,
        error: null,
        flat: true,
      };
    }
    const profile = computeHorizon(terrain, site.lat, site.lon, {
      stepDeg: HORIZON_STEP_DEG,
      maxDistanceKm: 160,
      minStepM: 1000,
    });
    return {
      profile,
      elevationM: profile.siteElevationM,
      source: "LOLA 1 km",
      complete: profile.complete,
      loading: false,
      error: null,
      flat: false,
    };
  }

  if (bundle) {
    const profile = getStoredHorizon(bundle, site.id);
    if (profile) {
      const stored = bundle.sites[site.id];
      return {
        profile,
        elevationM: stored.coverage === "none" ? null : profile.siteElevationM,
        source: sourceForCoverage(stored.coverage),
        complete: profile.complete,
        loading: false,
        error: null,
        flat: stored.coverage === "none",
      };
    }
  }

  return {
    profile: flatHorizon(),
    elevationM: null,
    source: "Flat assumption",
    complete: false,
    loading: bundleLoading,
    error: bundleError,
    flat: true,
  };
}

export function useSiteHorizon(
  site: Site,
  bundle: HorizonBundle | null,
  terrain: DemGrid | null,
  bundleLoading: boolean,
  bundleError: string | null
): SiteHorizon {
  return useMemo(
    () => resolveSiteHorizon(site, bundle, terrain, bundleLoading, bundleError),
    [site, bundle, terrain, bundleLoading, bundleError]
  );
}
