import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MIN, clockState, dur, isOpen, isOverdue } from './platform/engine';
import type { Incident, Severity } from './platform/types';
import { agency, cat, dep, levelLabel, lgaOf, now, subLabel } from './store';

export function useNow(ms = 15_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now();
}

export const go = (path: string) => (location.hash = path);
export const hhmm = (t?: number) => (t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
export const dayTime = (t: number) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const ago = (t: number, at = now()) => {
  const m = Math.round((at - t) / MIN);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m ago`;
  return `${Math.floor(m / 1440)}d ago`;
};
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export const SEV_COLOR: Record<Severity, string> = { critical: 'var(--crit)', high: 'var(--high)', normal: 'var(--normal)', low: 'var(--low)' };

export function Sev({ s }: { s: Severity }) {
  return <span className={`badge ${s}`}>{s[0].toUpperCase() + s.slice(1)}</span>;
}

export function stage(i: Incident): { label: string; tone: string } {
  switch (i.status) {
    case 'triage':
      return { label: i.restricted ? 'Awaiting triage' : 'Being reviewed', tone: 'warn' };
    case 'assigned':
      return { label: i.restricted ? 'Dispatched' : 'Assigned', tone: 'info' };
    case 'accepted':
      return { label: 'Acknowledged', tone: 'info' };
    case 'in_progress':
      if (i.restricted || i.category === 'fire') return { label: i.t.onScene ? 'On scene' : 'En route', tone: 'info' };
      return { label: 'Work in progress', tone: 'info' };
    case 'awaiting_verification':
      return { label: 'Awaiting citizen', tone: 'warn' };
    case 'investigation':
      return { label: 'Investigation', tone: 'sealed' };
    case 'resolved':
      return { label: i.verification === 'timeout' ? 'Resolved (unconfirmed)' : 'Resolved', tone: 'good' };
    case 'reopened':
      return { label: 'Reopened', tone: 'bad' };
    case 'invalid':
      return { label: i.outcome?.startsWith('False') ? 'False alarm' : 'Closed — invalid', tone: '' };
  }
}

export function Stage({ i }: { i: Incident }) {
  const s = stage(i);
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

/** The clock that matters right now for this case. */
export function nextClock(i: Incident, at: number) {
  if (!isOpen(i)) {
    const total = (i.t.resolved ?? i.t.actionTaken ?? at) - i.createdAt;
    return { label: 'Took', value: dur(total), tone: i.t.resolved && i.t.resolved > i.resolveDueAt ? 'bad' : 'good' };
  }
  const pick = (label: string, due: number) => {
    const win = due - i.createdAt;
    const st = clockState(due, undefined, at, win);
    return { label, value: at > due ? `${dur(at - due)} over` : `${dur(due - at)} left`, tone: st === 'breached' ? 'bad' : st === 'due_soon' ? 'warn' : '' };
  };
  if (!i.t.acknowledged) return pick('Acknowledge', i.ackDueAt);
  if (i.arriveDueAt && !i.t.onScene) return pick('Arrive', i.arriveDueAt);
  return pick('Resolve', i.resolveDueAt);
}

export function Clock({ i, at }: { i: Incident; at: number }) {
  const c = nextClock(i, at);
  return (
    <span className={`badge ${c.tone}`} title={`${c.label} target`}>
      {c.label}: {c.value}
    </span>
  );
}

export function Level({ i }: { i: Incident }) {
  if (i.escalationLevel <= 1) return null;
  return <span className={`badge ${i.escalationLevel >= 4 ? 'bad' : 'warn'}`}>L{i.escalationLevel} · {levelLabel(i)}</span>;
}

export function IdBadge({ i }: { i: Incident }) {
  const ids = new Set(i.reports.map((r) => r.identity));
  if (i.sensitiveOnly) return <span className="badge sealed">Restricted desk</span>;
  if (ids.has('confidential')) return <span className="badge sealed">Confidential</span>;
  if (ids.has('anonymous') && ids.size === 1) return <span className="badge">Anonymous</span>;
  return null;
}

export const CHANNEL: Record<string, string> = { web: 'Web', sos: 'SOS', whatsapp: 'WhatsApp', sms: 'SMS', ussd: 'USSD', call_615: '615 call' };

export function Stat({ k, v, s, alert }: { k: string; v: ReactNode; s?: ReactNode; alert?: boolean }) {
  return (
    <div className={`stat${alert ? ' alert' : ''}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

export function Bars({ rows, max, color }: { rows: { label: ReactNode; n: number; hint?: string }[]; max?: number; color?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <div className="empty">Nothing yet</div>;
  return (
    <div className="bars">
      {rows.map((r, k) => (
        <div className="bar" key={k} title={r.hint}>
          <span>{r.label}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(r.n / m) * 100}%`, background: color }} />
          </div>
          <span className="n">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

export function Card({ title, right, children, pad = true }: { title?: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {title && (
        <div className="hd">
          <h2>{title}</h2>
          <div className="spacer" />
          {right}
        </div>
      )}
      {pad ? <div className="bd">{children}</div> : children}
    </section>
  );
}

export function CaseTable({ rows, at, cols = ['ref', 'what', 'where', 'who', 'stage', 'clock'], empty = 'No cases' }: { rows: Incident[]; at: number; cols?: string[]; empty?: string }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {cols.includes('ref') && <th>Case</th>}
            {cols.includes('what') && <th>What</th>}
            {cols.includes('where') && <th>Where</th>}
            {cols.includes('who') && <th>Responder</th>}
            {cols.includes('stage') && <th>Stage</th>}
            {cols.includes('clock') && <th>Clock</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} className="click" onClick={() => go(`/case/${i.id}`)}>
              {cols.includes('ref') && (
                <td>
                  <div className="mono">{i.ref}</div>
                  <div className="tiny muted">{ago(i.createdAt, at)}</div>
                </td>
              )}
              {cols.includes('what') && (
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <Sev s={i.severity} />
                    <b>{subLabel(i.category, i.subcategory)}</b>
                    {i.reports.length > 1 && <span className="badge info">{i.reports.length} reports</span>}
                  </div>
                  <div className="small muted" style={{ marginTop: 3 }}>
                    {i.sensitiveOnly ? 'Details restricted' : i.title}
                  </div>
                </td>
              )}
              {cols.includes('where') && (
                <td>
                  {i.area}
                  <div className="tiny muted">{lgaOf(i.lgaId).name}</div>
                </td>
              )}
              {cols.includes('who') && <td className="small">{agency(i.agencyId)?.short}</td>}
              {cols.includes('stage') && (
                <td>
                  <div className="stack" style={{ gap: 4, justifyItems: 'start' }}>
                    <Stage i={i} />
                    <Level i={i} />
                  </div>
                </td>
              )}
              {cols.includes('clock') && (
                <td>
                  <Clock i={i} at={at} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- map ----------

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  r?: number;
  title: string;
  pulse?: boolean;
  onClick?: () => void;
}

function hull(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function MapView({ points, metro: metroDefault = false, height = 380, labels = true }: { points: MapPoint[]; metro?: boolean; height?: number; labels?: boolean }) {
  const [metro, setMetro] = useState(metroDefault);
  const b = metro ? dep.metroBounds : dep.bounds;
  const W = 600;
  const H = Math.round((W * (b.maxLat - b.minLat)) / (b.maxLng - b.minLng));
  const x = (lng: number) => ((lng - b.minLng) / (b.maxLng - b.minLng)) * W;
  const y = (lat: number) => ((b.maxLat - lat) / (b.maxLat - b.minLat)) * H;
  const shape = useMemo(() => {
    // Schematic outline around LGA centres (not a survey boundary).
    const ring: [number, number][] = [];
    for (const l of dep.lgas) for (let a = 0; a < 8; a++) ring.push([l.lng + Math.cos((a * Math.PI) / 4) * 0.16, l.lat + Math.sin((a * Math.PI) / 4) * 0.16]);
    return hull(ring);
  }, []);
  const visible = points.filter((p) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng);
  const scale = metro ? 1.25 : 1;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between">
        <div className="seg">
          <button className={!metro ? 'on' : ''} onClick={() => setMetro(false)}>
            State
          </button>
          <button className={metro ? 'on' : ''} onClick={() => setMetro(true)}>
            Ibadan metro
          </button>
        </div>
        <span className="tiny muted">
          {visible.length} shown · schematic map
        </span>
      </div>
      <svg className="map" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: height }} role="img" aria-label="Incident map">
        <polygon className="shape" points={shape.map(([lng, lat]) => `${x(lng)},${y(lat)}`).join(' ')} />
        {dep.lgas.map((l) => (
          <g key={l.id}>
            <circle className="lga-dot" cx={x(l.lng)} cy={y(l.lat)} r={2} />
            {labels && (metro ? l.metro : !l.metro || l.id === 'ibn') && (
              <text className="lga-label" x={x(l.lng) + 5} y={y(l.lat) - 4}>
                {metro ? l.name : l.id === 'ibn' ? 'Ibadan' : l.name}
              </text>
            )}
          </g>
        ))}
        {visible.map((p) => (
          <circle key={p.id} className={`pt${p.pulse ? ' pulse' : ''}`} cx={x(p.lng)} cy={y(p.lat)} r={(p.r ?? 4) * scale} fill={p.color} fillOpacity={0.85} onClick={p.onClick}>
            <title>{p.title}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function incidentPoints(rows: Incident[], at: number): MapPoint[] {
  return rows.map((i) => ({
    id: i.id,
    lat: i.lat,
    lng: i.lng,
    color: SEV_COLOR[i.severity],
    r: 3.5 + Math.min(6, Math.sqrt(i.reports.length) * 1.4),
    title: `${i.ref} · ${subLabel(i.category, i.subcategory)} · ${i.area}${isOverdue(i, at) ? ' · OVERDUE' : ''}`,
    pulse: i.status === 'triage' && i.severity === 'critical',
    onClick: () => go(`/case/${i.id}`),
  }));
}

export { cat };
