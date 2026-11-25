import type { VercelRequest, VercelResponse } from './_lib/httpTypes.js';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  res.status(200).json({
    ok: true,
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      huggingface: Boolean(process.env.HF_TOKEN),
      groq: Boolean(process.env.GROQ_API_KEY),
      openaq: Boolean(process.env.OPENAQ_API_KEY)
    }
  });
}
