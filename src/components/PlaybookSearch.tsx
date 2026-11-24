import { useMemo, useState } from 'react';
import { BookOpen, Cpu, ExternalLink, Search } from 'lucide-react';
import { CURATED_PLAYBOOK } from '../data/presets';
import {
  rankPlaybookByKeywords,
  rankPlaybookWithLocalHf,
  type RankedPlaybookTip
} from '../services/semanticPlaybook';

export function PlaybookSearch() {
  const [query, setQuery] = useState('');
  const [hfLoading, setHfLoading] = useState(false);
  const [hfError, setHfError] = useState<string | null>(null);
  const [hfRanked, setHfRanked] = useState<RankedPlaybookTip[] | null>(null);

  const keywordRanked = useMemo(
    () => rankPlaybookByKeywords(query, CURATED_PLAYBOOK),
    [query]
  );

  const displayed = hfRanked ?? keywordRanked;

  async function handleRunLocalHf() {
    if (!query.trim()) return;
    setHfLoading(true);
    setHfError(null);
    try {
      const ranked = await rankPlaybookWithLocalHf(query, CURATED_PLAYBOOK);
      setHfRanked(ranked);
    } catch {
      setHfError(
        'Local Hugging Face WASM model could not load in this browser/network. Showing instant keyword ranking instead.'
      );
      setHfRanked(null);
    } finally {
      setHfLoading(false);
    }
  }

  return (
    <section
      aria-labelledby="playbook-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="playbook-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <BookOpen className="h-5 w-5 text-sky-700" aria-hidden="true" />
            Verified Indoor Air &amp; Low-Emission Playbook
          </h2>
          <p className="text-sm text-slate-600">
            Search practical hacks instantly or opt in to local in-browser{' '}
            <strong className="font-semibold text-slate-800">Hugging Face Transformers.js (WASM)</strong>{' '}
            semantic matching.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="playbook-search-input" className="sr-only">
          Search indoor air hacks and sustainable swaps
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="playbook-search-input"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHfRanked(null);
            }}
            placeholder="Try: toddler dust, cheap purifier, cooking smoke, morning walk..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400"
          />
        </div>
        <button
          type="button"
          onClick={handleRunLocalHf}
          disabled={hfLoading || query.trim().length < 2}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-700 bg-sky-50 px-4 py-2.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
        >
          <Cpu className="h-4 w-4" aria-hidden="true" />
          {hfLoading ? 'Loading HF WASM...' : 'Local HF Semantic Match'}
        </button>
      </div>

      {hfError && (
        <p role="status" className="mt-2 text-xs text-amber-800">
          {hfError}
        </p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {displayed.map(({ tip, mode, score }) => (
          <article
            key={tip.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-slate-800">
                  {tip.category.replace('-', ' ')}
                </span>
                {mode === 'hf-wasm' && (
                  <span className="text-[11px] font-semibold text-sky-800">
                    HF Score {Math.round(score * 100)}%
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-sm font-bold text-slate-900">{tip.title}</h3>
              <p className="mt-1 text-xs text-slate-700">{tip.summary}</p>
              <p className="mt-2 text-xs text-slate-600">
                <strong>How:</strong> {tip.steps}
              </p>
            </div>

            <div className="mt-3 border-t border-slate-200 pt-2.5">
              <p className="text-xs font-semibold text-emerald-800">{tip.impactMetric}</p>
              <a
                href={tip.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-sky-800 underline hover:text-sky-950"
              >
                {tip.sourceLabel}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
