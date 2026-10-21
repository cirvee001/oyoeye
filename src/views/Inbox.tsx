import { useEffect, useRef, useState } from 'react';
import type { Notice } from '../platform/types';
import { actions, safety, getState, markAllRead, markNoticesRead, markRead, persona, useStore, subLabel } from '../store';
import { Ago, CountTitle, Icon, StatusPill, go, run, useNow } from '../ui';
import { errText, msgText, useLang, type StrKey } from '../i18n';
import { inboxView, type ActionItem, type UpdateGroup } from '../inbox';
import { handoffClock, transferClock } from '../countdown';
import { HandoffDecision } from './CaseView';
import { TransferRow } from './Officers';

const KIND_ICON: Record<Notice['kind'], string> = {
  handoff: 'pass',
  escalation: 'bell',
  backup: 'security',
  resolved: 'check',
  declined: 'pass',
  accepted: 'check',
  citizen: 'list',
  info: 'bell',
  reopened: 'other',
  sos: 'sos',
  feedback: 'done',
  transfer: 'officers',
  chat: 'chat',
};
const ACTION_ICON: Record<ActionItem['kind'], string> = { sos: 'sos', officer_sos: 'sos', help: 'sos', handoff: 'pass', review: 'alert', assign: 'pass', signoff: 'done', escalated: 'bell', transfer: 'officers', hoax: 'alert', notice: 'urgent', appeal: 'key', confirm: 'check', rate: 'done' };
const GROUP_KEY: Record<string, StrKey> = { 'Chat mentions': 'inbox.g.chat', 'Officer transfers': 'inbox.g.transfers', Notices: 'inbox.g.notices', Updates: 'inbox.g.updates' };

function openCase(incidentId?: string) {
  const me = persona();
  if (!incidentId) return;
  const i = getState().incidents.find((x) => x.id === incidentId);
  if (!i) return;
  if (me.role === 'citizen' || me.role === 'focal') {
    const r = i.reports.find((x) => x.reporter?.personId === me.id);
    if (r) return go(`/track/${r.ref}`);
    return go('/mycommunity');
  }
  go(`/case/${incidentId}`);
}
function openNotice(n: Notice) {
  markRead(n.id);
  if (n.channelId) return go(`/chat/${n.channelId}`);
  if (n.transferId) return go('/officers');
  openCase(n.incidentId);
}

/** One "Needs your action" row: what, the countdown, and its inline buttons (PRD v2.6 §4, §6). */
function ActionRow({ a, at, compact }: { a: ActionItem; at: number; compact?: boolean }) {
  const [lang, t] = useLang();
  const s = useStore((x) => x);
  const i = a.incidentId ? s.incidents.find((x) => x.id === a.incidentId) : undefined;
  const h = a.handoffId && i ? i.handoffs.find((x) => x.id === a.handoffId) : undefined;
  const hc = i && h ? handoffClock(i, at) : undefined;
  const tr = a.transferId ? s.transfers.find((x) => x.id === a.transferId) : undefined;
  const tc = tr ? transferClock(tr, at) : undefined;
  const urgent = a.rank <= 1;
  const sub =
    a.kind === 'handoff' && i
      ? `${subLabel(i.category, i.subcategory)} — ${i.area}`
      : a.kind === 'help'
        ? 'Officer needs help · answer now'
        : a.kind === 'sos' || a.kind === 'officer_sos'
          ? 'Open the case now'
          : a.kind === 'hoax'
            ? 'The duty lead decides whether it counts against the reporter'
            : a.kind === 'notice'
              ? 'Kidnapping notices to community leaders need your approval'
              : '';
  return (
    <div className={`notice-row action k-${a.kind}${urgent ? ' urgent' : ''}`}>
      <span className="n-ico">
        <Icon name={ACTION_ICON[a.kind]} size={16} />
      </span>
      <div className="n-body" role="button" tabIndex={0} onClick={() => (a.complaintId ? go(`/complaint/${a.complaintId}`) : a.transferId ? go('/officers') : openCase(a.incidentId))} onKeyDown={(e) => e.key === 'Enter' && openCase(a.incidentId)}>
        <div className="small">
          <b>{a.kind === 'confirm' ? `${t('t.fixed')} ${a.reportRef}` : a.kind === 'rate' ? `${t('inbox.rate')} — ${a.reportRef}` : a.title}</b>
          {hc && <span className={`cd-pill cd-${hc.tone}`}>{hc.tone === 'red' ? hc.overdueText : `${hc.short} to accept`}</span>}
          {tc && <span className={`cd-pill cd-${tc.tone}`}>{tc.tone === 'red' ? tc.short : `${tc.short} to accept`}</span>}
          {a.kind === 'help' && <span className="cd-pill cd-red">answer now</span>}
        </div>
        {(sub || a.ref) && <div className="tiny muted">{[a.ref && !a.reportRef ? a.ref : '', sub].filter(Boolean).join(' · ')}</div>}
      </div>
      {!compact && (
        <div className="n-actions">
          {h && i && <HandoffDecision i={i} h={h} />}
          {a.sosAgencyId && i && <SosAnswer caseId={i.id} agencyId={a.sosAgencyId} />}
          {a.transferId && <TransferRow id={a.transferId} compact />}
          {a.kind === 'notice' && i && (
            <button className="btn sm primary" onClick={() => run(actions.approveNotice(i.id), 'Community leaders notified by SMS.')}>
              Approve notice
            </button>
          )}
          {(a.kind === 'sos' || a.kind === 'officer_sos' || a.kind === 'hoax' || a.kind === 'review' || a.kind === 'assign' || a.kind === 'signoff' || a.kind === 'escalated') && (
            <button className="btn sm primary" onClick={() => openCase(a.incidentId)}>
              Open case
            </button>
          )}
          {a.kind === 'appeal' && (
            <button className="btn sm primary" onClick={() => go(`/complaint/${a.complaintId}`)}>
              Review appeal
            </button>
          )}
          {a.kind === 'confirm' && i && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary sm" onClick={() => run(errText(actions.confirmFix(i.id, 'yes', a.reportRef!), lang), t('t.closedOk'))}>
                {t('t.yes')}
              </button>
              <button className="btn sm" onClick={() => run(errText(actions.confirmFix(i.id, 'partial', a.reportRef!), lang), t('t.reopenOk'))}>
                {t('t.partly')}
              </button>
              <button className="btn danger sm" onClick={() => run(errText(actions.confirmFix(i.id, 'no', a.reportRef!), lang), t('t.reopenOk'))}>
                {t('t.no')}
              </button>
            </div>
          )}
          {a.kind === 'rate' && (
            <button className="btn sm primary" onClick={() => go(`/track/${a.reportRef}`)}>
              {t('inbox.rate')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NoticeLine({ n, at }: { n: Notice; at: number }) {
  const [lang, t] = useLang();
  return (
    <div className={`notice-row k-${n.kind}${n.read ? '' : ' unread'}`}>
      <span className="n-ico">
        <Icon name={KIND_ICON[n.kind]} size={14} />
      </span>
      <div className="n-body" role="button" tabIndex={0} onClick={() => openNotice(n)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openNotice(n))}>
        <div className="small">{n.msg ? msgText(n.msg, lang) : n.text}</div>
        <div className="tiny muted">
          <Ago t={n.at} at={at} lang={lang} />
        </div>
      </div>
      {!n.read && <span className="unread-dot" role="img" aria-label={t('inbox.unreadDot')} />}
    </div>
  );
}

/** One row per case: the latest update, "3 updates" and the case status; expand to see them all. */
function GroupRow({ g, at }: { g: UpdateGroup; at: number }) {
  const [lang, t] = useLang();
  const [open, setOpen] = useState(false);
  const i = useStore((s) => s.incidents).find((x) => x.id === g.incidentId);
  const me = persona();
  const resident = me.role === 'citizen' || me.role === 'focal';
  const title = g.incidentId ? (i ? `${resident ? i.reports.find((r) => r.reporter?.personId === me.id)?.ref ?? i.ref : i.ref} · ${i.restricted && resident ? t('cd.secreport') : subLabel(i.category, i.subcategory)}` : g.title) : GROUP_KEY[g.title] ? t(GROUP_KEY[g.title]) : g.title;
  return (
    <div className={`group-row${g.unread ? ' unread' : ''}`}>
      <div className="gr-main">
        <button className="gr-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${title}: ${t('inbox.nupdates', { n: g.items.length })}`}>
          <Icon name={open ? 'down' : 'forward'} size={14} />
        </button>
        <div className="n-body" role="button" tabIndex={0} onClick={() => (g.incidentId ? openCase(g.incidentId) : setOpen(!open))} onKeyDown={(e) => e.key === 'Enter' && (g.incidentId ? openCase(g.incidentId) : setOpen(!open))}>
          <div className="small">
            <b>{title}</b> <span className="tiny muted">{`· ${t('inbox.nupdates', { n: g.items.length })}`}</span>
          </div>
          <div className="small muted gr-latest">{g.latest.msg ? msgText(g.latest.msg, lang) : g.latest.text}</div>
          <div className="tiny muted">
            <Ago t={g.latest.at} at={at} lang={lang} />
          </div>
        </div>
        {i && <StatusPill i={i} lang={lang} />}
        {g.unread > 0 && <span className="unread-dot" role="img" aria-label={`${g.unread} ${t('inbox.unreadDot')}`} />}
      </div>
      {open && (
        <div className="gr-items">
          {g.items.slice(0, 30).map((n) => (
            <NoticeLine key={n.id} n={n} at={at} />
          ))}
        </div>
      )}
    </div>
  );
}

function useInbox() {
  const at = useNow(10_000);
  const s = useStore((x) => x);
  const me = persona();
  return { at, me, v: inboxView(s, me, at) };
}

export function Bell() {
  const [, t] = useLang();
  const { at, me, v } = useInbox();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onHash = () => setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    addEventListener('hashchange', onHash);
    addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      removeEventListener('hashchange', onHash);
      removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="bell-wrap" ref={ref}>
      <button className={`bell${v.badge ? ' has' : ''}`} onClick={() => setOpen(!open)} aria-label={t('bell.aria', { n: v.badge })} aria-expanded={open} data-badge={v.badge}>
        <Icon name="bell" size={20} />
        {v.badge > 0 && <span className="bell-n">{v.badge > 99 ? '99+' : v.badge}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="row between bell-hd">
            <b>{t('inbox.of', { name: me.name.split(' ')[0] })}</b>
            <a className="btn ghost sm" href="#/inbox">
              {t('inbox.viewall')}
            </a>
          </div>
          <div className="bell-list">
            {!v.actions.length && !v.groups.length && <div className="empty small">{t('inbox.empty.bell')}</div>}
            {v.actions.slice(0, 6).map((a) => (
              <ActionRow key={a.key} a={a} at={at} compact />
            ))}
            {v.actions.length > 6 && <div className="tiny muted bell-more">{t('inbox.moreactions', { n: v.actions.length - 6 })}</div>}
            <a className="bell-others" href="#/inbox">
              {t('inbox.others', { n: v.unreadGroups })} →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

type Chip = 'all' | 'action' | 'unread';

export function InboxPage() {
  const [, t] = useLang();
  const { at, v } = useInbox();
  const [chip, setChip] = useState<Chip>('all');
  const groups = v.groups.filter((g) => chip !== 'unread' || g.unread > 0).slice(0, 80);
  const showActions = true; // action items are always "unread" until done
  const showGroups = chip !== 'action';
  return (
    <div className="narrow stack lg">
      <section className="card worklist inbox-page">
        <div className="wl-head">
          <h2>
            <CountTitle title={t('inbox.title')} n={v.badge} />
          </h2>
          <div className="seg" role="group" aria-label={t('inbox.title')}>
            {(
              [
                ['all', 'inbox.all'],
                ['action', 'inbox.chip.action'],
                ['unread', 'inbox.unread'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={chip === k ? 'on' : ''} aria-pressed={chip === k} onClick={() => setChip(k)}>
                {t(l)}
                {k === 'action' && v.actions.length > 0 ? ` (${v.actions.length})` : k === 'unread' && v.unreadGroups > 0 ? ` (${v.unreadGroups})` : ''}
              </button>
            ))}
          </div>
          <button className="btn" onClick={markAllRead}>
            {t('inbox.markall2')}
          </button>
        </div>
        {showActions && (
          <div className="inbox-sec">
            <h3 className="sec-hd">
              <CountTitle title={t('inbox.action')} n={v.actions.length} />
            </h3>
            {!v.actions.length ? <div className="empty small">{t('inbox.noaction')}</div> : v.actions.map((a) => <ActionRow key={a.key} a={a} at={at} />)}
          </div>
        )}
        {showGroups && (
          <div className="inbox-sec">
            <div className="row between sec-hd">
              <h3>
                <CountTitle title={t('inbox.updates')} n={v.unreadGroups} />
              </h3>
              {v.unreadGroups > 0 && (
                <button className="btn ghost sm" onClick={() => markNoticesRead(v.groups.flatMap((g) => g.items.map((n) => n.id)))}>
                  {t('inbox.markall')}
                </button>
              )}
            </div>
            {!groups.length ? <div className="empty">{t('inbox.empty')}</div> : groups.map((g) => <GroupRow key={g.key} g={g} at={at} />)}
          </div>
        )}
      </section>
    </div>
  );
}

/** Inline "I'm going / Can't go" for an officer SOS alert. */
function SosAnswer({ caseId, agencyId, onDone }: { caseId: string; agencyId: string; onDone?: () => void }) {
  const i = useStore((s) => s.incidents).find((x) => x.id === caseId);
  const [cant, setCant] = useState(false);
  const [reason, setReason] = useState('');
  const r = i?.officerSos?.responses.find((x) => x.agencyId === agencyId);
  if (!r) return null;
  if (r.status !== 'asked') return <div className="tiny muted">{r.status === 'going' ? `Going · ${r.by}` : `Can't go · ${r.reason}`}</div>;
  return (
    <div className="row" style={{ gap: 6 }}>
      {!cant ? (
        <>
          <button className="btn danger sm" onClick={() => (onDone?.(), run(safety.respond(caseId, agencyId, true), 'Your unit is marked as going.'))}>
            I'm going
          </button>
          <button className="btn sm" onClick={() => setCant(true)}>
            Can't go
          </button>
        </>
      ) : (
        <>
          <input className="input" style={{ width: 180 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not?" aria-label="Reason you cannot go" />
          <button className="btn sm" onClick={() => (onDone?.(), run(safety.respond(caseId, agencyId, false, reason), 'Recorded.'))}>
            Send
          </button>
        </>
      )}
    </div>
  );
}
