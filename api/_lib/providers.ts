import { z } from 'zod';
import type { AssistantPlan, CommuteMode } from '../../src/types/airQuality.js';
import { COMMUTE_LABELS } from '../../src/engine/impactCalculator.js';
import { buildDeterministicPlan } from '../../src/engine/deterministicFallback.js';
import {
  AssistantPlanOutputSchema,
  sanitizeUserText,
  type AssistantRequest
} from './schemas.js';

export interface ProviderEnv {
  GEMINI_API_KEY?: string;
  HF_TOKEN?: string;
  HF_MODEL?: string;
  GROQ_API_KEY?: string;
}

const geminiEnvelope = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) })
  })).min(1)
});
const chatEnvelope = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1)
});

class ProviderFailure extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

interface ProviderModel {
  id: string;
  label: string;
}

function logProviderFailure(provider: string, error: unknown): void {
  const reason = error instanceof ProviderFailure ? error.message
    : error instanceof z.ZodError ? 'unexpected response shape'
      : error instanceof SyntaxError ? 'invalid JSON'
        : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'request timed out'
          : 'request failed';
  console.error(`[assistant] ${provider}: ${reason}`);
}

async function tryModels(
  provider: string,
  models: ProviderModel[],
  retryStatuses: number[],
  call: (model: ProviderModel) => Promise<AssistantPlan>,
  diagnostics: string[],
  deadline: AbortSignal
): Promise<AssistantPlan | undefined> {
  for (const model of models) {
    if (deadline.aborted) break;
    try {
      return await call(model);
    } catch (error) {
      logProviderFailure(provider, error);
      const status = error instanceof ProviderFailure ? error.status : undefined;
      if (status !== undefined) diagnostics.push(`${provider} HTTP ${status}`);
      else if (error instanceof z.ZodError) diagnostics.push(`${provider} ZodError`);
      if (status === undefined || !retryStatuses.includes(status)) break;
    }
  }
}

function commuteLabels(profile: AssistantRequest['profile']) {
  const legacyLabel = Object.hasOwn(COMMUTE_LABELS, profile.commuteMode)
    ? COMMUTE_LABELS[profile.commuteMode as CommuteMode] : 'your selected commute';
  const cleanLabel = (label: string | undefined, fallback: string) => {
    if (!label) return fallback;
    if (Object.hasOwn(COMMUTE_LABELS, label)) return COMMUTE_LABELS[label as CommuteMode];
    return sanitizeUserText(label, 50) || fallback;
  };
  return {
    baselineCommuteLabel: cleanLabel(profile.baselineCommuteLabel, 'your usual commute'),
    chosenCommuteLabel: cleanLabel(profile.chosenCommuteLabel, legacyLabel)
  };
}

function buildPrompts(req: AssistantRequest): { system: string; user: string } {
  const safeCity = sanitizeUserText(req.city, 80);
  const safeQuestion = req.userQuestion ? sanitizeUserText(req.userQuestion, 240) : '';
  const { householdMembers, commuteKm, homeType, budgetTier } = req.profile;

  const system = [
    'You are VayuShield AI, a grounded urban air quality advisor helping families navigate severe smog and urban air pollution.',
    'STRICT RULES:',
    '1. Base every number ONLY on the telemetry and deterministic impact metrics provided in the user JSON. Never invent AQI values or unverified statistics.',
    '2. Return a JSON object with this schema: {"summary":string,"dailyRoutine":[{"timeBlock":string,"action":string,"whyItHelps":string}],"indoorHacks":[{"title":string,"steps":string,"costTier":string,"impact":string}],"sustainableSwaps":[{"swap":string,"directImpact":string}],"safetyNote":string}. Use 1–3 items per list and concise text.',
    '3. Keep recommendations practical, respectful of the household budgetTier, and clear about the direct impact of each choice.',
    '4. Include a brief non-medical informational disclaimer in safetyNote.',
    '5. Use the supplied commute labels in swaps, and keep the dominant pollutant separate from the PM2.5 reading.'
  ].join('\n');

  const user = JSON.stringify({
    location: safeCity,
    telemetry: {
      cpcbNaqi: req.aqi,
      category: req.category,
      dominantPollutant: req.dominantPollutant,
      pm25UgM3: req.pm25,
      pm10UgM3: req.pm10,
      cleanest2HourWindow: req.bestWindowLabel,
      worst2HourWindow: req.worstWindowLabel,
      worst2HourAverageNaqi: req.worstWindowAqi
    },
    household: { householdMembers, commuteKm, homeType, budgetTier, ...commuteLabels(req.profile) },
    activeChoices: req.activeChoices,
    computedChoiceImpact: req.impactSummary,
    specificQuestion: safeQuestion || 'Create today’s low-emission routine, indoor air hacks, and sustainable swaps.'
  });

  return { system, user };
}

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new ProviderFailure('plan did not contain a JSON object');
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

async function callGemini(
  apiKey: string,
  model: ProviderModel,
  system: string,
  user: string,
  fetchImpl: typeof fetch,
  deadline: AbortSignal
): Promise<AssistantPlan> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        ...(model.id === 'gemini-2.0-flash' ? {} : { thinkingConfig: { thinkingBudget: 0 } })
      }
    }),
    signal: AbortSignal.any([deadline, AbortSignal.timeout(20000)])
  });

  if (!res.ok) {
    throw new ProviderFailure(`HTTP ${res.status}`, res.status);
  }

  const data = geminiEnvelope.parse(await res.json());
  const text = data.candidates[0]?.content.parts
    .filter((part) => !part.thought).map((part) => part.text ?? '').join('').trim();
  if (!text) throw new ProviderFailure('empty response text');

  const parsed = AssistantPlanOutputSchema.parse(extractJsonObject(text));
  return {
    provider: 'gemini',
    modelLabel: model.label,
    ...parsed
  };
}

async function callOpenAiCompatible(
  endpoint: string,
  token: string,
  model: ProviderModel,
  provider: 'huggingface' | 'groq',
  system: string,
  user: string,
  fetchImpl: typeof fetch,
  deadline: AbortSignal
): Promise<AssistantPlan> {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      model: model.id,
      temperature: 0.3,
      ...(provider === 'groq' ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    }),
    signal: AbortSignal.any([deadline, AbortSignal.timeout(provider === 'groq' ? 15000 : 20000)])
  });

  if (!res.ok) {
    throw new ProviderFailure(`HTTP ${res.status}`, res.status);
  }

  const data = chatEnvelope.parse(await res.json());
  const content = data.choices[0]?.message.content.trim();
  if (!content) throw new ProviderFailure('empty response text');

  const parsed = AssistantPlanOutputSchema.parse(extractJsonObject(content));
  return {
    provider,
    modelLabel: model.label,
    ...parsed
  };
}

/**
 * 4-Tier Free-Tier Failover Orchestrator (strict descending capability):
 * 1. Gemini 2.5 Flash (Google AI Studio Free Tier)
 * 2. Hugging Face Inference Providers (https://router.huggingface.co/v1/chat/completions)
 * 3. Groq OpenAI-Compatible API (Llama 3.3 70B)
 * 4. Deterministic Local Routine Synthesizer (Zero-Key Guaranteed Fallback)
 */
export async function generatePlanWithFailover(
  req: AssistantRequest,
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

  const fallback = buildDeterministicPlan({
    city: sanitizeUserText(req.city, 80),
    aqi: req.aqi,
    category: req.category,
    dominantPollutant: req.dominantPollutant,
    pm25: req.pm25,
    pm10: req.pm10,
    bestWindowLabel: req.bestWindowLabel,
    worstWindowLabel: req.worstWindowLabel,
    worstWindowAqi: req.worstWindowAqi ?? req.aqi,
    householdMembers: req.profile.householdMembers,
    ...commuteLabels(req.profile),
    budgetTier: req.profile.budgetTier,
    exposureReductionPct: req.impactSummary.exposureReductionPct,
    annualCo2SavedKg: req.impactSummary.annualCo2SavedKg
  });
  return diagnostics.length ? { ...fallback, debugReason: diagnostics.join('; ') } : fallback;
}
