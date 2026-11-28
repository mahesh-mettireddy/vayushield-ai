import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import healthHandler from '../../api/health';
import type { VercelRequest, VercelResponse } from '../../api/_lib/httpTypes';

function createMockRequest(method = 'GET'): VercelRequest {
  const req = new IncomingMessage(new Socket());
  req.method = method;
  return Object.assign(req, { query: {}, body: undefined });
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
    healthHandler(createMockRequest('GET'), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');

    const payload = json.mock.calls[0]?.[0];
    expect(payload).toEqual({
      ok: true,
      providers: {
        gemini: true,
        huggingface: false,
        groq: true,
        openaq: false
      }
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('super-secret');
  });

  it.each(['POST', 'PUT', 'DELETE'])('rejects %s requests with 405 and Allow: GET', (method) => {
    const { res, status, json, setHeader } = createMockResponse();
    healthHandler(createMockRequest(method), res);

    expect(status).toHaveBeenCalledWith(405);
    expect(setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(json).toHaveBeenCalledWith({ error: 'Method not allowed. Use GET.' });
  });
});
