import { z } from 'zod';
import type { AssistantPlan } from '../../src/types/airQuality.js';
import { AssistantPlanOutputSchema } from './schemas.js';

export interface ProviderEnv {
  GEMINI_API_KEY?: string;
  HF_TOKEN?: string;
  HF_MODEL?: string;
  GROQ_API_KEY?: string;
}

export interface ProviderModel {
  id: string;
  label: string;
}

const geminiEnvelope = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) })
  })).min(1)
});

const chatEnvelope = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1)
});

export class ProviderFailure extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export function logProviderFailure(provider: string, error: unknown): void {
  const reason = error instanceof ProviderFailure ? error.message
    : error instanceof z.ZodError ? 'unexpected response shape'
      : error instanceof SyntaxError ? 'invalid JSON'
        : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'request timed out'
          : 'request failed';
  console.error(`[assistant] ${provider}: ${reason}`);
}

export function extractJsonObject(rawText: string): unknown {
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

export async function tryModels(
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
  return undefined;
}

export async function callGemini(
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

export async function callOpenAiCompatible(
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
