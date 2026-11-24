# Goldfish Cold Review Report — VayuShield AI

**Reviewer Mode**: Stateless Cold-Eyes Specification Audit (Elephant–Goldfish Model)  
**Target Document**: `docs/DESIGN_DOC.md`  
**Review Verdict**: **APPROVED WITH 5 RESOLVED DESIGN FIXES**

---

## Findings Caught Before Implementation

### Finding 1 — [CRITICAL] Carbon Monoxide (CO) Unit Mismatch (`µg/m³` vs `mg/m³`)
- **Risk**: Open-Meteo Air Quality API returns `carbon_monoxide` in `µg/m³` (typically `300–2500 µg/m³`), while India's CPCB NAQI table defines CO breakpoints in `mg/m³` (`0–1.0`, `1.0–2.0`, etc.). Passing raw Open-Meteo values directly would inflate CO by `1000x` and permanently lock overall AQI at `500 (Severe)`.
- **Resolution**: `calculateCpcbAqi` explicitly accepts `coUgM3` (matching Open-Meteo's raw unit) and divides by `1000` internally before interpolation, backed by a dedicated regression test in `src/test/cpcbAqi.test.ts`.

### Finding 2 — [HIGH] CPCB Breakpoint Decimal Gaps (`30.1–30.9 µg/m³`)
- **Risk**: Official CPCB summary tables list discrete integer ranges (`0–30`, `31–60`). A naive `c >= 31 && c <= 60` check would drop floating-point values like `30.4 µg/m³`.
- **Resolution**: Use continuous contiguous breakpoints (`[0, 30]`, `(30, 60]`, `(60, 90]`, `(90, 120]`, `(120, 250]`, `> 250`) and clamp final sub-index values to `[0, 500]`.

### Finding 3 — [HIGH] Past Hours in 24-Hour Clean-Air Window Finder
- **Risk**: Open-Meteo's `hourly` array starts at `00:00` of the current day, so slicing indices `0..23` at 8:00 PM would recommend a "best outdoor window" from 6:00 AM that already passed.
- **Resolution**: Request `forecast_days=2&timezone=auto&timeformat=unixtime` from Open-Meteo, locate the first hourly timestamp strictly after the current instant, and slice the next **24 upcoming hours**. Format labels in the city’s timezone.

### Finding 4 — [MEDIUM] Vercel ESM Import Resolution Between `api/` and `src/`
- **Risk**: In ESM TypeScript projects (`"type": "module"`), Vercel serverless functions in `api/` importing `.ts` files from `src/` can fail at runtime if `tsconfig.json` or file extensions mismatch Node ESM resolution.
- **Resolution**: Keep serverless helpers cleanly isolated inside `api/_lib/` with pure standard Node `fetch` + `zod` (zero Vite-only or browser-only imports), and share deterministic fallback logic cleanly without DOM dependencies.

### Finding 5 — [MEDIUM] Client-Side `@huggingface/transformers` Bundle Bloat & CI Network Failures
- **Risk**: Static `import { pipeline } from '@huggingface/transformers'` bloats the main JS bundle and causes CI/offline environments to fail when downloading ONNX weights.
- **Resolution**: Use dynamic `import('@huggingface/transformers')` strictly behind an opt-in user toggle ("Enable Local HF Semantic Search"), while providing instant zero-latency TF-IDF / keyword semantic scoring by default.

---

## Sign-Off
All 5 design findings have been incorporated into the implementation blueprint. Ready to proceed to implementation and verification.
