import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractJsonObject, logProviderFailure, tryModels } from '../../api/_lib/providerAdapters';
import { generatePlanWithFailover } from '../../api/_lib/providers';
import { AssistantPlanOutputSchema, type AssistantRequest } from '../../api/_lib/schemas';

const SAMPLE_REQ: AssistantRequest = {
  city: 'New Delhi',
  aqi: 342,
  category: 'Very Poor',
  dominantPollutant: 'pm25',
  pm25: 175,
  pm10: 290,
  bestWindowLabel: '2 PM – 4 PM',
  worstWindowLabel: '7 AM – 9 AM',
  profile: {
    householdMembers: ['Children', 'Daily Commuters'],
    commuteMode: 'metro',
    baselineCommuteLabel: 'Solo Petrol/Diesel Car',
    chosenCommuteLabel: 'Metro / Electric Rail',
    commuteKm: 16,
    homeType: 'apartment',
    budgetTier: 'budget_diy'
  },
  activeChoices: ['HEPA / DIY Corsi-Rosenthal Filtration'],
  impactSummary: { exposureReductionPct: 68, annualCo2SavedKg: 715 }
};

const VALID_PLAN_JSON = JSON.stringify({
  summary: 'New Delhi is at CPCB NAQI 342.',
  dailyRoutine: [{ timeBlock: 'Morning', action: 'Stay indoors.', whyItHelps: 'High smog.' }],
  indoorHacks: [
    { title: 'HEPA', steps: 'Run filter.', costTier: 'Standard', impact: 'Drops PM2.5.' }
  ],
  sustainableSwaps: [{ swap: 'Metro', directImpact: 'Saves CO2.' }],
  safetyNote: 'Informational only.'
});

const ENV = {
  GEMINI_API_KEY: 'fixture-gemini',
  HF_TOKEN: 'fixture-hf',
  GROQ_API_KEY: 'fixture-groq'
};
const chatResponse = (content: string) => Response.json({ choices: [{ message: { content } }] });
const geminiResponse = (text: string) =>
  Response.json({ candidates: [{ content: { parts: [{ text }] } }] });

describe('Provider Model Retries, Schema Normalization & Adapters', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([400, 404])(
    'retries Gemini 2.0 once after Gemini 2.5 returns HTTP %i',
    async (status) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('', { status }))
        .mockResolvedValueOnce(geminiResponse(VALID_PLAN_JSON));
      const plan = await generatePlanWithFailover(SAMPLE_REQ, ENV, fetchMock);
      expect(plan.modelLabel).toBe('Gemini 2.0 Flash');
      expect(fetchMock.mock.calls[1]?.[0]).toContain('/gemini-2.0-flash:');
      expect(
        JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).generationConfig
      ).not.toHaveProperty('thinkingConfig');
    }
  );

  it('tries a supported Gemini model if both legacy models are unavailable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(geminiResponse(VALID_PLAN_JSON));
    expect((await generatePlanWithFailover(SAMPLE_REQ, ENV, fetchMock)).modelLabel).toBe(
      'Gemini 2.5 Flash-Lite'
    );
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/gemini-2.5-flash-lite:');
  });

  it.each([404, 422])('tries the Hugging Face Llama model after HTTP %i', async (status) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status }))
      .mockResolvedValueOnce(chatResponse(VALID_PLAN_JSON));
    const plan = await generatePlanWithFailover(
      SAMPLE_REQ,
      { HF_TOKEN: 'test-hf', HF_MODEL: 'custom/model' },
      fetchMock
    );
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model)).toEqual([
      'custom/model',
      'meta-llama/Llama-3.3-70B-Instruct'
    ]);
    expect(plan.provider).toBe('huggingface');
  });

  it('switches to a supported Groq model after HTTP 400', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 400 }))
      .mockResolvedValueOnce(chatResponse(VALID_PLAN_JSON));
    expect(
      (await generatePlanWithFailover(SAMPLE_REQ, { GROQ_API_KEY: 'test-groq' }, fetchMock))
        .provider
    ).toBe('groq');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      model: 'openai/gpt-oss-120b',
      response_format: { type: 'json_object' }
    });
  });

  it('normalizes snake_case keys and long fields before validating', async () => {
    const summary = 'S'.repeat(1100);
    const action = 'A'.repeat(590);
    const remote = {
      summary,
      daily_routine: [{ time_block: 'Morning', action, why_it_helps: 'Avoid traffic.' }],
      indoor_hacks: [
        { title: 'Filter', steps: 'Run it.', cost_tier: 'Budget', impact: 'Filters.' }
      ],
      sustainable_swaps: [{ swap: 'Rail', direct_impact: 'Lower emissions.' }],
      safety_note: 'General.'
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(geminiResponse(JSON.stringify(remote)));
    const plan = await generatePlanWithFailover(SAMPLE_REQ, ENV, fetchMock);
    expect(plan).toMatchObject({
      summary,
      dailyRoutine: [{ timeBlock: 'Morning', action, whyItHelps: 'Avoid traffic.' }]
    });
  });

  it('uses deterministic fallback with no keys and handles timeouts, empty parts, missing braces, and aborted signals', async () => {
    expect((await generatePlanWithFailover(SAMPLE_REQ, {})).provider).toBe(
      'deterministic-fallback'
    );

    const timeoutErr = new Error('timed out');
    timeoutErr.name = 'TimeoutError';
    logProviderFailure('TestProvider', timeoutErr);
    expect(console.error).toHaveBeenCalledWith('[assistant] TestProvider: request timed out');
    expect(() => extractJsonObject('no braces here')).toThrow('plan did not contain a JSON object');
    expect(AssistantPlanOutputSchema.safeParse('not-an-object').success).toBe(false);

    const controller = new AbortController();
    controller.abort();
    const callSpy = vi.fn();
    expect(
      await tryModels('Gemini', [{ id: 'm1', label: 'M1' }], [], callSpy, [], controller.signal)
    ).toBeUndefined();
    expect(callSpy).not.toHaveBeenCalled();

    const emptyPartsMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }] } }] })
      )
      .mockResolvedValueOnce(chatResponse('   '))
      .mockResolvedValueOnce(chatResponse(VALID_PLAN_JSON));
    expect((await generatePlanWithFailover(SAMPLE_REQ, ENV, emptyPartsMock)).provider).toBe('groq');
  });
});
