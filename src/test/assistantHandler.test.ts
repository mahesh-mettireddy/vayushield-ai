import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import assistantHandler, { MAX_ASSISTANT_BODY_BYTES } from '../../api/assistant';
import type { VercelRequest, VercelResponse } from '../../api/_lib/httpTypes';
import { resetRateLimitCache, type AssistantRequest } from '../../api/_lib/schemas';

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
    householdMembers: ['Children'],
    commuteMode: 'metro',
    commuteKm: 16,
    homeType: 'apartment',
    budgetTier: 'budget_diy'
  },
  activeChoices: ['HEPA / DIY Corsi-Rosenthal Filtration'],
  impactSummary: { exposureReductionPct: 68, annualCo2SavedKg: 715 }
};

const VALID_PLAN_JSON = JSON.stringify({
  summary: 'New Delhi CPCB NAQI is 342.',
  dailyRoutine: [{ timeBlock: 'Morning', action: 'Stay indoors.', whyItHelps: 'High smog.' }],
  indoorHacks: [{ title: 'HEPA', steps: 'Run filter.', costTier: 'Standard', impact: 'Drops PM2.5.' }],
  sustainableSwaps: [{ swap: 'Metro', directImpact: 'Saves CO2.' }],
  safetyNote: 'Informational only.'
});

const ENV = { GEMINI_API_KEY: 'fixture-gemini', HF_TOKEN: 'fixture-hf', GROQ_API_KEY: 'fixture-groq' };

function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  remoteAddress?: string;
} = {}): VercelRequest {
  const socket = new Socket();
  if (options.remoteAddress) {
    Object.defineProperty(socket, 'remoteAddress', { value: options.remoteAddress, configurable: true });
  }
  const req = new IncomingMessage(socket);
  req.method = options.method ?? 'POST';
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      if (value !== undefined) req.headers[key.toLowerCase()] = value;
    }
  }
  return Object.assign(req, { query: {}, body: options.body });
}

function createMockResponse() {
  const raw = new ServerResponse(new IncomingMessage(new Socket()));
  const status = vi.fn();
  const json = vi.fn();
  const setHeader = vi.fn((_name: string, _value: number | string | readonly string[]): VercelResponse => res);
  const res: VercelResponse = Object.assign(raw, {
    setHeader,
    status: (code: number) => {
      status(code);
      return res;
    },
    json: (body: unknown) => {
      json(body);
      return res;
    }
  });
  return { res, status, json, setHeader };
}

describe('POST /api/assistant', () => {
  beforeEach(() => {
    resetRateLimitCache();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects non-POST methods on /api/assistant', async () => {
    const { res, status, setHeader } = createMockResponse();
    await assistantHandler(createMockRequest({ method: 'GET' }), res);
    expect(status).toHaveBeenCalledWith(405);
    expect(setHeader).toHaveBeenCalledWith('Allow', 'POST');
  });

  it.each([SAMPLE_REQ, JSON.stringify(SAMPLE_REQ)])('accepts object and raw JSON assistant requests', async (body) => {
    for (const key of Object.keys(ENV)) vi.stubEnv(key, '');
    const { res, status, json } = createMockResponse();
    await assistantHandler(createMockRequest({ body }), res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ provider: 'deterministic-fallback' }));
  });

  it('enforces the 16 KB payload limit before JSON.parse and returns 413', async () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    const oversized = '{"userQuestion":"' + 'x'.repeat(MAX_ASSISTANT_BODY_BYTES + 100) + '"}';
    const { res, status, json } = createMockResponse();
    await assistantHandler(createMockRequest({ body: oversized }), res);
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({ error: 'Request payload exceeds the 16 KB limit.' });
    expect(parseSpy).not.toHaveBeenCalled();

    const headerOver = createMockResponse();
    await assistantHandler(createMockRequest({
      headers: { 'content-length': String(MAX_ASSISTANT_BODY_BYTES + 1) },
      body: SAMPLE_REQ
    }), headerOver.res);
    expect(headerOver.status).toHaveBeenCalledWith(413);
  });

  it('returns 400 for malformed JSON and invalid request schema', async () => {
    const badJson = createMockResponse();
    await assistantHandler(createMockRequest({ body: '{invalid' }), badJson.res);
    expect(badJson.status).toHaveBeenCalledWith(400);

    const badSchema = createMockResponse();
    await assistantHandler(createMockRequest({ body: { city: '' } }), badSchema.res);
    expect(badSchema.status).toHaveBeenCalledWith(400);
  });

  it('enforces 20 req / 5 min rate limit and prefers trusted proxy IP headers', async () => {
    for (const key of Object.keys(ENV)) vi.stubEnv(key, '');

    for (let i = 0; i < 20; i++) {
      const ok = createMockResponse();
      await assistantHandler(createMockRequest({
        headers: { 'x-vercel-forwarded-for': '203.0.113.10', 'x-forwarded-for': `198.51.100.${i}` },
        body: SAMPLE_REQ
      }), ok.res);
      expect(ok.status).toHaveBeenCalledWith(200);
    }

    const limited = createMockResponse();
    await assistantHandler(createMockRequest({
      headers: { 'x-vercel-forwarded-for': '203.0.113.10', 'x-forwarded-for': '198.51.100.99' },
      body: SAMPLE_REQ
    }), limited.res);
    expect(limited.status).toHaveBeenCalledWith(429);
    expect(limited.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));

    // Different trusted x-real-ip with same spoofed x-forwarded-for should still be allowed
    const separateIp = createMockResponse();
    await assistantHandler(createMockRequest({
      headers: { 'x-real-ip': '203.0.113.11', 'x-forwarded-for': '198.51.100.99' },
      body: SAMPLE_REQ
    }), separateIp.res);
    expect(separateIp.status).toHaveBeenCalledWith(200);
  });

  it.each(['gemini', 'huggingface', 'groq'] as const)('returns a %s plan through POST /api/assistant', async (provider) => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    if (provider !== 'gemini') fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }));
    if (provider === 'groq') fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }));
    fetchMock.mockResolvedValueOnce(
      provider === 'gemini'
        ? Response.json({ candidates: [{ content: { parts: [{ text: VALID_PLAN_JSON }] } }] })
        : Response.json({ choices: [{ message: { content: VALID_PLAN_JSON } }] })
    );
    const { res, status, json } = createMockResponse();
    await assistantHandler(createMockRequest({
      headers: { 'x-forwarded-for': 'test-' + provider },
      body: JSON.stringify(SAMPLE_REQ)
    }), res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ provider }));
  });
});
