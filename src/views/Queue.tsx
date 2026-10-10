import { useState } from 'react';
import { isOpen, isOverdue } from '../platform/engine';
import type { CategoryId } from '../platform/types';
import { agency, dep, persona, useStore } from '../store';
import { Card, CaseTable, Stat, useNow } from '../ui';

type Tab = 'open' | 'overdue' | 'triage' | 'verify' | 'closed';

export function Queue() {
  const me = persona();
  const at = useNow(10_000);
  const incidents = useStore((s) => s.incidents);
  const central = me.role === 'command';
  const scope = central ? incidents.filter((i) => !i.sensitiveOnly) : incidents.filter((i) => i.agencyId === me.agencyId);
  const [tab, setTab] = useState<Tab>(central ? 'triage' : 'open');
  const [cat, setCat] = useState<CategoryId | ''>('');
  const [lga, setLga] = useState('');
  const filtered = scope.filter((i) => (!cat || i.category === cat) && (!lga || i.lgaId === lga));
  const sets: Record<Tab, typeof filtered> = {
    triage: filtered.filter((i) => i.status === 'triage' && !i.restricted),
    open: filtered.filter((i) => isOpen(i) && i.status !== 'triage'),
    overdue: filtered.filter((i) => isOverdue(i, at)),
    verify: filtered.filter((i) => i.status === 'awaiting_verification'),
    closed: filtered.filter((i) => !isOpen(i) && i.status !== 'awaiting_verification').slice(0, 150),
  };
  const rows = sets[tab];
  const a = agency(me.agencyId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{central ? 'All cases' : a?.name}</h1>
          <p>{central ? 'Cross-agency view. Security cases are triaged by the 615 control room; low-confidence civic reports wait here for review.' : 'Reports reach this queue automatically from the routing matrix.'}</p>
        </div>
      </div>
      <div className="stats">
        {central && <Stat k="Needs review" v={sets.triage.length} alert={sets.triage.length > 0} />}
        <Stat k="Open" v={sets.open.length} />
        <Stat k="Overdue" v={sets.overdue.length} alert={sets.overdue.length > 0} />
        <Stat k="Not yet acknowledged" v={sets.open.filter((i) => !i.t.acknowledged).length} />
        <Stat k="Awaiting citizen" v={sets.verify.length} />
        <Stat k="Reopened" v={filtered.filter((i) => i.status === 'reopened').length} />
      </div>
      <Card
        title={
          <div className="seg">
            {(central ? (['triage', 'open', 'overdue', 'verify', 'closed'] as Tab[]) : (['open', 'overdue', 'verify', 'closed'] as Tab[])).map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {{ triage: 'Needs review', open: 'Open', overdue: 'Overdue', verify: 'Awaiting citizen', closed: 'Closed' }[t]} ({sets[t].length})
              </button>
            ))}
          </div>
        }
        right={
          <div className="row">
            {central && (
              <select className="input" style={{ width: 170 }} value={cat} onChange={(e) => setCat(e.target.value as CategoryId | '')}>
                <option value="">All categories</option>
                {dep.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            <select className="input" style={{ width: 170 }} value={lga} onChange={(e) => setLga(e.target.value)}>
              <option value="">All LGAs</option>
              {dep.lgas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        }
        pad={false}
      >
        <CaseTable rows={rows} at={at} cols={central ? undefined : ['ref', 'what', 'where', 'stage', 'clock']} />
      </Card>
    </>
  );
}
