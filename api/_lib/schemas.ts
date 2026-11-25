import { z } from 'zod';

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

function normalizeKeys(value: unknown, aliases: Record<string, string>): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const output = { ...input };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (Object.hasOwn(input, alias)) output[canonical] ??= input[alias];
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

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateEntry>();

export function checkRateLimit(
  clientKey: string,
  limit = 20,
  windowMs = 5 * 60 * 1000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const existing = rateBuckets.get(clientKey);

  if (!existing || now >= existing.resetAt) {
    rateBuckets.set(clientKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}
