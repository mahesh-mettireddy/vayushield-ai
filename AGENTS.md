# VayuShield AI contributor notes

Read the [project overview](README.md) and [architecture reference](docs/ARCHITECTURE.md) before editing.

## Project requirements
1. **Never expose API keys to the browser**: No `VITE_GEMINI_API_KEY`, `VITE_HF_TOKEN`, or `VITE_GROQ_API_KEY`. All LLM calls go through `POST /api/assistant`.
2. **Preserve the 4-tier failover order**: `Gemini 2.5 Flash` → `Hugging Face Router (router.huggingface.co/v1)` → `Groq (Llama 3.3 70B)` → `Deterministic Fallback`.
3. **Preserve forecast and index behavior.** Convert Open-Meteo CO to `mg/m³` before lookup. Keep concentration breakpoints contiguous and clamp scores to `[0, 500]`. Use the next 24 strictly future hours and show labels in the selected city’s timezone.
4. **Keep optional inference lazy.** Load Transformers.js on opt-in through a dynamic `import()`. Keep server-only helpers in `api/_lib/` and shared code free of platform-specific dependencies.
5. **Keep the repository under 10 MB.** Exclude model weights, large assets, `node_modules`, and `dist` from Git.
6. **Run the validation commands below before pushing.**
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
7. **Remove temporary logs and build artifacts after validation.**
