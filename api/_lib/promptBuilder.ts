import type { DeterministicPlanInput } from '../../src/engine/deterministicFallback.js';
import { COMMUTE_LABELS } from '../../src/engine/impactCalculator.js';
import { sanitizeUserText, type AssistantRequest } from './schemas.js';

function findCommuteLabel(mode: string): string | undefined {
  return Object.entries(COMMUTE_LABELS).find(([key]) => key === mode)?.[1];
}

/** Resolves safe human-readable baseline and target commute labels from an assistant request profile. */
export function resolveCommuteLabels(profile: AssistantRequest['profile']): {
  baselineCommuteLabel: string;
  chosenCommuteLabel: string;
} {
  const legacyLabel = findCommuteLabel(profile.commuteMode) ?? 'your selected commute';
  const cleanLabel = (label: string | undefined, fallback: string): string => {
    if (!label) return fallback;
    return findCommuteLabel(label) ?? (sanitizeUserText(label, 50) || fallback);
  };

  return {
    baselineCommuteLabel: cleanLabel(profile.baselineCommuteLabel, 'your usual commute'),
    chosenCommuteLabel: cleanLabel(profile.chosenCommuteLabel, legacyLabel)
  };
}

function sanitizeList(items: ReadonlyArray<string>, maxLength: number): string[] {
  return items.map((item) => sanitizeUserText(item, maxLength)).filter(Boolean);
}

/** Constructs sanitized system and user JSON prompts for the upstream LLM planner. */
export function buildPrompts(req: AssistantRequest): { system: string; user: string } {
  const safeCity = sanitizeUserText(req.city, 80);
  const safeCategory = sanitizeUserText(req.category, 32);
  const safeDominant = sanitizeUserText(req.dominantPollutant, 16);
  const safeBestWindow = sanitizeUserText(req.bestWindowLabel, 40);
  const safeWorstWindow = sanitizeUserText(req.worstWindowLabel, 40);
  const safeMembers = sanitizeList(req.profile.householdMembers, 40);
  const safeChoices = sanitizeList(req.activeChoices, 80);
  const safeQuestion = req.userQuestion ? sanitizeUserText(req.userQuestion, 240) : '';
  const { commuteKm, homeType, budgetTier } = req.profile;

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
      category: safeCategory,
      dominantPollutant: safeDominant,
      pm25UgM3: req.pm25,
      pm10UgM3: req.pm10,
      cleanest2HourWindow: safeBestWindow,
      worst2HourWindow: safeWorstWindow,
      worst2HourAverageNaqi: req.worstWindowAqi
    },
    household: {
      householdMembers: safeMembers,
      commuteKm,
      homeType,
      budgetTier,
      ...resolveCommuteLabels(req.profile)
    },
    activeChoices: safeChoices,
    computedChoiceImpact: req.impactSummary,
    specificQuestion:
      safeQuestion ||
      'Create today’s low-emission routine, indoor air hacks, and sustainable swaps.'
  });

  return { system, user };
}

/** Maps a sanitized `AssistantRequest` into inputs for the deterministic fallback routine engine. */
export function buildFallbackInput(req: AssistantRequest): DeterministicPlanInput {
  return {
    city: sanitizeUserText(req.city, 80),
    aqi: req.aqi,
    category: sanitizeUserText(req.category, 32),
    dominantPollutant: sanitizeUserText(req.dominantPollutant, 16),
    pm25: req.pm25,
    pm10: req.pm10,
    bestWindowLabel: sanitizeUserText(req.bestWindowLabel, 40),
    worstWindowLabel: sanitizeUserText(req.worstWindowLabel, 40),
    worstWindowAqi: req.worstWindowAqi ?? req.aqi,
    householdMembers: sanitizeList(req.profile.householdMembers, 40),
    ...resolveCommuteLabels(req.profile),
    budgetTier: req.profile.budgetTier,
    exposureReductionPct: req.impactSummary.exposureReductionPct,
    annualCo2SavedKg: req.impactSummary.annualCo2SavedKg
  };
}
