import type { VercelRequest, VercelResponse } from './_lib/httpTypes.js';
import { generatePlanWithFailover } from './_lib/providers.js';
import { AssistantRequestSchema, checkRateLimit, extractClientIp } from './_lib/schemas.js';

export const MAX_ASSISTANT_BODY_BYTES = 16 * 1024;

function exceedsPayloadLimit(req: VercelRequest): boolean {
  const headerLength = req.headers['content-length'];
  const contentLength = typeof headerLength === 'string' ? Number(headerLength) : Number.NaN;
  if (Number.isFinite(contentLength) && contentLength > MAX_ASSISTANT_BODY_BYTES) {
    return true;
  }

  const rawBody = req.body;
  if (typeof rawBody === 'string') {
    return Buffer.byteLength(rawBody, 'utf8') > MAX_ASSISTANT_BODY_BYTES;
  }
  if (Buffer.isBuffer(rawBody) || rawBody instanceof Uint8Array) {
    return rawBody.byteLength > MAX_ASSISTANT_BODY_BYTES;
  }
  if (rawBody !== undefined && rawBody !== null) {
    try {
      return Buffer.byteLength(JSON.stringify(rawBody), 'utf8') > MAX_ASSISTANT_BODY_BYTES;
    } catch {
      return true;
    }
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const clientIp = extractClientIp(req);
  const rate = checkRateLimit(clientIp, 20, 5 * 60 * 1000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return;
  }

  if (exceedsPayloadLimit(req)) {
    res.status(413).json({ error: 'Request payload exceeds the 16 KB limit.' });
    return;
  }

  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: 'Request body must contain valid JSON.' });
      return;
    }
  }

  const parsed = AssistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid assistant request payload.', details: parsed.error.flatten() });
    return;
  }

  const plan = await generatePlanWithFailover(parsed.data, {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    HF_TOKEN: process.env.HF_TOKEN,
    HF_MODEL: process.env.HF_MODEL,
    GROQ_API_KEY: process.env.GROQ_API_KEY
  });

  res.status(200).json(plan);
}
