import { useState } from 'react';
import { canOpen, isOpen, isOverdue, pendingHandoff } from '../platform/engine';
import type { CategoryId, Incident, Severity } from '../platform/types';
import { roleKind, type RoleKind } from '../roles';
import { canDecide, dep, lgaOf, persona, useStore } from '../store';
import { CaseTable, CountTitle, Icon, Tabs, isSos, useNow } from '../ui';
import { LiveMap } from './LiveMap';

type Tab = { id: string; label: string; test: (i: Incident) => boolean; newestFirst?: boolean };

const SEV: Record<Severity, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const final = (i: Incident) => ['closed', 'rejected', 'referred'].includes(i.status);

export function tabsFor(kind: RoleKind, me: ReturnType<typeof persona>, at: number): Tab[] {
  const toAccept = (i: Incident) => {
    const h = pendingHandoff(i);
    return (
      (i.status === 'assigned' && ((!!h && canDecide(me, h)) || (i.agencyId === me.agencyId && !i.officerId))) ||
      (!!i.officerSos && isOpen(i) && (i.officerSos.responses.some((r) => r.agencyId === me.agencyId && r.status === 'asked') || (i.agencyId === me.agencyId && i.status === 'verified')))
    );
  };
  switch (kind) {
    case 'commander':
    case 'agency':
      return [
        { id: 'toaccept', label: 'To accept', test: toAccept },
        { id: 'accepted', label: 'Accepted', test: (i) => i.status === 'accepted' || (i.status === 'assigned' && !toAccept(i)) },
        { id: 'progress', label: 'In progress', test: (i) => i.status === 'in_progress' },
        { id: 'resolved', label: 'Resolved', test: (i) => i.status === 'resolved' },
        { id: 'reopened', label: 'Reopened', test: (i) => i.status === 'reopened' },
        { id: 'closed', label: 'Closed', test: final, newestFirst: true },
      ];
    case 'desk':
      return [
        { id: 'pending', label: 'Pending review', test: (i) => i.status === 'pending' || i.status === 'verified' },
        { id: 'open', label: 'Open', test: (i) => (isOpen(i) && i.status !== 'pending' && i.status !== 'verified') || i.status === 'resolved' },
        { id: 'closed', label: 'Closed', test: final, newestFirst: true },
      ];
    case 'coord':
    case 'gov':
    case 'chair':
      return [
        { id: 'open', label: 'Open', test: (i) => isOpen(i) || i.status === 'resolved' },
        { id: 'overdue', label: 'Overdue', test: (i) => isOverdue(i, at) },
        { id: 'closed', label: 'Closed', test: final, newestFirst: true },
      ];
    default:
      return [
        { id: 'pending', label: 'Pending review', test: (i) => i.status === 'pending' || i.status === 'verified' },
        { id: 'assigned', label: 'Assigned', test: (i) => i.status === 'assigned' },
        { id: 'progress', label: 'In progress', test: (i) => ['accepted', 'in_progress', 'reopened'].includes(i.status) },
        { id: 'resolved', label: 'Resolved', test: (i) => i.status === 'resolved' },
        { id: 'closed', label: 'Closed', test: final, newestFirst: true },
        { id: 'all', label: 'All', test: () => true, newestFirst: true },
      ];
  }
}

/** Every case this person may open, as a list (the same rule as the case page). */
export function scopeFor(me: ReturnType<typeof persona>, incidents: Incident[]) {
  const kind = roleKind(me);
  return incidents.filter((i) => canOpen(me, i, dep) && (kind !== 'desk' || i.sensitiveOnly));
}

/** SOS first (newest SOS on top), then critical, then the one waiting longest. */
export const urgentFirst = (a: Incident, b: Incident) => {
  const sa = isSos(a) && isOpen(a);
  const sb = isSos(b) && isOpen(b);
  if (sa !== sb) return Number(sb) - Number(sa);
  if (sa && sb) return b.createdAt - a.createdAt;
  return SEV[a.severity] - SEV[b.severity] || a.createdAt - b.createdAt;
};

export function Cases({ q: q0 = '' }: { q?: string }) {
  const me = persona();
  const at = useNow(5000);
  const incidents = useStore((s) => s.incidents);
  const kind = roleKind(me);
  const tabs = tabsFor(kind, me, at);
  const [tab, setTab] = useState(tabs[0].id);
  const [q, setQ] = useState(q0);
  const [filters, setFilters] = useState(false);
  const [lga, setLga] = useState('');
  const [cat, setCat] = useState<CategoryId | ''>('');
  const [sev, setSev] = useState<Severity | ''>('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const scope = scopeFor(me, incidents);
  const needle = q.trim().toLowerCase();
  const filtered = scope.filter(
    (i) =>
      (!lga || i.lgaId === lga) &&
      (!cat || i.category === cat) &&
      (!sev || i.severity === sev) &&
      (!needle || `${i.ref} ${i.reports.map((r) => r.ref).join(' ')} ${i.area} ${lgaOf(i.lgaId).name} ${i.sensitiveOnly ? '' : i.title}`.toLowerCase().includes(needle)),
  );
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const rows = filtered.filter(current.test).sort(current.newestFirst ? (a, b) => b.createdAt - a.createdAt : urgentFirst);
  const activeFilters = [lga, cat, sev].filter(Boolean).length;

  return (
    <section className="card worklist">
      <div className="wl-head">
        <h2>
          <CountTitle title="Cases" n={filtered.length} />
        </h2>
        <div className="seg" role="group" aria-label="List or map">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
            <Icon name="list" size={15} /> List
          </button>
          <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
            <Icon name="pin" size={15} /> Map
          </button>
        </div>
        <label className="searchbox">
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by reference, area or LGA" />
        </label>
        {(kind === 'operator' || kind === 'lead') && (
          <a className="btn primary" href="#/intake">
            <Icon name="plus" size={16} /> New 615 call
          </a>
        )}
        <button className={`btn${activeFilters ? ' good' : ''}`} onClick={() => setFilters(!filters)} aria-expanded={filters}>
          <Icon name="filter" size={16} /> Filter{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>
      {filters && (
        <div className="wl-filters">
          <select className="input" value={lga} onChange={(e) => setLga(e.target.value)}>
            <option value="">All LGAs</option>
            {dep.lgas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value as CategoryId | '')}>
            <option value="">All categories</option>
            {dep.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select className="input" value={sev} onChange={(e) => setSev(e.target.value as Severity | '')}>
            <option value="">Any priority</option>
            {(['critical', 'high', 'normal', 'low'] as const).map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {activeFilters > 0 && (
            <button className="btn ghost" onClick={() => (setLga(''), setCat(''), setSev(''))}>
              Clear
            </button>
          )}
        </div>
      )}
      <Tabs tabs={tabs.map((t) => ({ id: t.id, label: t.label, count: filtered.filter(t.test).length }))} value={current.id} onChange={setTab} />
      {view === 'map' ? (
        <div className="cases-map">
          <LiveMap rows={rows} context={filtered} />
        </div>
      ) : (
        <CaseTable key={current.id + needle + lga + cat + sev} rows={rows} at={at} empty={current.id === 'pending' || current.id === 'toaccept' ? 'No cases waiting. New cases appear here and in your inbox.' : 'Nothing in this list right now.'} />
      )}
    </section>
  );
}
