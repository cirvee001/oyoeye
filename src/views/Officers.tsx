import { PHONE_HINT } from '../format';
import { lagosIsoDate } from '../format';
import { useState } from 'react';
import { isActive, isLive, isOpen, pendingHandoff } from '../platform/engine';
import type { Person, Shift, StationRole } from '../platform/types';
import { actions, agency, canDecide, canManageStation, dep, lgaOf, onboarding, org, persona, setDuty, subLabel, useStore, validPhone } from '../store';
import { initials } from '../roles';
import { Card, Chips, CountTitle, Icon, Priority, Sheet, StatusPill, Tabs, run } from '../ui';
import { FocalList } from './Community';
import { safety } from '../store';
import { StaffStatus } from './Stations';

const SHIFT_LABEL: Record<Shift, string> = { morning: 'Morning 06–14', afternoon: 'Afternoon 14–22', night: 'Night 22–06' };
const ROLE_LABEL: Record<StationRole, string> = { field: 'Field officer', desk: 'Desk officer', deputy: 'Deputy commander' };

type Modal = { kind: 'assign' | 'transfer' | 'suspend' | 'deactivate' | 'lost'; p: Person } | { kind: 'invite' | 'many' };

/** "My officers": invite, roster, transfer, suspend, deactivate (PRD v2.2 §4.3). */
/** "My officers" with tabs Officers · Community (v2.3 §6). */
export function Officers() {
  const [tab, setTab] = useState<'officers' | 'community'>('officers');
  return (
    <>
      <Tabs<'officers' | 'community'> tabs={[{ id: 'officers', label: 'Officers' }, { id: 'community', label: 'Community' }]} value={tab} onChange={setTab} />
      {tab === 'officers' ? <OfficersList /> : <FocalList />}
    </>
  );
}

function OfficersList() {
  const me = persona();
  const duty = useStore((s) => s.duty);
  const incidents = useStore((s) => s.incidents);
  const transfers = useStore((s) => s.transfers);
  useStore((s) => s.audit.length);
  const [modal, setModal] = useState<Modal>();
  const stationId = me.agencyId!;
  const station = agency(stationId);
  const officers = dep.people.filter((p) => p.agencyId === stationId && p.role === 'officer').sort((a, b) => Number(a.staffStatus === 'deactivated') - Number(b.staffStatus === 'deactivated'));
  const openFor = (id: string) => incidents.filter((i) => i.officerId === id && isOpen(i)).length;
  const incoming = transfers.filter((t) => t.status === 'pending' && t.toStationId === stationId);
  const outgoing = (id: string) => transfers.find((t) => t.status === 'pending' && t.personId === id);
  return (
    <>
      {incoming.length > 0 && (
        <Card title={<CountTitle title="Transfers waiting for you" n={incoming.length} />}>
          <div className="stack">
            {incoming.map((t) => (
              <TransferRow key={t.id} id={t.id} />
            ))}
          </div>
        </Card>
      )}
      <section className="card worklist">
        <div className="wl-head">
          <h2>
            <CountTitle title="My officers" n={officers.filter((p) => p.staffStatus !== 'deactivated').length} />
          </h2>
          <span className="small muted">{station?.name}</span>
          <button className="btn" onClick={() => setModal({ kind: 'many' })}>
            Invite many
          </button>
          <button className="btn primary" onClick={() => setModal({ kind: 'invite' })}>
            <Icon name="plus" size={16} /> Invite officer
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name (rank)</th>
                <th>Service no.</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Shift</th>
                <th>On duty</th>
                <th>Open cases</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {officers.map((p) => {
                const d = duty[p.id] ?? { on: true, shift: 'morning' as Shift };
                const active = isActive(p);
                const out = outgoing(p.id);
                return (
                  <tr key={p.id} className={p.staffStatus === 'deactivated' ? 'dim' : ''}>
                    <td>
                      <div className="row nowrap" style={{ gap: 10 }}>
                        <span className="avatar sm">{initials(p.name)}</span>
                        <div>
                          <div className="strong">{p.name}</div>
                          <div className="tiny muted">{p.rank}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{p.serviceNumber}</td>
                    <td className="small nowrap">{p.phone}</td>
                    <td className="small">{ROLE_LABEL[p.stationRole ?? 'field']}</td>
                    <td>
                      {active ? (
                        <select className="input" style={{ width: 160 }} value={d.shift} onChange={(e) => setDuty(p.id, d.on, e.target.value as Shift)} aria-label={`Shift for ${p.name}`}>
                          {(Object.keys(SHIFT_LABEL) as Shift[]).map((s) => (
                            <option key={s} value={s}>
                              {SHIFT_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {active ? (
                        <label className="switch">
                          <input type="checkbox" checked={d.on} onChange={(e) => setDuty(p.id, e.target.checked)} aria-label={`${p.name} on duty`} />
                          <span>{d.on ? 'On' : 'Off'}</span>
                        </label>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="tnum">{openFor(p.id)}</td>
                    <td>
                      <div className="stack" style={{ gap: 4, justifyItems: 'start' }}>
                        <StaffStatus s={p.staffStatus} />
                        {p.needsCode && <span className="badge warn">New code needed</span>}
                        {p.loneDuty && <span className="badge info">Lone duty</span>}
                        {out && <span className="badge handoff">Transfer to {agency(out.toStationId)?.short} pending</span>}
                      </div>
                    </td>
                    <td>
                      {p.staffStatus !== 'deactivated' && (
                        <details className="more">
                          <summary className="btn sm">
                            Actions <Icon name="down" size={14} />
                          </summary>
                          <div className="more-menu" role="menu">
                            {p.staffStatus === 'invited' ? (
                              <>
                                <button className="menu-item" onClick={() => run(onboarding.resendCode(p.id), `New code sent to ${p.phone}.`)}>
                                  Resend code
                                </button>
                                <button className="menu-item danger" onClick={() => run(onboarding.cancelInvite(p.id), 'Invite cancelled.')}>
                                  Cancel invite
                                </button>
                              </>
                            ) : (
                              <>
                                {active && (
                                  <button className="menu-item" onClick={() => setModal({ kind: 'assign', p })}>
                                    {`Pass a case to ${p.name}`}
                                  </button>
                                )}
                                {active && !out && (
                                  <button className="menu-item" onClick={() => setModal({ kind: 'transfer', p })}>
                                    Transfer to another station
                                  </button>
                                )}
                                {p.needsCode && (
                                  <button className="menu-item" onClick={() => run(onboarding.resendCode(p.id), `New code sent to ${p.phone}.`)}>
                                    Resend code
                                  </button>
                                )}
                                {p.staffStatus === 'suspended' ? (
                                  <button className="menu-item" onClick={() => run(onboarding.reinstate(p.id), `${p.name} reinstated.`)}>
                                    Reinstate
                                  </button>
                                ) : (
                                  <button className="menu-item" onClick={() => setModal({ kind: 'suspend', p })}>
                                    Suspend
                                  </button>
                                )}
                                {active && (
                                  <button className="menu-item" onClick={() => run(safety.setLoneDuty(p.id, !p.loneDuty), p.loneDuty ? `${p.name}: normal duty.` : `${p.name}: lone duty — every job runs check-ins.`)}>
                                    {p.loneDuty ? 'End lone duty' : 'Set lone duty'}
                                  </button>
                                )}
                                <button className="menu-item" onClick={() => setModal({ kind: 'lost', p })}>
                                  Report lost phone
                                </button>
                                <button className="menu-item danger" onClick={() => setModal({ kind: 'deactivate', p })}>
                                  Deactivate
                                </button>
                              </>
                            )}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="tiny muted">New cases and escalations go to on-duty officers first. Every change is written to the audit log.</p>
      {modal?.kind === 'invite' && <InviteSheet stationId={stationId} onClose={() => setModal(undefined)} />}
      {modal?.kind === 'many' && <InviteMany stationId={stationId} onClose={() => setModal(undefined)} />}
      {modal && 'p' in modal && modal.kind === 'assign' && <AssignCase officer={modal.p} onClose={() => setModal(undefined)} />}
      {modal && 'p' in modal && (modal.kind === 'transfer' || modal.kind === 'deactivate') && <MoveSheet p={modal.p} kind={modal.kind} onClose={() => setModal(undefined)} />}
      {modal && 'p' in modal && modal.kind === 'suspend' && <SuspendSheet p={modal.p} onClose={() => setModal(undefined)} />}
      {modal && 'p' in modal && modal.kind === 'lost' && (
        <Sheet title={`Report lost phone — ${modal.p.name}`} onClose={() => setModal(undefined)}>
          <div className="stack lg">
            <p>This signs {modal.p.name} out of every device straight away. Their next sign-in needs a new SMS code sent to {modal.p.phone}.</p>
            <button className="btn danger lg block" onClick={() => run(onboarding.reportLostPhone(modal.p.id), 'Signed out everywhere. A new code was sent by SMS.') && setModal(undefined)}>
              Sign out everywhere
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Accept / Decline an incoming officer transfer (used here and in the inbox). */
export function TransferRow({ id, compact }: { id: string; compact?: boolean }) {
  const me = persona();
  const t = useStore((s) => s.transfers).find((x) => x.id === id);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  if (!t) return null;
  const p = dep.people.find((x) => x.id === t.personId);
  if (t.status !== 'pending') return <span className="tiny muted">{t.status === 'accepted' ? `Accepted by ${t.decidedBy}` : `Declined by ${t.decidedBy}`}</span>;
  const can = canManageStation(me, t.toStationId);
  return (
    <div className={compact ? '' : 'pick-row'}>
      {!compact && (
        <div>
          <b>{p?.name}</b> <span className="small muted">({p?.rank})</span>
          <div className="small muted">
            {agency(t.fromStationId)?.short} → {agency(t.toStationId)?.short} · {t.reason} · effective {t.effective}
          </div>
        </div>
      )}
      {can && !declining && (
        <div className="row nowrap" style={{ gap: 6 }}>
          <button className="btn primary sm" onClick={() => run(onboarding.decideTransfer(t.id, true), `${p?.name} now posted to ${agency(t.toStationId)?.short}.`)}>
            Accept
          </button>
          <button className="btn sm" onClick={() => setDeclining(true)}>
            Decline
          </button>
        </div>
      )}
      {can && declining && (
        <div className="row" style={{ gap: 6 }}>
          <input className="input" style={{ width: 220 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label="Decline reason" />
          <button className="btn danger sm" onClick={() => run(onboarding.decideTransfer(t.id, false, reason), 'Transfer declined.')}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function InviteSheet({ stationId, onClose }: { stationId: string; onClose: () => void }) {
  const o = org(agency(stationId)?.organisationId);
  const ranks = o?.ranks ?? ['Officer'];
  const [v, setV] = useState({ name: '', rank: ranks[Math.min(1, ranks.length - 1)], serviceNumber: '', phone: '', stationRole: 'field' as StationRole });
  const [done, setDone] = useState<string>();
  const submit = () => {
    const err = onboarding.invite(stationId, v);
    if (run(err)) setDone(`Invite sent to ${v.phone}. ${v.name} shows as Invited until they activate.`);
  };
  return (
    <Sheet title={`Invite officer to ${agency(stationId)?.short}`} onClose={onClose}>
      {done ? (
        <div className="stack lg">
          <div className="success-banner">
            <Icon name="done" size={22} /> {done}
          </div>
          <p className="small muted">The SMS with the activation code is in the WhatsApp / SMS outbox (Demo controls).</p>
          <button className="btn primary lg block" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="stack lg">
          <label className="field">
            <span>Full name</span>
            <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Tola Ojo" />
          </label>
          <div className="grid g2">
            <label className="field">
              <span>Rank</span>
              <select className="input" value={v.rank} onChange={(e) => setV({ ...v, rank: e.target.value })}>
                {ranks.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Service number</span>
              <input className="input mono" value={v.serviceNumber} onChange={(e) => setV({ ...v, serviceNumber: e.target.value })} placeholder="e.g. AP/419002" />
            </label>
          </div>
          <label className="field">
            <span>Phone</span>
            <input className="input" inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="0803 000 0123" />
          </label>
          {v.phone.length > 6 && !validPhone(v.phone) && <span className="small clk bad">{PHONE_HINT}</span>}
          <div className="field">
            <span>Role at station</span>
            <div className="radios">
              {(Object.keys(ROLE_LABEL) as StationRole[]).map((r) => (
                <label key={r} className={v.stationRole === r ? 'on' : ''}>
                  <input type="radio" checked={v.stationRole === r} onChange={() => setV({ ...v, stationRole: r })} /> {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
          </div>
          <button className="btn primary lg block" disabled={!v.name.trim() || !v.serviceNumber.trim() || !validPhone(v.phone)} onClick={submit}>
            Send invite by SMS
          </button>
        </div>
      )}
    </Sheet>
  );
}

function InviteMany({ stationId, onClose }: { stationId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState<{ ok: number; errors: string[] }>();
  return (
    <Sheet title="Invite many officers" onClose={onClose}>
      <div className="stack lg">
        <p className="small muted">Paste one officer per line: name, rank, service number, phone.</p>
        <textarea className="input mono" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Funmi Ajayi, Sergeant, AP/419100, 0806 211 3344\nKunle Bello, Constable, AP/419101, 0813 455 6677'} />
        {res && (
          <div className={`notice ${res.errors.length ? 'warn' : 'good'} small`}>
            {res.ok} invite(s) sent.
            {res.errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        )}
        <button className="btn primary lg block" disabled={!text.trim()} onClick={() => setRes(onboarding.inviteMany(stationId, text))}>
          Send invites
        </button>
      </div>
    </Sheet>
  );
}

/** Transfer or deactivate: open cases must be passed to another officer first. */
function MoveSheet({ p, kind, onClose }: { p: Person; kind: 'transfer' | 'deactivate'; onClose: () => void }) {
  const me = persona();
  const incidents = useStore((s) => s.incidents);
  const open = incidents.filter((i) => i.officerId === p.id && isOpen(i));
  const others = dep.people.filter((x) => x.agencyId === p.agencyId && x.role === 'officer' && x.id !== p.id && isActive(x));
  const myOrg = agency(p.agencyId)?.organisationId;
  const targets = dep.agencies
    .filter((a) => a.id !== p.agencyId && isLive(a) && !['control_room', 'sensitive_desk'].includes(a.kind) && a.kind !== 'lga_council')
    .sort((a, b) => Number(b.organisationId === myOrg) - Number(a.organisationId === myOrg) || a.short.localeCompare(b.short));
  const [to, setTo] = useState('');
  const [reason, setReason] = useState(kind === 'transfer' ? 'Posting' : '');
  const [effective, setEffective] = useState(lagosIsoDate(Date.now() + 86_400_000));
  const [reassignTo, setReassignTo] = useState('');
  const reassignAll = () => {
    if (!reassignTo) return run('Choose who the cases are passed to');
    for (const i of open) {
      const err = actions.passCase(i.id, { toAgencyId: p.agencyId!, toPersonId: reassignTo, reason: kind === 'transfer' ? 'Officer transferred' : 'Officer leaving the station' });
      if (err) return run(err);
    }
    run(undefined, `${open.length} case(s) passed to ${dep.people.find((x) => x.id === reassignTo)?.name}.`);
  };
  return (
    <Sheet title={kind === 'transfer' ? `Transfer ${p.name}` : `Deactivate ${p.name}`} onClose={onClose}>
      <div className="stack lg">
        {open.length > 0 ? (
          <div className="notice warn stack">
            <b>
              {p.name} holds {open.length} open case{open.length === 1 ? '' : 's'}. Pass {open.length === 1 ? 'it' : 'them'} to another officer first.
            </b>
            {open.map((i) => (
              <div key={i.id} className="row between small">
                <span>
                  <span className="mono">{i.ref}</span> · {subLabel(i.category, i.subcategory)} · {i.area}
                </span>
                <StatusPill i={i} />
              </div>
            ))}
            <div className="row">
              <select className="input" style={{ flex: 1 }} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} aria-label="Pass all cases to">
                <option value="">Pass all cases to…</option>
                {others.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={reassignAll}>
                Pass all
              </button>
            </div>
          </div>
        ) : (
          <div className="notice good small">No open cases — ready to {kind === 'transfer' ? 'transfer' : 'deactivate'}.</div>
        )}
        {kind === 'transfer' ? (
          <>
            <label className="field">
              <span>Receiving station</span>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose…</option>
                {targets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.short} — {a.lgaIds.slice(0, 3).map((l) => lgaOf(l).name).join(', ') || 'statewide'}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Reason</span>
              <Chips options={['Posting', 'Redeployment', 'Temporary duty']} value={reason} onChange={setReason} />
            </div>
            <label className="field">
              <span>Effective date</span>
              <input className="input" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </label>
            <button
              className="btn primary lg block"
              disabled={!to || !!open.length}
              onClick={() => run(onboarding.requestTransfer(p.id, to, reason, effective), `Transfer sent to ${agency(to)?.short}. Their commander must accept it.`) && onClose()}
            >
              Request transfer
            </button>
            <p className="tiny muted center">The receiving commander gets Accept / Decline in their inbox. Posting history and chat membership move on accept.</p>
          </>
        ) : (
          <>
            <label className="field">
              <span>Reason (required)</span>
              <Chips options={['Retired', 'Dismissed', 'Left the service', 'Other']} value={reason} onChange={setReason} />
            </label>
            <button className="btn danger lg block" disabled={!reason || !!open.length} onClick={() => run(onboarding.deactivate(p.id, reason), `${p.name} deactivated. History and audit trail kept.`) && onClose()}>
              Deactivate {p.name}
            </button>
            <p className="tiny muted center">Signs them out and removes them from chat at once. {me.role === 'admin' ? '' : 'Their history stays.'}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function SuspendSheet({ p, onClose }: { p: Person; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet title={`Suspend ${p.name}`} onClose={onClose}>
      <div className="stack lg">
        <Chips options={['Under investigation', 'Disciplinary', 'Extended leave', 'Other']} value={reason} onChange={setReason} />
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <button className="btn danger lg block" disabled={!reason.trim()} onClick={() => run(onboarding.suspend(p.id, reason), `${p.name} suspended.`) && onClose()}>
          Suspend
        </button>
      </div>
    </Sheet>
  );
}

function AssignCase({ officer, onClose }: { officer: Person; onClose: () => void }) {
  const me = persona();
  const incidents = useStore((s) => s.incidents);
  // Cases my unit holds without an officer (or waiting for us to accept).
  const unassigned = incidents.filter((i) => {
    if (i.agencyId !== me.agencyId || !isOpen(i) || i.officerId) return false;
    const h = pendingHandoff(i);
    return i.status === 'accepted' || i.status === 'reopened' || (!!h && canDecide(me, h));
  });
  return (
    <Sheet title={`Assign a case to ${officer.name}`} onClose={onClose}>
      {!unassigned.length ? (
        <div className="empty">Every case in your unit already has an officer.</div>
      ) : (
        <div className="stack">
          {unassigned.map((i) => (
            <div key={i.id} className="pick-row">
              <div>
                <div className="strong">
                  {subLabel(i.category, i.subcategory)} <span className="mono muted small">{i.ref}</span>
                </div>
                <div className="small muted">
                  {i.area}, {lgaOf(i.lgaId).name}
                </div>
              </div>
              <div className="row nowrap" style={{ gap: 8 }}>
                <StatusPill i={i} />
                <Priority s={i.severity} />
                <button className="btn sm primary" onClick={() => run(actions.passCase(i.id, { toAgencyId: me.agencyId!, toPersonId: officer.id, reason: 'Assigned by commander' }), `Passed to ${officer.name}. They must accept it.`) && onClose()}>
                  Assign
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
