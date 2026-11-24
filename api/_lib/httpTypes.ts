import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel adds these helpers to Node's request and response objects at runtime.
export type VercelRequest = IncomingMessage & {
  query: Record<string, string | string[]>;
  body: unknown;
};

export type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
};
