import type { AssistantPlan } from '../../src/types/airQuality.js';
import { buildDeterministicPlan } from '../../src/engine/deterministicFallback.js';
import { buildFallbackInput, buildPrompts } from './promptBuilder.js';
import {
  callGemini,
  callOpenAiCompatible,
  tryModels,
  type ProviderEnv
} from './providerAdapters.js';

export type { ProviderEnv } from './providerAdapters.js';

/**
 * 4-Tier Free-Tier Failover Orchestrator (strict descending capability):
 * 1. Gemini 2.5 Flash (Google AI Studio Free Tier)
 * 2. Hugging Face Inference Providers (https://router.huggingface.co/v1/chat/completions)
 * 3. Groq OpenAI-Compatible API (Llama 3.3 70B)
 * 4. Deterministic Local Routine Synthesizer (Zero-Key Guaranteed Fallback)
 */
export async function generatePlanWithFailover(
  req: Parameters<typeof buildPrompts>[0],
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch
): Promise<AssistantPlan> {
  const { system, user } = buildPrompts(req);
  // Leave time to return the built-in plan before Vercel ends the request.
  const deadline = AbortSignal.timeout(110000);
  const diagnostics: string[] = [];

  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const gemini = await tryModels('Gemini', [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' }
    ], [400, 404], (model) => callGemini(geminiKey, model, system, user, fetchImpl, deadline), diagnostics, deadline);
    if (gemini) return gemini;
  }

  const hfToken = env.HF_TOKEN?.trim();
  if (hfToken) {
    const models = [...new Set([env.HF_MODEL?.trim() || 'Qwen/Qwen2.5-72B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct'])]
      .map((id) => ({ id, label: `Hugging Face Router (${id})` }));
    const huggingFace = await tryModels('Hugging Face Router', models, [404, 422], (model) =>
      callOpenAiCompatible('https://router.huggingface.co/v1/chat/completions', hfToken, model, 'huggingface',
        system, user, fetchImpl, deadline), diagnostics, deadline);
    if (huggingFace) return huggingFace;
  }

  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const groq = await tryModels('Groq', [
      { id: 'llama-3.3-70b-versatile', label: 'Groq (Llama 3.3 70B)' },
      { id: 'openai/gpt-oss-120b', label: 'Groq (GPT-OSS 120B)' }
    ], [400, 404, 410], (model) =>
      callOpenAiCompatible('https://api.groq.com/openai/v1/chat/completions', groqKey, model, 'groq',
        system, user, fetchImpl, deadline), diagnostics, deadline);
    if (groq) return groq;
  }

  const fallback = buildDeterministicPlan(buildFallbackInput(req));
  return diagnostics.length ? { ...fallback, debugReason: diagnostics.join('; ') } : fallback;
}
