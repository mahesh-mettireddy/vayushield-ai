# VayuShield AI — Urban Air Quality Assistant

> Built for **Virtual: PromptWars — Main Challenge 06 (`[Challenge 6] Urban Air Quality Assistant`)** following Google's **Elephant–Goldfish Model (EGM)** design-first workflow (`docs/CONCEPT_BRIEF.md`, `docs/DESIGN_DOC.md`, `docs/GOLDFISH_REVIEW.md`).

VayuShield AI helps families and urban communities navigate severe winter smog and urban air pollution by combining **real-time Open-Meteo & OpenAQ telemetry**, a **deterministic India CPCB NAQI + Choice-Impact engine**, and a **resilient multi-provider GenAI planner** (Gemini 2.5 Flash → Hugging Face Inference Providers → Groq → Deterministic Offline Fallback).

## Key Features
- **Live India CPCB NAQI Telemetry**: Fetches real-time `PM2.5`, `PM10`, `NO₂`, `SO₂`, `O₃`, and `CO` from [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (free, no key) with optional [OpenAQ v3](https://docs.openaq.org/about/about) ground-station reference overlay, computing exact 6-band [India CPCB NAQI](https://www.pib.gov.in/newsite/printrelease.aspx?relid=110654) sub-indices and dominant pollutant.
- **24-Hour Clean-Air Window Finder**: Scans the next 24 upcoming local hours to pinpoint the cleanest 2-hour window for walks, school runs, and cross-ventilation vs. the peak smog window to avoid.
- **Choice-Impact Simulator ("Model Proposes, Code Disposes")**: Quantifies daily PM2.5 exposure reduction (%) and annual CO₂ savings (kg + mature tree equivalent) from commute swaps, DIY Corsi-Rosenthal/HEPA filtration, kitchen exhaust habits, and N95 masking.
- **4-Tier Free-Tier GenAI Routine Planner**:
  1. **Gemini 2.5 Flash** ([Google AI Studio](https://aistudio.google.com/docs/pricing))
  2. **Hugging Face Inference Providers** ([`router.huggingface.co/v1`](https://huggingface.co/docs/inference-providers/en/index), open-weight `Qwen/Qwen2.5-72B-Instruct`)
  3. **Groq Free Tier** ([`llama-3.3-70b-versatile`](https://console.groq.com/docs/openai))
  4. **Deterministic Local Fallback** (guarantees zero error screens even without API keys)
- **Opt-In Local Hugging Face WASM Semantic Playbook**: Lazy-loads [`@huggingface/transformers`](https://huggingface.co/docs/transformers.js/index) (`Xenova/all-MiniLM-L6-v2`) in-browser on demand so initial page loads stay fast and the GitHub repo stays well under 10 MB.

## Quick Start (Local Development)

```bash
npm install
cp .env.example .env.local
# Optional: add GEMINI_API_KEY, HF_TOKEN, GROQ_API_KEY, or OPENAQ_API_KEY
npm run dev
```

## Verification & Quality Gates

```bash
npm run typecheck   # Strict TypeScript (src + api)
npm run lint        # ESLint + react-hooks + jsx-a11y
npm test            # Vitest unit, failover, and vitest-axe WCAG AA tests
npm run build       # Production Vite bundle
```

## Deploy to Vercel (Free, ~60 Seconds)
1. Push this repository to a public GitHub repo (`< 10 MB`).
2. Import the repo in [Vercel](https://vercel.com/new) (Framework Preset: **Vite**).
3. Add server-side Environment Variables (`GEMINI_API_KEY`, `HF_TOKEN`, `GROQ_API_KEY`, optional `OPENAQ_API_KEY`) in **Project Settings → Environment Variables**.
4. Deploy — both the React frontend and `/api/*` serverless functions go live together with strict security headers (`vercel.json`).

## Architecture & Elephant–Goldfish Docs
- `docs/CONCEPT_BRIEF.md` — Problem scope, personas, and design constraints
- `docs/DESIGN_DOC.md` — Exact CPCB NAQI equations, API schemas, failover order, security & a11y spec
- `docs/GOLDFISH_REVIEW.md` — 5 design-stage bugs caught before coding (CO `µg/m³ → mg/m³` conversion, continuous breakpoints, future-only 24h windows, isolated serverless helpers, lazy HF import)
- `AGENTS.md` — Invariants and validation checklist for coding agents
