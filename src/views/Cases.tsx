import { isOpen } from '../platform/engine';
import type { CategoryId, Incident, Severity } from '../platform/types';
import { roleKind } from '../roles';
import { dep, persona, useStore } from '../store';
import { CaseTable, CountTitle, Icon, Tabs, go, isSos, useNow } from '../ui';
import { FLAG_LABEL, casesLink, filterCases, parseQuery, type CaseQuery } from '../filters';
import { LiveMap } from './LiveMap';

export { scopeFor, tabsFor } from '../filters';

const SEV: Record<Severity, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** SOS first (newest SOS on top), then critical, then the one waiting longest. */
export const urgentFirst = (a: Incident, b: Incident) => {
  const sa = isSos(a) && isOpen(a);
  const sb = isSos(b) && isOpen(b);
  if (sa !== sb) return Number(sb) - Number(sa);
  if (sa && sb) return b.createdAt - a.createdAt;
  return SEV[a.severity] - SEV[b.severity] || a.createdAt - b.createdAt;
};

/** Cases work list. Tab, filters and search live in the URL, so Back works and links can be shared (PRD v2.6 §3). */
export function Cases({ query = '' }: { query?: string }) {
  const me = persona();
  const at = useNow(5000);
  const incidents = useStore((s) => s.incidents);
  const kind = roleKind(me);
  const params = new URLSearchParams(query);
  const q = parseQuery(query);
  const view = params.get('view') === 'map' ? 'map' : 'list';
  const filtersOpen = params.get('filters') === '1' || !!(q.lga || q.cat || q.priority || q.status || q.flag);
  const set = (patch: Partial<CaseQuery> & { view?: string; filters?: string }) => {
    const next = { ...q, ...patch } as CaseQuery & { view?: string; filters?: string };
    const extra = [patch.view ?? (view === 'map' ? 'map' : ''), patch.filters ?? params.get('filters') ?? ''];
    let url = casesLink(next);
    if (extra[0]) url += `${url.includes('?') ? '&' : '?'}view=${extra[0]}`;
    if (extra[1]) url += `${url.includes('?') ? '&' : '?'}filters=${extra[1]}`;
    go(url);
  };
  const { tabs, tab, filtered, rows: unsorted } = filterCases(me, incidents, q, at);
  const rows = unsorted.slice().sort(tab.newestFirst ? (a, b) => b.createdAt - a.createdAt : urgentFirst);
  const activeFilters = [q.lga, q.cat, q.priority, q.status, q.flag].filter(Boolean).length;

  return (
    <section className="card worklist">
      <div className="wl-head">
        <h2>
          <CountTitle title="Cases" n={filtered.length} />
        </h2>
        <div className="seg" role="group" aria-label="List or map">
          <button className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => set({ view: '' })}>
            <Icon name="list" size={15} /> List
          </button>
          <button className={view === 'map' ? 'on' : ''} aria-pressed={view === 'map'} onClick={() => set({ view: 'map' })}>
            <Icon name="pin" size={15} /> Map
          </button>
        </div>
        <label className="searchbox">
          <Icon name="search" size={16} />
          <input type="search" defaultValue={q.q ?? ''} key={q.q ?? ''} onKeyDown={(e) => e.key === 'Enter' && set({ q: (e.target as HTMLInputElement).value || undefined })} onBlur={(e) => e.target.value !== (q.q ?? '') && set({ q: e.target.value || undefined })} placeholder="Search by reference, area or LGA" aria-label="Search cases" />
        </label>
        {(kind === 'operator' || kind === 'lead') && (
          <a className="btn primary" href="#/intake">
            <Icon name="plus" size={16} /> New 615 call
          </a>
        )}
        <button className={`btn${activeFilters ? ' good' : ''}`} onClick={() => set({ filters: filtersOpen ? '' : '1' })} aria-expanded={filtersOpen}>
          <Icon name="filter" size={16} /> Filter{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>
      {filtersOpen && (
        <div className="wl-filters">
          <select className="input" value={q.lga ?? ''} onChange={(e) => set({ lga: e.target.value || undefined })} aria-label="LGA">
            <option value="">All LGAs</option>
            {dep.lgas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select className="input" value={q.cat ?? ''} onChange={(e) => set({ cat: (e.target.value as CategoryId) || undefined })} aria-label="Category">
            <option value="">All categories</option>
            {dep.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select className="input" value={q.priority ?? ''} onChange={(e) => set({ priority: e.target.value || undefined })} aria-label="Priority">
            <option value="">Any priority</option>
            {(['critical', 'high', 'normal', 'low'] as const).map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select className="input" value={q.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })} aria-label="Status">
            <option value="">Any status</option>
            <option value="open">Open</option>
            {['pending', 'verified', 'assigned', 'accepted', 'in_progress', 'resolved', 'closed', 'reopened', 'rejected', 'referred'].map((st) => (
              <option key={st} value={st}>
                {st.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select className="input" value={q.flag ?? ''} onChange={(e) => set({ flag: e.target.value || undefined })} aria-label="Flag">
            <option value="">Any flag</option>
            {Object.entries(FLAG_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
            {q.flag && !FLAG_LABEL[q.flag] && <option value={q.flag}>{q.flag}</option>}
          </select>
          {activeFilters > 0 && (
            <button className="btn ghost" onClick={() => go(casesLink({ tab: q.tab, q: q.q }))}>
              Clear
            </button>
          )}
        </div>
      )}
      <Tabs tabs={tabs.map((t) => ({ id: t.id, label: t.label, count: filtered.filter(t.test).length }))} value={tab.id} onChange={(id) => set({ tab: id })} />
      {view === 'map' ? (
        <div className="cases-map">
          <LiveMap rows={rows} context={filtered} />
        </div>
      ) : (
        <CaseTable key={query} rows={rows} at={at} empty={tab.id === 'pending' || tab.id === 'toaccept' ? 'No cases waiting. New cases appear here and in your inbox.' : 'Nothing in this list right now.'} />
      )}
    </section>
  );
}
