import { afterEach, describe, expect, it, vi } from 'vitest';
import healthHandler from '../../api/health';
import { createMockRequest, createMockResponse } from './httpMock';

describe('GET /api/health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reports boolean provider flags without leaking secret values', () => {
    vi.stubEnv('GEMINI_API_KEY', 'super-secret-gemini-key');
    vi.stubEnv('HF_TOKEN', '');
    vi.stubEnv('GROQ_API_KEY', 'super-secret-groq-key');
    vi.stubEnv('OPENAQ_API_KEY', '');

    const { res, status, json, setHeader } = createMockResponse();
    healthHandler(createMockRequest({ method: 'GET' }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');

    const payload = json.mock.calls[0]?.[0];
    expect(payload).toEqual({
      ok: true,
      providers: { gemini: true, huggingface: false, groq: true, openaq: false }
    });
    expect(JSON.stringify(payload)).not.toContain('super-secret');
  });

  it.each(['POST', 'PUT', 'DELETE'])('rejects %s requests with 405 and Allow: GET', (method) => {
    const { res, status, json, setHeader } = createMockResponse();
    healthHandler(createMockRequest({ method }), res);

    expect(status).toHaveBeenCalledWith(405);
    expect(setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(json).toHaveBeenCalledWith({ error: 'Method not allowed. Use GET.' });
  });
});
