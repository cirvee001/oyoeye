import { useEffect, useState, type ReactNode } from 'react';
import { SEVERITIES, canOpen, clockState, distinctReporters, dur, isOpen, km, pendingHandoff, reporterVisibility } from '../platform/engine';
import type { CategoryId, Handoff, Incident, Severity } from '../platform/types';
import {
  ackMinutes,
  actions,
  canPostChannel,
  channelIdOf,
  chat,
  agency,
  canDecide,
  cat,
  dep,
  getState,
  handoffTarget,
  holderLabel,
  isControl,
  isManagerOf,
  isUnsealed,
  levelLabel,
  lgaOf,
  logView,
  onDuty,
  person,
  persona,
  subLabel,
  useStore,
} from '../store';
import { CHANNEL, CatIcon, Chips, ConfirmButton, Icon, PhotoInput, Priority, Sheet, StatusPill, Stepper, ago, dayTime, go, hhmm, run, useNow, isSos } from '../ui';
import { credibility } from './credibility';
import { LiveMap } from './LiveMap';
import { OfficerSosButton } from './Safety';
import { markAlertOpened, markCaseRead } from '../store';
import { fmtDayName, fmtTimeWat, lagosDayStart } from '../format';
import { handoffClock } from '../countdown';
import { GROUP_TIP, REJECT_REASONS, callbackNeeded, canCloseOfficerSos, rejectLabel, safety, standing } from '../store';

const back = () => (history.length > 1 ? history.back() : go('/cases'));

export function CaseView({ id }: { id: string }) {
  const at = useNow(5000);
  const s = useStore((x) => x);
  const i = s.incidents.find((x) => x.id === id);
  const me = persona();
  const allowed = i ? canOpen(me, i, dep) : false;
  const [update, setUpdate] = useState(false);
  useEffect(() => {
    if (i && allowed) {
      logView(i);
      markAlertOpened(i.id); // opening the case stops its alert sound (for every operator)
      markCaseRead(i.id); // and marks its inbox updates read
    }
  }, [i?.id, allowed]);

  if (!i) return <div className="empty">Case not found.</div>;
  if (!allowed)
    return (
      <div className="detail">
        <button className="backlink" onClick={back}>
          <Icon name="back" size={18} /> Cases
        </button>
        <Card0 title="No access">
          <p>
            Your role ({me.title}) can't open this case.
            {me.role === 'admin' ? ' Platform administrators manage configuration; they do not read case content.' : i.restricted ? ' Security cases are limited to the control room, the units involved and oversight roles.' : ''}
          </p>
        </Card0>
      </div>
    );

  const c = cat(i.category);
  const protectedTitle = i.sensitiveOnly && me.role !== 'sensitive';
  const h = pendingHandoff(i);
  const since = [...i.handoffs].reverse().find((x) => x.status === 'accepted')?.decidedAt ?? i.t.acknowledged ?? i.t.assigned ?? i.createdAt;
  const canUpdate = isOpen(i) && ((me.role === 'officer' && i.officerId === me.id) || isManagerOf(me, i.agencyId) || (me.role === 'sensitive' && i.sensitiveOnly));
  const clock = (due: number | undefined, done: number | undefined, from: number) => {
    if (!due) return <span className="muted">—</span>;
    const st = clockState(due, done, at, due - from);
    const tone = st === 'met' || st === 'ok' ? 'good' : st === 'due_soon' ? 'warn' : 'bad';
    const text = done ? `${st === 'met' ? 'Met' : 'Missed'} · ${fmtTimeWat(done)}` : at > due ? `${dur(at - due)} overdue (was due ${fmtTimeWat(due)})` : `by ${fmtTimeWat(due)} · ${dur(due - at)} left`;
    return <span className={`clk ${tone}`}>{text}</span>;
  };
  const people = distinctReporters(i);

  return (
    <div className="detail">
      <button className="backlink" onClick={back}>
        <Icon name="back" size={18} /> Cases
      </button>

      <section className="card case-head">
        <div className="ch-row">
          <CatIcon c={i.category} size={24} />
          <div className="ch-main">
            <div className="row" style={{ gap: 8 }}>
              <span className="mono muted">{i.ref}</span>
              <StatusPill i={i} big />
              <Priority s={i.severity} />
              {isSos(i) && isOpen(i) && <span className="badge solid">SOS</span>}
              {i.officerSos && isOpen(i) && <span className="badge solid pulse">OFFICER SOS</span>}
              {i.namesGroup && <span className="badge warn">Names a group — supervisor review before armed dispatch</span>}
              {i.lone && isOpen(i) && <span className="badge info">Alone on scene</span>}
            </div>
            <h1>{protectedTitle ? subLabel(i.category, i.subcategory) : i.title}</h1>
            <HandoffBanner i={i} at={at} />
            <p className="muted small">
              {`${subLabel(i.category, i.subcategory)} · ${i.area}, ${lgaOf(i.lgaId).name} · reported ${fmtTimeWat(i.createdAt)} (${ago(i.createdAt, at)})`}
            </p>
          </div>
          {me.role === 'officer' && <OfficerSosButton compact />}
          <HeaderActions i={i} />
        </div>
        <Stepper i={i} />
        <NextLead i={i} />
      </section>

      <Card0 title="Case details">
        <div className="inforow">
          <Info k="Reported" v={`${dayTime(i.createdAt)} WAT`} />
          <Info k="Channel" v={CHANNEL[i.reports[0].channel]} />
          <Info k="LGA" v={lgaOf(i.lgaId).name} />
          <Info k="Area / landmark" v={`${i.area}${i.landmark ? ` — near ${i.landmark}` : ''}`} />
          <Info k="Category" v={c.label} />
          <Info k="Severity" v={<Priority s={i.severity} />} />
          <Info k="Reports" v={`${i.reports.length} · ${people > 1 ? `Reported by ${people} people` : 'Single report'}`} />
          <Info
            k="With"
            v={
              <>
                {holderLabel(i)}
                {i.officerId && <span className={`duty-dot${onDuty(i.officerId) ? ' on' : ''}`} style={{ marginLeft: 6 }} />}
              </>
            }
          />
          <Info k="Since" v={`${fmtTimeWat(since)} (${ago(since, at)})`} />
          <Info k={i.status === 'pending' ? 'Review due' : 'Accept due'} v={clock(i.ackDueAt, i.t.acknowledged, i.t.assigned ?? i.createdAt)} />
          <Info k="Arrive due" v={clock(i.arriveDueAt, i.t.onScene, i.createdAt)} />
          <Info k="Resolve due" v={clock(i.resolveDueAt, i.t.resolved, i.createdAt)} />
          {h && <Info k="Handoff pending" v={`→ ${handoffTarget(h)} (since ${hhmm(h.at)})`} />}
          {i.escalationLevel >= 2 && <Info k="Escalation" v={<span className="clk bad">L{i.escalationLevel} · {levelLabel(i)}</span>} />}
          {i.backupRequested && isOpen(i) && <Info k="Backup" v={i.backupSent ? `${i.backupSent} sending` : 'Requested'} />}
          {i.outcome && <Info k="Outcome" v={i.outcome} />}
          {i.leadersNotified?.length ? <Info k="Community leaders" v={`${i.leadersNotified.length} notified by SMS`} /> : null}
        </div>
        <div className="case-map">
          <LiveMap rows={[i]} focus={i} controls={false} height={220} />
        </div>
      </Card0>

      <div className={`pair${i.restricted ? '' : ' one'}`}>
        <Card0 title={i.reports.length > 1 ? `Reporters (${i.reports.length})` : 'Reporter'}>
          <div className="stack">
            {i.reports.slice(0, 6).map((r) => (
              <ReportRow key={r.ref} i={i} r={r} at={at} />
            ))}
            {i.reports.length > 6 && <span className="small muted">+{i.reports.length - 6} more</span>}
          </div>
        </Card0>
        {i.restricted && (
          <Card0 title="Credibility">
            <ul className="plainlist">
              {credibility(i, s.incidents).map((x) => (
                <li key={x.text}>
                  <span className={`dot tone-${x.tone || 'none'}`} />
                  {x.text}
                </li>
              ))}
            </ul>
            <p className="tiny muted">These signals inform a person. They never decide.</p>
          </Card0>
        )}
      </div>

      <Card0
        title="Evidence"
        right={
          canUpdate && (
            <button className="btn sm" onClick={() => setUpdate(true)}>
              <Icon name="camera" size={16} /> Add photo / update
            </button>
          )
        }
      >
        {!i.evidence.length ? (
          <div className="empty">No evidence yet. {c.evidence.includes('photo') ? 'A photo of the finished work is needed to resolve.' : 'A note on what was done is needed to resolve.'}</div>
        ) : (
          <div className="gallery">
            {i.evidence.map((e, k) => (
              <div key={k} className="ev">
                {e.photo ? <img src={e.photo} alt={e.text} /> : <div className="ev-note">{e.text}</div>}
                <div className="tiny muted">
                  {e.photo ? `${e.text} · ` : ''}
                  {e.by} · {hhmm(e.at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card0>
      {update && <UpdateSheet i={i} onClose={() => setUpdate(false)} />}

      <Timeline i={i} />
    </div>
  );
}

/** Live countdown under the title while a pass waits for acceptance (PRD v2.6 §6). */
export function HandoffBanner({ i, at }: { i: Incident; at: number }) {
  const me = persona();
  const c = isOpen(i) ? handoffClock(i, at) : undefined;
  if (!c) return null;
  const receiver = canDecide(me, c.h);
  const sender = c.h.fromId === me.id;
  const text = c.tone === 'red' ? c.overdueText : receiver ? `You have ${c.short} to accept` : sender ? `Waiting for them to accept · ${c.short}` : `Waiting for ${c.target} to accept · ${c.short}`;
  return (
    <div className={`cd-banner cd-${c.tone}`} role="status" aria-live="polite">
      <span aria-hidden>⏳</span> <span className="cd-text">{text}</span>
      <span className="tiny muted">{` · accept by ${fmtTimeWat(c.due)}`}</span>
      {receiver && (
        <button className="btn sm primary" onClick={() => run(actions.acceptHandoff(i.id), `Accepted ${i.ref}. You now own it.`)}>
          Accept
        </button>
      )}
    </div>
  );
}

function Info({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <div className="ir-label">{k}</div>
      <div className="ir-value">{v}</div>
    </div>
  );
}

function Card0({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="hd">
        <h2>{title}</h2>
        <div className="spacer" />
        {right}
      </div>
      <div className="bd">{children}</div>
    </section>
  );
}

// ---------- Timeline (grouped by day, like HospEase MedicalTimeline) ----------

const HANDOFF_ACTIONS = ['Passed', 'Passed back', 'Handoff accepted', 'Handoff declined', 'Routing'];
const MESSAGE_ACTIONS = ['Question to reporter', 'Call-back to reporter'];
const KIND_ICON: Record<string, string> = { handoffs: 'pass', messages: 'inbox', escalation: 'alert', updates: 'check' };

function dayLabel(t: number, at: number) {
  const d = lagosDayStart(t);
  const today = lagosDayStart(at);
  if (d === today) return 'Today';
  if (d === today - 86_400_000) return 'Yesterday';
  return fmtDayName(t);
}

/** The case timeline (also shown read-only on the oversight complaint page). */
export function CaseTimeline({ i }: { i: Incident }) {
  return <Timeline i={i} />;
}

/** System entries hidden from "Key steps" (PRD v2.6 §5); they stay under "Everything". */
export const HIDDEN_STEPS = ['Triage suggestion', 'Routing', 'Viewed restricted case', 'Conduct feedback requested', 'Held for review', 'Update sent to reporter', 'Case card posted', 'Alert muted 15 min', 'Alert unmuted'];
export const isKeyStep = (title: string) => !HIDDEN_STEPS.includes(title) && !title.startsWith('Alert muted');

export interface TlRow {
  at: number;
  seq: number;
  title: string;
  who: string;
  detail: string;
  kind: string;
}
/** Timeline rows for a case: "Key steps" (default) or "Everything". */
export function timelineRows(i: Incident, audit: { at: number; seq: number; action: string; actor: string; detail: string; incidentId?: string }[], view: 'key' | 'all') {
  const entries: TlRow[] = audit
    .filter((e) => e.incidentId === i.id && (view === 'all' || e.action !== 'Viewed restricted case'))
    .map((e) => ({ at: e.at, seq: e.seq, title: e.action, who: e.actor, detail: e.detail, kind: HANDOFF_ACTIONS.includes(e.action) ? 'handoffs' : MESSAGE_ACTIONS.includes(e.action) ? 'messages' : e.action === 'Escalated' ? 'escalation' : 'updates' }));
  const msgs: TlRow[] = i.updates.map((u, k) => ({ at: u.at, seq: -k - 1, title: 'Update sent to reporter', who: 'OyoEye', detail: u.text, kind: 'messages' }));
  const all = [...entries, ...msgs].sort((a, b) => b.at - a.at || b.seq - a.seq);
  return view === 'key' ? all.filter((r) => isKeyStep(r.title)) : all;
}
const SYSTEM_WHO = ['OyoEye', 'Triage assistant'];
/** Runs of 3+ consecutive system entries of the same kind collapse into one row ("4 messages sent · show"). */
export function collapseRuns(rows: TlRow[]) {
  const out: (TlRow | { run: TlRow[] })[] = [];
  for (let k = 0; k < rows.length; ) {
    let j = k;
    while (j < rows.length && SYSTEM_WHO.includes(rows[j].who) && rows[j].title === rows[k].title && SYSTEM_WHO.includes(rows[k].who)) j++;
    if (j - k >= 3) {
      out.push({ run: rows.slice(k, j) });
      k = j;
    } else {
      out.push(rows[k]);
      k++;
    }
  }
  return out;
}
const runLabel = (r: TlRow[]) => (r[0].title === 'Update sent to reporter' ? `${r.length} messages sent` : `${r.length} × ${r[0].title.toLowerCase()}`);

function TlItem({ e }: { e: TlRow }) {
  return (
    <li className={`tl-${e.kind}${e.title === 'Handoff declined' ? ' declined' : ''}`}>
      <span className="tl-time tnum">{hhmm(e.at)}</span>
      <span className="tl-ico">
        <Icon name={KIND_ICON[e.kind] ?? 'check'} size={14} />
      </span>
      <div>
        <b>{e.who}</b> <span className="tl-what">{e.title.toLowerCase()}</span>
        {e.detail && <div className="small muted">{e.detail}</div>}
      </div>
    </li>
  );
}
function TlRun({ rows }: { rows: TlRow[] }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{rows.map((e) => <TlItem key={`${e.seq}-${e.at}`} e={e} />)}</>;
  return (
    <li className="tl-run">
      <span className="tl-time tnum">{hhmm(rows[0].at)}</span>
      <span className="tl-ico">
        <Icon name="inbox" size={14} />
      </span>
      <div>
        <span className="tl-what">{runLabel(rows)}</span> ·{' '}
        <button className="link-btn" onClick={() => setOpen(true)}>
          show
        </button>
      </div>
    </li>
  );
}

function Timeline({ i }: { i: Incident }) {
  const audit = useStore((s) => s.audit);
  const at = useNow(30_000);
  const [view, setView] = useState<'key' | 'all'>('key');
  const [filter, setFilter] = useState<'all' | 'handoffs' | 'updates' | 'messages'>('all');
  const keyN = timelineRows(i, audit, 'key').length;
  const allN = timelineRows(i, audit, 'all').length;
  const rows = timelineRows(i, audit, view).filter((e) => filter === 'all' || e.kind === filter || (filter === 'updates' && e.kind === 'escalation'));
  const groups: { day: string; rows: TlRow[] }[] = [];
  for (const r of rows) {
    const d = dayLabel(r.at, at);
    if (groups[groups.length - 1]?.day !== d) groups.push({ day: d, rows: [] });
    groups[groups.length - 1].rows.push(r);
  }
  const FILTERS = ['All', 'Handoffs', 'Updates', 'Messages'];
  return (
    <Card0
      title="Timeline"
      right={
        <div className="row" style={{ gap: 8 }}>
          <div className="seg tl-view" role="group" aria-label="Timeline view">
            <button className={view === 'key' ? 'on' : ''} aria-pressed={view === 'key'} onClick={() => setView('key')}>
              Key steps
            </button>
            <button className={view === 'all' ? 'on' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>
              {`Everything (${allN - keyN} more)`}
            </button>
          </div>
          <Chips options={FILTERS} value={filter[0].toUpperCase() + filter.slice(1)} onChange={(v) => setFilter(v.toLowerCase() as typeof filter)} />
        </div>
      }
    >
      {!rows.length ? (
        <div className="empty">Nothing here yet.</div>
      ) : (
        groups.map((g) => (
          <div key={g.day} className="tl-day">
            <div className="tl-dayhd">{g.day}</div>
            <ol className="timeline" data-view={view}>
              {collapseRuns(g.rows).map((e) => ('run' in e ? <TlRun key={`run-${e.run[0].seq}-${e.run[0].at}`} rows={e.run} /> : <TlItem key={`${e.seq}-${e.at}`} e={e} />))}
            </ol>
          </div>
        ))
      )}
      <div className="tiny muted" style={{ marginTop: 8 }}>
        Every event is written to the hash-chained audit log. History can be corrected, never erased.
      </div>
    </Card0>
  );
}

// ---------- Reporter ----------

function ReportRow({ i, r, at }: { i: Incident; r: Incident['reports'][number]; at: number }) {
  const me = persona();
  const vis = reporterVisibility(me, i, r);
  const unsealed = vis === 'sealed' && isUnsealed(i.id);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const showText = !(i.sensitiveOnly && me.role !== 'sensitive');
  return (
    <div className="notice">
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        {r.photo && showText && <img className="thumb" src={r.photo} alt="Reporter photo" />}
        <div style={{ flex: 1 }}>
          <div>{showText ? `"${r.text}"` : 'Details held by the restricted desk'}</div>
          {r.voice && <div className="small muted">🎙 {r.voice}</div>}
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
          <button className="btn" onClick={() => run(actions.breakGlass(i.id, reason), 'Identity unsealed for 30 minutes. Logged.')}>
            Unseal identity
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Next step ----------

type SheetKind = '' | 'callback' | 'verify' | 'pass' | 'assign' | 'handback' | 'decline' | 'resolve' | 'update' | 'backup' | 'sendbackup' | 'ask' | 'reject' | 'merge' | 'rejectres' | 'severity' | 'cantgo' | 'sossafe' | 'sosinjured' | 'sosmissing';

/** One action the current user can take. "pass" actions are shown as the "Pass case" button. */
interface Act {
  key: string;
  label: string;
  onClick: () => void;
  pass?: boolean;
  danger?: boolean;
  confirm?: string;
}

/** Works out the role-specific next step (PRD v2 §3.4). Shared by the case header and field cards. */
function useNextStep(i: Incident) {
  const me = persona();
  const at = useNow(5000);
  const [sheet, setSheet] = useState<SheetKind>('');
  const h = pendingHandoff(i);
  const control = isControl(me);
  const manager = isManagerOf(me, i.agencyId) && agency(i.agencyId)?.kind !== 'control_room';
  const officer = me.role === 'officer' && i.officerId === me.id;
  const desk = me.role === 'sensitive' && i.sensitiveOnly;
  // Commanders assign; officers (or the restricted desk) do the field work.
  const worker = officer || desk || (manager && !i.officerId && !dep.people.some((p) => p.agencyId === i.agencyId && p.role === 'officer'));
  const decider = !!h && canDecide(me, h);
  const emergency = i.restricted || i.category === 'fire';
  const c = cat(i.category);

  let title = 'Next step';
  let lead: ReactNode = null;
  const primary: Act[] = [];
  const secondary: Act[] = [];
  const P = (key: string, label: string, onClick: () => void, extra: Partial<Act> = {}) => primary.push({ key, label, onClick, ...extra });
  const S = (key: string, label: string, onClick: () => void, extra: Partial<Act> = {}) => secondary.push({ key, label, onClick, ...extra });
  const open = (k: SheetKind) => () => setSheet(k);

  const sosR = i.officerSos?.responses.find((r) => r.status === 'asked' && isManagerOf(me, r.agencyId));
  if (me.role === 'citizen') {
    title = 'Your report';
  } else if (i.officerSos && isOpen(i)) {
    const o = i.officerSos;
    title = o.kind === 'missed' ? 'Missed check-in — officer SOS' : 'Officer SOS';
    lead = (
      <>
        {person(o.officerId)?.name} near {i.area}. {o.responses.map((r) => `${agency(r.agencyId)?.short} (${r.km} km): ${r.status === 'going' ? 'going' : r.status === 'cant' ? `can't go${r.reason ? ` — ${r.reason}` : ''}` : 'asked'}`).join(' · ')}
        {o.safeAt ? ` · Officer said "I'm safe now" at ${hhmm(o.safeAt)}.` : ''}
      </>
    );
    if (sosR) {
      P('going', "I'm going", () => run(safety.respond(i.id, sosR.agencyId, true), 'Your unit is marked as going. The officer and duty lead are told.'));
      S('cant', "Can't go", open('cantgo'));
    }
    if (canCloseOfficerSos(me, i)) {
      P('safe', 'Officer safe', open('sossafe'));
      S('injured', 'Officer injured — hospital', open('sosinjured'), { danger: true });
      S('missing', 'Officer missing', open('sosmissing'), { danger: true });
    }
    if (me.id === o.officerId && !o.safeAt) P('imsafe', "I'm safe now", () => run(safety.imSafe(i.id), 'Everyone has been told.'));
  } else if (i.armedHold && isOpen(i)) {
    const hh = i.armedHold;
    title = 'Armed dispatch waiting for the duty lead';
    lead = (
      <>
        This report names a group. {person(hh.byId)?.name} asked to pass it to <b>{agency(hh.toAgencyId)?.short}</b>. The duty lead must confirm. {GROUP_TIP}
      </>
    );
    if (me.role === 'ops_manager' && isControl(me)) P('confirm-armed', `Confirm armed dispatch → ${agency(hh.toAgencyId)?.short}`, () => run(actions.confirmArmed(i.id), `Passed to ${agency(hh.toAgencyId)?.short}.`));
    if (control) S('reject', 'Reject', open('reject'), { danger: true });
  } else if (i.status === 'rejected' && i.rejectKind === 'hoax' && i.hoax && !i.hoax.confirmedAt && !i.hoax.dismissedBy) {
    title = 'Hoax — waiting for the duty lead';
    lead = (
      <>
        {i.hoax.by} rejected this as a <b>deliberate false alarm</b>: “{i.hoax.reason}”. It only counts against the reporter's standing once the duty lead confirms.
      </>
    );
    if (me.role === 'ops_manager' && isControl(me)) {
      P('confirm-hoax', 'Confirm hoax', () => run(standing.confirmHoax(i.id), "Confirmed. The reporter's standing has been updated."), { confirm: 'Confirm this was a deliberate false alarm?' });
      S('dismiss-hoax', 'Not a hoax — no penalty', () => run(standing.dismissHoax(i.id), 'Re-classified as No trace found. No penalty.'));
    }
  } else if (!isOpen(i) && i.status !== 'resolved') {
    title = i.status === 'closed' ? 'Case closed' : i.status === 'referred' ? 'Referred to investigation' : `Rejected — ${rejectLabel(i.rejectKind)}`;
    lead = (
      <>
        {i.status === 'rejected' ? `Reason: ${i.outcome ?? '—'}. ` : i.outcome ? `Outcome: ${i.outcome}. ` : ''}
        {i.t.closed ? `Final at ${dayTime(i.t.closed)}${i.by.closed ? ` by ${i.by.closed}` : ''}.` : ''} History can be corrected, never erased.
      </>
    );
  } else if (decider && h) {
    title = h.kind === 'handback' || h.kind === 'control' ? 'Passed back to you' : 'Passed to you';
    lead = (
      <>
        <b>{h.fromName}</b> passed this case {ago(h.at, at)}. <b>Reason:</b> {h.reason}
        {h.note ? <> · Note: {h.note}</> : null} · Accept by {fmtTimeWat(i.ackDueAt)} or it escalates.
      </>
    );
    P('accept', h.kind === 'unit' ? 'Accept for unit' : 'Accept', () => run(actions.acceptHandoff(i.id), `Accepted ${i.ref}. You now own it.`));
    if (h.kind === 'unit' && manager) S('pass', 'Pass case', open('assign'), { pass: true });
    S('decline', 'Decline', open('decline'));
  } else if (i.status === 'pending' && (control || desk)) {
    title = 'Pending review';
    lead = i.restricted ? 'A report is an allegation, not proof. Check it, then pass it to the unit that covers the area. Security is never dispatched automatically.' : 'This report was not clearly classified. Confirm what it is and pass it to the right agency.';
    if (desk) {
      P('take', 'Take case', () => run(actions.takeCase(i.id), 'Case taken by the restricted desk.'));
      S('pass', 'Pass case', open('verify'), { pass: true });
    } else {
      const cb = callbackNeeded(getState(), i);
      if (cb) lead = <>{lead} <span className="tip">Call back before verifying (2 hoaxes in 12 months). SOS is never held back.</span></>;
      P('verify', 'Verify & pass', open(cb ? 'callback' : 'verify'));
      if (!cb) S('mark', 'Mark verified', () => run(actions.verify(i.id, { how: 'Operator judgement' }), 'Marked verified.'));
      S('callback', 'Call back reporter', () => run(actions.callBack(i.id), 'Masked call placed. Logged.'));
      S('ask', 'Ask reporter a question', open('ask'));
      S('merge', 'Merge duplicate', open('merge'));
    }
    S('reject', 'Reject', open('reject'), { danger: true });
  } else if (i.status === 'verified' && control) {
    title = 'Verified — pass it on';
    P('pass', 'Pass case', open('verify'));
    S('reject', 'Reject', open('reject'), { danger: true });
  } else if (i.status === 'assigned' && h) {
    title = 'Waiting for acceptance';
    lead = (
      <>
        <b>Handoff pending → {handoffTarget(h)}</b> · passed {ago(h.at, at)} by {h.fromName}. They must accept by {fmtTimeWat(i.ackDueAt)} or it escalates.
      </>
    );
    if (control || manager || h.fromId === me.id) S('pass', 'Pass case', open(manager && h.kind === 'officer' ? 'assign' : 'pass'), { pass: true });
  } else if (i.status === 'accepted') {
    if (worker) {
      title = 'Accepted — get moving';
      P('start', emergency ? 'En route' : 'Start work', () => run(actions.start(i.id), emergency ? 'Marked en route. The reporter is told help is on the way.' : 'Work started.'));
      if (officer) S('handback', 'Pass case', open('handback'), { pass: true });
    }
    if (manager && !i.officerId) {
      title = 'Accepted by your unit — pass it to an officer';
      primary.unshift({ key: 'assign', label: 'Pass case', onClick: open('assign') });
    } else if (manager) S('pass', 'Pass case', open('assign'), { pass: true });
    if (control) S('pass-c', 'Pass case', open('pass'), { pass: true });
  } else if (i.status === 'in_progress') {
    title = emergency ? (i.t.onScene ? 'On scene' : 'En route') : 'Work in progress';
    if (worker) {
      if (emergency && !i.t.onScene) P('scene', 'On scene', () => run(actions.onScene(i.id), 'Arrival recorded.'));
      P('resolve', 'Mark resolved', open('resolve'));
      S('update', c.evidence.includes('photo') ? 'Add update / photo' : 'Add update', open('update'));
      if (i.restricted) S('backup', 'Request backup', open('backup'));
      if (officer) S('handback', 'Pass case', open('handback'), { pass: true });
    }
    if (manager || control) S('sendbackup', 'Send backup', open('sendbackup'));
    if (manager) S('pass', 'Pass case', open('assign'), { pass: true });
  } else if (i.status === 'resolved') {
    title = 'Resolved';
    if (c.citizenVerification) lead = 'Waiting for the citizen to confirm the fix. If nobody replies in 72 hours it closes as "Closed — unconfirmed".';
    else if (manager || desk) {
      lead = (
        <>
          {i.by.resolved} marked this resolved: <b>{i.outcome ?? 'done'}</b>. Check the timeline, then sign off.
        </>
      );
      P('sign', 'Sign off & close', () => run(actions.signOff(i.id), `${i.ref} signed off and closed.`), { confirm: 'Sign off and close this case?' });
      S('rejectres', 'Reject resolution', open('rejectres'), { danger: true });
    } else lead = 'Waiting for the unit commander to sign off.';
  } else if (i.status === 'reopened') {
    title = 'Reopened';
    lead = `${i.side?.reason ?? 'Reopened'} — accept it again and fix it. Escalation went up one level.`;
    if (worker || manager) P('accept', 'Accept', () => run(actions.acceptCase(i.id), 'Accepted again.'));
    if (manager) S('pass', 'Pass case', open('assign'), { pass: true });
  }

  if (i.noticeHold?.length && me.role === 'agency_head' && agency(me.agencyId)?.kind === 'control_room') S('approve-notice', `Approve community notice (${i.noticeHold.length})`, () => run(actions.approveNotice(i.id), 'Community leaders notified by SMS.'));
  if (i.namesGroup && control && i.status === 'pending' && !i.armedHold) lead = <>{lead} <span className="tip">Tip: {GROUP_TIP} Passing to an armed unit needs the duty lead's confirmation.</span></>;
  if (officer && isOpen(i) && ['accepted', 'in_progress'].includes(i.status)) S(i.lone ? 'lone-off' : 'lone', i.lone ? 'End lone working' : "I'm alone on this job", () => run(safety.setLone(i.id, !i.lone), i.lone ? 'Lone working ended.' : 'Check-in timer starts once you are on scene.'));
  if (desk && isOpen(i) && i.status !== 'pending' && !decider) S('pass-desk', 'Pass case', open('pass'), { pass: true });
  if ((control || manager) && isOpen(i)) S('severity', 'Change severity', open('severity'));
  if (me.role !== 'citizen' && canPostChannel(me, channelIdOf(i.agencyId))) S('discuss', 'Discuss in station chat', () => run(chat.discussCase(i.id), `Case card posted in the ${agency(i.agencyId)?.short} chat.`));
  return { title, lead, primary, secondary, sheet: sheet ? <ActionSheet kind={sheet} i={i} onClose={() => setSheet('')} /> : null, citizen: me.role === 'citizen' };
}

function ActButton({ a, cls }: { a: Act; cls: string }) {
  if (a.confirm)
    return (
      <ConfirmButton className={cls} confirm={a.confirm} onConfirm={a.onClick}>
        {a.label}
      </ConfirmButton>
    );
  return (
    <button className={cls} onClick={a.onClick}>
      {a.label}
    </button>
  );
}

/** Case page header: ONE primary button, a "Pass case" button, everything else under More. */
function HeaderActions({ i }: { i: Incident }) {
  const n = useNextStep(i);
  if (n.citizen) {
    const me = persona();
    const mine = i.reports.find((r) => r.reporter?.personId === me.id) ?? i.reports[0];
    return (
      <div className="hdr-actions">
        <button className="btn primary" onClick={() => go(`/track/${mine.ref}`)}>
          Open tracking page
        </button>
      </div>
    );
  }
  const [first, ...restPrimary] = n.primary;
  const passIdx = n.secondary.findIndex((a) => a.pass);
  const pass = passIdx >= 0 ? n.secondary[passIdx] : undefined;
  const more = [...restPrimary, ...n.secondary.filter((_, k) => k !== passIdx)];
  return (
    <>
      <div className="hdr-actions">
        {first && <ActButton a={first} cls="btn primary lg" />}
        {pass && (
          <button className="btn lg" onClick={pass.onClick}>
            <Icon name="pass" size={17} /> Pass case
          </button>
        )}
        {more.length > 0 && (
          <details className="more">
            <summary className="btn lg">
              More <Icon name="down" size={16} />
            </summary>
            <div className="more-menu" role="menu">
              {more.map((a) => (
                <ActButton key={a.key} a={a} cls={`menu-item${a.danger ? ' danger' : ''}`} />
              ))}
            </div>
          </details>
        )}
      </div>
      {n.sheet}
    </>
  );
}

/** The next step as a compact card (field officer's phone list). */
export function NextStep({ i }: { i: Incident; compact?: boolean }) {
  const n = useNextStep(i);
  if (n.citizen) return null;
  const nothing = !n.primary.length && !n.secondary.length && !n.lead;
  return (
    <div className="next-card">
      <div className="small strong">{n.title}</div>
      {n.lead && <div className="small muted">{n.lead}</div>}
      {nothing && <div className="small muted">Nothing for you to do right now.</div>}
      {!!n.primary.length && (
        <div className="next-primary">
          {n.primary.map((a) => (
            <ActButton key={a.key} a={a} cls="btn primary lg" />
          ))}
        </div>
      )}
      {!!n.secondary.length && (
        <div className="row">
          {n.secondary.map((a) => (
            <ActButton key={a.key} a={a} cls={`btn${a.danger ? ' danger-outline' : ''}`} />
          ))}
        </div>
      )}
      {n.sheet}
    </div>
  );
}

/** The lead sentence for the current step, shown under the case header. */
function NextLead({ i }: { i: Incident }) {
  const n = useNextStep(i);
  if (!n.lead) return null;
  return (
    <div className={`next-lead${i.status === 'reopened' ? ' bad' : pendingHandoff(i) ? ' handoff' : ''}`}>
      <b>{n.title}:</b> {n.lead}
    </div>
  );
}

// ---------- Sheets ----------

const REASONS = ['Outside our area', 'Needs armed response', 'Needs fire service', 'Officer off duty', 'Wrong category', 'Other'];

function reasonText(chip: string, text: string) {
  if (!chip) return text.trim();
  if (chip === 'Other') return text.trim();
  return text.trim() ? `${chip} — ${text.trim()}` : chip;
}

function ActionSheet({ kind, i, onClose }: { kind: SheetKind; i: Incident; onClose: () => void }) {
  switch (kind) {
    case 'verify':
    case 'pass':
    case 'assign':
      return <PassSheet i={i} mode={kind} onClose={onClose} />;
    case 'handback':
      return <ReasonSheet title="Pass case — pass back to my commander" chips={['Officer off duty', 'Needs armed response', 'Outside our area', 'Other']} button="Pass back to my commander" onClose={onClose} onSubmit={(r) => run(actions.handBack(i.id, r), 'Passed back to your commander. They must accept it.')} />;
    case 'decline':
      return <ReasonSheet title="Decline — tell them why" chips={REASONS} button="Decline" danger onClose={onClose} onSubmit={(r) => run(actions.declineHandoff(i.id, r), 'Declined. The case went back to the sender with your reason.')} />;
    case 'rejectres':
      return <ReasonSheet title="Reject the resolution" chips={['Evidence is not enough', 'Situation not contained', 'Wrong outcome', 'Other']} button="Reject resolution — reopen" danger onClose={onClose} onSubmit={(r) => run(actions.rejectResolution(i.id, r), 'Reopened and sent back to the officer.')} />;
    case 'callback':
      return <CallbackSheet i={i} onClose={onClose} />;
    case 'reject':
      return <RejectSheet i={i} onClose={onClose} />;
    case 'resolve':
      return <ResolveSheet i={i} onClose={onClose} />;
    case 'update':
      return <UpdateSheet i={i} onClose={onClose} />;
    case 'backup':
      return <ReasonSheet title="Request backup" chips={['Crowd building', 'Armed suspects', 'Need ambulance', 'Need more officers', 'Other']} button="Request backup" danger onClose={onClose} onSubmit={(r) => run(actions.requestBackup(i.id, r), 'Backup requested. The duty lead and your commander have been told.')} />;
    case 'ask':
      return <AskSheet i={i} onClose={onClose} />;
    case 'merge':
      return <MergeSheet i={i} onClose={onClose} />;
    case 'sendbackup':
      return <SendBackupSheet i={i} onClose={onClose} />;
    case 'cantgo': {
      const r = i.officerSos?.responses.find((x) => x.status === 'asked' && isManagerOf(persona(), x.agencyId));
      return <ReasonSheet title="Can't go — tell them why" chips={['No vehicle', 'Already on a critical job', 'Too far', 'Other']} button="Can't go" danger onClose={onClose} onSubmit={(rs) => run(safety.respond(i.id, r?.agencyId ?? '', false, rs), 'Recorded. The duty lead is told.')} />;
    }
    case 'sossafe':
      return <ReasonSheet title="Officer safe — debrief note" chips={['Officer found safe', 'Situation contained', 'False alarm — pressed by mistake', 'Other']} button="Close as Officer safe" onClose={onClose} onSubmit={(rs) => run(safety.close(i.id, 'safe', rs), 'Closed: officer safe.')} />;
    case 'sosinjured':
      return <ReasonSheet title="Officer injured — hospital" chips={['Taken to hospital', 'Treated on scene, then hospital', 'Other']} button="Record — escalate to coordinator" danger onClose={onClose} onSubmit={(rs) => run(safety.close(i.id, 'injured', rs), 'Recorded. The coordinator has been told.')} />;
    case 'sosmissing':
      return <ReasonSheet title="Officer missing" chips={['No contact', 'Phone off', 'Other']} button="Escalate — officer missing" danger onClose={onClose} onSubmit={(rs) => run(safety.close(i.id, 'missing', rs), 'Escalated to the security coordinator.')} />;
    case 'severity':
      return <SeveritySheet i={i} onClose={onClose} />;
  }
  return null;
}

function ReasonSheet({ title, chips, button, danger, onClose, onSubmit }: { title: string; chips: string[]; button: string; danger?: boolean; onClose: () => void; onSubmit: (r: string) => boolean }) {
  const [chip, setChip] = useState('');
  const [text, setText] = useState('');
  const reason = reasonText(chip, text);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack lg">
        <div className="field">
          <span>Why? (required)</span>
          <Chips options={chips} value={chip} onChange={setChip} />
        </div>
        <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={chip === 'Other' ? 'Write the reason' : 'Add detail (optional)'} />
        <button className={`btn lg block ${danger ? 'danger' : 'primary'}`} disabled={!reason} onClick={() => onSubmit(reason) && onClose()}>
          {button}
        </button>
      </div>
    </Sheet>
  );
}

const openLoad = (agencyId: string) => getState().incidents.filter((x) => x.agencyId === agencyId && isOpen(x)).length;
const officerLoad = (id: string) => getState().incidents.filter((x) => x.officerId === id && isOpen(x)).length;
const SECURITY_KINDS = ['police', 'corps', 'sensitive_desk', 'emergency'];

type PassTo = 'unit' | 'person' | 'control';

/** "Pass case" modal, like HospEase TransferAppointmentModal (PRD v2.1 §4.4). */
function PassSheet({ i, mode, onClose }: { i: Incident; mode: 'verify' | 'pass' | 'assign'; onClose: () => void }) {
  const me = persona();
  const control = isControl(me);
  const desk = me.role === 'sensitive';
  const manager = !control && !desk;
  const [category, setCategory] = useState<CategoryId>(i.category === 'other' ? 'waste' : i.category);
  const [sub, setSub] = useState(i.category === 'other' ? 'refuse' : i.subcategory ?? cat(i.category).subcategories[0].id);
  const [sev, setSev] = useState<Severity>(i.severity);
  const options: PassTo[] = manager ? ['unit', 'person', 'control'] : ['unit'];
  const [to, setTo] = useState<PassTo>(mode === 'assign' && manager ? 'person' : options[0]);
  const [target, setTarget] = useState('');
  const [chip, setChip] = useState(mode === 'verify' ? 'Covers this area' : mode === 'assign' ? 'Nearest patrol' : '');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string>();
  const security = cat(category).restricted;
  const sensitiveSub = !!cat(category).subcategories.find((s) => s.id === sub)?.sensitiveOnly;
  const cr = dep.agencies.find((a) => a.kind === 'control_room')!;

  const unitLabel = (a: (typeof dep.agencies)[number]) => `${a.short} — ${a.lgaIds.length ? `covers ${a.lgaIds.slice(0, 3).map((l) => lgaOf(l).name).join(', ')}${a.lgaIds.length > 3 ? '…' : ''}` : 'statewide'} · ${openLoad(a.id)} open`;
  let units = dep.agencies.filter((a) => a.kind !== 'control_room' && a.id !== i.agencyId && (security ? SECURITY_KINDS.includes(a.kind) : !['police', 'corps', 'sensitive_desk'].includes(a.kind)));
  if (desk) units = dep.agencies.filter((a) => (a.kind === 'police' || a.id === 'sgbv') && a.id !== i.agencyId);
  else if (!control) units = units.filter((a) => a.kind !== 'sensitive_desk');
  else if (sensitiveSub) units = units.filter((a) => a.kind === 'sensitive_desk');
  // Units covering the case's LGA first.
  units.sort((a, b) => Number(b.lgaIds.includes(i.lgaId)) - Number(a.lgaIds.includes(i.lgaId)) || a.short.localeCompare(b.short));
  const people = dep.people
    .filter((p) => p.agencyId === (me.agencyId ?? i.agencyId) && p.role === 'officer' && p.id !== i.officerId)
    .sort((a, b) => Number(onDuty(b.id)) - Number(onDuty(a.id)) || officerLoad(a.id) - officerLoad(b.id));
  const chips = mode === 'verify' ? ['Covers this area', ...REASONS] : to === 'person' ? ['Nearest patrol', 'On duty in the area', 'Officer off duty', 'Other'] : REASONS;
  const reason = reasonText(chip, note);
  const value = to === 'control' ? `a:${cr.id}` : target;

  const submit = () => {
    if (!value) return run('Choose who to pass it to');
    if (!reason) return run(chip === 'Other' ? 'Write the reason in the note' : 'Choose a reason');
    const [t, v] = value.split(':');
    const toPersonId = t === 'p' ? v : undefined;
    const toAgencyId = t === 'p' ? person(v)!.agencyId! : v;
    const label = t === 'p' ? person(v)!.name : agency(v)!.short;
    const err =
      mode === 'verify'
        ? actions.verifyAndPass(i.id, { category: control ? category : undefined, subcategory: control ? sub : undefined, severity: control ? sev : undefined, toAgencyId, reason, note: chip === 'Other' ? undefined : note || undefined })
        : actions.passCase(i.id, { toAgencyId, toPersonId, reason, note: chip === 'Other' ? undefined : note || undefined });
    if (err) return run(err);
    const after = getState().incidents.find((x) => x.id === i.id)!;
    const msg = after.armedHold ? `This report names a group. It is waiting for the duty lead to confirm armed dispatch to ${label}.` : `Passed to ${label}. They have ${ackMinutes(after)} min to accept.`;
    run(undefined, msg);
    setDone(msg);
  };

  const title = mode === 'verify' && i.status === 'pending' ? 'Verify & pass' : 'Pass case';
  void security;
  return (
    <Sheet title={`${title} ${i.ref}`} onClose={onClose}>
      {done ? (
        <div className="stack lg">
          <div className="success-banner">
            <Icon name="done" size={22} /> {done}
          </div>
          <button className="btn primary lg block" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="stack lg">
          <div className="summary">
            <div>
              <span>Ref</span>
              <b className="mono">{i.ref}</b>
            </div>
            <div>
              <span>Type</span>
              <b>{subLabel(i.category, i.subcategory)}</b>
            </div>
            <div>
              <span>Area, LGA</span>
              <b>
                {i.area}, {lgaOf(i.lgaId).name}
              </b>
            </div>
            <div>
              <span>Current holder</span>
              <b>{holderLabel(i)}</b>
            </div>
          </div>
          {mode === 'verify' && control && (
            <div className="grid g3">
              <label className="field">
                <span>Category</span>
                <select
                  className="input"
                  value={category}
                  onChange={(e) => {
                    const v = e.target.value as CategoryId;
                    setCategory(v);
                    setSub(cat(v).subcategories[0].id);
                    setTarget('');
                  }}
                >
                  {dep.categories
                    .filter((x) => x.id !== 'other')
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Type</span>
                <select className="input" value={sub} onChange={(e) => (setSub(e.target.value), setTarget(''))}>
                  {cat(category).subcategories.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Severity</span>
                <select className="input" value={sev} onChange={(e) => setSev(e.target.value as Severity)}>
                  {SEVERITIES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {sensitiveSub && control && <div className="notice sealed small">This type goes to the restricted desk, not to a patrol unit. Reporter identity stays sealed.</div>}
          {options.length > 1 && (
            <div className="field">
              <span>Pass to</span>
              <div className="radios">
                {options.map((o) => (
                  <label key={o} className={to === o ? 'on' : ''}>
                    <input type="radio" name="passto" checked={to === o} onChange={() => (setTo(o), setTarget(''), setChip(''))} />
                    {o === 'unit' ? 'Pass to another unit or agency' : o === 'person' ? 'Pass to an officer' : 'Pass back to the control room'}
                  </label>
                ))}
              </div>
            </div>
          )}
          {to !== 'control' && (
            <label className="field">
              <span>{to === 'person' ? 'Officer' : desk ? 'Partner (identity stays sealed)' : 'Unit / agency'}</span>
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Pass to">
                <option value="">Choose…</option>
                {to === 'person'
                  ? people.map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {p.name} — {onDuty(p.id) ? '● on duty' : '○ off duty'} · {officerLoad(p.id)} open
                      </option>
                    ))
                  : units.map((a) => (
                      <option key={a.id} value={`a:${a.id}`}>
                        {unitLabel(a)}
                      </option>
                    ))}
              </select>
            </label>
          )}
          <div className="field">
            <span>Reason (required)</span>
            <Chips options={chips} value={chip} onChange={setChip} />
          </div>
          <label className="field">
            <span>{chip === 'Other' ? 'Write the reason' : 'Note (optional)'}</span>
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. approach quietly; caller hiding in a shop" />
          </label>
          <button className="btn primary lg block" disabled={!value || !reason} onClick={submit}>
            {mode === 'verify' && i.status === 'pending' ? 'Verify & pass case' : mode === 'assign' ? 'Assign' : 'Pass case'}
          </button>
          <p className="tiny muted center">The receiver gets an inbox alert with Accept / Decline.{i.restricted ? ' Reporter identity is never sent.' : ''}</p>
        </div>
      )}
    </Sheet>
  );
}

function ResolveSheet({ i, onClose }: { i: Incident; onClose: () => void }) {
  const c = cat(i.category);
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [err, setErr] = useState<string>();
  const needsPhoto = c.evidence.includes('photo');
  return (
    <Sheet title="Mark resolved" onClose={onClose}>
      <div className="stack lg">
        {c.outcomes && (
          <div className="field">
            <span>Outcome (required)</span>
            <div className="opts">
              {c.outcomes.map((o) => (
                <label key={o} className={`pick${outcome === o ? ' on' : ''}`}>
                  <input type="radio" checked={outcome === o} onChange={() => setOutcome(o)} />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="field">
          <span>What was done?</span>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={i.restricted ? 'e.g. Area patrolled for 1 hour; no further threat' : 'e.g. Refuse cleared by 2 trucks; site swept'} />
        </label>
        {needsPhoto && <PhotoInput value={photo} onChange={setPhoto} label={`Photo of the finished work${i.t.reopened ? ' (new photo required — case was reopened)' : ''}`} sample="After clean-up" sampleTone="#8b9a6a" />}
        {err && <div className="notice bad small">{err}</div>}
        <button
          className="btn primary lg block"
          onClick={() => {
            const e = actions.resolve(i.id, { note, outcome: outcome || undefined, photo });
            setErr(e);
            if (run(e, c.citizenVerification ? 'Marked resolved. The citizen is asked: is it fixed?' : 'Marked resolved. Waiting for your commander to sign off.')) onClose();
          }}
        >
          {c.citizenVerification ? 'Mark resolved — citizen will confirm' : 'Mark resolved — commander signs off'}
        </button>
      </div>
    </Sheet>
  );
}

function UpdateSheet({ i, onClose }: { i: Incident; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string>();
  return (
    <Sheet title={i.restricted ? 'Situation update' : 'Add update / photo'} onClose={onClose}>
      <div className="stack lg">
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={i.restricted ? 'What is happening on the ground?' : 'Progress update'} />
        <PhotoInput value={photo} onChange={setPhoto} label="Photo (optional)" sample={i.restricted ? 'Scene' : 'Work in progress'} sampleTone={i.category === 'waste' ? '#5d6b3c' : undefined} />
        <button className="btn primary lg block" onClick={() => run(photo ? actions.addEvidence(i.id, 'photo', note, photo) : actions.addEvidence(i.id, 'note', note), 'Update added to the timeline.') && onClose()}>
          Save update
        </button>
      </div>
    </Sheet>
  );
}

function AskSheet({ i, onClose }: { i: Incident; onClose: () => void }) {
  const [q, setQ] = useState('');
  return (
    <Sheet title="Ask the reporter a question" onClose={onClose}>
      <div className="stack lg">
        <Chips options={['Are you safe now?', 'Can you describe the vehicle?', 'How many people?', 'Exact location?']} value={q} onChange={setQ} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question" />
        <p className="small muted">Sent through a masked channel. The reporter's number is never shown to units.</p>
        <button className="btn primary lg block" onClick={() => run(actions.requestInfo(i.id, q), 'Question sent to the reporter.') && onClose()}>
          Send question
        </button>
      </div>
    </Sheet>
  );
}

function RejectSheet({ i, onClose }: { i: Incident; onClose: () => void }) {
  const [kind, setKind] = useState<(typeof REJECT_REASONS)[number]['id']>();
  const [reason, setReason] = useState('');
  const hoax = kind === 'hoax';
  const anon = i.reports.every((r) => r.identity === 'anonymous');
  const ok = !!kind && (hoax ? reason.trim().length >= 20 : true);
  return (
    <Sheet title="Reject this report" onClose={onClose}>
      <div className="stack lg">
        <div className="opts">
          {REJECT_REASONS.map((o) => (
            <label key={o.id} className={`pick${kind === o.id ? ' on' : ''}${o.id === 'hoax' && anon ? ' disabled' : ''}`}>
              <input type="radio" disabled={o.id === 'hoax' && anon} checked={kind === o.id} onChange={() => setKind(o.id)} />
              <span>
                {o.label} <span className={`tiny ${o.penalty ? 'clk bad' : 'muted'}`}>{o.penalty ? '— counts against standing once the duty lead confirms' : '— no penalty'}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="field">
          <span>{hoax ? 'Why is this a deliberate false alarm? (at least 20 characters)' : 'Note (optional)'}</span>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={hoax ? 'e.g. Caller admitted on call-back that it was made up' : ''} />
        </label>
        {hoax && reason.trim().length > 0 && reason.trim().length < 20 && <span className="small clk bad">{20 - reason.trim().length} more characters</span>}
        <p className="small muted">Honest mistakes never count against a reporter. Rejected is final; it is recorded in the audit log with your name.</p>
        <ConfirmButton className="btn danger lg block" disabled={!ok} confirm="Reject this report? This cannot be undone." onConfirm={() => run(actions.reject(i.id, reason.trim() || rejectLabel(kind), kind), hoax ? 'Rejected as a hoax — waiting for the duty lead to confirm.' : 'Report rejected.') && onClose()}>
          Reject
        </ConfirmButton>
      </div>
    </Sheet>
  );
}

/** Restricted reporter: "Have you called back?" before the verify sheet opens. */
function CallbackSheet({ i, onClose }: { i: Incident; onClose: () => void }) {
  const [next, setNext] = useState(false);
  if (next) return <PassSheet i={i} mode="verify" onClose={onClose} />;
  return (
    <Sheet title="Have you called back?" onClose={onClose}>
      <div className="stack lg">
        <p>This reporter is <b>Restricted</b> (2 deliberate false alarms in 12 months). Call them back before verifying. SOS reports are never held back.</p>
        <button className="btn primary lg block" onClick={() => run(standing.callback(i.id, 'reached'), 'Call-back recorded.') && setNext(true)}>
          Yes — I called back
        </button>
        <button className="btn lg block" onClick={() => run(standing.callback(i.id, 'unreachable'), "Recorded: couldn't reach.") && setNext(true)}>
          Couldn't reach
        </button>
      </div>
    </Sheet>
  );
}

function MergeSheet({ i, onClose }: { i: Incident; onClose: () => void }) {
  const incidents = useStore((s) => s.incidents);
  const near = incidents.filter((x) => x.id !== i.id && x.category === i.category && isOpen(x) && km(x.lat, x.lng, i.lat, i.lng) < 3 && Math.abs(x.createdAt - i.createdAt) < 12 * 3600_000).slice(0, 8);
  return (
    <Sheet title="Merge into an existing case" onClose={onClose}>
      {!near.length ? (
        <div className="empty">No similar open cases nearby.</div>
      ) : (
        <div className="stack">
          {near.map((x) => (
            <div key={x.id} className="notice row between">
              <span>
                <span className="mono small">{x.ref}</span> · {subLabel(x.category, x.subcategory)} · {x.area} <StatusPill i={x} />
              </span>
              <button className="btn sm" onClick={() => run(actions.mergeInto(i.id, x.id), `Merged into ${x.ref}.`) && onClose()}>
                Merge
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function SendBackupSheet({ i, onClose }: { i: Incident; onClose: () => void }) {
  const [a, setA] = useState('');
  const units = dep.agencies.filter((x) => ['police', 'corps', 'emergency'].includes(x.kind) && x.id !== i.agencyId);
  const sorted = [...units.filter((u) => u.lgaIds.includes(i.lgaId) || !u.lgaIds.length), ...units.filter((u) => u.lgaIds.length && !u.lgaIds.includes(i.lgaId))];
  return (
    <Sheet title="Send backup" onClose={onClose}>
      <div className="stack lg">
        <select className="input" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Choose a unit…</option>
          {sorted.map((u) => (
            <option key={u.id} value={u.id}>
              {u.short}
              {u.lgaIds.includes(i.lgaId) ? ' (covers this area)' : ''}
            </option>
          ))}
        </select>
        <button className="btn primary lg block" disabled={!a} onClick={() => run(actions.sendBackup(i.id, a), `${agency(a)?.short} told to send backup.`) && onClose()}>
          Send backup
        </button>
      </div>
    </Sheet>
  );
}

function SeveritySheet({ i, onClose }: { i: Incident; onClose: () => void }) {
  const [sev, setSev] = useState<Severity>(i.severity);
  const [reason, setReason] = useState('');
  return (
    <Sheet title="Change severity" onClose={onClose}>
      <div className="stack lg">
        <div className="seg">
          {SEVERITIES.map((x) => (
            <button key={x} className={sev === x ? 'on' : ''} onClick={() => setSev(x)}>
              {x}
            </button>
          ))}
        </div>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
        <button className="btn primary lg block" onClick={() => run(actions.changeSeverity(i.id, sev, reason), 'Severity changed.') && onClose()}>
          Change severity
        </button>
      </div>
    </Sheet>
  );
}

/** Inline Accept / Decline used in the inbox. */
export function HandoffDecision({ i, h, onDone }: { i: Incident; h: Handoff; onDone?: () => void }) {
  const [declining, setDeclining] = useState(false);
  const me = persona();
  if (h.status !== 'pending') return <span className="tiny muted">{h.status === 'accepted' ? `Accepted by ${h.decidedBy}` : h.status === 'declined' ? `Declined by ${h.decidedBy}` : 'Replaced by a newer handoff'}</span>;
  if (!canDecide(me, h)) return null;
  return (
    <>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn primary sm" onClick={() => run(actions.acceptHandoff(i.id), `Accepted ${i.ref}.`) && onDone?.()}>
          {h.kind === 'unit' ? 'Accept for unit' : 'Accept'}
        </button>
        <button className="btn sm" onClick={() => setDeclining(true)}>
          Decline
        </button>
      </div>
      {declining && <ReasonSheet title="Decline — tell them why" chips={REASONS} button="Decline" danger onClose={() => setDeclining(false)} onSubmit={(r) => run(actions.declineHandoff(i.id, r), 'Declined. Returned to the sender with your reason.')} />}
    </>
  );
}

