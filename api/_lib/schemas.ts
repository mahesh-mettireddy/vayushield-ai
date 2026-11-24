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
  profile: z.object({
    householdMembers: z.array(z.string().trim().max(40)).max(6),
    commuteMode: z.string().trim().min(1).max(30),
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

export const AssistantPlanOutputSchema = z.object({
  summary: z.string().min(10).max(600),
  dailyRoutine: z
    .array(
      z.object({
        timeBlock: z.string().min(2).max(80),
        action: z.string().min(5).max(320),
        whyItHelps: z.string().min(5).max(280)
      })
    )
    .min(2)
    .max(5),
  indoorHacks: z
    .array(
      z.object({
        title: z.string().min(2).max(100),
        steps: z.string().min(5).max(320),
        costTier: z.string().min(2).max(40),
        impact: z.string().min(5).max(220)
      })
    )
    .min(2)
    .max(5),
  sustainableSwaps: z
    .array(
      z.object({
        swap: z.string().min(4).max(160),
        directImpact: z.string().min(5).max(260)
      })
    )
    .min(2)
    .max(5),
  safetyNote: z.string().min(10).max(300)
});

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
