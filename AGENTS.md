# AGENTS.md — VayuShield AI (Elephant–Goldfish Coding Guide)

This repository follows the **Elephant–Goldfish Model (EGM)**. Before making edits, read:
1. `docs/CONCEPT_BRIEF.md` — product scope & constraints
2. `docs/DESIGN_DOC.md` — exact CPCB NAQI math, API schemas, failover order, a11y spec
3. `docs/GOLDFISH_REVIEW.md` — critical invariants (CO `µg/m³ → mg/m³`, continuous breakpoints, future-only 24h windows, isolated `api/_lib/`, lazy HF import)

## Non-Negotiable Invariants
1. **Never expose API keys to the browser**: No `VITE_GEMINI_API_KEY`, `VITE_HF_TOKEN`, or `VITE_GROQ_API_KEY`. All LLM calls go through `POST /api/assistant`.
2. **Preserve the 4-tier failover order**: `Gemini 2.5 Flash` → `Hugging Face Router (router.huggingface.co/v1)` → `Groq (Llama 3.3 70B)` → `Deterministic Fallback`.
3. **Never break the 10 MB GitHub repo limit**: Never commit model weights, large images, `node_modules`, or `dist`.
4. **Always run full validation before `git push`**:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
5. **Cleanup**: Remove any temporary logs/artifacts after verifying tests so disk space stays clean.
