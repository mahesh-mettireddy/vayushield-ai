# VayuShield AI

**Urban Air Quality Telemetry, Deterministic Indoor Physics & 4-Tier Resilient Planning**

[![Live App](https://img.shields.io/badge/Live_Demo-vayushield--ai--rose.vercel.app-116456?style=flat-square)](https://vayushield-ai-rose.vercel.app/)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-5.7_Strict-1e40af?style=flat-square)](tsconfig.json)
[![Tests](https://img.shields.io/badge/Tests-50_Passing-0c6b4d?style=flat-square)](src/test/App.a11y.test.tsx)
[![Security Audit](https://img.shields.io/badge/npm_audit-0_Vulnerabilities-0c6b4d?style=flat-square)](package.json)
[![Accessibility](https://img.shields.io/badge/WCAG_2.1_AA-0_axe_Violations-0c6b4d?style=flat-square)](src/test/App.a11y.test.tsx)
[![Repository Size](https://img.shields.io/badge/Repository-%3C_1_MB-116456?style=flat-square)](.github/workflows/ci.yml)

**Live Demo:** [https://vayushield-ai-rose.vercel.app/](https://vayushield-ai-rose.vercel.app/) · **Architecture Reference:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

VayuShield AI converts live urban air pollution telemetry into verifiable, household-level decisions. Rather than letting a language model guess AQI bands or fabricate health metrics, every pollutant sub-index, 24-hour clean-air window, indoor particulate decay curve, commute CO₂ delta, and community multiplier is computed deterministically in strict TypeScript—and the GenAI layer only synthesizes daily schedules grounded in those verified numbers.

---

## Why VayuShield AI

| Capability | Generic AQI Apps & LLM Chatbots | VayuShield AI |
| :--- | :--- | :--- |
| **AQI Calculation** | Often relies on generic US-EPA estimates or ungrounded LLM approximations susceptible to unit errors. | **Deterministic India CPCB NAQI Engine** ([`cpcbAqi.ts`](src/engine/cpcbAqi.ts)) across all 6 pollutants (`PM2.5`, `PM10`, `NO₂`, `SO₂`, `O₃`, `CO`) with contiguous breakpoints clamped to `[0, 500]`. |
| **Daily Timing Guidance** | Static advice ("go out early morning") that misses thermal inversions or stale past forecast hours. | **24h Clean-Air Window Finder** ([`openMeteoForecast.ts`](src/engine/openMeteoForecast.ts), [`cleanAirWindow.ts`](src/engine/cleanAirWindow.ts)) slicing strictly upcoming hours in the city's local timezone and ranking 2-hour windows by NAQI. |
| **Indoor Air Physics** | Vague tips such as "run an air purifier." | **Bedroom Time-to-Clean ACH Simulator** ([`roomCleanPhysics.ts`](src/engine/roomCleanPhysics.ts), [`RoomCleanCurve.tsx`](src/components/RoomCleanCurve.tsx)) solving exponential decay $C(t) = C_{eq} + (C_0 - C_{eq})e^{-\text{ACH} \cdot t/60}$ across room volumes & CADR setups to exact minutes-to-`30 µg/m³`. |
| **Household & Community Scale** | Qualitative slogans with no measurable tradeoff comparison. | **Choice-Impact & Community Scale Engine** ([`impactCalculator.ts`](src/engine/impactCalculator.ts)) computing daily `µg/m³` exposure drops (capped at 92%), annual CO₂ savings, tree equivalents, `1–200` household scaling, and 1-click Family Alerts ([`communityAlert.ts`](src/engine/communityAlert.ts)). |
| **Resilience & Privacy** | Single-provider lock-in or browser-exposed `VITE_*` API keys. | **Zero-Key-Leak 4-Tier Server Failover** ([`providers.ts`](api/_lib/providers.ts)): `Gemini 2.5 Flash` → `Hugging Face Router` → `Groq` → `Deterministic Fallback`, plus opt-in lazy **Browser WASM Semantic Search** (`@huggingface/transformers`). |

---

## System Architecture

```mermaid
flowchart LR
    subgraph Browser["Browser Client (React 19 + Vite + TypeScript + Tailwind)"]
        UI["AqiHero Radial Gauge & Clean-Air 24h Bar Chart"]
        Planner["Tab 1: AI Daily Plan (RoutinePlanner)"]
        Impact["Tab 2: Impact Lab + Community Scale + Bedroom ACH Physics Curve"]
        Playbook["Tab 3: Indoor Air Playbook (Keyword + Lazy WASM HF Embeddings)"]
    end

    subgraph Serverless["Vercel Node 22 ESM Functions (/api/*)"]
        AirAPI["GET /api/air-quality\n(Zod Query Validation + 15m TTL Cache)"]
        AssistAPI["POST /api/assistant\n(Zod Schema + Prompt Sanitizer + 20 req/5m IP Rate Limit)"]
        HealthAPI["GET /api/health\n(Provider Flag Status)"]
    end

    subgraph External["Live Telemetry & 4-Tier GenAI Failover"]
        OM["Open-Meteo Air Quality & Geocoding API"]
        OAQ["OpenAQ v3 Reference Stations (Optional)"]
        T1["1. Gemini 2.5 Flash (x-goog-api-key)"]
        T2["2. Hugging Face Router (Qwen 2.5 72B / Llama 3.3 70B)"]
        T3["3. Groq API (Llama 3.3 70B / GPT-OSS 120B)"]
        T4["4. Deterministic CPCB Routine Engine"]
    end

    UI --> AirAPI
    Planner --> AssistAPI
    Impact -->|"Pure Deterministic Client Engine"| Impact
    Playbook -->|"Opt-in dynamic import()"| Playbook

    AirAPI --> OM
    AirAPI --> OAQ
    AssistAPI --> T1
    T1 -.->|"HTTP/Schema Failure"| T2
    T2 -.->|"HTTP/Schema Failure"| T3
    T3 -.->|"HTTP/Schema Failure"| T4
```

---

## Key Engineering Safeguards

Each scientific boundary, serverless boundary, and SVG rendering edge case is guarded by deterministic unit and integration checks:

1. **CO `µg/m³ → mg/m³` Unit Normalization ([`src/engine/cpcbAqi.ts`](src/engine/cpcbAqi.ts))**
   - Open-Meteo reports `carbon_monoxide` in `µg/m³` (`300–2500 µg/m³`), whereas India CPCB NAQI breakpoints expect `mg/m³` (`0–1.0`, `1.0–2.0`, …). `calculateCpcbAqi` explicitly accepts `coUgM3` and divides by `1000` before interpolation, preventing a 1000× score inflation and verified in [`src/test/cpcbAqi.test.ts`](src/test/cpcbAqi.test.ts).
2. **Contiguous CPCB Breakpoint Intervals ([`src/engine/cpcbAqi.ts`](src/engine/cpcbAqi.ts))**
   - Official summary tables list discrete integer intervals (`0–30`, `31–60`) that leave fractional gaps (`30.4 µg/m³`). VayuShield AI models upper bounds contiguously (`0–30`, `30–60`, `60–90`, `90–120`, `120–250`, `250–500`) and clamps sub-indices to `[0, 500]`.
3. **Strict Future 24-Hour Window Slicing ([`src/engine/openMeteoForecast.ts`](src/engine/openMeteoForecast.ts))**
   - Open-Meteo `hourly` arrays start at local midnight (`00:00`), so slicing `0..23` in the evening would surface stale past hours. `readOpenMeteoForecast` requests `forecast_days=2&timezone=auto&timeformat=unixtime`, locates the first entry strictly after `now`, slices the next 24 upcoming hours, and formats labels in the city's timezone (verified in [`src/test/cleanAirWindow.test.ts`](src/test/cleanAirWindow.test.ts)).
4. **NAQI-First Window Ranking on Ozone-Dominated Days ([`src/engine/cleanAirWindow.ts`](src/engine/cleanAirWindow.ts))**
   - When ground-level ozone (`O₃`) drives overall NAQI above `PM2.5`, ranking slots by `PM2.5` alone misidentifies high-ozone hours as clean. `analyzeCleanAirWindows` ranks consecutive 2-hour windows by average overall NAQI first (breaking ties by `avgPm25`) and clamps `exposureSavingsPct` to `0` when the cleanest NAQI slot has equal or higher `PM2.5`.
5. **Serverless ESM Isolation & Opt-In Lazy WASM ([`api/_lib/`](api/_lib/), [`src/services/semanticPlaybook.ts`](src/services/semanticPlaybook.ts))**
   - Node 22 ESM serverless functions use explicit `.js` module specifiers, standard `fetch` + `zod`, and keep secrets strictly server-side. Browser-side `@huggingface/transformers` loads only on explicit user opt-in via dynamic `import()` with `useWasmCache = false` aligned to [`vercel.json`](vercel.json) CSP.
6. **Continuous SVG Decay Curve Rendering ([`src/components/RoomCleanCurve.tsx`](src/components/RoomCleanCurve.tsx), [`src/styles/index.css`](src/styles/index.css))**
   - Animating multi-segment dynamic SVG paths with `pathLength` + `stroke-dasharray` can cause partial stroke cut-offs in Chromium across preset switches. The Bedroom Time-to-Clean chart renders a plain continuous `<path>` (`stroke-dasharray: none`) inside a GPU-friendly `220ms` opacity fade group, verified across all room and filtration presets in [`src/test/App.a11y.test.tsx`](src/test/App.a11y.test.tsx).

---

## Engineering Quality Matrix

| Pillar | Implementation & Verification Proof | Primary Files & Commands |
| :--- | :--- | :--- |
| **Code Quality** | Strict TypeScript (`strict: true`, `noUnusedLocals`, `noUncheckedIndexedAccess`), pure deterministic scientific engines separated from React UI, Zod runtime validation on all API inputs/outputs, and clean ESM module boundaries. | [`tsconfig.json`](tsconfig.json), [`src/engine/`](src/engine/), [`api/_lib/schemas.ts`](api/_lib/schemas.ts) · `npm run typecheck` |
| **Security** | Zero browser-exposed secrets (no `VITE_*` API keys), prompt-injection delimiter stripping (`sanitizeUserText`), per-IP rate limiting (`20` req / `5 min` → `429` with `Retry-After`), strict HTTP headers (`CSP`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`), and `0` production dependency vulnerabilities. | [`vercel.json`](vercel.json), [`api/assistant.ts`](api/assistant.ts), [`api/air-quality.ts`](api/air-quality.ts), [`.env.example`](.env.example) · `npm audit --omit=dev` |
| **Efficiency** | Sub-1 MB repository footprint (`< 10 MB` CI budget), 15-min/hour-aligned telemetry edge caching (`s-maxage`), parallel Open-Meteo + OpenAQ requests with `AbortSignal.timeout`, manual Vite vendor chunking (`react`, `icons`), and lazy-loaded WASM embeddings. | [`.github/workflows/ci.yml`](.github/workflows/ci.yml), [`vite.config.ts`](vite.config.ts), [`src/services/semanticPlaybook.ts`](src/services/semanticPlaybook.ts) · `npm run build` |
| **Testing** | 7 test suites (`50` automated tests) covering CPCB NAQI boundaries & CO conversion, future-only 24h windows & ozone ties, exposure & Community Scale math, ACH indoor decay physics, Family Alert formatting, 4-tier failover, and UI/axe accessibility regressions. | [`src/test/cpcbAqi.test.ts`](src/test/cpcbAqi.test.ts), [`src/test/cleanAirWindow.test.ts`](src/test/cleanAirWindow.test.ts), [`src/test/impactCalculator.test.ts`](src/test/impactCalculator.test.ts), [`src/test/roomCleanPhysics.test.ts`](src/test/roomCleanPhysics.test.ts), [`src/test/communityAlert.test.ts`](src/test/communityAlert.test.ts), [`src/test/providerFailover.test.ts`](src/test/providerFailover.test.ts), [`src/test/App.a11y.test.tsx`](src/test/App.a11y.test.tsx) · `npm test` |
| **Accessibility** | WCAG 2.1 AA compliance enforced via `eslint-plugin-jsx-a11y` and `vitest-axe` (`0` violations): skip link, semantic landmarks, `aria-live="polite"` readouts, keyboard arrow/Home/End navigation on forecast bars & tabs, `aria-pressed` toggles, `role="img"` chart descriptions, and `prefers-reduced-motion` support. | [`eslint.config.js`](eslint.config.js), [`src/styles/index.css`](src/styles/index.css), [`src/components/RoomCleanCurve.tsx`](src/components/RoomCleanCurve.tsx), [`src/test/App.a11y.test.tsx`](src/test/App.a11y.test.tsx) · `npm run lint` |
| **Scientific Grounding** | Transparent India CPCB NAQI interpolation, real-time Open-Meteo & optional OpenAQ station telemetry, DEFRA/urban passenger CO₂ factors, and single-zone ACH particulate decay equations with non-medical disclaimers. | [`src/engine/cpcbAqi.ts`](src/engine/cpcbAqi.ts), [`src/engine/impactCalculator.ts`](src/engine/impactCalculator.ts), [`src/engine/roomCleanPhysics.ts`](src/engine/roomCleanPhysics.ts), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

---

## Quick Start

**Prerequisites:** Node.js `>= 22.12.0` (`22.x` LTS).

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. In `vite dev` mode without Vercel Functions, the client fetches Open-Meteo telemetry directly and uses the built-in deterministic routine planner. To run the `/api/*` serverless endpoints locally, use `npx vercel dev`.

---

## Environment Variables

All provider keys are **server-only** and optional—VayuShield AI functions out-of-the-box without credentials using Open-Meteo + its deterministic routine engine. See [`.env.example`](.env.example):

| Variable | Purpose | Required? |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Tier 1 primary planner (`Gemini 2.5 Flash` with `2.0 Flash` / `2.5 Flash-Lite` fallback) | Optional |
| `HF_TOKEN` | Tier 2 failover via Hugging Face Inference Providers (`router.huggingface.co/v1`) | Optional |
| `HF_MODEL` | Override Tier 2 model ID (default: `Qwen/Qwen2.5-72B-Instruct`) | Optional |
| `GROQ_API_KEY` | Tier 3 failover via Groq (`llama-3.3-70b-versatile`) | Optional |
| `OPENAQ_API_KEY` | Optional nearest ground-station reference overlay via OpenAQ v3 | Optional |

> **Security rule:** Never prefix any secret key with `VITE_`. Keep credentials strictly in server environment variables.

---

## Testing & Quality Gates

Run all verification checks locally before pushing:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev
```

---

## Vercel Deployment

1. Import the repository into Vercel using the **Vite** framework preset.
2. Vercel builds the SPA (`dist/`) and deploys [`api/air-quality.ts`](api/air-quality.ts), [`api/assistant.ts`](api/assistant.ts), and [`api/health.ts`](api/health.ts) with the security headers and 120s function timeout configured in [`vercel.json`](vercel.json).
3. Configure any desired optional server keys (`GEMINI_API_KEY`, `HF_TOKEN`, `GROQ_API_KEY`, `OPENAQ_API_KEY`) in **Project Settings → Environment Variables** and redeploy.
4. Confirm deployment status via `GET /api/health`.

*Forecasts, exposure estimates, and ACH indoor decay curves are informational only and do not constitute medical advice.*
