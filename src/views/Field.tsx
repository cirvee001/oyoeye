import { isOpen, pendingHandoff } from '../platform/engine';
import { agency, lgaOf, persona, subLabel, useStore } from '../store';
import { CatIcon, Clock, Flags, Sev, StatusPill, ago, go, useNow } from '../ui';
import { NextStep } from './CaseView';
import { LiveMap } from './LiveMap';
import { OfficerSosButton } from './Safety';
import { useState } from 'react';
import { Sheet } from '../ui';
import type { Incident } from '../platform/types';

const RANK = { critical: 0, high: 1, normal: 2, low: 3 };

/** Field officers get a phone-first list with the next step on each card. */
export function Field() {
  const me = persona();
  const at = useNow(5000);
  const incidents = useStore((s) => s.incidents);
  const waiting = (i: (typeof incidents)[number]) => !!pendingHandoff(i) || i.status === 'reopened';
  const mine = incidents
    .filter((i) => i.officerId === me.id && (isOpen(i) || i.status === 'resolved'))
    .sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || Number(a.status === 'resolved') - Number(b.status === 'resolved') || RANK[a.severity] - RANK[b.severity]);
  const [mapFor, setMapFor] = useState<Incident>();
  const done = incidents.filter((i) => i.officerId === me.id && !isOpen(i) && i.status !== 'resolved').slice(0, 6);

  return (
    <div className="phone">
      {mapFor && (
        <Sheet title={`${mapFor.ref} — map`} onClose={() => setMapFor(undefined)} wide>
          <LiveMap rows={[mapFor]} focus={mapFor} selfId={me.id} controls={false} height="65vh" />
          <a className="btn primary lg block" style={{ marginTop: 10 }} href={`https://maps.google.com/?q=${mapFor.lat.toFixed(5)},${mapFor.lng.toFixed(5)}`} target="_blank" rel="noreferrer">
            Navigate (Google Maps)
          </a>
        </Sheet>
      )}
      <div>
        <h1>My cases</h1>
        <p className="muted">
          {me.name} · {agency(me.agencyId)?.short}
        </p>
      </div>
      <OfficerSosButton />
      {!mine.length && <div className="empty">No open cases. New cases passed to you appear here and in your inbox.</div>}
      {mine.map((i) => (
        <div key={i.id} className={`field-case sev-${i.severity}`}>
          <div className="row between">
            <div className="row" style={{ gap: 6 }}>
              <CatIcon c={i.category} size={18} />
              <b>{subLabel(i.category, i.subcategory)}</b>
              <Sev s={i.severity} />
            </div>
            <StatusPill i={i} />
          </div>
          <div>
            {i.area}, {lgaOf(i.lgaId).name}
            {i.landmark ? ` — near ${i.landmark}` : ''}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Flags i={i} at={at} />
            <Clock i={i} at={at} />
          </div>
          <div className="small muted">
            <span className="mono">{i.ref}</span> · reported {ago(i.createdAt, at)}
            {i.restricted ? ' · reporter contact held by the control room' : ''}
          </div>
          <NextStep i={i} compact />
          <div className="row">
            <button className="btn" onClick={() => setMapFor(i)}>
              Map
            </button>
            <a className="btn" href={`https://maps.google.com/?q=${i.lat.toFixed(5)},${i.lng.toFixed(5)}`} target="_blank" rel="noreferrer">
              Navigate
            </a>
            <button className="btn ghost" style={{ flex: 1 }} onClick={() => go(`/case/${i.id}`)}>
              Open full case →
            </button>
          </div>
        </div>
      ))}
      {!!done.length && (
        <>
          <h3 className="muted">Recently closed</h3>
          {done.map((i) => (
            <div key={i.id} className="row between small click" onClick={() => go(`/case/${i.id}`)}>
              <span>
                {subLabel(i.category, i.subcategory)} · {i.area}
              </span>
              <StatusPill i={i} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
