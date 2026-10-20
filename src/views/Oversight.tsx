import { useState } from 'react';
import type { Complaint, ComplaintStatus } from '../platform/types';
import { agency, complainantUnsealed, decideAppeal, lgaOf, oversight, person, persona, standingFor, subLabel, useStore } from '../store';
import { Card, Chips, CountTitle, Icon, Sheet, StatusPill, Tabs, ago, dayTime, go, run, useNow } from '../ui';
import { CaseTimeline } from './CaseView';

const STATUS: Record<ComplaintStatus, string> = { new: 'New', review: 'Under review', referred: 'Referred', closed: 'Closed' };
const KIND: Record<Complaint['kind'], string> = { money: 'Asked for money', respect: 'Not treated with respect', misconduct: 'Misconduct report', appeal: 'Standing appeal' };
export const REFER_TO = ['Police Complaint Response Unit', 'Amotekun discipline committee', 'Agency head (discipline desk)'];

export function ComplaintPill({ c }: { c: Complaint }) {
  return <span className={`pill cp-${c.status}`}>{STATUS[c.status]}</span>;
}

/** Oversight panel: complaint queue. Never visible to units, commanders or officers. */
export function Complaints() {
  const at = useNow();
  const rows = useStore((s) => s.complaints);
  const incidents = useStore((s) => s.incidents);
  const [tab, setTab] = useState<ComplaintStatus>('new');
  const shown = rows.filter((c) => c.status === tab);
  return (
    <section className="card worklist">
      <div className="wl-head">
        <h2>
          <CountTitle title="Complaints" n={rows.length} />
        </h2>
        <span className="small muted">Only the oversight panel sees this queue. Units, commanders and officers never do.</span>
      </div>
      <Tabs<ComplaintStatus> tabs={(Object.keys(STATUS) as ComplaintStatus[]).map((s) => ({ id: s, label: STATUS[s], count: rows.filter((c) => c.status === s).length }))} value={tab} onChange={setTab} />
      {!shown.length ? (
        <div className="empty">Nothing here.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Complaint</th>
                <th>Type</th>
                <th>Case</th>
                <th>Unit</th>
                <th>Received</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const i = incidents.find((x) => x.id === c.caseId);
                return (
                  <tr key={c.id} className="click" onClick={() => go(`/complaint/${c.id}`)}>
                    <td className="mono">{c.id}</td>
                    <td className={c.kind === 'money' ? 'strong clk bad' : 'strong'}>{KIND[c.kind]}</td>
                    <td className="small">{i ? `${i.ref} · ${subLabel(i.category, i.subcategory)}` : '—'}</td>
                    <td className="small">{agency(c.agencyId)?.short ?? '—'}</td>
                    <td className="small muted">{ago(c.at, at)}</td>
                    <td>
                      <ComplaintPill c={c} />
                    </td>
                    <td>
                      <button className="link-btn">View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ComplaintPage({ id }: { id: string }) {
  const c = useStore((s) => s.complaints).find((x) => x.id === id);
  const incidents = useStore((s) => s.incidents);
  useStore((s) => s.unseals);
  const [refer, setRefer] = useState(false);
  const [closing, setClosing] = useState(false);
  const [unseal, setUnseal] = useState(false);
  if (!c) return <div className="empty">Complaint not found.</div>;
  const i = incidents.find((x) => x.id === c.caseId);
  const open = c.status !== 'closed';
  const sealed = !complainantUnsealed(c.id);
  return (
    <div className="detail">
      <button className="backlink" onClick={() => go('/complaints')}>
        <Icon name="back" size={18} /> Complaints
      </button>
      <section className="card case-head">
        <div className="ch-row">
          <span className="sc-ico t-red">
            <Icon name="alert" size={22} />
          </span>
          <div className="ch-main">
            <div className="row" style={{ gap: 8 }}>
              <span className="mono muted">{c.id}</span>
              <ComplaintPill c={c} />
              {c.outcome && <span className="badge">{c.outcome}</span>}
            </div>
            <h1>{KIND[c.kind]}</h1>
            <p className="muted small">Received {dayTime(c.at)}{c.referredTo ? ` · referred to ${c.referredTo}` : ''}</p>
          </div>
          {open && c.kind === 'appeal' && (
            <div className="hdr-actions">
              <button className="btn primary lg" onClick={() => run(decideAppeal(c.id, true, 'Hoax marks removed'), 'Appeal upheld. The hoax marks were removed and the standing recalculated.')}>
                Uphold appeal
              </button>
              <button className="btn lg" onClick={() => run(decideAppeal(c.id, false), 'Appeal rejected.')}>
                Reject appeal
              </button>
            </div>
          )}
          {open && c.kind !== 'appeal' && (
            <div className="hdr-actions">
              {c.status === 'new' && (
                <button className="btn primary lg" onClick={() => run(oversight.start(c.id), 'Review started.')}>
                  Start review
                </button>
              )}
              {c.status !== 'new' && (
                <button className="btn primary lg" onClick={() => setRefer(true)}>
                  Refer
                </button>
              )}
              <button className="btn lg" onClick={() => setClosing(true)}>
                Close
              </button>
            </div>
          )}
        </div>
      </section>
      <Card title="The complaint">
        <p>{c.text}</p>
        <div className="inforow" style={{ marginTop: 14 }}>
          <div>
            <div className="ir-label">Unit</div>
            <div className="ir-value">{agency(c.agencyId)?.name ?? '—'}</div>
          </div>
          <div>
            <div className="ir-label">Officers involved</div>
            <div className="ir-value">{c.officerIds.map((x) => person(x)?.name).filter(Boolean).join(', ') || '—'}</div>
          </div>
          <div>
            <div className="ir-label">Complainant</div>
            <div className="ir-value">
              {!c.complainant.name && !c.complainant.phone ? (
                'Anonymous'
              ) : sealed ? (
                <span className="row" style={{ gap: 6 }}>
                  <span className="badge sealed">Sealed</span>
                  <button className="btn sm" onClick={() => setUnseal(true)}>
                    Contact (break glass)
                  </button>
                </span>
              ) : (
                <span className="badge sealed">
                  {c.complainant.name} · {c.complainant.phone} (unsealed, logged)
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
      {c.kind === 'appeal' && <AppealCases c={c} />}
      {i && (
        <Card title={`Linked case ${i.ref}`} right={<StatusPill i={i} />}>
          <p className="small muted">
            {subLabel(i.category, i.subcategory)} · {i.area}, {lgaOf(i.lgaId).name} · read-only. The panel reviews; it cannot change cases.
          </p>
        </Card>
      )}
      {i && <CaseTimeline i={i} />}
      <Card title="Complaint log">
        <ol className="timeline">
          {[...c.log].reverse().map((l, k) => (
            <li key={k}>
              <span className="tl-time tnum">{dayTime(l.at)}</span>
              <span className="tl-ico">
                <Icon name="check" size={14} />
              </span>
              <div>
                <b>{l.by}</b> <span className="tl-what">{l.text}</span>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      {refer && <ReferSheet c={c} onClose={() => setRefer(false)} />}
      {closing && <CloseSheet c={c} onClose={() => setClosing(false)} />}
      {unseal && <UnsealSheet c={c} onClose={() => setUnseal(false)} />}
    </div>
  );
}

function ReferSheet({ c, onClose }: { c: Complaint; onClose: () => void }) {
  const [to, setTo] = useState(agency(c.agencyId)?.kind === 'police' ? REFER_TO[0] : agency(c.agencyId)?.kind === 'corps' ? REFER_TO[1] : REFER_TO[2]);
  return (
    <Sheet title={`Refer ${c.id}`} onClose={onClose}>
      <div className="stack lg">
        <div className="opts">
          {REFER_TO.map((o) => (
            <label key={o} className={`pick${to === o ? ' on' : ''}`}>
              <input type="radio" checked={to === o} onChange={() => setTo(o)} /> {o}
            </label>
          ))}
        </div>
        <p className="small muted">The referral goes by secure letter. The complainant's identity is not included.</p>
        <button className="btn primary lg block" onClick={() => run(oversight.refer(c.id, to), `Referred to ${to}.`) && onClose()}>
          Refer
        </button>
      </div>
    </Sheet>
  );
}

function CloseSheet({ c, onClose }: { c: Complaint; onClose: () => void }) {
  const [outcome, setOutcome] = useState<NonNullable<Complaint['outcome']>>('Substantiated');
  const [note, setNote] = useState('');
  return (
    <Sheet title={`Close ${c.id}`} onClose={onClose}>
      <div className="stack lg">
        <Chips options={['Substantiated', 'Not substantiated', 'Withdrawn'] as const} value={outcome} onChange={setOutcome} />
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
        <button className="btn primary lg block" onClick={() => run(oversight.close(c.id, outcome, note), 'Complaint closed.') && onClose()}>
          Close complaint
        </button>
      </div>
    </Sheet>
  );
}

function UnsealSheet({ c, onClose }: { c: Complaint; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet title="Contact the complainant" onClose={onClose}>
      <div className="stack lg">
        <p className="small">Unsealing is logged, time-limited to 30 minutes and listed in Unseal reviews.</p>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. need a statement for the hearing)" />
        <button className="btn primary lg block" onClick={() => run(oversight.unsealComplainant(c.id, reason), 'Contact unsealed for 30 minutes. Logged.') && onClose()}>
          Unseal contact
        </button>
      </div>
    </Sheet>
  );
}

/** Every break-glass unseal across the platform, for review. */
export function UnsealReviews() {
  const audit = useStore((s) => s.audit);
  const reviews = useStore((s) => s.unsealReviews);
  const incidents = useStore((s) => s.incidents);
  const rows = audit.filter((e) => e.action === 'IDENTITY UNSEALED' || e.action === 'COMPLAINANT UNSEALED').reverse();
  const [note, setNote] = useState<Record<number, string>>({});
  return (
    <section className="card worklist">
      <div className="wl-head">
        <h2>
          <CountTitle title="Unseal reviews" n={rows.length} />
        </h2>
        <span className="small muted">Every break-glass unseal of a reporter or complainant identity.</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Reason</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={5} className="empty">
                  No unseals yet.
                </td>
              </tr>
            )}
            {rows.map((e) => {
              const r = reviews[e.seq];
              const i = incidents.find((x) => x.id === e.incidentId);
              return (
                <tr key={e.seq}>
                  <td className="small nowrap">{dayTime(e.at)}</td>
                  <td className="strong">{e.actor}</td>
                  <td className="small">{e.action === 'COMPLAINANT UNSEALED' ? 'Complainant contact' : `Reporter on ${i?.ref ?? 'a case'}`}</td>
                  <td className="small">{e.detail.replace(/^.*Reason: /, '')}</td>
                  <td>
                    {r ? (
                      <span className={`pill ${r.verdict === 'reviewed' ? 'sf-active' : 'st-reopened'}`}>
                        {r.verdict === 'reviewed' ? 'Reviewed' : 'Concern raised'} · {r.by}
                      </span>
                    ) : (
                      <div className="row nowrap" style={{ gap: 6 }}>
                        <input className="input" style={{ width: 160 }} value={note[e.seq] ?? ''} onChange={(ev) => setNote({ ...note, [e.seq]: ev.target.value })} placeholder="Note" aria-label="Review note" />
                        <button className="btn sm primary" onClick={() => run(oversight.review(e.seq, 'reviewed', note[e.seq]), 'Marked reviewed.')}>
                          Reviewed
                        </button>
                        <button className="btn sm danger-outline" onClick={() => run(oversight.review(e.seq, 'concern', note[e.seq]), 'Concern raised with the coordinator.')}>
                          Raise concern
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ padding: '0 20px 16px' }}>
        Signed in as {persona().name}. The panel can review, refer and close complaints; it cannot change cases.
      </p>
    </section>
  );
}

function AppealCases({ c }: { c: Complaint }) {
  const incidents = useStore((s) => s.incidents);
  const s = useStore((x) => x);
  const sd = c.complainant.personId ? standingFor(s, { personId: c.complainant.personId }) : undefined;
  return (
    <Card title="Hoax marks under appeal" right={sd ? <span className={`standing s-${sd.level}`}>{sd.label}</span> : undefined}>
      <div className="stack">
        {(c.hoaxCaseIds ?? []).map((id) => {
          const i = incidents.find((x) => x.id === id);
          if (!i) return null;
          return (
            <div key={id} className="pick-row">
              <span>
                <span className="mono small">{i.ref}</span> · {subLabel(i.category, i.subcategory)} · {i.area}
                <div className="small muted">
                  {i.hoax?.by}: “{i.hoax?.reason}” · confirmed by {i.hoax?.confirmedBy ?? '—'}
                </div>
              </span>
              {i.hoax?.overturnedAt ? <span className="pill sf-active">Mark removed</span> : <span className="pill st-reopened">Counts</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
