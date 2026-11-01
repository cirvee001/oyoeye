import { fmtDate, fmtDateTimeWat } from '../format';
import { useState } from 'react';
import { AGREE, KEY_RULES, ONBOARDING, RULES, RULES_CLOSING, errText, pick, useLang } from '../i18n';
import { getState, now, acceptRulebook, persona, rulebookUpdated, seenRulebookUpdate, signedIn, standing, standingFor, useStore, type Standing } from '../store';
import { Card, Icon, Sheet, go, run } from '../ui';
import type { Params, StrKey } from '../strings';
import { LangToggle } from './Citizen';

const ANON_KEY = 'oyoeye:anon-rules';
export function anonRulesSeen() {
  try {
    return sessionStorage.getItem(ANON_KEY) === '1';
  } catch {
    return false;
  }
}
function setAnonRulesSeen() {
  try {
    sessionStorage.setItem(ANON_KEY, '1');
  } catch {
    /* private mode: they will see the summary again, which is fine */
  }
}

function RuleRow({ k, open, onToggle }: { k: number; open: boolean; onToggle?: () => void }) {
  const [lang, t] = useLang();
  const r = RULES[k];
  return (
    <li className={`rule${open ? ' open' : ''}`}>
      <span className="rule-n">{k + 1}</span>
      <span className="sc-ico t-green">
        <Icon name={r.icon} size={18} />
      </span>
      <div className="rule-body">
        <button type="button" className="rule-title" onClick={onToggle} aria-expanded={open} disabled={!onToggle}>
          <b>{pick(r.title, lang)}</b>
          {onToggle && <span className="small muted">{open ? t('rb.hide') : t('rb.why')}</span>}
        </button>
        {open && (
          <div className="rule-why">
            <p>{pick(r.why, lang)}</p>
            {r.points && (
              <ul>
                {r.points.map((x, j) => (
                  <li key={j}>{pick(x, lang)}</li>
                ))}
              </ul>
            )}
            {r.note && <p className="rule-note">{pick(r.note, lang)}</p>}
          </div>
        )}
      </div>
    </li>
  );
}

/** First-time onboarding: 4 short cards, the Rule Book, then "I understand and agree" (§3.1–3.3). */
export function Onboarding({ replay }: { replay?: boolean }) {
  const [lang, t] = useLang();
  const [step, setStep] = useState(0);
  const total = ONBOARDING.length + 1;
  const card = ONBOARDING[step];
  const done = () => {
    if (!replay) acceptRulebook();
    go(replay ? '/rules' : '/home');
  };
  return (
    <div className="onboarding">
      <div className="ob-top">
        <span className="ob-brand">Tell Seyi</span>
        <a className="btn danger sm" href="#/sos">
          <Icon name="sos" size={16} /> {t('sos.ondanger')}
        </a>
        <LangToggle />
      </div>
      <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-label={t('ob.step', { n: step + 1, m: total })}>
        <span style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>
      <div className="ob-body">
        {card ? (
          <div className="ob-card">
            <span className="ob-ico">
              <Icon name={card.icon} size={44} />
            </span>
            <h1>{pick(card.title, lang)}</h1>
            <p>{pick(card.body, lang)}</p>
            <button className="btn primary xl block" onClick={() => setStep(step + 1)}>
              {step === ONBOARDING.length - 1 ? t('ob.readrules') : t('ob.next')}
            </button>
            {step > 0 && (
              <button className="btn ghost block" onClick={() => setStep(step - 1)}>
                {t('ob.back')}
              </button>
            )}
          </div>
        ) : (
          <div className="ob-card rules-card">
            <h1>{t('ob.rulebook')}</h1>
            <ol className="rules">
              {RULES.map((_, k) => (
                <RuleRow key={k} k={k} open />
              ))}
            </ol>
            <p className="rules-closing">{pick(RULES_CLOSING, lang)}</p>
            <button className="btn primary xl block" onClick={done}>
              {replay ? t('ob.done') : pick(AGREE, lang)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Rule book page (#/rules) — always available, signed in or not. */
export function RuleBookPage() {
  const [lang, t] = useLang();
  const me = persona();
  const [openK, setOpenK] = useState<number | undefined>(0);
  return (
    <div className="narrow stack lg">
      <section className="card worklist rulebook-page">
        <div className="wl-head">
          <h2>{t('rb.title')}</h2>
        </div>
        <div className="bd">
          {me.rulebookAcceptedAt && (
            <p className="small muted">{t('rb.accepted', { date: fmtDate(me.rulebookAcceptedAt), v: me.rulebookAcceptedVersion ?? 1 })}</p>
          )}
          <ol className="rules">
            {RULES.map((_, k) => (
              <RuleRow key={k} k={k} open={openK === k} onToggle={() => setOpenK(openK === k ? undefined : k)} />
            ))}
          </ol>
          <p className="rules-closing">{pick(RULES_CLOSING, lang)}</p>
          <p className="tiny muted print-stamp">{`Tell Seyi Rule Book v${getState().rulebookVersion} · ${fmtDateTimeWat(now())}`}</p>
          <div className="row">
            {signedIn() && (
              <button className="btn" onClick={() => go('/onboarding')}>
                {t('rb.replay')}
              </button>
            )}
            <button className="btn" onClick={() => window.print()}>
              {t('rb.print')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** One-screen summary for anonymous reporters before their first report in a session. Never shown for SOS. */
export function AnonRules({ onOk }: { onOk: () => void }) {
  const [, t] = useLang();
  return (
    <div className="phone">
      <div className="card pad stack lg">
        <h1>{t('rb.before')}</h1>
        <ol className="rules">
          {KEY_RULES.map((k) => (
            <RuleRow key={k} k={k} open />
          ))}
        </ol>
        <a href="#/rules" className="small">
          {t('rb.full')}
        </a>
        <button
          className="btn primary xl block"
          onClick={() => {
            setAnonRulesSeen();
            onOk();
          }}
        >
          {t('rb.understand')}
        </button>
        <p className="tiny muted">{t('rb.sosnote')}</p>
      </div>
    </div>
  );
}

const STANDING_TEXT = (s: Standing, t: (k: StrKey, p?: Params) => string) => t(`sd.${s.level}` as StrKey, { confirmed: s.confirmed, closed: s.closed });
const levelLabel = (s: Standing, t: (k: StrKey) => string) => t(`sd.lvl.${s.level}` as StrKey);

export function StandingBadge() {
  const [, t] = useLang();
  const me = persona();
  const s = useStore((x) => x);
  const sd = standingFor(s, { personId: me.id });
  if (!sd) return null;
  return <ScoreBadge sd={sd} label={levelLabel(sd, t)} />;
}

/** The reporter score as a badge: number out of 10, coloured by band (green 8–10, amber 5–7.9, red below 5). */
export function ScoreBadge({ sd, label, size = 'md' }: { sd: Standing; label?: string; size?: 'md' | 'lg' }) {
  return (
    <span className={`score-badge b-${sd.band} sz-${size}`} title={`Reporter score ${sd.score.toFixed(1)} out of 10${label ? ` · ${label}` : ''}`}>
      <svg width="14" height="14" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 4 54 12v17c0 15-9.5 25.5-22 31C19.5 54.5 10 44 10 29V12z" fill="currentColor" />
      </svg>
      <b>{sd.score.toFixed(1)}</b>
      <small>/10</small>
      {label && <span className="sb-label">{label}</span>}
    </span>
  );
}

/** Reporter standing card: transparent, with how long it lasts and an Appeal button (§3.5). */
export function StandingCard() {
  const [, t] = useLang();
  const me = persona();
  const s = useStore((x) => x);
  const [appeal, setAppeal] = useState(false);
  const sd = standingFor(s, { personId: me.id });
  if (!sd) return null;
  const pending = s.complaints.find((c) => c.kind === 'appeal' && c.complainant.personId === me.id && c.status !== 'closed');
  const bad = sd.level === 'review' || sd.level === 'restricted';
  return (
    <Card title={t('sd.title')} right={<ScoreBadge sd={sd} label={levelLabel(sd, t)} />}>
      <div className="stack">
        <div className={`score-meter b-${sd.band}`} aria-label={`${t('sd.score')}: ${sd.score.toFixed(1)} ${t('sd.outof')}`}>
          <div className="sm-num">
            <b>{sd.score.toFixed(1)}</b>
            <span>{t('sd.outof')}</span>
          </div>
          <div className="sm-track" aria-hidden="true">
            <div className="sm-fill" style={{ width: `${sd.score * 10}%` }} />
            <i style={{ left: '50%' }} />
            <i style={{ left: '80%' }} />
          </div>
        </div>
        <p className="small">{STANDING_TEXT(sd, t)}</p>
        <p className="tiny muted">{t('sd.rule')}</p>
        {bad && (
          <>
            <ul className="plainlist small">
              {sd.hoaxes.map((i) => (
                <li key={i.id}>
                  <span className="dot tone-bad" /> {i.reports[0].ref}: {i.hoax?.reason}
                </li>
              ))}
            </ul>
            <p className="small muted">{t('sd.until', { date: sd.until ? fmtDate(sd.until) : '—' })}</p>
            {pending ? (
              <div className="notice small">{t('sd.pending', { id: pending.id })}</div>
            ) : (
              <button className="btn" onClick={() => setAppeal(true)}>
                {t('sd.appeal')}
              </button>
            )}
          </>
        )}
        <a className="small" href="#/rules">
          {t('sd.how')}
        </a>
      </div>
      {appeal && <AppealSheet onClose={() => setAppeal(false)} />}
    </Card>
  );
}

function AppealSheet({ onClose }: { onClose: () => void }) {
  const [lang, t] = useLang();
  const [text, setText] = useState('');
  return (
    <Sheet title={t('ap.title')} onClose={onClose}>
      <div className="stack lg">
        <p className="small">{t('ap.intro')}</p>
        <label className="field">
          <span>{t('ap.label')}</span>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('ap.ph')} />
        </label>
        <button className="btn primary lg block" disabled={text.trim().length < 10} onClick={() => run(errText(standing.appeal(text), lang), t('ap.ok')) && onClose()}>
          {t('ap.send')}
        </button>
      </div>
    </Sheet>
  );
}

export function RulebookCard() {
  const [, t] = useLang();
  const me = persona();
  const accepted = !!me.rulebookAcceptedVersion;
  return (
    <Card title={t('rb.card')}>
      <div className="stack">
        <p className="small">{t('rb.card.sub')}</p>
        <div className="progress-bar" role="img" aria-label={accepted ? t('rb.read') : t('rb.notread')}>
          <span style={{ width: accepted ? '100%' : '0%' }} />
        </div>
        <span className="tiny muted">{accepted ? t('rb.acceptedv', { v: me.rulebookAcceptedVersion ?? 1 }) : t('rb.notread')}</span>
        <button className="btn" onClick={() => go('/rules')}>
          {t('rb.again')}
        </button>
      </div>
    </Card>
  );
}

export function RulebookUpdated() {
  const [, t] = useLang();
  const me = persona();
  const s = useStore((x) => x);
  if (!rulebookUpdated(s, me)) return null;
  return (
    <div className="notice warn row between">
      <span>
        <b>{t('rb.updated')}</b> {t('rb.updated.sub', { v: s.rulebookVersion })}
      </span>
      <span className="row" style={{ gap: 6 }}>
        <a className="btn sm primary" href="#/rules" onClick={() => seenRulebookUpdate()}>
          {t('rb.whatsnew')}
        </a>
        <button className="btn sm ghost" onClick={() => seenRulebookUpdate()}>
          {t('rb.dismiss')}
        </button>
      </span>
    </div>
  );
}
