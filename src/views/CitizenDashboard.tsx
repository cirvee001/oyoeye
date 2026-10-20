import { useState } from 'react';
import { DAY, isOpen } from '../platform/engine';
import type { Incident } from '../platform/types';
import { useLang } from '../i18n';
import { actions, dep, feedbackFor, lgaOf, persona, useStore } from '../store';
import { Card, CatIcon, Icon, StatCard, StatusPill, Stepper, ago, go, run, useNow } from '../ui';
import { ConductForm, LangToggle } from './Citizen';
import { RulebookCard, RulebookUpdated, StandingBadge, StandingCard } from './RuleBook';

const civicConfirm = (i: Incident) => i.status === 'resolved' && !!dep.categories.find((c) => c.id === i.category)?.citizenVerification;

/** Citizen Home as a dashboard (PRD v2.4 §2.2). Stacks on phones. */
export function CitizenDashboard() {
  const me = persona();
  const at = useNow();
  const [lang, t] = useLang();
  const s = useStore((x) => x);
  const mine = s.incidents.filter((i) => i.reports.some((r) => r.reporter?.personId === me.id)).sort((a, b) => b.createdAt - a.createdAt);
  const refOf = (i: Incident) => i.reports.find((r) => r.reporter?.personId === me.id)!.ref;
  const waiting = mine.filter((i) => civicConfirm(i) || ((i.status === 'closed' || i.status === 'referred') && !i.officerSos && !feedbackFor(s, refOf(i)) && at - (i.t.closed ?? 0) < 30 * DAY));
  const first = me.name.split(' ')[0];
  return (
    <div className="cdash">
      <div className="cd-greet">
        <h1>{`${t('home.hello')}, ${first}`}</h1>
        <div className="row">
          <StandingBadge />
          <LangToggle />
          <button className="btn primary" onClick={() => go('/report')}>
            <Icon name="plus" size={16} /> {t('home.report')}
          </button>
        </div>
      </div>
      <div className="cd-update">
        <RulebookUpdated />
      </div>

      <section className="card cd-sos">
        <div>
          <h2>{t('home.sos')}</h2>
          <p>{t('home.sos.sub')}</p>
        </div>
        <button className="sos-big" onClick={() => go('/sos')}>
          <span>SOS</span>
          <small>{lang === 'yo' ? 'Tẹ̀ ẹ́ mú' : 'Press and hold'}</small>
        </button>
      </section>
      <Card title="Other ways to get help" className="cd-ways">
        <ul className="ways">
          <li>
            <Icon name="home" size={18} /> This app
          </li>
          <li>
            <Icon name="phone" size={18} /> Call <b>615</b> (free)
          </li>
          <li>
            <Icon name="list" size={18} /> Dial <b>*615#</b> on any phone
          </li>
        </ul>
      </Card>

      <div className="statgrid cd-stats">
        <StatCard icon="cases" label="My open reports" value={mine.filter((i) => isOpen(i) || i.status === 'resolved').length} tone="blue" onClick={() => go('/my')} />
        <StatCard icon="clock" label="In progress" value={mine.filter((i) => ['accepted', 'in_progress'].includes(i.status)).length} tone="amber" />
        <StatCard icon="alert" label="Waiting for you" value={waiting.length} sub={waiting.length ? 'confirm a fix or rate the response' : 'nothing to do'} tone={waiting.length ? 'amber' : 'grey'} onClick={waiting.length ? () => go(`/track/${refOf(waiting[0])}`) : undefined} />
        <StatCard icon="done" label="Closed" value={mine.filter((i) => i.status === 'closed' || i.status === 'referred').length} tone="green" />
      </div>

      <Card title="My reports" right={<a href="#/my">View all</a>} className="cd-reports" pad={false}>
        {!mine.length ? (
          <div className="empty">
            <p>You haven't reported anything yet. When you do, you'll follow it here step by step.</p>
            <button className="btn primary lg" style={{ marginTop: 12 }} onClick={() => go('/report')}>
              {t('home.report')}
            </button>
          </div>
        ) : (
          <div className="cd-rows">
            {mine.slice(0, 5).map((i) => (
              <ReportRow key={i.id} i={i} reportRef={refOf(i)} at={at} />
            ))}
          </div>
        )}
      </Card>

      <div className="cd-side">
        <StandingCard />
        <RulebookCard />
        <AreaCard lgaId={mine[0]?.lgaId ?? 'ibn'} />
      </div>
    </div>
  );
}

function ReportRow({ i, reportRef, at }: { i: Incident; reportRef: string; at: number }) {
  const [lang] = useLang();
  const [rate, setRate] = useState(false);
  const s = useStore((x) => x);
  const closed = (i.status === 'closed' || i.status === 'referred') && !i.officerSos;
  return (
    <div className="cd-row">
      <div className="cd-row-main click" onClick={() => go(`/track/${reportRef}`)}>
        <span className="mono small muted">{reportRef}</span>
        <span className="row nowrap" style={{ gap: 8, minWidth: 0 }}>
          <CatIcon c={i.category} size={16} />
          <b className="cd-title">{i.restricted ? 'Security report' : i.title}</b>
        </span>
        <span className="small muted">
          {i.area} · {ago(i.createdAt, at)}
        </span>
        <StatusPill i={i} lang={lang} />
      </div>
      <Stepper i={i} compact safe lang={lang} />
      {civicConfirm(i) && (
        <div className="row cd-act">
          <span className="small strong">Is it fixed?</span>
          <button className="btn sm primary" onClick={() => run(actions.confirmFix(i.id, 'yes', reportRef), 'Thank you. The case is closed.')}>
            Yes
          </button>
          <button className="btn sm" onClick={() => run(actions.confirmFix(i.id, 'no', reportRef), 'Reopened and escalated.')}>
            No
          </button>
          <button className="btn sm" onClick={() => run(actions.confirmFix(i.id, 'partial', reportRef), 'Reopened and escalated.')}>
            Partly
          </button>
        </div>
      )}
      {closed && !feedbackFor(s, reportRef) && (
        <div className="cd-act">
          {rate ? (
            <ConductForm caseId={i.id} reportRef={reportRef} />
          ) : (
            <button className="btn sm" onClick={() => setRate(true)}>
              Rate response
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Public aggregates for the citizen's LGA only — no security points, places or details. */
function AreaCard({ lgaId }: { lgaId: string }) {
  const at = useNow(60_000);
  const rows = useStore((s) => s.incidents).filter((i) => i.lgaId === lgaId && i.createdAt > at - 7 * DAY && !i.sensitiveOnly);
  const civic = (['waste', 'roads', 'flooding', 'infrastructure'] as const).map((c) => {
    const xs = rows.filter((i) => i.category === c);
    return { c, fixed: xs.filter((i) => i.status === 'closed').length, open: xs.filter((i) => isOpen(i) || i.status === 'resolved').length };
  }).filter((x) => x.fixed + x.open > 0);
  const sec = rows.filter((i) => i.restricted).length;
  const label: Record<string, string> = { waste: 'Waste', roads: 'Roads', flooding: 'Flooding', infrastructure: 'Infrastructure' };
  return (
    <Card title={`In your area this week · ${lgaOf(lgaId).name}`}>
      <ul className="plainlist small">
        {civic.map((x) => (
          <li key={x.c}>
            <CatIcon c={x.c} size={14} /> {label[x.c]}: {x.fixed} fixed · {x.open} open
          </li>
        ))}
        <li>
          <CatIcon c="security" size={14} /> Security reports: {sec} (all being handled)
        </li>
      </ul>
      <p className="tiny muted">Public figures only — no security locations or details.</p>
    </Card>
  );
}
