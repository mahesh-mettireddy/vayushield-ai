import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURATED_PLAYBOOK } from '../data/presets';
import {
  rankPlaybookByKeywords,
  rankPlaybookWithLocalHf,
  resetSemanticExtractorCache
} from '../services/semanticPlaybook';

const { mockPipeline, envMock } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
  envMock: { useWasmCache: true }
}));

vi.mock('@huggingface/transformers', () => ({
  env: envMock,
  pipeline: mockPipeline
}));

describe('semanticPlaybook service', () => {
  beforeEach(() => {
    resetSemanticExtractorCache();
    mockPipeline.mockReset();
    envMock.useWasmCache = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ranks playbook tips by keywords and handles empty or unmatched tokens', () => {
    const all = rankPlaybookByKeywords('   ', CURATED_PLAYBOOK);
    expect(all).toHaveLength(CURATED_PLAYBOOK.length);
    expect(all[0]?.score).toBe(1);

    const matched = rankPlaybookByKeywords('cooking exhaust', CURATED_PLAYBOOK);
    expect(matched[0]?.tip.id).toBe('kitchen-exhaust-back-burner');
    expect(matched[0]?.score).toBe(1);

    expect(rankPlaybookByKeywords('!@#$%', CURATED_PLAYBOOK)).toEqual([]);
    expect(rankPlaybookByKeywords('quasar', CURATED_PLAYBOOK)).toEqual([]);
  });

  it('returns all tips immediately for blank query in semantic mode without loading WASM', async () => {
    const res = await rankPlaybookWithLocalHf('  ', CURATED_PLAYBOOK);
    expect(res).toHaveLength(CURATED_PLAYBOOK.length);
    expect(res[0]?.mode).toBe('hf-wasm');
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('lazily loads Transformers.js with useWasmCache disabled, ranks by cosine similarity, and caches extractor', async () => {
    const extractor = vi.fn(async (text: string) => {
      if (text.includes('kitchen air') || text.includes('Kitchen Exhaust')) {
        return { data: new Float32Array([1, 0]) };
      }
      return { data: new Float32Array([0.1, 0.99]) };
    });
    mockPipeline.mockResolvedValueOnce(extractor);

    const ranked = await rankPlaybookWithLocalHf('kitchen air', CURATED_PLAYBOOK);
    expect(envMock.useWasmCache).toBe(false);
    expect(mockPipeline).toHaveBeenCalledTimes(1);
    expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    expect(ranked[0]?.tip.id).toBe('kitchen-exhaust-back-burner');
    expect(ranked[0]?.mode).toBe('hf-wasm');
    expect(ranked[0]?.score).toBe(1);

    await rankPlaybookWithLocalHf('mask', CURATED_PLAYBOOK);
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('throws controlled errors when pipeline or tensor output has an unexpected shape', async () => {
    mockPipeline.mockResolvedValueOnce({ invalid: true });
    await expect(rankPlaybookWithLocalHf('purifier', CURATED_PLAYBOOK)).rejects.toThrow(
      'Local feature extraction pipeline failed to initialize.'
    );

    resetSemanticExtractorCache();
    mockPipeline.mockResolvedValueOnce(async () => ({ badTensor: true }));
    await expect(rankPlaybookWithLocalHf('purifier', CURATED_PLAYBOOK)).rejects.toThrow(
      'Unexpected feature tensor shape from local embedding model.'
    );
  });
});
