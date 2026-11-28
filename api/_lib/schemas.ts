import { z } from 'zod';
import { BoundedTtlCache } from './boundedCache.js';
import type { VercelRequest } from './httpTypes.js';

/** Strips control characters and prompt-injection delimiters from user-supplied text. */
export function sanitizeUserText(raw: string, maxLength: number): string {
  return raw
    // Deliberately strips ASCII control characters from user text.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/```|<<<|>>>|<\/?system>|<\/?assistant>/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function readHeaderValue(header: string | string[] | undefined): string {
  if (Array.isArray(header)) return header[0]?.split(',')[0]?.trim() ?? '';
  return header?.split(',')[0]?.trim() ?? '';
}

/**
 * Extracts a bounded client IP key, preferring trusted Vercel/reverse-proxy headers
 * before falling back to x-forwarded-for or the socket address.
 */
export function extractClientIp(req: Pick<VercelRequest, 'headers' | 'socket'>): string {
  const candidates = [
    readHeaderValue(req.headers['x-vercel-forwarded-for']),
    readHeaderValue(req.headers['x-real-ip']),
    readHeaderValue(req.headers['x-forwarded-for']),
    req.socket?.remoteAddress?.trim() ?? ''
  ];
  const resolved = candidates.find((candidate) => candidate.length > 0) ?? 'unknown';
  return resolved.slice(0, 64);
}

export const OpenMeteoAirDataSchema = z.object({
  timezone: z.string().min(1),
  current: z.object({
    pm2_5: z.number().nullable().optional(),
    pm10: z.number().nullable().optional(),
    nitrogen_dioxide: z.number().nullable().optional(),
    sulphur_dioxide: z.number().nullable().optional(),
    ozone: z.number().nullable().optional(),
    carbon_monoxide: z.number().nullable().optional()
  }).optional(),
  hourly: z.object({
    time: z.array(z.number()),
    pm2_5: z.array(z.number().nullable()).optional(),
    pm10: z.array(z.number().nullable()).optional(),
    nitrogen_dioxide: z.array(z.number().nullable()).optional(),
    sulphur_dioxide: z.array(z.number().nullable()).optional(),
    ozone: z.array(z.number().nullable()).optional(),
    carbon_monoxide: z.array(z.number().nullable()).optional()
  }).optional()
});

export const AirQualityQuerySchema = z.union([
  z.object({
    q: z.string().trim().min(2).max(80)
  }),
  z.object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
    city: z.string().trim().min(1).max(80).optional(),
    region: z.string().trim().max(80).optional(),
    country: z.string().trim().max(80).optional()
  })
]);

export const AssistantRequestSchema = z.object({
  city: z.string().trim().min(1).max(80),
  aqi: z.number().min(0).max(500),
  category: z.string().trim().min(1).max(32),
  dominantPollutant: z.string().trim().min(1).max(16),
  pm25: z.number().min(0).max(2000),
  pm10: z.number().min(0).max(4000),
  bestWindowLabel: z.string().trim().min(1).max(40),
  worstWindowLabel: z.string().trim().min(1).max(40),
  worstWindowAqi: z.number().min(0).max(500).optional(),
  profile: z.object({
    householdMembers: z.array(z.string().trim().max(40)).max(6),
    commuteMode: z.string().trim().min(1).max(30),
    baselineCommuteLabel: z.string().trim().min(1).max(50).optional(),
    chosenCommuteLabel: z.string().trim().min(1).max(50).optional(),
    commuteKm: z.number().min(0).max(200),
    homeType: z.enum(['apartment', 'independent_house', 'shared_flat']),
    budgetTier: z.enum(['zero_cost', 'budget_diy', 'standard'])
  }),
  activeChoices: z.array(z.string().trim().max(80)).max(10),
  impactSummary: z.object({
    exposureReductionPct: z.number().min(0).max(100),
    annualCo2SavedKg: z.number().min(0).max(50000)
  }),
  userQuestion: z.string().max(300).optional()
});

export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKeys(value: unknown, aliases: Record<string, string>): unknown {
  if (!isPlainRecord(value)) return value;
  const output: Record<string, unknown> = { ...value };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (Object.hasOwn(value, alias)) output[canonical] ??= value[alias];
  }
  return output;
}

const planText = z.string().trim().min(1).max(600);
const routineStep = z.preprocess(
  (value) => normalizeKeys(value, { time_block: 'timeBlock', why_it_helps: 'whyItHelps' }),
  z.object({ timeBlock: z.string().trim().min(1).max(120), action: planText, whyItHelps: planText })
);
const indoorHack = z.preprocess(
  (value) => normalizeKeys(value, { cost_tier: 'costTier' }),
  z.object({ title: z.string().trim().min(1).max(160), steps: planText, costTier: z.string().trim().min(1).max(80), impact: planText })
);
const sustainableSwap = z.preprocess(
  (value) => normalizeKeys(value, { direct_impact: 'directImpact' }),
  z.object({ swap: z.string().trim().min(1).max(240), directImpact: planText })
);

export const AssistantPlanOutputSchema = z.preprocess(
  (value) => normalizeKeys(value, {
    daily_routine: 'dailyRoutine', indoor_hacks: 'indoorHacks',
    sustainable_swaps: 'sustainableSwaps', safety_note: 'safetyNote'
  }),
  z.object({
    summary: z.string().trim().min(1).max(1200),
    dailyRoutine: z.array(routineStep).min(1).max(6),
    indoorHacks: z.array(indoorHack).min(1).max(6),
    sustainableSwaps: z.array(sustainableSwap).min(1).max(6),
    safetyNote: planText
  })
);

const RATE_LIMIT_MAX_KEYS = 500;
const rateLimitMap = new BoundedTtlCache<number>(RATE_LIMIT_MAX_KEYS);

export function resetRateLimitCache(): void {
  rateLimitMap.clear();
}

export function checkRateLimit(
  clientKey: string,
  limit = 20,
  windowMs = 5 * 60 * 1000
): { allowed: boolean; retryAfterSec: number } {
  if (limit <= 0) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)) };
  }

  const now = Date.now();
  const existing = rateLimitMap.getEntry(clientKey);

  if (!existing || now >= existing.expiresAt) {
    rateLimitMap.set(clientKey, 1, now + windowMs);
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.value >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000))
    };
  }

  rateLimitMap.set(clientKey, existing.value + 1, existing.expiresAt);
  return { allowed: true, retryAfterSec: 0 };
}
