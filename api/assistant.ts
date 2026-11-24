import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generatePlanWithFailover } from './_lib/providers';
import { AssistantRequestSchema, checkRateLimit } from './_lib/schemas';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = Array.isArray(forwarded)
    ? (forwarded[0] ?? 'unknown')
    : (forwarded?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown');

  const rate = checkRateLimit(clientIp, 20, 5 * 60 * 1000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return;
  }

  const parsed = AssistantRequestSchema.safeParse(req.body);
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
