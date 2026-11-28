# VayuShield AI architecture

**Live Deployment:** [https://vayushield-ai-rose.vercel.app/](https://vayushield-ai-rose.vercel.app/)

VayuShield AI uses React 19, Vite, TypeScript, and Tailwind CSS for the frontend, wrapped in a top-level [`ErrorBoundary`](../src/components/ErrorBoundary.tsx). Vercel Node 22 ESM Functions serve the API routes under [`api/`](../api/).

---

## 1. System Architecture

```text
Browser (React 19 + Vite + TypeScript + Tailwind CSS, wrapped in ErrorBoundary)
  ├── AppHeader & LocationBar (Open-Meteo Geocoding via /api/air-quality?q=... or presets + geolocation)
  ├── AqiHero (CPCB NAQI SVG radial gauge 0–500, 6 bands, dominant pollutant, Family Alert, sensor disclosure)
  ├── CleanAirWindowCard (24-hour NAQI bar chart -> lowest and highest two-hour averages)
  └── WorkspaceTabs (roving-tabindex ARIA tablist switching between 3 tools)
        ├── RoutinePlanner (Calls POST /api/assistant -> structured JSON routine + indoor hacks + swaps)
        ├── ChoiceImpactSimulator -> ChoiceImpactCards & RoomCleanCurve (ACH physics SVG)
        └── PlaybookSearch (Keyword + optional lazy-loaded @huggingface/transformers WASM embeddings)
          │
          ▼ HTTPS (Same-origin, zero CORS issues on Vercel)
Vercel Serverless Functions (/api/*)
  ├── GET  /api/air-quality?lat=&lon=&city= | ?q=
  │     ├── Bounded IP rate limit (60 req / 5 min) + strict Zod bounds & upstream validation (upstream.ts)
  │     ├── Open-Meteo Air Quality & Geocoding API (hourly PM2.5, PM10, NO2, SO2, O3, CO; timezone=auto)
  │     ├── Optional OpenAQ v3 /locations provenance overlay (if OPENAQ_API_KEY env var is present)
  │     └── BoundedTtlCache (max 500 entries; expires after 15 minutes or first forecast hour)
  ├── GET  /api/health (service status and boolean provider configuration flags, no-store)
  └── POST /api/assistant
        ├── 16 KB pre-parse body cap (413) + bounded IP rate limiter (20 req / 5 min, 429 + Retry-After)
        ├── Strict Zod request validation + prompt sanitization across all user/profile/choice fields
        ├── Failover Chain (promptBuilder.ts + providerAdapters.ts -> providers.ts):
        │     1. Gemini 2.5 Flash -> 2.0 Flash -> 2.5 Flash-Lite (GEMINI_API_KEY)
        │     2. Hugging Face Inference Providers router.huggingface.co/v1 (HF_TOKEN)
        │     3. Groq OpenAI-compatible API (GROQ_API_KEY)
        │     4. Built-in deterministic routine generator
        └── Zod output validation -> strict typed JSON response
```

---

## 2. Deterministic Scientific Engine (`src/engine/`)

### 2.1 India CPCB National AQI (`src/engine/cpcbAqi.ts`)

Implements the official CPCB NAQI 6-band scale (0–500) using linear interpolation:

$$I_p = \frac{I_{hi} - I_{lo}}{BP_{hi} - BP_{lo}} \cdot (C_p - BP_{lo}) + I_{lo}$$

Overall NAQI = $\max(I_p)$ across available pollutants, clamped to `[0, 500]`, rounded to nearest integer.

**Exact Breakpoint Table (Continuous Upper-Bound Intervals to Prevent Decimal Gaps)**:

| Band         | AQI (`I_lo–I_hi`) | PM2.5 (`µg/m³`) | PM10 (`µg/m³`) | NO₂ (`µg/m³`) | SO₂ (`µg/m³`) | O₃ (`µg/m³`) | CO (`mg/m³`) |
| :----------- | :---------------- | :-------------- | :------------- | :------------ | :------------ | :----------- | :----------- |
| Good         | 0–50              | 0–30            | 0–50           | 0–40          | 0–40          | 0–50         | 0–1.0        |
| Satisfactory | 51–100            | 30–60           | 50–100         | 40–80         | 40–80         | 50–100       | 1.0–2.0      |
| Moderate     | 101–200           | 60–90           | 100–250        | 80–180        | 80–380        | 100–168      | 2.0–10.0     |
| Poor         | 201–300           | 90–120          | 250–350        | 180–280       | 380–800       | 168–208      | 10.0–17.0    |
| Very Poor    | 301–400           | 120–250         | 350–430        | 280–400       | 800–1600      | 208–748      | 17.0–34.0    |
| Severe       | 401–500           | 250–500+        | 430–600+       | 400–600+      | 1600–2400+    | 748–1000+    | 34.0–50.0+   |

**Critical Unit Conversion Rule**:

- Open-Meteo returns `carbon_monoxide` in **`µg/m³`**.
- CPCB CO breakpoints are in **`mg/m³`**.
- `calculateCpcbAqi` divides raw `coUgM3` by `1000` before interpolation.

### 2.2 24-Hour Clean-Air Window Finder (`src/engine/cleanAirWindow.ts` & `src/engine/openMeteoForecast.ts`)

- Inputs: the next 24 hourly forecast entries (`{ time, pm25, pm10, aqi }`) strictly after the current instant, formatted in the city’s timezone (`timezone=auto`).
- Ranks consecutive pairs by average overall NAQI, breaking ties by average PM2.5.
- Outputs `bestWindow`, `worstWindow`, and `exposureSavingsPct` (clamped to `0` when the cleanest NAQI window has equal or greater PM2.5).

### 2.3 Choice-Impact Simulator (`src/engine/impactCalculator.ts`)

Pure deterministic model translating household choices into verifiable daily/annual impact:

- **Commute Swap** (round-trip `commuteKm` per day, 240 commute days/yr):
  - Emission factors (kg CO₂ / km): `solo_car = 0.192`, `scooter = 0.084`, `bus = 0.068`, `metro = 0.028`, `cycle_walk = 0.000`, `wfh = 0.000`.
  - Daily CO₂ saved = `max(0, (baselineFactor - chosenFactor) * commuteKm)`, Annual CO₂ saved = `dailyCo2SavedKg * 240`.
- **Indoor & Personal Exposure Reduction** (multiplicative residual model, capped at 92%):
  - `hepaOrCorsiRosenthal` (`55%`), `cleanCookingExhaust` (`35%` + `85 kg CO₂/yr`), `smartVentilation` (`20%`), `n95OutdoorMask` (`20%` daily weighted), `zeroSmokeIndoor` (`15%`), commute swap (`8%` when annual commute CO₂ > 0).
  - **Community Scale Multiplier** (`calculateCommunityImpact`): scales single-household `annualCo2SavedKg` across `1–200` households into tonnes/yr and mature-tree equivalents (`21 kg CO₂/tree/yr`).

### 2.4 Bedroom Time-to-Clean ACH Physics Simulator (`src/engine/roomCleanPhysics.ts`)

Pure deterministic single-zone exponential decay model estimating how long indoor PM2.5 takes to reach India's CPCB **Good** ceiling (`30 µg/m³`):

- **Decay Model**: $C(t) = C_{eq} + (C_0 - C_{eq}) \cdot e^{-\text{ACH} \cdot (t / 60)}$, sampled every 10 minutes from `t = 0` to `120` min (`13` points), with $C_0 = \max(5, 0.78 \cdot \text{ambientPm25})$.
- **Room Presets (9 ft ceiling)**: `small_bedroom` (`1,080 cu ft` / `30.6 m³`), `master_bedroom` (`1,800 cu ft` / `51.0 m³`), `living_room` (`2,880 cu ft` / `81.6 m³`).
- **Filtration Presets**: `sealed_only` (`CADR = 0 m³/h`), `corsi_rosenthal` (`CADR = 340 m³/h`), `true_hepa` (`CADR = 260 m³/h`), where $\text{totalAch} = \max(0.5, \text{CADR} / V + 0.4)$ and $C_{eq} = \max(4, \text{ambientPm25} \cdot \text{equilibriumFactor})$.

---

## 3. API Contracts & Security (`api/`)

### 3.1 `GET /api/air-quality`

- Query params validated via Zod (`AirQualityQuerySchema`): either `q` (`2..80` chars) for geocoding OR `lat` (`-90..90`) & `lon` (`-180..180`) + optional location metadata.
- Upstream Open-Meteo & OpenAQ payloads validated via Zod (`OpenMeteoAirDataSchema`, `OpenMeteoGeoResponseSchema`, `OpenAqLocationsResponseSchema`).
- Security: Rejects non-GET (`405`, `Allow: GET`), bounded IP rate limiting (`60` req / `5 min` → `429`), sets `X-Content-Type-Options: nosniff`, and caches telemetry in a 500-entry `BoundedTtlCache` expiring after 15 minutes or when the first forecast hour begins.

### 3.2 `POST /api/assistant`

- Enforces `MAX_ASSISTANT_BODY_BYTES = 16 KB` (`413 Payload Too Large`) before `JSON.parse`, prefers trusted platform IP headers (`x-vercel-forwarded-for`, `x-real-ip`) before `x-forwarded-for`, enforces bounded IP rate limiting (`20` req / `5 min` → `429` with `Retry-After`), validates inputs via `AssistantRequestSchema`, and sanitizes all user, profile, and choice strings via `sanitizeUserText`.
- Provider failover (`api/_lib/providers.ts` orchestrating `promptBuilder.ts` and `providerAdapters.ts`): `Gemini 2.5 Flash` (with `2.0 Flash` / `2.5 Flash-Lite` compatibility retries) → `Hugging Face Router` → `Groq` → `Deterministic Fallback`.
- Normalizes supported snake_case aliases and validates output with `AssistantPlanOutputSchema`.

### 3.3 `GET /api/health`

- Returns `ok: true` and boolean configuration flags for Gemini, Hugging Face, Groq, and OpenAQ with `Cache-Control: no-store` and `Allow: GET` on non-GET `405` responses.

---

## 4. Accessibility & Security Controls

- **WCAG 2.1 AA**:
  - Skip-to-main-content link (`<a href="#main-content" className="skip-link">`), semantic landmarks (`<header>`, `<nav>`, `<main id="main-content" tabIndex={-1}>`, `<section>`, `<footer>`), polite live status region, and top-level `ErrorBoundary` recovery (`role="alert"`).
  - Native `<svg role="img">` with `<title>`/`<desc>` labels on both the CPCB NAQI radial gauge (`AqiHero.tsx`) and Bedroom ACH decay chart (`RoomCleanChartSvg.tsx`).
  - Explicit `<button aria-expanded={...} aria-controls={...}>` disclosures, `aria-live="polite"` readouts, keyboard Tab/Enter/Escape/Arrow navigation, `aria-pressed` toggles, `aria-busy` loading indicators, and `prefers-reduced-motion` support.
- **Security Headers (`vercel.json`)**:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-Permitted-Cross-Domain-Policies: none`
  - `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
  - `Content-Security-Policy` with zero `'unsafe-inline'` in `script-src` or `style-src`, `object-src 'none'`, `frame-ancestors 'none'`, and `'wasm-unsafe-eval'` scoped for opt-in Transformers.js ONNX WASM.

---

## 5. Tests and CI

- **Automated Test Suites (`22` suites, `110` tests in `src/test/`)**:
  - Domain engines: `cpcbAqi.test.ts`, `cleanAirWindow.test.ts`, `impactCalculator.test.ts`, `roomCleanPhysics.test.ts`, `communityAlert.test.ts`, `engineCoverage.test.ts`
  - API & infrastructure: `boundedCache.test.ts`, `providerFailover.test.ts`, `providerAdapters.test.ts`, `assistantHandler.test.ts`, `airQualityHandler.test.ts`, `healthHandler.test.ts`, `apiValidation.test.ts`
  - Client services & UI/a11y: `airQualityClient.test.ts`, `semanticPlaybook.test.ts`, `abortAndTimeout.test.tsx`, `ErrorBoundary.test.tsx`, `components.test.tsx`, `impactAndPlanner.test.tsx`, `App.a11y.test.tsx`, `App.keyboard.test.tsx`, `App.landmarks.test.tsx`
- **CI (`.github/workflows/ci.yml`)**: Runs under `permissions: { contents: read }` with `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:coverage` (`99.23%` stmts, `95.11%` branches, `99.65%` funcs, `99.81%` lines), `npm audit --omit=dev`, `npm run build`, and enforces repo size `< 10 MB`.
