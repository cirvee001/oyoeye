import { isOpen } from '../platform/engine';
import { actions, agency, dep, lgaOf, persona, subLabel, useStore } from '../store';
import { Clock, Sev, Stage, ago, go, useNow } from '../ui';

const RANK = { critical: 0, high: 1, normal: 2, low: 3 };

/** Field officers get a phone-first list, not an enterprise dashboard. */
export function Field() {
  const me = persona();
  const at = useNow(5000);
  const incidents = useStore((s) => s.incidents);
  const mine = incidents.filter((i) => i.officerId === me.id && isOpen(i)).sort((a, b) => Number(!!a.t.acknowledged) - Number(!!b.t.acknowledged) || RANK[a.severity] - RANK[b.severity]);
  const done = incidents.filter((i) => i.officerId === me.id && !isOpen(i)).slice(0, 6);
  const emergency = agency(me.agencyId)?.kind === 'police' || agency(me.agencyId)?.kind === 'corps';

  return (
    <div className="phone">
      <div>
        <h1>My cases</h1>
        <p className="muted">
          {me.name} · {agency(me.agencyId)?.short}
        </p>
      </div>
      {!mine.length && <div className="empty">No open cases. New assignments arrive here and on WhatsApp.</div>}
      {mine.map((i) => (
        <div key={i.id} className="field-case" style={{ borderLeft: `4px solid var(--${i.severity === 'critical' ? 'crit' : i.severity === 'high' ? 'high' : 'normal'})` }}>
          <div className="row between">
            <div className="row" style={{ gap: 6 }}>
              {i.severity === 'critical' && !i.t.acknowledged ? <span className="badge solid pulse">URGENT</span> : <Sev s={i.severity} />}
              <b>{subLabel(i.category, i.subcategory)}</b>
            </div>
            <Stage i={i} />
          </div>
          <div>
            {i.area}, {lgaOf(i.lgaId).name}
            {i.landmark ? ` — near ${i.landmark}` : ''}
          </div>
          <div className="small muted">
            Assigned {ago(i.t.assigned ?? i.createdAt, at)} · <span className="mono">{i.ref}</span>
            {i.reports.length > 1 ? ` · ${i.reports.length} reports` : ''}
          </div>
          {i.restricted && <div className="tiny muted">Reporter contact is held by the control room. Treat as unverified until you confirm on scene.</div>}
          <Clock i={i} at={at} />
          {!i.t.acknowledged ? (
            <button className="btn primary lg block" onClick={() => actions.accept(i.id)}>
              ACCEPT
            </button>
          ) : (
            <div className="field-actions">
              <a className="btn block" href={`https://maps.google.com/?q=${i.lat.toFixed(5)},${i.lng.toFixed(5)}`} target="_blank" rel="noreferrer">
                Navigate
              </a>
              <a className="btn block" href={`tel:${dep.emergencyLine}`}>
                Call control room
              </a>
              {!i.t.enRoute ? (
                <button className="btn primary block" onClick={() => actions.enRoute(i.id)}>
                  {emergency || i.category === 'fire' ? 'En route' : 'Start work'}
                </button>
              ) : (emergency || i.category === 'fire') && !i.t.onScene ? (
                <button className="btn primary block" onClick={() => actions.onScene(i.id)}>
                  Arrived
                </button>
              ) : (
                <button className="btn primary block" onClick={() => go(`/case/${i.id}`)}>
                  Upload evidence
                </button>
              )}
              <button className="btn block" onClick={() => go(`/case/${i.id}`)}>
                {i.restricted ? 'Sitrep / backup / close' : 'Update / complete'}
              </button>
            </div>
          )}
        </div>
      ))}
      {!!done.length && (
        <>
          <h3 className="muted">Recently closed</h3>
          {done.map((i) => (
            <div key={i.id} className="row between small" style={{ cursor: 'pointer' }} onClick={() => go(`/case/${i.id}`)}>
              <span>
                {subLabel(i.category, i.subcategory)} · {i.area}
              </span>
              <Stage i={i} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
