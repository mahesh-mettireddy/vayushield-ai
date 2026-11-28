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

const OVERALL_FAILOVER_DEADLINE_MS = 110_000;

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' }
];

const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Groq (Llama 3.3 70B)' },
  { id: 'openai/gpt-oss-120b', label: 'Groq (GPT-OSS 120B)' }
];

async function tryGeminiTier(
  apiKey: string | undefined,
  system: string,
  user: string,
  fetchImpl: typeof fetch,
  diagnostics: string[],
  deadline: AbortSignal
): Promise<AssistantPlan | undefined> {
  const key = apiKey?.trim();
  if (!key) return undefined;
  return tryModels(
    'Gemini',
    GEMINI_MODELS,
    [400, 404],
    (model) => callGemini(key, model, system, user, fetchImpl, deadline),
    diagnostics,
    deadline
  );
}

async function tryHuggingFaceTier(
  env: ProviderEnv,
  system: string,
  user: string,
  fetchImpl: typeof fetch,
  diagnostics: string[],
  deadline: AbortSignal
): Promise<AssistantPlan | undefined> {
  const token = env.HF_TOKEN?.trim();
  if (!token) return undefined;
  const models = [
    ...new Set([
      env.HF_MODEL?.trim() || 'Qwen/Qwen2.5-72B-Instruct',
      'meta-llama/Llama-3.3-70B-Instruct'
    ])
  ].map((id) => ({ id, label: `Hugging Face Router (${id})` }));
  return tryModels(
    'Hugging Face Router',
    models,
    [404, 422],
    (model) =>
      callOpenAiCompatible(
        'https://router.huggingface.co/v1/chat/completions',
        token,
        model,
        'huggingface',
        system,
        user,
        fetchImpl,
        deadline
      ),
    diagnostics,
    deadline
  );
}

async function tryGroqTier(
  apiKey: string | undefined,
  system: string,
  user: string,
  fetchImpl: typeof fetch,
  diagnostics: string[],
  deadline: AbortSignal
): Promise<AssistantPlan | undefined> {
  const key = apiKey?.trim();
  if (!key) return undefined;
  return tryModels(
    'Groq',
    GROQ_MODELS,
    [400, 404, 410],
    (model) =>
      callOpenAiCompatible(
        'https://api.groq.com/openai/v1/chat/completions',
        key,
        model,
        'groq',
        system,
        user,
        fetchImpl,
        deadline
      ),
    diagnostics,
    deadline
  );
}

/**
 * 4-Tier Free-Tier Failover Orchestrator (strict descending capability):
 * 1. Gemini 2.5 Flash (Google AI Studio Free Tier)
 * 2. Hugging Face Inference Providers (`router.huggingface.co/v1/chat/completions`)
 * 3. Groq OpenAI-Compatible API (`llama-3.3-70b-versatile`)
 * 4. Deterministic Local Routine Synthesizer (Zero-Key Guaranteed Fallback)
 */
export async function generatePlanWithFailover(
  req: Parameters<typeof buildPrompts>[0],
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch
): Promise<AssistantPlan> {
  const { system, user } = buildPrompts(req);
  // Leave time to return the built-in plan before Vercel ends the request.
  const deadline = AbortSignal.timeout(OVERALL_FAILOVER_DEADLINE_MS);
  const diagnostics: string[] = [];

  const livePlan =
    (await tryGeminiTier(env.GEMINI_API_KEY, system, user, fetchImpl, diagnostics, deadline)) ??
    (await tryHuggingFaceTier(env, system, user, fetchImpl, diagnostics, deadline)) ??
    (await tryGroqTier(env.GROQ_API_KEY, system, user, fetchImpl, diagnostics, deadline));
  if (livePlan) return livePlan;

  const fallback = buildDeterministicPlan(buildFallbackInput(req));
  return diagnostics.length ? { ...fallback, debugReason: diagnostics.join('; ') } : fallback;
}
