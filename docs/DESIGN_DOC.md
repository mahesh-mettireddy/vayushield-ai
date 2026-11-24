# Design Document — VayuShield AI

**Status**: Ready for Goldfish Cold Review  
**Architecture**: Single-repo React 19 + Vite + TypeScript + Tailwind CSS + Vercel Serverless Functions (`/api/*`)  
**Target Grading Rubric**: Code Quality, Security, Efficiency (`< 10 MB` repo), Testing, Accessibility (WCAG 2.1 AA), Problem Statement Alignment.

---

## 1. System Architecture

```text
Browser (React 19 + Vite + TypeScript + Tailwind CSS)
  ├── LocationSearch (Open-Meteo Geocoding via /api/air-quality?q=... or city presets)
  ├── AqiHero & PollutantGrid (CPCB NAQI Engine -> 0-500 score, 6 bands, dominant pollutant)
  ├── CleanAirWindowChart (24h hourly PM2.5 forecast -> safest 2h outdoor/ventilation window)
  ├── ChoiceImpactSimulator (Deterministic PM2.5 exposure & CO2 savings calculator)
  ├── RoutinePlanner (Calls POST /api/assistant -> structured JSON routine + hacks + impact)
  └── IndoorPlaybookSearch (Keyword + optional lazy-loaded @huggingface/transformers WASM embeddings)
          │
          ▼ HTTPS (Same-origin, zero CORS issues on Vercel)
Vercel Serverless Functions (/api/*)
  ├── GET  /api/air-quality?lat=&lon=&city=
  │     ├── Open-Meteo Air Quality API (hourly PM2.5, PM10, NO2, SO2, O3, CO; timezone=auto)
  │     ├── Optional OpenAQ v3 overlay (if OPENAQ_API_KEY env var is present)
  │     └── 15-minute in-memory TTL cache + Cache-Control: s-maxage=900
  └── POST /api/assistant
        ├── Zod request validation + prompt-injection sanitization + IP rate limiter
        ├── Failover Chain (strict descending capability):
        │     1. Gemini 2.5 Flash (GEMINI_API_KEY)
        │     2. Hugging Face Inference Providers router.huggingface.co/v1 (HF_TOKEN)
        │     3. Groq OpenAI-compatible API (GROQ_API_KEY)
        │     4. Deterministic Local Routine Synthesizer (Zero-Key Guaranteed Fallback)
        └── Zod output validation -> strict typed JSON response
```

---

## 2. Deterministic Scientific Engine (`src/engine/`)

### 2.1 India CPCB National AQI (`src/engine/cpcbAqi.ts`)
Implements the official CPCB NAQI 6-band scale (0–500) using linear interpolation:

$$I_p = \frac{I_{hi} - I_{lo}}{BP_{hi} - BP_{lo}} \cdot (C_p - BP_{lo}) + I_{lo}$$

Overall NAQI = $\max(I_p)$ across available pollutants, clamped to `[0, 500]`, rounded to nearest integer.

**Exact Breakpoint Table (Continuous Upper-Bound Intervals to Prevent Decimal Gaps)**:

| Band | AQI (`I_lo–I_hi`) | PM2.5 (`µg/m³`) | PM10 (`µg/m³`) | NO₂ (`µg/m³`) | SO₂ (`µg/m³`) | O₃ (`µg/m³`) | CO (`mg/m³`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Good | 0–50 | 0–30 | 0–50 | 0–40 | 0–40 | 0–50 | 0–1.0 |
| Satisfactory | 51–100 | 30–60 | 50–100 | 40–80 | 40–80 | 50–100 | 1.0–2.0 |
| Moderate | 101–200 | 60–90 | 100–250 | 80–180 | 80–380 | 100–168 | 2.0–10.0 |
| Poor | 201–300 | 90–120 | 250–350 | 180–280 | 380–800 | 168–208 | 10.0–17.0 |
| Very Poor | 301–400 | 120–250 | 350–430 | 280–400 | 800–1600 | 208–748 | 17.0–34.0 |
| Severe | 401–500 | 250–500+ | 430–600+ | 400–600+ | 1600–2400+ | 748–1000+ | 34.0–50.0+ |

**Critical Unit Conversion Rule**:
- Open-Meteo returns `carbon_monoxide` in **`µg/m³`**.
- CPCB CO breakpoints are in **`mg/m³`**.
- `coMgM3 = coUgM3 / 1000` MUST be applied before calling `calculateSubIndex('co', coMgM3)`.

### 2.2 24-Hour Clean-Air Window Finder (`src/engine/cleanAirWindow.ts`)
- Inputs: the next 24 hourly forecast entries (`{ time, pm25, pm10, aqi }`) strictly after the current instant, displayed in the city’s timezone (`timezone=auto`).
- Computes rolling 2-hour average PM2.5 across all consecutive pairs `(i, i+1)`.
- Outputs:
  - `bestWindow`: lowest average PM2.5 2-hour slot (start/end formatted in 12h local time + average PM2.5 + ventilation advice).
  - `worstWindow`: highest average PM2.5 2-hour slot (peak smog avoidance warning).
  - `exposureSavingsPct`: percentage reduction in PM2.5 by shifting a 1-hour outdoor activity from `worstWindow` to `bestWindow`.

### 2.3 Choice-Impact Simulator (`src/engine/impactCalculator.ts`)
Pure deterministic model translating household choices into verifiable daily/annual impact:
- **Commute Swap** (round-trip `commuteKm` per day, 240 commute days/yr):
  - Baseline emission factors (kg CO₂ / km): `solo_car = 0.192`, `scooter = 0.084`, `bus = 0.068`, `metro = 0.028`, `cycle_walk = 0.000`, `wfh = 0.000`.
  - Daily CO₂ saved = `max(0, (baselineFactor - chosenFactor) * commuteKm)`.
  - Annual CO₂ saved = `dailyCo2SavedKg * 240`.
- **Indoor & Personal Exposure Reduction** (multiplicative residual model, never exceeds 92%):
  - `hepaOrCorsiRosenthal`: reduces indoor PM2.5 infiltration by `55%` (remaining factor `0.45`).
  - `smartVentilation`: timing cross-ventilation to `bestWindow` reduces indoor spike by `20%` (remaining factor `0.80`).
  - `cleanCookingExhaust`: using chimney/exhaust + lid/induction reduces indoor cooking PM2.5 by `35%` (remaining factor `0.65`).
  - `n95OutdoorMask`: reduces outdoor inhaled PM2.5 by `80%` during outdoor hours (weighted `0.25` of day → overall daily reduction factor `0.80`).
  - Outputs: `baselineDailyExposureUgM3`, `projectedDailyExposureUgM3`, `exposureReductionPct`, `dailyCo2SavedKg`, `annualCo2SavedKg`, and human-readable impact rationale per toggle.

---

## 3. API Contracts & Security (`api/`)

### 3.1 `GET /api/air-quality`
- Query params validated via Zod:
  - Either `q` (string, 2–80 chars, sanitized) for geocoding search via Open-Meteo Geocoding API (`https://geocoding-api.open-meteo.com/v1/search`), OR
  - `lat` (`-90..90`) & `lon` (`-180..180`) + optional `city` (`1..80` chars) to fetch hourly Open-Meteo Air Quality forecast + optional OpenAQ v3 nearest station.
- Security: Rejects non-GET methods (`405`), validates numeric bounds, and sets `X-Content-Type-Options: nosniff`. Telemetry cache entries expire after 15 minutes or when the first forecast hour begins, whichever comes first.

### 3.2 `POST /api/assistant`
- Request body validated via Zod (`AssistantRequestSchema`):
  - `city`: string (1–80 chars)
  - `aqi`: number (`0..500`), `category`: string, `dominantPollutant`: string, `pm25`: number, `pm10`: number
  - `bestWindowLabel`: string, `worstWindowLabel`: string
  - `profile`: `{ householdMembers: string[], commuteMode: string, commuteKm: number, homeType: string, budgetTier: 'zero_cost' | 'budget_diy' | 'standard' }`
  - `activeChoices`: string[] (max 10)
  - `impactSummary`: `{ exposureReductionPct: number, annualCo2SavedKg: number }`
  - `userQuestion`: optional string (max 300 chars, stripped of control chars & prompt-injection delimiters)
- Rate Limit: In-memory sliding window (20 requests / 5 min per IP) returning `429` with `Retry-After`.
- Provider Failover Order:
  1. **Gemini 2.5 Flash**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` with `responseMimeType: "application/json"`.
  2. **Hugging Face Inference Providers**: `https://router.huggingface.co/v1/chat/completions` (`model: process.env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct'`).
  3. **Groq**: `https://api.groq.com/openai/v1/chat/completions` (`model: 'llama-3.3-70b-versatile'`).
  4. **Deterministic Fallback**: Local TypeScript routine generator grounded in exact CPCB band + household profile + choice simulator numbers.
- Response Schema (`AssistantPlanSchema`):
  ```ts
  {
    provider: 'gemini' | 'huggingface' | 'groq' | 'deterministic-fallback',
    summary: string,
    dailyRoutine: Array<{ timeBlock: string; action: string; whyItHelps: string }>,
    indoorHacks: Array<{ title: string; steps: string; costTier: string; impact: string }>,
    sustainableSwaps: Array<{ swap: string; directImpact: string }>,
    safetyNote: string
  }
  ```

---

## 4. Accessibility & Security Controls
- **WCAG 2.1 AA**:
  - Skip-to-main-content link (`<a href="#main-content" className="sr-only focus:not-sr-only">`).
  - Semantic landmarks: `<header>`, `<main id="main-content">`, `<section aria-labelledby="...">`, `<footer>`.
  - Dynamic AQI status & AI plan updates announced via `aria-live="polite"`.
  - All interactive toggles use native `<button aria-pressed={...}>` or `<input type="checkbox">` with visible focus rings (`focus-visible:outline-2`).
  - Color is never the sole indicator of AQI severity: every badge displays text label + numeric score + icon.
- **Security Headers (`vercel.json`)**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
  - `Content-Security-Policy` restricting script/connect origins cleanly.

---

## 5. Testing & CI Plan
- **Unit Tests**:
  - `src/test/cpcbAqi.test.ts`: Exact boundary values, decimal boundary continuity (`30.4`), CO `µg/m³ → mg/m³` conversion, severe clamping (`> 500`), dominant pollutant selection.
  - `src/test/cleanAirWindow.test.ts`: Finds true minimum/maximum 2-hour windows, handles flat series and short arrays gracefully.
  - `src/test/impactCalculator.test.ts`: Commute CO₂ math, multiplicative indoor exposure cap (`<= 92%`), zero-km edge cases.
  - `src/test/providerFailover.test.ts`: Verifies Gemini → Hugging Face Router → Groq → Deterministic fallback order and schema validation.
- **UI & Accessibility Tests**:
  - `src/test/App.a11y.test.tsx`: Renders full app with mocked air quality data, verifies interactive simulator updates and zero WCAG violations via `vitest-axe`.
- **CI (`.github/workflows/ci.yml`)**: Runs `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and enforces repo size `< 10 MB`.
