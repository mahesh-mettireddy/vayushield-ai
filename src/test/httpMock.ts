import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '../../api/_lib/httpTypes';

export function createMockRequest(
  options: {
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[]>;
    body?: unknown;
    remoteAddress?: string;
  } = {}
): VercelRequest {
  const socket = new Socket();
  if (options.remoteAddress) {
    Object.defineProperty(socket, 'remoteAddress', {
      value: options.remoteAddress,
      configurable: true
    });
  }
  const req = new IncomingMessage(socket);
  req.method = options.method ?? 'GET';
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      if (value !== undefined) req.headers[key.toLowerCase()] = value;
    }
  }
  return Object.assign(req, { query: options.query ?? {}, body: options.body });
}

export function createMockResponse() {
  const raw = new ServerResponse(new IncomingMessage(new Socket()));
  const status = vi.fn();
  const json = vi.fn();
  const setHeader = vi.fn(
    (_name: string, _value: number | string | readonly string[]): VercelResponse => res
  );
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
