import { useState } from 'react';
import { MIN, SEVERITIES, dur, isOpen, km, median } from '../platform/engine';
import type { Incident, Severity } from '../platform/types';
import { actions, agency, cat, dep, lgaOf, person, persona, subLabel, useStore } from '../store';
import { CHANNEL, Card, CaseTable, Clock, IdBadge, MapView, Sev, Stat, ago, go, incidentPoints, useNow } from '../ui';

const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, normal: 2, low: 3 };

export function ControlRoom() {
  const at = useNow(5000);
  const incidents = useStore((s) => s.incidents);
  const sec = incidents.filter((i) => i.restricted && !i.sensitiveOnly);
  const queue = sec
    .filter((i) => i.status === 'triage')
    .sort((a, b) => Number(b.reports[0].channel === 'sos') - Number(a.reports[0].channel === 'sos') || SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.createdAt - b.createdAt);
  const active = sec.filter((i) => isOpen(i) && i.status !== 'triage').sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.createdAt - a.createdAt);
  const [selId, setSel] = useState<string | undefined>();
  const sel = queue.find((i) => i.id === selId) ?? queue[0];

  const today = new Date(at);
  today.setHours(0, 0, 0, 0);
  const todays = sec.filter((i) => i.createdAt >= today.getTime());
  const triageTimes = todays.filter((i) => i.t.triaged).map((i) => i.t.triaged! - i.createdAt);
  const arriveTimes = todays.filter((i) => i.t.onScene).map((i) => i.t.onScene! - i.createdAt);
  const lateArrivals = active.filter((i) => i.arriveDueAt && !i.t.onScene && at > i.arriveDueAt);
  const restrictedDesk = incidents.filter((i) => i.sensitiveOnly && isOpen(i)).length;
  const oldest = queue.length ? Math.max(...queue.map((i) => at - i.createdAt)) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>615 Security Control Room</h1>
          <p>Every security report is read by a person here before any unit moves. The triage assistant suggests; operators decide.</p>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => go('/intake')}>
          + Log a 615 call
        </button>
      </div>

      <div className="stats">
        <Stat k="Waiting for triage" v={queue.length} s={queue.length ? `oldest ${dur(oldest)}` : 'queue clear'} alert={queue.some((i) => i.severity === 'critical')} />
        <Stat k="Active security incidents" v={active.length} s={`${active.filter((i) => i.severity === 'critical').length} critical`} />
        <Stat k="Units late to scene" v={lateArrivals.length} s="past arrival target" alert={lateArrivals.length > 0} />
        <Stat k="Median triage today" v={triageTimes.length ? dur(median(triageTimes)) : '—'} s={`${triageTimes.length} triaged`} />
        <Stat k="Median time to scene" v={arriveTimes.length ? dur(median(arriveTimes)) : '—'} s="today" />
        <Stat k="Restricted desk" v={restrictedDesk} s="SGBV & intelligence — details hidden here" />
      </div>

      <div className="grid split-r">
        <Card title="Triage queue" right={<span className="small muted">SOS first, then severity, then oldest</span>}>
          {!queue.length ? (
            <div className="empty">Queue is clear. New reports appear here the moment they arrive.</div>
          ) : (
            <div className="stack">
              {queue.map((i) => (
                <QueueCard key={i.id} i={i} at={at} on={i.id === sel?.id} onClick={() => setSel(i.id)} />
              ))}
            </div>
          )}
        </Card>
        {sel ? <TriagePanel key={sel.id} i={sel} at={at} all={incidents} /> : <Card title="Live map">
          <MapView points={incidentPoints(active, at)} metro />
        </Card>}
      </div>

      <div className="grid split">
        <Card title="Active incidents" right={<span className="small muted">{active.length} open</span>} pad={false}>
          <CaseTable rows={active} at={at} empty="No active security incidents" />
        </Card>
        <div className="stack lg">
          {sel && (
            <Card title="Live map">
              <MapView points={incidentPoints([...queue, ...active], at)} metro />
            </Card>
          )}
          <Units active={active} at={at} />
        </div>
      </div>
    </>
  );
}

function QueueCard({ i, at, on, onClick }: { i: Incident; at: number; on: boolean; onClick: () => void }) {
  const sos = i.reports[0].channel === 'sos';
  return (
    <div className={`qcard ${i.severity}${sos ? ' sos' : ''}${on ? ' on' : ''}`} onClick={onClick}>
      <div className="row between">
        <div className="row" style={{ gap: 6 }}>
          {sos ? <span className="badge solid pulse">SOS</span> : <Sev s={i.severity} />}
          <b>{subLabel(i.category, i.subcategory)}</b>
        </div>
        <span className={`small tnum ${at - i.createdAt > 3 * MIN ? 'badge bad' : 'muted'}`}>waiting {dur(at - i.createdAt)}</span>
      </div>
      <div className="small">{i.reports[0].text}</div>
      <div className="row tiny muted" style={{ gap: 6 }}>
        <span>
          {i.area}, {lgaOf(i.lgaId).name}
        </span>
        · <span>{CHANNEL[i.reports[0].channel]}</span>
        <IdBadge i={i} />
        {i.reports.length > 1 && <span className="badge info">{i.reports.length} reports</span>}
      </div>
    </div>
  );
}

/** Signals shown to the operator. They inform a person; they never decide. */
export function credibility(i: Incident, all: Incident[]) {
  const out: { tone: 'good' | 'warn' | 'bad' | ''; text: string }[] = [];
  const n = i.reports.length;
  out.push(n > 1 ? { tone: 'good', text: `${n} independent reports within ${Math.round((Math.max(...i.reports.map((r) => r.submittedAt)) - i.createdAt) / MIN)} min` } : { tone: '', text: 'Single report — not yet corroborated' });
  const near = all.filter((x) => x.id !== i.id && x.category === 'security' && Math.abs(x.createdAt - i.createdAt) < 72 * 60 * MIN && km(x.lat, x.lng, i.lat, i.lng) < 2);
  if (near.length) out.push({ tone: 'warn', text: `${near.length} other security reports within 2 km in 72h` });
  const r = i.reports[0];
  if (r.identity === 'anonymous') out.push({ tone: '', text: 'Anonymous — no call-back possible' });
  const p = person(r.reporter?.personId);
  if (p?.history && r.identity === 'standard') {
    const h = p.history;
    out.push(h.false >= 2 ? { tone: 'bad', text: `Reporter history: ${h.false} of ${h.reports} past reports were false` } : { tone: 'good', text: `Reporter history: ${h.confirmed} of ${h.reports} past reports confirmed` });
  } else if (r.identity === 'confidential') out.push({ tone: '', text: 'Confidential reporter — history held by restricted desk' });
  const phone = r.reporter?.phone;
  if (phone) {
    const recent = all.flatMap((x) => x.reports).filter((x) => x.reporter?.phone === phone && Math.abs(x.submittedAt - r.submittedAt) < 60 * MIN).length;
    if (recent > 2) out.push({ tone: 'bad', text: `Rate limit: ${recent} reports from this number in 1h` });
  }
  if (r.photo) out.push({ tone: 'good', text: 'Photo attached' });
  if (r.channel === 'call_615') out.push({ tone: 'good', text: `Spoke to operator${r.callRef ? ` (${r.callRef})` : ''}` });
  return out;
}

function TriagePanel({ i, at, all }: { i: Incident; at: number; all: Incident[] }) {
  const me = persona();
  const units = dep.agencies.filter((a) => a.kind === 'police' || a.kind === 'corps');
  const covering = units.filter((u) => u.lgaIds.includes(i.lgaId));
  const others = units.filter((u) => !u.lgaIds.includes(i.lgaId));
  const [sub, setSub] = useState(i.subcategory ?? 'suspicious');
  const [sev, setSev] = useState<Severity>(i.severity);
  const [unit, setUnit] = useState(i.suggestedAgencyId && units.some((u) => u.id === i.suggestedAgencyId) ? i.suggestedAgencyId : covering[0]?.id ?? units[0].id);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'dispatch' | 'ask' | 'invalid'>('dispatch');
  const [msg, setMsg] = useState<string>();
  const c = cat('security');
  const canAct = ['dispatcher', 'ops_manager', 'agency_head', 'supervisor'].includes(me.role);
  const sensitiveSub = c.subcategories.find((s) => s.id === sub)?.sensitiveOnly;

  const run = (fn: () => string | undefined) => {
    const err = fn();
    setMsg(err);
  };

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          Triage <span className="mono muted">{i.ref}</span>
        </span>
      }
      right={<a href={`#/case/${i.id}`}>Open full case</a>}
    >
      <div className="stack lg">
        <div className="notice warn small">
          <b>A report is an allegation, not proof.</b> Dispatch to check and protect. Do not act against a named or described person on a report alone.
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {i.reports.slice(0, 3).map((r) => (
            <div key={r.ref} className="notice">
              <div>"{r.text}"</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {CHANNEL[r.channel]} · {ago(r.submittedAt, at)} · {r.identity}
              </div>
            </div>
          ))}
          {i.reports.length > 3 && <span className="small muted">+{i.reports.length - 3} more reports</span>}
        </div>

        <div className="grid g2">
          <div className="stack" style={{ gap: 6 }}>
            <h3>Assistant suggestion</h3>
            <div className="row" style={{ gap: 6 }}>
              <Sev s={i.ai.severity} /> <span>{subLabel('security', i.ai.subcategory)}</span>
              <span className="badge">{Math.round(i.ai.confidence * 100)}% confident</span>
            </div>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              {i.ai.signals.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <h3>Credibility signals</h3>
            {credibility(i, all).map((s) => (
              <div key={s.text} className="row small" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <span className="dot" style={{ background: s.tone === 'good' ? 'var(--ok)' : s.tone === 'bad' ? 'var(--crit)' : s.tone === 'warn' ? 'var(--high)' : 'var(--line-2)' }} />
                {s.text}
              </div>
            ))}
          </div>
        </div>

        <div className="kv">
          <span>Location</span>
          <span>
            {i.area}, {lgaOf(i.lgaId).name}
            {i.landmark ? ` — near ${i.landmark}` : ''}
          </span>
          <span>Clock</span>
          <span>
            <Clock i={i} at={at} />
          </span>
        </div>

        {canAct ? (
          <>
            <div className="seg">
              <button className={mode === 'dispatch' ? 'on' : ''} onClick={() => setMode('dispatch')}>
                Dispatch
              </button>
              <button className={mode === 'ask' ? 'on' : ''} onClick={() => setMode('ask')}>
                Ask reporter
              </button>
              <button className={mode === 'invalid' ? 'on' : ''} onClick={() => setMode('invalid')}>
                False alarm / invalid
              </button>
            </div>
            {mode === 'dispatch' && (
              <div className="stack">
                <div className="grid g2">
                  <label className="field">
                    <span>Type</span>
                    <select className="input" value={sub} onChange={(e) => setSub(e.target.value)}>
                      {c.subcategories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Severity</span>
                    <select className="input" value={sev} onChange={(e) => setSev(e.target.value as Severity)}>
                      {SEVERITIES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {sensitiveSub ? (
                  <div className="notice sealed small">This type goes to the restricted desk, not to a patrol unit. Only restricted-cases officers will see the details.</div>
                ) : (
                  <label className="field">
                    <span>Responding unit</span>
                    <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                      <optgroup label={`Covers ${lgaOf(i.lgaId).name}`}>
                        {covering.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} — {openLoad(all, u.id)} open
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Other units">
                        {others.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>Note for the unit (optional)</span>
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. approach quietly; caller hiding in shop" />
                </label>
                <div className="row">
                  <button
                    className="btn primary lg"
                    onClick={() =>
                      run(() =>
                        actions.confirmTriage(i.id, {
                          category: 'security',
                          subcategory: sub,
                          severity: sev,
                          agencyId: sensitiveSub ? (sub === 'gbv' ? 'sgbv' : 'intel') : unit,
                          note,
                        }),
                      )
                    }
                  >
                    {sensitiveSub ? 'Send to restricted desk' : `Dispatch ${agency(unit)?.short}`}
                  </button>
                  <span className="small muted">Unit gets WhatsApp + SMS. Reporter identity is not sent.</span>
                </div>
              </div>
            )}
            {mode === 'ask' && (
              <div className="stack">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Can you describe the vehicle? Are you safe?" />
                <button className="btn" disabled={i.reports.every((r) => r.identity === 'anonymous')} onClick={() => run(() => actions.requestInfo(i.id, note))}>
                  Send via masked channel
                </button>
                {i.reports.every((r) => r.identity === 'anonymous') && <span className="small muted">Anonymous reporter: no way to contact them.</span>}
              </div>
            )}
            {mode === 'invalid' && (
              <div className="stack">
                <select className="input" value={note} onChange={(e) => setNote(e.target.value)}>
                  <option value="">Choose a reason…</option>
                  <option>False alarm — caller confirmed no threat</option>
                  <option>Prank / abusive report</option>
                  <option>Unverifiable: no location detail after call-back</option>
                  <option>Duplicate of another case</option>
                </select>
                <button className="btn danger" onClick={() => run(() => actions.markInvalid(i.id, note))}>
                  Close as invalid
                </button>
                <span className="small muted">Recorded in the audit log with your name. Reporter history is updated.</span>
              </div>
            )}
            {msg && <div className="notice bad small">{msg}</div>}
          </>
        ) : (
          <div className="notice small">Your role can view but not triage security reports.</div>
        )}
      </div>
    </Card>
  );
}

const openLoad = (all: Incident[], agencyId: string) => all.filter((i) => i.agencyId === agencyId && isOpen(i)).length;

function Units({ active, at }: { active: Incident[]; at: number }) {
  const units = dep.agencies.filter((a) => a.kind === 'police' || a.kind === 'corps');
  const rows = units
    .map((u) => {
      const mine = active.filter((i) => i.agencyId === u.id);
      return {
        u,
        n: mine.length,
        waiting: mine.filter((i) => !i.t.acknowledged).length,
        late: mine.filter((i) => i.arriveDueAt && !i.t.onScene && at > i.arriveDueAt).length,
        onScene: mine.filter((i) => i.t.onScene).length,
      };
    })
    .sort((a, b) => b.n - a.n);
  return (
    <Card title="Response units" pad={false}>
      <table className="table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Open</th>
            <th>Not acked</th>
            <th>On scene</th>
            <th>Late</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.u.id}>
              <td>{r.u.short}</td>
              <td className="tnum">{r.n}</td>
              <td className="tnum">{r.waiting ? <span className="badge warn">{r.waiting}</span> : 0}</td>
              <td className="tnum">{r.onScene}</td>
              <td className="tnum">{r.late ? <span className="badge bad">{r.late}</span> : 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
