import type { PlaybookTip } from '../types/airQuality';

export interface RankedPlaybookTip {
  tip: PlaybookTip;
  score: number;
  mode: 'keyword' | 'hf-wasm';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

export function rankPlaybookByKeywords(query: string, tips: PlaybookTip[]): RankedPlaybookTip[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return tips.map((tip) => ({ tip, score: 1, mode: 'keyword' }));
  }

  return tips
    .map((tip) => {
      const haystack = `${tip.title} ${tip.summary} ${tip.steps} ${tip.keywords.join(' ')}`.toLowerCase();
      let matches = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) matches += 1;
      }
      const score = matches / tokens.length;
      return { tip, score, mode: 'keyword' as const };
    })
    .sort((a, b) => b.score - a.score);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

type FeatureExtractor = (
  text: string,
  options?: { pooling?: 'mean'; normalize?: boolean }
) => Promise<{ data: Float32Array | number[] }>;

let cachedExtractor: FeatureExtractor | null = null;

/**
 * Lazily loads Hugging Face Transformers.js (WASM) in the browser only when the user opts in.
 * Zero initial bundle bloat and zero server API cost (Goldfish Review Finding #5).
 */
export async function rankPlaybookWithLocalHf(
  query: string,
  tips: PlaybookTip[]
): Promise<RankedPlaybookTip[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return tips.map((tip) => ({ tip, score: 1, mode: 'hf-wasm' }));
  }

  if (!cachedExtractor) {
    const transformers = await import('@huggingface/transformers');
    // The library's WASM cache loads its factory from a blob URL. Use HTTP caching under the app's CSP.
    transformers.env.useWasmCache = false;
    cachedExtractor = (await transformers.pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    )) as unknown as FeatureExtractor;
  }

  const queryTensor = await cachedExtractor(cleanQuery, { pooling: 'mean', normalize: true });
  const queryVec = Array.from(queryTensor.data);

  const scored: RankedPlaybookTip[] = [];
  for (const tip of tips) {
    const docText = `${tip.title}. ${tip.summary} ${tip.steps}`;
    const docTensor = await cachedExtractor(docText, { pooling: 'mean', normalize: true });
    const docVec = Array.from(docTensor.data);
    scored.push({
      tip,
      score: Math.max(0, Math.round(cosineSimilarity(queryVec, docVec) * 100) / 100),
      mode: 'hf-wasm'
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}
