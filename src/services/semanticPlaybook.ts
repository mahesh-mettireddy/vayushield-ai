import type { PlaybookTip } from '../types/airQuality';

/** Scored playbook entry tagged with its matching engine (`keyword` or `hf-wasm`). */
export interface RankedPlaybookTip {
  tip: PlaybookTip;
  score: number;
  mode: 'keyword' | 'hf-wasm';
}

/** Shape of tensor output returned by Hugging Face Transformers feature extraction pipelines. */
export interface FeatureTensorLike {
  data: Float32Array | number[] | ArrayLike<number>;
}

/** Function interface for a browser WASM sentence-embedding extractor. */
export type FeatureExtractor = (
  text: string,
  options?: { pooling?: 'mean'; normalize?: boolean }
) => Promise<FeatureTensorLike>;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/** Ranks indoor air playbook tips instantaneously using normalized keyword overlap. */
export function rankPlaybookByKeywords(query: string, tips: PlaybookTip[]): RankedPlaybookTip[] {
  if (!query.trim()) {
    return tips.map((tip) => ({ tip, score: 1, mode: 'keyword' }));
  }
  const tokens = [...new Set(tokenize(query))];
  if (tokens.length === 0) return [];

  return tips
    .map((tip) => {
      const haystack = new Set(
        tokenize(`${tip.title} ${tip.summary} ${tip.steps} ${tip.keywords.join(' ')}`)
      );
      let matches = 0;
      for (const token of tokens) {
        if (haystack.has(token)) matches += 1;
      }
      return { tip, score: matches / tokens.length, mode: 'keyword' as const };
    })
    .filter((item) => item.score > 0)
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

function isNumericTensorData(value: unknown): value is Float32Array | number[] | ArrayLike<number> {
  if (value instanceof Float32Array || Array.isArray(value)) {
    return Array.isArray(value) ? value.every((item) => typeof item === 'number') : true;
  }
  if (typeof value === 'object' && value !== null && 'length' in value) {
    const length = Reflect.get(value, 'length');
    return typeof length === 'number' && length >= 0;
  }
  return false;
}

function isFeatureTensor(value: unknown): value is FeatureTensorLike {
  return (
    typeof value === 'object' && value !== null && isNumericTensorData(Reflect.get(value, 'data'))
  );
}

function isFeatureExtractor(value: unknown): value is FeatureExtractor {
  return typeof value === 'function';
}

function extractVector(tensor: unknown): number[] {
  if (!isFeatureTensor(tensor)) {
    throw new Error('Unexpected feature tensor shape from local embedding model.');
  }
  return Array.from(tensor.data, Number);
}

let cachedExtractor: FeatureExtractor | null = null;

/** Clears the cached browser WASM feature-extraction pipeline instance. */
export function resetSemanticExtractorCache(): void {
  cachedExtractor = null;
}

async function getOrCreateExtractor(): Promise<FeatureExtractor> {
  if (cachedExtractor) return cachedExtractor;
  const transformers = await import('@huggingface/transformers');
  // The library's WASM cache loads its factory from a blob URL. Use HTTP caching under the app's CSP.
  transformers.env.useWasmCache = false;
  const created: unknown = await transformers.pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );
  if (!isFeatureExtractor(created)) {
    throw new Error('Local feature extraction pipeline failed to initialize.');
  }
  cachedExtractor = created;
  return cachedExtractor;
}

/** Lazily loads Hugging Face Transformers.js (WASM) in the browser only when the user opts in. */
export async function rankPlaybookWithLocalHf(
  query: string,
  tips: PlaybookTip[]
): Promise<RankedPlaybookTip[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return tips.map((tip) => ({ tip, score: 1, mode: 'hf-wasm' }));
  }

  const extractor = await getOrCreateExtractor();
  const queryVec = extractVector(await extractor(cleanQuery, { pooling: 'mean', normalize: true }));
  const scored: RankedPlaybookTip[] = [];

  for (const tip of tips) {
    const docText = `${tip.title}. ${tip.summary} ${tip.steps}`;
    const docVec = extractVector(await extractor(docText, { pooling: 'mean', normalize: true }));
    scored.push({
      tip,
      score: Math.max(0, Math.round(cosineSimilarity(queryVec, docVec) * 100) / 100),
      mode: 'hf-wasm'
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}
