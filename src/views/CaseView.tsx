import { useEffect, useState } from 'react';
import { MAX_LEVEL, SEVERITIES, affectedRadius, canOpen, dur, escalationContact, isOpen, reporterVisibility } from '../platform/engine';
import type { CategoryId, Incident, Severity } from '../platform/types';
import { readPhoto } from '../photo';
import { actions, agency, cat, dep, isUnsealed, levelLabel, lgaOf, logView, person, persona, subLabel, useStore } from '../store';
import { CHANNEL, Card, Clock, IdBadge, Level, Sev, Stage, ago, dayTime, go, hhmm, useNow } from '../ui';
import { credibility } from './ControlRoom';

export function CaseView({ id }: { id: string }) {
  const at = useNow(5000);
  const s = useStore((x) => x);
  const i = s.incidents.find((x) => x.id === id);
  const me = persona();
  const allowed = i ? canOpen(me, i, dep) : false;
  useEffect(() => {
    if (i && allowed) logView(i);
  }, [i?.id, allowed]);

  if (!i) return <div className="empty">Case not found.</div>;
  if (!allowed)
    return (
      <Card title="No access">
        <p>
          Your role ({me.title}) can't open this case.
          {i.restricted && ' Security cases are limited to the control room, the assigned unit and oversight roles.'}
          {me.role === 'admin' && ' Platform administrators manage configuration; they do not read case content.'}
        </p>
      </Card>
    );

  const c = cat(i.category);
  const trail = s.audit.filter((e) => e.incidentId === i.id);
  const radius = affectedRadius(i);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono muted">{i.ref}</span>
            <Sev s={i.severity} />
            <Stage i={i} />
            <Level i={i} />
            <IdBadge i={i} />
            {i.restricted && i.unverified && <span className="badge warn">Uncorroborated</span>}
            {i.backupRequested && isOpen(i) && <span className="badge bad">Backup requested</span>}
          </div>
          <h1 style={{ marginTop: 8 }}>{i.sensitiveOnly && me.role !== 'sensitive' ? subLabel(i.category, i.subcategory) : i.title}</h1>
          <p>
            {subLabel(i.category, i.subcategory)} · {i.area}, {lgaOf(i.lgaId).name}
            {i.landmark ? ` · near ${i.landmark}` : ''} · {agency(i.agencyId)?.name}
          </p>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => history.back()}>
          Back
        </button>
      </div>

      <div className="grid split">
        <div className="stack lg">
          <Card title="Accountability clock" right={<Clock i={i} at={at} />}>
            <Timeline i={i} at={at} />
          </Card>

          <Card title={i.reports.length > 1 ? `Master incident — ${i.reports.length} citizen reports` : 'Citizen report'} right={radius > 0 ? <span className="small muted">Affected radius {radius.toFixed(1)} km</span> : undefined}>
            <div className="stack">
              {i.reports.slice(0, 12).map((r) => (
                <ReportRow key={r.ref} i={i} r={r} at={at} />
              ))}
              {i.reports.length > 12 && <span className="small muted">+{i.reports.length - 12} more</span>}
            </div>
          </Card>

          <Card title={i.restricted ? 'Situation reports & evidence' : 'Updates & evidence'}>
            {!i.evidence.length ? (
              <div className="empty">Nothing yet. {c.evidence.length ? `Closing needs: ${c.evidence.join(' + ')}.` : ''}</div>
            ) : (
              <div className="stack">
                {i.evidence.map((e, k) => (
                  <div key={k} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    {e.photo ? <img className="thumb" src={e.photo} alt="" /> : <span className="badge">{e.kind}</span>}
                    <div>
                      <div>{e.text}</div>
                      <div className="tiny muted">
                        {e.by} · {dayTime(e.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Audit trail" right={<span className="small muted">Append-only · hash-chained</span>}>
            {trail.map((e) => (
              <div key={e.seq} className="audit-row">
                <span className="tnum small muted">{dayTime(e.at)}</span>
                <span>
                  <b>{e.action}</b> — {e.actor}
                  {e.detail && <span className="muted"> · {e.detail}</span>}
                </span>
              </div>
            ))}
          </Card>
        </div>

        <div className="stack lg">
          <Actions i={i} />
          <Card title="Details">
            <div className="kv">
              <span>Category</span>
              <span>{c.label}</span>
              <span>Type</span>
              <span>{subLabel(i.category, i.subcategory)}</span>
              <span>Responder</span>
              <span>{agency(i.agencyId)?.name}</span>
              <span>Officer</span>
              <span>{person(i.officerId)?.name ?? '—'}</span>
              <span>LGA</span>
              <span>{lgaOf(i.lgaId).name}</span>
              <span>Targets</span>
              <span>
                ack {hhmm(i.ackDueAt)}
                {i.arriveDueAt ? ` · arrive ${hhmm(i.arriveDueAt)}` : ''} · resolve {dayTime(i.resolveDueAt)}
              </span>
              {i.outcome && (
                <>
                  <span>Outcome</span>
                  <span>{i.outcome}</span>
                </>
              )}
              {i.verification && (
                <>
                  <span>Citizen said</span>
                  <span>{{ yes: 'Fixed', no: 'Not fixed', partial: 'Partly fixed', timeout: 'No response' }[i.verification]}</span>
                </>
              )}
            </div>
          </Card>
          <Card title="Escalation ladder">
            <div className="stack" style={{ gap: 6 }}>
              {Array.from({ length: MAX_LEVEL[i.severity] }, (_, k) => k + 1).map((lv) => {
                const who = escalationContact(dep, i, lv);
                const on = lv === i.escalationLevel;
                return (
                  <div key={lv} className="row" style={{ gap: 8, opacity: lv > i.escalationLevel ? 0.55 : 1 }}>
                    <span className={`badge ${on ? (lv >= 4 ? 'bad' : lv >= 2 ? 'warn' : 'info') : ''}`}>L{lv}</span>
                    <span className="small">
                      <b>{levelLabel(i, lv)}</b>
                      {who ? ` — ${who.name}` : ''}
                    </span>
                  </div>
                );
              })}
              <span className="tiny muted">Severity decides how high a case can climb. Not every pothole reaches the Governor.</span>
            </div>
          </Card>
          {i.restricted && (
            <Card title="Credibility signals">
              <div className="stack" style={{ gap: 6 }}>
                {credibility(i, s.incidents).map((x) => (
                  <span key={x.text} className="small">
                    • {x.text}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Timeline({ i, at }: { i: Incident; at: number }) {
  const emergency = i.restricted || i.category === 'fire';
  const steps: { label: string; t?: number; due?: number; show?: boolean }[] = [
    { label: 'Submitted', t: i.createdAt },
    { label: i.restricted ? 'Triaged by control room' : 'Reviewed', t: i.t.triaged, show: i.restricted || !!i.t.triaged || i.status === 'triage' },
    { label: emergency ? 'Unit dispatched' : 'Assigned to agency', t: i.t.assigned },
    { label: 'Acknowledged', t: i.t.acknowledged, due: i.ackDueAt },
    { label: emergency ? 'En route' : 'Work started', t: i.t.enRoute },
    { label: 'On scene', t: i.t.onScene, due: i.arriveDueAt, show: emergency },
    { label: 'Action taken', t: i.t.actionTaken },
    { label: i.status === 'invalid' ? 'Closed' : 'Resolved', t: i.t.resolved, due: i.resolveDueAt },
  ];
  const shown = steps.filter((s) => s.show !== false);
  const firstPending = shown.findIndex((s) => !s.t);
  return (
    <div className="tl">
      {shown.map((s, k) => {
        const late = s.due && ((s.t && s.t > s.due) || (!s.t && at > s.due && isOpen(i)));
        const cls = s.t ? (late ? 'late' : 'done') : k === firstPending && isOpen(i) ? (late ? 'late now' : 'now') : '';
        return (
          <div key={s.label} className={`step ${cls}`}>
            <span className="pin" />
            <div>
              <b>{s.label}</b>
              {s.due && (
                <div className="tiny muted">
                  target {hhmm(s.due)}
                  {late ? (s.t ? ` · missed by ${dur(s.t - s.due)}` : ` · ${dur(at - s.due)} overdue`) : s.t ? ' · met' : ''}
                </div>
              )}
            </div>
            <span className="tnum small">{s.t ? `${hhmm(s.t)} · +${dur(s.t - i.createdAt)}` : <span className="muted">—</span>}</span>
          </div>
        );
      })}
      {i.t.resolved && (
        <div className="small" style={{ marginTop: 8 }}>
          Total: <b>{dur(i.t.resolved - i.createdAt)}</b>
        </div>
      )}
    </div>
  );
}

function ReportRow({ i, r, at }: { i: Incident; r: Incident['reports'][number]; at: number }) {
  const me = persona();
  const vis = reporterVisibility(me, i, r);
  const unsealed = vis === 'sealed' && isUnsealed(i.id);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <div className="notice">
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        {r.photo && <img className="thumb" src={r.photo} alt="Reporter photo" />}
        <div style={{ flex: 1 }}>
          <div>"{r.text}"</div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            <span className="mono">{r.ref}</span> · {CHANNEL[r.channel]} · {ago(r.submittedAt, at)}
            {r.callRef ? ` · ${r.callRef}` : ''}
          </div>
        </div>
      </div>
      <div className="row small" style={{ marginTop: 8, gap: 6 }}>
        <span className="muted">Reporter:</span>
        {vis === 'none' && <span className={`badge ${r.identity === 'anonymous' ? '' : 'sealed'}`}>{r.identity === 'anonymous' ? 'Anonymous — not stored' : 'Protected — hidden from your role'}</span>}
        {vis === 'masked' && <span className="badge">Contact via control room only</span>}
        {vis === 'visible' && (
          <span>
            {r.reporter?.name} · {r.reporter?.phone}
          </span>
        )}
        {vis === 'sealed' &&
          (unsealed ? (
            <span className="badge sealed">
              {r.reporter?.name} · {r.reporter?.phone} (unsealed, logged)
            </span>
          ) : (
            <>
              <span className="badge sealed">Sealed</span>
              <button className="btn sm" onClick={() => setOpen(!open)}>
                Break glass…
              </button>
            </>
          ))}
      </div>
      {open && !unsealed && (
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="small">Unsealing is logged, time-limited to 30 minutes and reported to the state security coordinator.</div>
          <input className="input" placeholder="Reason (e.g. survivor requested call-back; imminent threat to life)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn" onClick={() => setErr(actions.breakGlass(i.id, reason))}>
            Unseal identity
          </button>
          {err && <span className="small" style={{ color: 'var(--crit)' }}>{err}</span>}
        </div>
      )}
    </div>
  );
}

function Actions({ i }: { i: Incident }) {
  const me = persona();
  const c = cat(i.category);
  const [err, setErr] = useState<string>();
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [panel, setPanel] = useState<'' | 'complete' | 'update' | 'backup' | 'transfer' | 'severity' | 'reassign'>('');
  const [target, setTarget] = useState('');
  const [sev, setSev] = useState<Severity>(i.severity);
  const run = (r: string | undefined) => {
    setErr(r);
    if (!r) {
      setPanel('');
      setNote('');
      setPhoto(undefined);
    }
  };
  const inAgency = me.agencyId === i.agencyId;
  const desk = me.role === 'sensitive' && i.sensitiveOnly;
  const responder = desk || (me.role === 'officer' && i.officerId === me.id) || (inAgency && ['supervisor', 'ops_manager', 'agency_head'].includes(me.role));
  const manager = inAgency && ['supervisor', 'ops_manager', 'agency_head', 'sensitive'].includes(me.role);
  const control = agency(me.agencyId)?.kind === 'control_room' || me.role === 'command';
  const open = isOpen(i);
  const emergency = i.restricted || i.category === 'fire';

  if (me.role === 'citizen') return <CitizenVerify i={i} />;
  if (!open)
    return (
      <Card title="Case closed">
        <p className="small muted">Closed {i.t.resolved ? dayTime(i.t.resolved) : ''}. History can be corrected, never erased.</p>
      </Card>
    );
  if (i.status === 'triage' && !(me.role === 'command' && !i.restricted) && !(me.role === 'sensitive' && i.sensitiveOnly))
    return (
      <Card title="Waiting for triage">
        <p className="small">A control-room operator must confirm this report before a unit is dispatched.</p>
        {control && (
          <button className="btn primary" style={{ marginTop: 10 }} onClick={() => go('/control')}>
            Go to triage queue
          </button>
        )}
      </Card>
    );

  return (
    <Card title="Actions">
      <div className="stack">
        {i.status === 'triage' && !desk && <CommandTriage i={i} onDone={run} />}
        {i.status === 'triage' && desk && (
          <>
            <div className="notice sealed small">Survivor-centred handling: contact only through the protected channel, never through a patrol unit, unless the survivor agrees.</div>
            <button className="btn primary lg block" onClick={() => run(actions.confirmTriage(i.id, { category: 'security', subcategory: i.subcategory, severity: i.severity, agencyId: i.agencyId }))}>
              Take case at {agency(i.agencyId)?.short}
            </button>
          </>
        )}
        {responder && i.status !== 'triage' && (
          <>
            {!i.t.acknowledged && (
              <button className="btn primary lg block" onClick={() => run(actions.accept(i.id))}>
                Accept case
              </button>
            )}
            {i.t.acknowledged && !i.t.enRoute && (
              <button className="btn primary block" onClick={() => run(actions.enRoute(i.id))}>
                {emergency ? 'En route' : 'Start work'}
              </button>
            )}
            {emergency && i.t.enRoute && !i.t.onScene && (
              <button className="btn primary block" onClick={() => run(actions.onScene(i.id))}>
                Arrived on scene
              </button>
            )}
            <div className="row">
              <button className="btn" onClick={() => setPanel(panel === 'update' ? '' : 'update')}>
                {i.restricted ? 'Situation report' : 'Add update'}
              </button>
              {i.restricted && (
                <button className="btn" onClick={() => setPanel(panel === 'backup' ? '' : 'backup')}>
                  Request backup
                </button>
              )}
              <button className="btn" disabled={!i.t.acknowledged} onClick={() => setPanel(panel === 'complete' ? '' : 'complete')}>
                {i.restricted ? 'Close with outcome' : 'Mark action completed'}
              </button>
            </div>
          </>
        )}
        {(manager || control) && i.status !== 'triage' && (
          <div className="row">
            {manager && (
              <button className="btn sm" onClick={() => setPanel(panel === 'reassign' ? '' : 'reassign')}>
                Reassign officer
              </button>
            )}
            <button className="btn sm" onClick={() => setPanel(panel === 'transfer' ? '' : 'transfer')}>
              Transfer
            </button>
            <button className="btn sm" onClick={() => setPanel(panel === 'severity' ? '' : 'severity')}>
              Change severity
            </button>
          </div>
        )}
        {!responder && !manager && !control && <p className="small muted">View only for your role.</p>}

        {panel === 'update' && (
          <div className="stack">
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={i.restricted ? 'What is happening on the ground?' : 'Progress update'} />
            <PhotoInput value={photo} onChange={setPhoto} />
            <button className="btn primary" onClick={() => run(photo ? actions.addEvidence(i.id, 'photo', note || 'Photo', photo) : actions.addEvidence(i.id, 'note', note))}>
              Save
            </button>
          </div>
        )}
        {panel === 'backup' && (
          <div className="stack">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What do you need?" />
            <button className="btn danger" onClick={() => run(actions.requestBackup(i.id, note || 'Backup needed'))}>
              Send to control room
            </button>
          </div>
        )}
        {panel === 'complete' && (
          <div className="stack">
            {c.outcomes && (
              <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="">Outcome…</option>
                {c.outcomes.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            )}
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done?" />
            {c.evidence.includes('photo') && <PhotoInput value={photo} onChange={setPhoto} label={i.evidence.some((e) => e.kind === 'photo') ? 'Completion photo (optional)' : 'Completion photo (required)'} />}
            <button className="btn primary" onClick={() => run(actions.complete(i.id, { note, outcome: outcome || undefined, photo }))}>
              {c.citizenVerification ? 'Submit — citizen will be asked to confirm' : 'Close case'}
            </button>
          </div>
        )}
        {panel === 'reassign' && (
          <div className="stack">
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Officer…</option>
              {dep.people
                .filter((p) => p.agencyId === i.agencyId && p.role === 'officer')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button className="btn primary" disabled={!target} onClick={() => run(actions.assignOfficer(i.id, target))}>
              Reassign
            </button>
          </div>
        )}
        {panel === 'transfer' && (
          <div className="stack">
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Transfer to…</option>
              {dep.agencies
                .filter((a) => a.id !== i.agencyId && a.kind !== 'control_room' && (i.restricted ? ['police', 'corps', 'sensitive_desk'].includes(a.kind) : !['police', 'corps', 'sensitive_desk'].includes(a.kind)))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (required)" />
            <button className="btn primary" disabled={!target} onClick={() => run(actions.transfer(i.id, target, note))}>
              Transfer
            </button>
          </div>
        )}
        {panel === 'severity' && (
          <div className="stack">
            <select className="input" value={sev} onChange={(e) => setSev(e.target.value as Severity)}>
              {SEVERITIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (required)" />
            <button className="btn primary" onClick={() => run(actions.changeSeverity(i.id, sev, note))}>
              Change
            </button>
          </div>
        )}
        {err && <div className="notice bad small">{err}</div>}
        {i.restricted && <span className="tiny muted">Every view and action on this case is logged. Closing needs an outcome and a note.</span>}
      </div>
    </Card>
  );
}

function CommandTriage({ i, onDone }: { i: Incident; onDone: (r: string | undefined) => void }) {
  const [category, setCategory] = useState<CategoryId>(i.category);
  const [sub, setSub] = useState(i.subcategory ?? cat(i.category).subcategories[0].id);
  const [sev, setSev] = useState<Severity>(i.severity);
  const [agencyId, setAgency] = useState(i.suggestedAgencyId ?? i.agencyId);
  const c = cat(category);
  return (
    <div className="stack">
      <div className="notice warn small">The assistant was unsure ({Math.round(i.ai.confidence * 100)}%). Confirm before routing.</div>
      <select
        className="input"
        value={category}
        onChange={(e) => {
          const v = e.target.value as CategoryId;
          setCategory(v);
          setSub(cat(v).subcategories[0].id);
        }}
      >
        {dep.categories.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <select className="input" value={sub} onChange={(e) => setSub(e.target.value)}>
        {c.subcategories.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <select className="input" value={sev} onChange={(e) => setSev(e.target.value as Severity)}>
        {SEVERITIES.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <select className="input" value={agencyId} onChange={(e) => setAgency(e.target.value)}>
        {dep.agencies
          .filter((a) => !['control_room', 'police', 'corps', 'sensitive_desk'].includes(a.kind))
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </select>
      {category === 'security' ? (
        <div className="notice small">Security reports go to the 615 control room for triage.</div>
      ) : (
        <button className="btn primary" onClick={() => onDone(actions.confirmTriage(i.id, { category, subcategory: sub, severity: sev, agencyId }))}>
          Confirm & route
        </button>
      )}
    </div>
  );
}

function CitizenVerify({ i }: { i: Incident }) {
  const me = persona();
  const mine = i.reports.find((r) => r.reporter?.personId === me.id) ?? i.reports[0];
  if (i.status !== 'awaiting_verification')
    return (
      <Card title="Status">
        <div className="stack">
          {i.updates
            .slice()
            .reverse()
            .map((u, k) => (
              <div key={k} className="small">
                <span className="muted tnum">{hhmm(u.at)}</span> {u.text}
              </div>
            ))}
        </div>
      </Card>
    );
  return (
    <Card title="Has the issue been resolved?">
      <div className="stack">
        <p className="small">
          {agency(i.agencyId)?.short} marked this as fixed: <i>"{i.evidence.filter((e) => e.kind === 'note').slice(-1)[0]?.text}"</i>
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => actions.verify(i.id, 'yes', mine.ref)}>
            Yes
          </button>
          <button className="btn" onClick={() => actions.verify(i.id, 'partial', mine.ref)}>
            Partly
          </button>
          <button className="btn danger" onClick={() => actions.verify(i.id, 'no', mine.ref)}>
            No
          </button>
        </div>
        <span className="tiny muted">If you say no, the case reopens and goes to the supervisor.</span>
      </div>
    </Card>
  );
}

export function PhotoInput({ value, onChange, label = 'Photo' }: { value?: string; onChange: (v?: string) => void; label?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="row">
        {value && <img className="thumb" src={value} alt="" />}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            onChange(f ? await readPhoto(f) : undefined);
          }}
        />
      </div>
    </label>
  );
}
