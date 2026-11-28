import { useId, useRef, useState } from 'react';
import { ChevronDown, Cpu, ExternalLink, Search } from 'lucide-react';
import { CURATED_PLAYBOOK } from '../data/presets';
import {
  rankPlaybookByKeywords,
  rankPlaybookWithLocalHf,
  type RankedPlaybookTip
} from '../services/semanticPlaybook';
import type { PlaybookTip } from '../types/airQuality';

function PlaybookTipDisclosure({ tip }: { tip: PlaybookTip }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        How to do it
        <ChevronDown size={14} aria-hidden="true" className="details-arrow" />
      </button>
      <div id={panelId} hidden={!open}>
        <p>{tip.steps}</p>
        <p>{tip.impactMetric}</p>
      </div>
    </div>
  );
}

/** Ensures external playbook source links strictly use `https:` URLs. */
export function getSafeExternalHref(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' ? parsed.toString() : '#';
  } catch {
    return '#';
  }
}

function PlaybookTipCard({ item }: { item: RankedPlaybookTip }) {
  const { tip, mode, score } = item;
  return (
    <article className="tip-card">
      <div className="tip-meta">
        <span>{tip.category.replace('-', ' ')}</span>
        {mode === 'hf-wasm' && <span>Match {Math.round(score * 100)}%</span>}
      </div>
      <h3>{tip.title}</h3>
      <p>{tip.summary}</p>
      <PlaybookTipDisclosure tip={tip} />
      <a href={getSafeExternalHref(tip.sourceUrl)} target="_blank" rel="noopener noreferrer">
        {tip.sourceLabel}
        <span className="sr-only"> (opens in a new tab)</span>
        <ExternalLink size={13} aria-hidden="true" />
      </a>
    </article>
  );
}

/** Searchable indoor air playbook with instant keyword ranking and opt-in browser WASM semantic matching. */
export function PlaybookSearch() {
  const [query, setQuery] = useState('');
  const [semantic, setSemantic] = useState<RankedPlaybookTip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const revision = useRef(0);
  const displayed = semantic ?? rankPlaybookByKeywords(query, CURATED_PLAYBOOK);

  async function searchByMeaning() {
    const request = revision.current;
    setLoading(true);
    setFailed(false);
    try {
      const ranked = await rankPlaybookWithLocalHf(query, CURATED_PLAYBOOK);
      if (request === revision.current) setSemantic(ranked);
    } catch {
      if (request === revision.current) setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="panel-heading">
        <div>
          <h2>Indoor air playbook</h2>
          <p>Find practical tips for filtration, cooking, and cleaner commutes.</p>
        </div>
      </div>
      <div className="inline-form playbook-search">
        <label className="search-field" htmlFor="playbook-search">
          <span className="sr-only">Search the playbook</span>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            id="playbook-search"
            maxLength={180}
            placeholder="Search for a tip, e.g. air purifier"
            value={query}
            onChange={(event) => {
              revision.current += 1;
              setQuery(event.target.value);
              setSemantic(null);
              setFailed(false);
            }}
          />
        </label>
        <button
          className="button-primary"
          type="button"
          onClick={() => void searchByMeaning()}
          disabled={loading || query.trim().length < 2}
        >
          <Cpu size={17} aria-hidden="true" />
          {loading ? 'Loading local model…' : 'Local HF Semantic Match (WASM)'}
        </button>
      </div>
      {failed && (
        <p className="notice" role="status">
          The local model couldn’t load. Keyword search is still available.
        </p>
      )}
      {displayed.length ? (
        <div className="playbook-grid">
          {displayed.map((item) => (
            <PlaybookTipCard item={item} key={item.tip.id} />
          ))}
        </div>
      ) : (
        <p className="empty-search" role="status">
          No exact keyword matches — click Local HF Semantic Match to search by meaning
        </p>
      )}
    </div>
  );
}
