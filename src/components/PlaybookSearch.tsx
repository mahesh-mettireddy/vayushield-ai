import { useRef, useState } from 'react';
import { Cpu, ExternalLink, Search } from 'lucide-react';
import { CURATED_PLAYBOOK } from '../data/presets';
import { rankPlaybookByKeywords, rankPlaybookWithLocalHf, type RankedPlaybookTip } from '../services/semanticPlaybook';

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
        <div><h2>Indoor air playbook</h2><p>Find practical tips for filtration, cooking, and cleaner commutes.</p></div>
      </div>
      <div className="inline-form playbook-search">
        <label className="search-field" htmlFor="playbook-search">
          <span className="sr-only">Search the playbook</span><Search size={17} aria-hidden="true" />
          <input type="search" id="playbook-search" maxLength={180} placeholder="Search for a tip, e.g. air purifier"
            value={query} onChange={(event) => {
              revision.current += 1;
              setQuery(event.target.value);
              setSemantic(null);
              setFailed(false);
            }} />
        </label>
        <button className="button-primary" type="button" onClick={() => void searchByMeaning()}
          disabled={loading || query.trim().length < 2}>
          <Cpu size={17} aria-hidden="true" />{loading ? 'Loading local model…' : 'Local HF Semantic Match (WASM)'}
        </button>
      </div>
      {failed && <p className="notice" role="status">The local model couldn’t load. Keyword search is still available.</p>}
      {displayed.length ? (
        <div className="playbook-grid">
          {displayed.map(({ tip, mode, score }) => (
            <article className="tip-card" key={tip.id}>
              <div className="tip-meta"><span>{tip.category.replace('-', ' ')}</span>
                {mode === 'hf-wasm' && <span>Match {Math.round(score * 100)}%</span>}</div>
              <h3>{tip.title}</h3><p>{tip.summary}</p>
              <details><summary>How to do it</summary><p>{tip.steps}</p><p>{tip.impactMetric}</p></details>
              <a href={tip.sourceUrl} target="_blank" rel="noopener noreferrer">{tip.sourceLabel}<ExternalLink size={13} aria-hidden="true" /></a>
            </article>
          ))}
        </div>
      ) : <p className="empty-search" role="status">No exact keyword matches — click Local HF Semantic Match to search by meaning</p>}
    </div>
  );
}
