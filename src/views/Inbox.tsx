import { useEffect, useRef, useState } from 'react';
import type { Notice } from '../platform/types';
import { actions, safety, dep, getState, inboxFor, markAllRead, markRead, persona, useStore } from '../store';
import { CountTitle, Icon, ago, go, run, useNow } from '../ui';
import { errText, msgText, useLang } from '../i18n';
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

function openNotice(n: Notice) {
  markRead(n.id);
  const me = persona();
  if (n.channelId) return go(`/chat/${n.channelId}`);
  if (!n.incidentId) return;
  if (me.role === 'focal' && !getState().incidents.find((x) => x.id === n.incidentId)?.reports.some((r) => r.reporter?.personId === me.id)) return go('/mycommunity');
  if (me.role === 'citizen' || me.role === 'focal') {
    const i = getState().incidents.find((x) => x.id === n.incidentId);
    const r = i?.reports.find((x) => x.reporter?.personId === me.id) ?? i?.reports[0];
    if (r) go(`/track/${r.ref}`);
  } else go(`/case/${n.incidentId}`);
}

function NoticeRow({ n, at }: { n: Notice; at: number }) {
  const [lang, t] = useLang();
  const incidents = useStore((s) => s.incidents);
  const me = persona();
  const i = n.incidentId ? incidents.find((x) => x.id === n.incidentId) : undefined;
  const h = n.handoffId && i ? i.handoffs.find((x) => x.id === n.handoffId) : undefined;
  const r = i?.reports.find((x) => x.reporter?.personId === me.id);
  const confirm = me.role === 'citizen' && i && r && i.status === 'resolved' && dep.categories.find((c) => c.id === i.category)?.citizenVerification && /fixed/i.test(n.text);
  return (
    <div className={`notice-row k-${n.kind}${n.read ? '' : ' unread'}`}>
      <span className="n-ico">
        <Icon name={KIND_ICON[n.kind]} size={16} />
      </span>
      <div className="n-body" role="button" tabIndex={0} onClick={() => openNotice(n)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openNotice(n))}>
        <div className="small">{n.msg ? msgText(n.msg, lang) : n.text}</div>
        <div className="tiny muted">
          {n.ref && <span className="mono">{n.ref}</span>} · {ago(n.at, at, lang)}
        </div>
      </div>
      {!n.read && <span className="unread-dot" role="img" aria-label={t('inbox.unreadDot')} />}
      {n.sosAgencyId && i?.officerSos && <SosAnswer caseId={i.id} agencyId={n.sosAgencyId} onDone={() => markRead(n.id)} />}
      {n.transferId && (
        <div className="n-actions" onClick={() => markRead(n.id)}>
          <TransferRow id={n.transferId} compact />
        </div>
      )}
      {h && i && (
        <div className="n-actions" onClick={() => markRead(n.id)}>
          <HandoffDecision i={i} h={h} />
        </div>
      )}
      {confirm && i && r && (
        <div className="n-actions row" style={{ gap: 6 }}>
          <button className="btn primary sm" onClick={() => (markRead(n.id), run(errText(actions.confirmFix(i.id, 'yes', r.ref), lang), t('t.closedOk')))}>
            {t('t.yes')}
          </button>
          <button className="btn sm" onClick={() => (markRead(n.id), run(errText(actions.confirmFix(i.id, 'partial', r.ref), lang), t('t.reopenOk')))}>
            {t('t.partly')}
          </button>
          <button className="btn danger sm" onClick={() => (markRead(n.id), run(errText(actions.confirmFix(i.id, 'no', r.ref), lang), t('t.reopenOk')))}>
            {t('t.no')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Bell() {
  const [, t] = useLang();
  const me = persona();
  const at = useNow(10_000);
  const inbox = useStore((s) => s.inbox);
  const meId = useStore((s) => s.signedInId);
  const mine = inboxFor({ inbox } as Parameters<typeof inboxFor>[0], meId);
  const unread = mine.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onHash = () => setOpen(false);
    document.addEventListener('mousedown', close);
    addEventListener('hashchange', onHash);
    return () => {
      document.removeEventListener('mousedown', close);
      removeEventListener('hashchange', onHash);
    };
  }, [open]);
  return (
    <div className="bell-wrap" ref={ref}>
      <button className={`bell${unread ? ' has' : ''}`} onClick={() => setOpen(!open)} aria-label={t('bell.aria', { n: unread })} aria-expanded={open}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="bell-n">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="row between bell-hd">
            <b>{t('inbox.of', { name: me.name.split(' ')[0] })}</b>
            <div className="row" style={{ gap: 4 }}>
              {unread > 0 && (
                <button className="btn ghost sm" onClick={markAllRead}>
                  {t('inbox.markall')}
                </button>
              )}
              <a className="btn ghost sm" href="#/inbox">
                {t('inbox.viewall')}
              </a>
            </div>
          </div>
          <div className="bell-list">
            {!mine.length && <div className="empty small">{t('inbox.empty.bell')}</div>}
            {mine.slice(0, 25).map((n) => (
              <NoticeRow key={n.id} n={n} at={at} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InboxPage() {
  const [, t] = useLang();
  const at = useNow(10_000);
  const inbox = useStore((s) => s.inbox);
  const meId = useStore((s) => s.signedInId);
  const mine = inboxFor({ inbox } as Parameters<typeof inboxFor>[0], meId);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const rows = mine.filter((n) => !unreadOnly || !n.read).slice(0, 150);
  return (
    <div className="narrow stack lg">
      <section className="card worklist">
        <div className="wl-head">
          <h2>
            <CountTitle title={t('inbox.title')} n={mine.filter((n) => !n.read).length} />
          </h2>
          <div className="seg" role="group" aria-label={t('inbox.title')}>
            <button className={!unreadOnly ? 'on' : ''} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
              {t('inbox.all')}
            </button>
            <button className={unreadOnly ? 'on' : ''} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
              {t('inbox.unread')}
            </button>
          </div>
          <button className="btn" onClick={markAllRead}>
            {t('inbox.markall')}
          </button>
        </div>
        {!rows.length && <div className="empty">{t('inbox.empty')}</div>}
        {rows.map((n) => (
          <NoticeRow key={n.id} n={n} at={at} />
        ))}
      </section>
    </div>
  );
}

/** Inline "I'm going / Can't go" for an officer SOS alert. */
function SosAnswer({ caseId, agencyId, onDone }: { caseId: string; agencyId: string; onDone: () => void }) {
  const i = useStore((s) => s.incidents).find((x) => x.id === caseId);
  const [cant, setCant] = useState(false);
  const [reason, setReason] = useState('');
  const r = i?.officerSos?.responses.find((x) => x.agencyId === agencyId);
  if (!r) return null;
  if (r.status !== 'asked') return <div className="n-actions tiny muted">{r.status === 'going' ? `Going · ${r.by}` : `Can't go · ${r.reason}`}</div>;
  return (
    <div className="n-actions row" style={{ gap: 6 }}>
      {!cant ? (
        <>
          <button className="btn danger sm" onClick={() => (onDone(), run(safety.respond(caseId, agencyId, true), "Your unit is marked as going."))}>
            I'm going
          </button>
          <button className="btn sm" onClick={() => setCant(true)}>
            Can't go
          </button>
        </>
      ) : (
        <>
          <input className="input" style={{ width: 180 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not?" aria-label="Reason you cannot go" />
          <button className="btn sm" onClick={() => (onDone(), run(safety.respond(caseId, agencyId, false, reason), 'Recorded.'))}>
            Send
          </button>
        </>
      )}
    </div>
  );
}
