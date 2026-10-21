import { citizenCards } from '../filters';
import { useState } from 'react';
import { DAY, isOpen } from '../platform/engine';
import type { Incident } from '../platform/types';
import { catLabel, errText, useLang } from '../i18n';
import { actions, dep, feedbackFor, lgaOf, persona, useStore } from '../store';
import { Card, CatIcon, Icon, StatCard, StatusPill, Stepper, ago, go, run, useNow } from '../ui';
import { ConductForm } from './Citizen';
import { RulebookCard, RulebookUpdated, StandingBadge, StandingCard } from './RuleBook';

const CARD_KEY: Record<string, 'cd.open' | 'cd.progress' | 'cd.waiting' | 'cd.closed'> = { 'My open reports': 'cd.open', 'In progress': 'cd.progress', 'Waiting for you': 'cd.waiting', Closed: 'cd.closed' };
const civicConfirm = (i: Incident) => i.status === 'resolved' && !!dep.categories.find((c) => c.id === i.category)?.citizenVerification;

/** Citizen Home as a dashboard (PRD v2.4 §2.2). Stacks on phones. */
export function CitizenDashboard() {
  const me = persona();
  const at = useNow();
  const [, t] = useLang();
  const s = useStore((x) => x);
  const s0 = s;
  const mine = s.incidents.filter((i) => i.reports.some((r) => r.reporter?.personId === me.id)).sort((a, b) => b.createdAt - a.createdAt);
  const refOf = (i: Incident) => i.reports.find((r) => r.reporter?.personId === me.id)!.ref;
  const first = me.name.split(' ')[0];
  return (
    <div className="cdash">
      <div className="cd-greet">
        <h1>{`${t('home.hello')}, ${first}`}</h1>
        <div className="row">
          <StandingBadge />
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
          <small>{t('cd.hold')}</small>
        </button>
      </section>
      <Card title={t('cd.ways')} className="cd-ways">
        <ul className="ways">
          <li>
            <Icon name="home" size={18} /> {t('cd.app')}
          </li>
          <li>
            <Icon name="phone" size={18} /> {t('cd.call')} <b>615</b> {t('cd.free')}
          </li>
          <li>
            <Icon name="list" size={18} /> {t('cd.dial')} <b>*615#</b> {t('cd.anyphone')}
          </li>
        </ul>
      </Card>

      <div className="statgrid cd-stats">
        {citizenCards(me, s0, at).map((c) => (
          <StatCard key={c.label} icon={c.icon} label={t(CARD_KEY[c.label])} value={c.value} sub={c.sub ? t(c.label === 'Waiting for you' && c.count ? 'cd.waiting.sub' : 'cd.nothing') : undefined} tone={c.tone} to={c.to} view={t('cd.view')} />
        ))}
      </div>

      <Card title={t('home.mine')} right={<a href="#/my">{t('inbox.viewall')}</a>} className="cd-reports" pad={false}>
        {!mine.length ? (
          <div className="empty">
            <p>{t('cd.empty')}</p>
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
  const [lang, t] = useLang();
  const [rate, setRate] = useState(false);
  const s = useStore((x) => x);
  const closed = (i.status === 'closed' || i.status === 'referred') && !i.officerSos;
  return (
    <div className="cd-row">
      <a className="cd-row-main click" href={`#/track/${reportRef}`}>
        <span className="mono small muted">{reportRef}</span>
        <span className="row nowrap" style={{ gap: 8, minWidth: 0 }}>
          <CatIcon c={i.category} size={16} />
          <b className="cd-title">{i.restricted ? t('cd.secreport') : i.title}</b>
        </span>
        <span className="small muted">{`${i.area} · ${ago(i.createdAt, at, lang)}`}</span>
        <StatusPill i={i} lang={lang} cta={civicConfirm(i)} />
      </a>
      <Stepper i={i} compact safe lang={lang} />
      {civicConfirm(i) && (
        <div className="row cd-act">
          <span className="small strong">{t('t.fixed')}</span>
          <button className="btn sm primary" onClick={() => run(errText(actions.confirmFix(i.id, 'yes', reportRef), lang), t('t.closedOk'))}>
            {t('t.yesShort')}
          </button>
          <button className="btn sm" onClick={() => run(errText(actions.confirmFix(i.id, 'no', reportRef), lang), t('t.reopenOk'))}>
            {t('t.no')}
          </button>
          <button className="btn sm" onClick={() => run(errText(actions.confirmFix(i.id, 'partial', reportRef), lang), t('t.reopenOk'))}>
            {t('t.partly')}
          </button>
        </div>
      )}
      {closed && !feedbackFor(s, reportRef) && (
        <div className="cd-act">
          {rate ? (
            <ConductForm caseId={i.id} reportRef={reportRef} />
          ) : (
            <button className="btn sm" onClick={() => setRate(true)}>
              {t('cd.rate')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Public aggregates for the citizen's LGA only — no security points, places or details. */
function AreaCard({ lgaId }: { lgaId: string }) {
  const [lang, t] = useLang();
  const at = useNow(60_000);
  const rows = useStore((s) => s.incidents).filter((i) => i.lgaId === lgaId && i.createdAt > at - 7 * DAY && !i.sensitiveOnly);
  const civic = (['waste', 'roads', 'flooding', 'infrastructure'] as const).map((c) => {
    const xs = rows.filter((i) => i.category === c);
    return { c, fixed: xs.filter((i) => i.status === 'closed').length, open: xs.filter((i) => isOpen(i) || i.status === 'resolved').length };
  }).filter((x) => x.fixed + x.open > 0);
  const sec = rows.filter((i) => i.restricted).length;
  return (
    <Card title={t('cd.area', { lga: lgaOf(lgaId).name })}>
      <ul className="plainlist small">
        {civic.map((x) => (
          <li key={x.c}>
            <CatIcon c={x.c} size={14} /> {t('cd.area.row', { cat: catLabel(x.c, lang), fixed: x.fixed, open: x.open })}
          </li>
        ))}
        <li>
          <CatIcon c="security" size={14} /> {t('cd.area.sec', { n: sec })}
        </li>
      </ul>
      <p className="tiny muted">{t('cd.area.note')}</p>
    </Card>
  );
}
