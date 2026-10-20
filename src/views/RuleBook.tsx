import { useState } from 'react';
import { AGREE, KEY_RULES, ONBOARDING, RULES, RULES_CLOSING, pick, useLang } from '../i18n';
import { acceptRulebook, persona, rulebookUpdated, seenRulebookUpdate, signedIn, standing, standingFor, useStore, type Standing } from '../store';
import { Card, Icon, Sheet, go, run } from '../ui';
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
  const [lang] = useLang();
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
          {onToggle && <span className="small muted">{open ? (lang === 'yo' ? 'Pa á dé' : 'Hide why') : lang === 'yo' ? 'Ìdí' : 'Why'}</span>}
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
  const [lang] = useLang();
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
        <span className="ob-brand">OyoEye</span>
        <a className="btn danger sm" href="#/sos">
          <Icon name="sos" size={16} /> {lang === 'yo' ? 'Ewu báyìí? SOS' : 'In danger now? SOS'}
        </a>
        <LangToggle />
      </div>
      <div className="ob-progress" aria-label={`Step ${step + 1} of ${total}`}>
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
              {lang === 'yo' ? 'Tẹ̀síwájú' : step === ONBOARDING.length - 1 ? 'Read the rules →' : 'Next'}
            </button>
            {step > 0 && (
              <button className="btn ghost block" onClick={() => setStep(step - 1)}>
                {lang === 'yo' ? 'Padà' : 'Back'}
              </button>
            )}
          </div>
        ) : (
          <div className="ob-card rules-card">
            <h1>{lang === 'yo' ? 'Ìwé Òfin OyoEye' : 'The OyoEye Rule Book'}</h1>
            <ol className="rules">
              {RULES.map((_, k) => (
                <RuleRow key={k} k={k} open />
              ))}
            </ol>
            <p className="rules-closing">{pick(RULES_CLOSING, lang)}</p>
            <button className="btn primary xl block" onClick={done}>
              {replay ? (lang === 'yo' ? 'Parí' : 'Done') : pick(AGREE, lang)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Rule book page (#/rules) — always available, signed in or not. */
export function RuleBookPage() {
  const [lang] = useLang();
  const me = persona();
  const [openK, setOpenK] = useState<number | undefined>(0);
  return (
    <div className="narrow stack lg">
      <section className="card worklist rulebook-page">
        <div className="wl-head">
          <h2>{lang === 'yo' ? 'Ìwé Òfin OyoEye — òfin kúkúrú mẹ́jọ' : 'OyoEye Rule Book — 8 short rules'}</h2>
          <LangToggle />
        </div>
        <div className="bd">
          {me.rulebookAcceptedAt && (
            <p className="small muted">
              Last accepted: {new Date(me.rulebookAcceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, v{me.rulebookAcceptedVersion}
            </p>
          )}
          <ol className="rules">
            {RULES.map((_, k) => (
              <RuleRow key={k} k={k} open={openK === k} onToggle={() => setOpenK(openK === k ? undefined : k)} />
            ))}
          </ol>
          <p className="rules-closing">{pick(RULES_CLOSING, lang)}</p>
          <div className="row">
            {signedIn() && (
              <button className="btn" onClick={() => go('/onboarding')}>
                Replay onboarding
              </button>
            )}
            <button className="btn" onClick={() => window.print()}>
              Print / share
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** One-screen summary for anonymous reporters before their first report in a session. Never shown for SOS. */
export function AnonRules({ onOk }: { onOk: () => void }) {
  const [lang] = useLang();
  return (
    <div className="phone">
      <div className="card pad stack lg">
        <div className="row between">
          <h1>{lang === 'yo' ? 'Kí ẹ tó ròyìn' : 'Before you report'}</h1>
          <LangToggle />
        </div>
        <ol className="rules">
          {KEY_RULES.map((k) => (
            <RuleRow key={k} k={k} open />
          ))}
        </ol>
        <a href="#/rules" className="small">
          {lang === 'yo' ? 'Ka gbogbo Ìwé Òfin' : 'Read the full Rule Book (8 rules)'}
        </a>
        <button
          className="btn primary xl block"
          onClick={() => {
            setAnonRulesSeen();
            onOk();
          }}
        >
          {lang === 'yo' ? 'Ó yé mi' : 'I understand'}
        </button>
        <p className="tiny muted">In danger now? Use SOS — it never waits for this screen.</p>
      </div>
    </div>
  );
}

const STANDING_TEXT = (s: Standing) => {
  switch (s.level) {
    case 'trusted':
      return `Trusted — ${s.confirmed} of ${s.closed} reports confirmed. Thank you.`;
    case 'new':
      return 'New — your standing builds as your reports are confirmed.';
    case 'good':
      return 'Good — thank you for reporting honestly.';
    case 'review':
      return 'Under review — one report was found to be a deliberate false alarm.';
    case 'restricted':
      return 'Restricted — two reports were found to be deliberate false alarms. Your new reports (not SOS) get a call-back before help is sent.';
  }
};

export function StandingBadge() {
  const me = persona();
  const s = useStore((x) => x);
  const sd = standingFor(s, { personId: me.id });
  if (!sd) return null;
  return <span className={`standing s-${sd.level}`}>{sd.label}</span>;
}

/** Reporter standing card: transparent, with how long it lasts and an Appeal button (§3.5). */
export function StandingCard() {
  const me = persona();
  const s = useStore((x) => x);
  const [appeal, setAppeal] = useState(false);
  const sd = standingFor(s, { personId: me.id });
  if (!sd) return null;
  const pending = s.complaints.find((c) => c.kind === 'appeal' && c.complainant.personId === me.id && c.status !== 'closed');
  const bad = sd.level === 'review' || sd.level === 'restricted';
  return (
    <Card title="Reporter standing" right={<span className={`standing s-${sd.level}`}>{sd.label}</span>}>
      <div className="stack">
        <p className="small">{STANDING_TEXT(sd)}</p>
        {bad && (
          <>
            <ul className="plainlist small">
              {sd.hoaxes.map((i) => (
                <li key={i.id}>
                  <span className="dot tone-bad" /> {i.reports[0].ref}: {i.hoax?.reason}
                </li>
              ))}
            </ul>
            <p className="small muted">This lasts until {sd.until ? new Date(sd.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} (12 months from the last one). Honest mistakes never count. SOS is always answered.</p>
            {pending ? (
              <div className="notice small">Your appeal ({pending.id}) is with the independent oversight panel.</div>
            ) : (
              <button className="btn" onClick={() => setAppeal(true)}>
                Appeal
              </button>
            )}
          </>
        )}
        <a className="small" href="#/rules">
          How standing works (Rule 3)
        </a>
      </div>
      {appeal && <AppealSheet onClose={() => setAppeal(false)} />}
    </Card>
  );
}

function AppealSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <Sheet title="Appeal your standing" onClose={onClose}>
      <div className="stack lg">
        <p className="small">Your appeal goes to the independent Oyo Security Oversight Panel, not to the control room. If they uphold it, the mark is removed and your standing is recalculated.</p>
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Why should the panel look again? e.g. I reported in good faith what my neighbours told me." />
        <button className="btn primary lg block" disabled={text.trim().length < 10} onClick={() => run(standing.appeal(text), 'Appeal sent to the oversight panel.') && onClose()}>
          Send appeal
        </button>
      </div>
    </Sheet>
  );
}

export function RulebookCard() {
  const me = persona();
  const accepted = !!me.rulebookAcceptedVersion;
  return (
    <Card title="OyoEye Rule Book">
      <div className="stack">
        <p className="small">8 short rules that keep OyoEye working for everyone.</p>
        <div className="progress-bar" aria-label={accepted ? 'Read' : 'Not read yet'}>
          <span style={{ width: accepted ? '100%' : '0%' }} />
        </div>
        <span className="tiny muted">{accepted ? `Accepted v${me.rulebookAcceptedVersion}` : 'Not read yet'}</span>
        <button className="btn" onClick={() => go('/rules')}>
          Read again
        </button>
      </div>
    </Card>
  );
}

export function RulebookUpdated() {
  const me = persona();
  const s = useStore((x) => x);
  if (!rulebookUpdated(s, me)) return null;
  return (
    <div className="notice warn row between">
      <span>
        <b>The Rule Book was updated</b> — see what's new (v{s.rulebookVersion}).
      </span>
      <span className="row" style={{ gap: 6 }}>
        <a className="btn sm primary" href="#/rules" onClick={() => seenRulebookUpdate()}>
          See what's new
        </a>
        <button className="btn sm ghost" onClick={() => seenRulebookUpdate()}>
          Dismiss
        </button>
      </span>
    </div>
  );
}
