# Concept Brief — VayuShield AI (Urban Air Quality Assistant)

**Methodology**: Elephant–Goldfish Model (EGM) — Design-first specification created prior to implementation.  
**Challenge**: Virtual: PromptWars — Main Challenge 06 (`[Challenge 6] Urban Air Quality Assistant`, Hack2skill).  
**Deadline**: November 29, 2026, 11:59 PM IST.

## 1. Problem Statement
Families and urban communities facing severe winter smog and urban air pollution need more than a passive AQI number. They need an interactive GenAI assistant that:
1. Suggests **low-emission daily routines** tailored to their location and household lifestyle.
2. Provides practical **indoor air quality hacks** (ventilation timing, DIY Corsi-Rosenthal / HEPA CADR guidance, cooking exhaust practices).
3. Recommends **sustainable alternatives** (commute swaps, clean cooking, energy habits).
4. **Clearly explains the direct impact of their choices** using transparent, verifiable numbers rather than vague platitudes.

## 2. Target Users & Personas
- **Urban Families (India & Global)**: Households with young children, seniors, or members with respiratory sensitivity navigating seasonal smog (e.g., Delhi NCR, Hyderabad, Bengaluru, Mumbai, or any global city).
- **Daily Commuters**: Office workers and students deciding when to travel, whether to swap solo ICE vehicles for metro/carpool/cycling, and when to mask.
- **Community & Home Caregivers**: People managing indoor air quality on a realistic budget (not assuming expensive commercial purifiers in every room).

## 3. Core Principles & Architectural Decisions
- **Model Proposes, Code Disposes**: All AQI calculations (India CPCB National AQI), 24-hour clean-air window discovery, PM2.5 exposure reduction, and CO₂ emission savings are computed deterministically in pure, unit-tested TypeScript. GenAI synthesizes personalized routines and plain-language explanations strictly grounded in those computed figures.
- **100% Free-Tier & Zero-Failure Resilience**:
  - Live air-quality & geocoding data via **Open-Meteo** (free, no API key, 10,000 calls/day) with optional **OpenAQ v3** ground-station overlay (India CPCB reference monitors).
  - Server-side GenAI failover chain in strict descending capability order: **Gemini 2.5 Flash (Google AI Studio Free Tier)** → **Hugging Face Inference Providers (`router.huggingface.co/v1`, Qwen/Llama open-weight)** → **Groq Free Tier (Llama 3.3 70B)** → **Deterministic Local Synthesizer** (guarantees zero error screens even without keys).
  - Optional client-side **Hugging Face Transformers.js (`@huggingface/transformers`)** lazy-loaded semantic matcher for offline playbook discovery.
- **Single-Stack Deployment**: React 19 + Vite + TypeScript + Tailwind CSS + Vercel Serverless Functions (`/api/*`) in one `< 1 MB` GitHub repo (well under the 10 MB limit) with zero cold-start sleep and unified CI testing.

## 4. In Scope (MVP for Attempt #1)
- Instant city search (Open-Meteo Geocoding) + browser geolocation + quick-select Indian & global smog-prone cities.
- Real-time pollutant telemetry (`PM2.5`, `PM10`, `NO2`, `SO2`, `O3`, `CO`) + exact **India CPCB NAQI** computation and dominant pollutant identification.
- **24-Hour Clean-Air Window Finder** highlighting the safest 2-hour outdoor & cross-ventilation window.
- **Interactive Choice-Impact Simulator** calculating personal PM2.5 exposure reduction (%) and annual/daily CO₂ savings (kg).
- **Household Profile & GenAI Routine Planner** generating structured, location-aware daily routines, indoor air hacks, sustainable alternatives, and direct impact explanations.
- **Curated WHO/CPCB Indoor Air Playbook** with optional client-side Hugging Face semantic search.
- Full **Vitest + React Testing Library + vitest-axe** test suite, strict security headers, Zod schema validation, and GitHub Actions CI.

## 5. Out of Scope
- Paid sensor hardware / IoT MQTT brokers.
- Medical diagnosis or clinical prescriptions (app includes clear non-medical informational disclaimer).
- Heavy ML model weights committed to Git (strictly forbidden by the 10 MB repo limit).
- User authentication / database persistence (household preferences are stored locally in `localStorage` for privacy and zero-friction judging).
