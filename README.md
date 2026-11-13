# Lunar Horizon

An interactive lunar south-pole landing-site planner for mission planners, educators, and the public. Pick a site and a date, then read the local Sun and Earth geometry against the real terrain horizon, along with power potential and direct-to-Earth communication windows.

Built for a NASA hackathon. Terrain and astronomy run locally in the browser: no accounts, no server round-trips for the astronomy or terrain. An optional **Luna** mission copilot adds a chat layer; its numbers come from the same local engine, and it can be refined by an LLM through the Vercel AI Gateway when credentials are configured.

## What it does

- **Curated catalog** — 18 sites spanning Artemis III candidates, CLPS/commercial landers, international missions, Apollo legacy sites, and science targets.
- **Custom coordinates** — click anywhere on the south-polar terrain map or type a latitude/longitude.
- **Real terrain** — LOLA polar DEMs drive 0.5° horizon profiles for curated polar sites and live 1 km ray-marched horizons for custom points.
- **Sun and Earth geometry** — local azimuth/elevation, subsolar and sub-Earth points, Earth phase, libration-driven link cycles.
- **Power and comms** — solar elevation, relative power index, sunlight and DTE percentages, longest windows, and next rise/set.
- **Time exploration** — date/time controls, seasonal presets, animation, and a scrubbable timeline from 7 days to 1 year.
- **Comparison** — up to six independent site/date scenarios with cards, a table, a sunlight-vs-DTE scatter plot, and a shareable URL.
- **Luna copilot** — a grounded chat assistant that ranks sites, compares scenarios, finds next rise/set, plans a surface mission by duration and priority, and explains the physics. Every metric is computed by the local LOLA + ephemeris engine before any AI text is generated.
- **Context** — a field guide for newcomers and a methods page documenting data, frames, algorithms, and limits.

## Mission copilot

The floating **Ask Luna** button opens a chat panel on every page. Luna parses the question, resolves sites and dates, runs the same `lib/scenario.ts` computations as the planner, and returns a deterministic answer with links into the planner and compare views. The panel reads the current URL so "this site" or "current scenario" refers to what you are looking at.

Two answer modes:

- **Local engine** (always available) — intent parsing, ranking, comparisons, rise/set, mission planning, and concept explanations run entirely in the browser.
- **AI Gateway** (optional) — when `AI_GATEWAY_API_KEY` (or a Vercel OIDC token) is available, `POST /api/chat` asks an LLM to rephrase the computed context. The system prompt treats the local metrics as authoritative, so the model cannot invent numbers. If the gateway is unavailable, the UI silently keeps the local answer and shows a **Local engine** badge.

Configure the optional AI layer:

```bash
# .env.local (local dev) or the Vercel project environment
AI_GATEWAY_API_KEY=...        # https://vercel.com/dashboard/ai-gateway/api-keys
COPILOT_MODEL=openai/gpt-4o-mini   # optional override
```

`GET /api/chat` reports whether a gateway credential is present. The endpoint validates and limits messages, rate-limits by client IP, and never returns provider error details to the browser.

> AI Gateway requires a payment method on the Vercel team before it serves any
> request, including models marked free. Without credits the endpoint returns
> `gateway_403` and the copilot keeps answering from the local engine, so the
> app never breaks.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Production build:

```bash
npm run build
npm start
```

## Data pipeline

The browser bundles are checked in under `public/data/`.

| File | Description |
| --- | --- |
| `lola_south_pole_1km.bin` | 915 × 915 int16 composite of `LDEM_80S_80M` and `LDEM_75S_240M`, 1 km/pixel, 0.5 m per DN relative to a 1737.4 km sphere. |
| `horizons.json` | 720-azimuth, four-layer horizon profiles for all curated sites, generated from the native-resolution DEMs. |

Regenerate from the source PDS products in `data/`:

```bash
npm run data:dem
npm run data:horizons
```

`data/` is git-ignored because it holds ~140 MB of raw PDS imagery. Download
`LDEM_80S_80M` and `LDEM_75S_240M` from the PDS Geosciences Node and place
them there as `ldem_80s_80m.img` and `ldem_75s_240m.img` before running the
scripts. The browser-ready bundles in `public/data/` are committed, so a clone
runs without the raw sources.

## How it works

- **Ephemeris** — Meeus solar and lunar series, plus the IAU WGCCRE 2009 lunar rotation model (the model behind SPICE `IAU_MOON`). No atmospheric refraction.
- **Frames** — selenographic body-fixed frame with `+x` at (0°E, 0°N), `+y` at (90°E, 0°N), `+z` north; longitude positive east.
- **Horizon** — for each azimuth a ray is marched outward with curvature drop `r²/(2R)`; the maximum terrain elevation angle becomes the horizon. Curated polar sites use precomputed profiles; custom points inside 75°S use the bundled 1 km grid.
- **Visibility** — a body is visible when its center elevation exceeds the interpolated terrain horizon at its azimuth. The Sun's ~0.27° and Earth's ~0.95° angular radii are documented but not modeled as finite disks.
- **Windows** — hourly samples over 30 days with bisection-refined transitions to about one minute. The timeline uses 720 samples across the selected range.

## Limitations

This is a geometric planning and teaching tool, not a flight-dynamics or power/link-budget system. It does not model hardware, array tilt, temperature, dust, storage, antenna pointing, Doppler, plasma effects, landing hazards, or boulder-scale obstructions. Sites outside the polar DEMs (Apollo, Chang'e, Chandrayaan-3, SLIM) use a documented flat-horizon assumption. Do not use the output for flight operations or safety-critical decisions.

See the in-app **Methods** page for provenance, equations, accuracy, and references.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Lucide icons. Terrain and ephemeris computations are custom TypeScript. The only server route is the optional `/api/chat` AI refinement endpoint; the planner and copilot fallback work without it.
