import { useEffect, useRef, useState } from 'react';
import { isOpen, km } from '../platform/engine';
import type { CategoryId, Identity, Incident } from '../platform/types';
import { catLabel, useLang, type StrKey } from '../i18n';
import { actions, agency, conduct, dep, feedbackFor, incidentByRef, lgaOf, persona, setLang, signedIn, submitReport, suggest, subLabel, useStore } from '../store';
import { AnonRules, anonRulesSeen } from './RuleBook';
import { CatIcon, Icon, PhotoInput, StatusPill, Stepper, ago, go, hhmm, run, useNow } from '../ui';

const TILES: CategoryId[] = ['security', 'fire', 'flooding', 'roads', 'waste', 'infrastructure', 'other'];
const SOS_TILES: CategoryId[] = ['security', 'fire', 'flooding', 'other'];

function nearestLga(lat: number, lng: number) {
  return dep.lgas.slice().sort((a, b) => km(a.lat, a.lng, lat, lng) - km(b.lat, b.lng, lat, lng))[0];
}

export function LangToggle() {
  const [lang] = useLang();
  return (
    <div className="seg lang" role="group" aria-label="Language">
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
        EN
      </button>
      <button className={lang === 'yo' ? 'on' : ''} onClick={() => setLang('yo')}>
        YO
      </button>
    </div>
  );
}

// ---------- Home ----------

export function CitizenHome() {
  const me = persona();
  const [lang, t] = useLang();
  const incidents = useStore((s) => s.incidents);
  const mine = incidents.filter((i) => i.reports.some((r) => r.reporter?.personId === me.id));
  const waiting = mine.filter((i) => i.status === 'resolved' && dep.categories.find((c) => c.id === i.category)?.citizenVerification).length;
  return (
    <div className="phone">
      <div className="row between">
        <h1>
          {t('home.hello')}, {me.name.split(' ')[0]}
        </h1>
        <LangToggle />
      </div>
      <button className="tile sos" onClick={() => go('/sos')}>
        <span className="tile-ico">SOS</span>
        <span>
          <b>{t('home.sos')}</b>
          <small>{t('home.sos.sub')}</small>
        </span>
      </button>
      <div className="tiles">
        <button className="tile" onClick={() => go('/report')}>
          <span className="tile-ico">
            <Icon name="plus" size={30} />
          </span>
          <b>{t('home.report')}</b>
          <small>{t('home.report.sub')}</small>
        </button>
        <button className="tile" onClick={() => go('/my')}>
          <span className="tile-ico">
            <Icon name="list" size={30} />
          </span>
          <b>{t('home.mine')}</b>
          <small>
            {mine.length} · {t('home.mine.sub')}
          </small>
          {waiting > 0 && <span className="badge warn">{lang === 'yo' ? 'Ẹ fọwọ́ sí i' : `${waiting} waiting for you to confirm`}</span>}
        </button>
      </div>
      <p className="tiny muted center">
        {lang === 'yo' ? 'Kò ní fóònù olóye? Tẹ' : 'No smartphone? Dial'} <b>*615#</b> {lang === 'yo' ? 'tàbí pe' : 'or call'} <b>615</b>.
      </p>
    </div>
  );
}

// ---------- Report flow (3 steps) ----------

export function ReportFlow() {
  const me = persona();
  const guest = !signedIn();
  const [lang, t] = useLang();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<CategoryId>();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [voice, setVoice] = useState<string>();
  const [recording, setRecording] = useState(false);
  const focal = me.role === 'focal';
  const [lgaId, setLga] = useState(focal && me.lgaId ? me.lgaId : 'ibn');
  const [area, setArea] = useState(focal && me.community && lgaOf(me.lgaId ?? 'ibn').areas.includes(me.community) ? me.community : focal && me.lgaId ? lgaOf(me.lgaId).areas[0] : 'Bodija');
  const [landmark, setLandmark] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number }>();
  const [identity, setIdentity] = useState<Identity>(guest ? 'anonymous' : 'standard');
  // v2.3 §3.1: focal-person extras
  const [how, setHow] = useState<'saw' | 'told' | 'at_scene'>('saw');
  const [atRisk, setAtRisk] = useState('');
  const [canAssist, setCanAssist] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [done, setDone] = useState<{ ref: string; incident: Incident; merged: boolean }>();
  const suggestion = text.trim().length > 8 ? suggest(text, { category }) : undefined;
  // v2.4: anonymous reporters see a one-screen summary of 3 key rules once per session (never for SOS).
  const [rulesOk, setRulesOk] = useState(() => !guest || anonRulesSeen());

  const record = () => {
    setRecording(true);
    setTimeout(() => {
      setRecording(false);
      setVoice(`Voice note 0:${String(8 + Math.floor(Math.random() * 40)).padStart(2, '0')} (simulated)`);
    }, 1600);
  };

  const submit = () => {
    const res = submitReport({
      text: text.trim() || (voice ? `Voice note: ${catLabel(category ?? 'other')}` : catLabel(category ?? 'other')),
      category: category === 'other' ? undefined : category,
      lgaId,
      area,
      landmark: landmark || undefined,
      lat: gps?.lat,
      lng: gps?.lng,
      identity: focal ? 'standard' : identity,
      channel: 'web',
      reporter: guest ? undefined : { personId: me.id, name: me.name, phone: me.phone, optInUpdates: optIn || focal },
      photo,
      voice,
      focal: focal ? { how, atRisk: Number(atRisk) || undefined, canAssist } : undefined,
    });
    setDone(res);
  };

  if (!rulesOk) return <AnonRules onOk={() => setRulesOk(true)} />;
  if (done) return <Receipt done={done} onNew={() => (setDone(undefined), setStep(1), setText(''), setPhoto(undefined), setVoice(undefined), setCategory(undefined))} />;

  return (
    <div className="phone">
      <div className="row between">
        <span className="small muted">
          {t('r.step')} {step} {t('r.of')} 3
        </span>
        <LangToggle />
      </div>
      <div className="progress3">
        {[1, 2, 3].map((k) => (
          <span key={k} className={k <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 1 && (
        <div className="card pad stack lg">
          <div>
            <h1>{focal ? 'Report for my community' : t('r.what')}</h1>
            <p className="muted small">{t('r.what.sub')}</p>
          </div>
          <div className="cat-grid">
            {TILES.map((c) => (
              <button key={c} className={`cat-tile${category === c ? ' on' : ''}`} onClick={() => setCategory(category === c ? undefined : c)}>
                <CatIcon c={c} size={26} />
                <span>{catLabel(c, lang)}</span>
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t('r.describe')}</span>
            <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Panti ti po ju ni Mokola" />
          </label>
          {suggestion && !category && (
            <div className="small muted">
              Looks like: <b>{suggestion.category === 'other' ? 'not sure yet — a person will read it' : subLabel(suggestion.category, suggestion.subcategory)}</b>
            </div>
          )}
          <PhotoInput value={photo} onChange={setPhoto} label={`${t('r.photo')} (optional)`} sample="Reported by citizen" sampleTone="#5d6b3c" />
          <div className="row">
            <button className={`btn${recording ? ' danger' : ''}`} onClick={record} disabled={recording}>
              <Icon name="mic" /> {recording ? '● Recording…' : voice ? t('r.voice.done') : t('r.voice')}
            </button>
            {voice && <span className="small muted">{voice}</span>}
          </div>
          <button className="btn primary lg block" disabled={!category && text.trim().length < 4 && !voice} onClick={() => setStep(2)}>
            {t('r.next')}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card pad stack lg">
          <div>
            <h1>{t('r.where')}</h1>
            <p className="muted small">{t('r.where.sub')}</p>
          </div>
          <LocationPicker lgaId={lgaId} area={area} gps={gps} onChange={(l, a, g) => (setLga(l), setArea(a), setGps(g))} />
          <label className="field">
            <span>{t('r.landmark')}</span>
            <input className="input" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. opposite the market gate" />
          </label>
          <div className="row">
            <button className="btn lg" onClick={() => setStep(1)}>
              {t('r.back')}
            </button>
            <button className="btn primary lg" style={{ flex: 1 }} onClick={() => setStep(3)}>
              {t('r.next')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card pad stack lg">
          <div>
            <h1>{focal ? 'About this report' : t('r.who')}</h1>
            <p className="muted small">{focal ? `You report as ${me.name}, ${me.title}. Units never see your name or number.` : t('r.who.sub')}</p>
          </div>
          {focal && (
            <>
              <div className="field">
                <span>How do you know?</span>
                <div className="opts">
                  {(
                    [
                      ['saw', 'I saw it'],
                      ['told', 'Someone in my community told me'],
                      ['at_scene', 'Group members are at the scene'],
                    ] as const
                  ).map(([k, l]) => (
                    <label key={k} className={`pick${how === k ? ' on' : ''}`}>
                      <input type="radio" checked={how === k} onChange={() => setHow(k)} /> {l}
                    </label>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Number of people affected or at risk</span>
                <input className="input lg" inputMode="numeric" value={atRisk} onChange={(e) => setAtRisk(e.target.value.replace(/D/g, ''))} placeholder="e.g. 6" />
              </label>
              <label className="optin">
                <input type="checkbox" checked={canAssist} onChange={(e) => setCanAssist(e.target.checked)} />
                <span>
                  <b>Our group can assist</b>
                  <div className="tiny muted">The operator decides. Civilians are never dispatched.</div>
                </span>
              </label>
            </>
          )}
          {!focal && (['standard', 'confidential', 'anonymous'] as Identity[]).map((o) => (
            <label key={o} className={`idopt${identity === o ? ' on' : ''}${guest && o !== 'anonymous' ? ' disabled' : ''}`}>
              <input type="radio" disabled={guest && o !== 'anonymous'} checked={identity === o} onChange={() => setIdentity(o)} />
              <span>
                <b>{t(`id.${o}` as StrKey)}</b>
                <div className="small muted">{t(`id.${o}.sub` as StrKey)}</div>
              </span>
            </label>
          ))}
          {guest && (
            <p className="small muted">
              You are not signed in, so this report is anonymous. <a href="#/signin">Sign in with your phone</a> to get updates.
            </p>
          )}
          {!guest && !focal && identity !== 'anonymous' && (
            <label className="optin">
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
              <span>
                <b>{t('r.optin')}</b>
                <div className="tiny muted">{t('r.optin.sub')}</div>
              </span>
            </label>
          )}
          <div className="row">
            <button className="btn lg" onClick={() => setStep(2)}>
              {t('r.back')}
            </button>
            <button className="btn primary lg" style={{ flex: 1 }} onClick={submit}>
              {t('r.submit')}
            </button>
          </div>
          <p className="tiny muted">False reports are an offence. A report is treated as information to check, not as proof against anyone.</p>
        </div>
      )}
    </div>
  );
}

function LocationPicker({ lgaId, area, gps, onChange }: { lgaId: string; area: string; gps?: { lat: number; lng: number }; onChange: (lgaId: string, area: string, gps?: { lat: number; lng: number }) => void }) {
  const [, t] = useLang();
  const lga = lgaOf(lgaId);
  const locate = () => {
    const fallback = () => onChange(lgaId, area, { lat: lga.lat + 0.004, lng: lga.lng - 0.003 });
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng } = p.coords;
        const b = dep.bounds;
        if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) return fallback(); // outside the state: demo location
        const l = nearestLga(lat, lng);
        onChange(l.id, l.areas[0], { lat, lng });
      },
      fallback,
      { timeout: 4000 },
    );
  };
  return (
    <div className="stack">
      <button className={`btn lg block${gps ? ' good' : ''}`} onClick={locate}>
        <Icon name="pin" /> {gps ? `${t('r.located')} ✓` : t('r.locate')}
      </button>
      <div className="grid g2">
        <label className="field">
          <span>{t('r.lga')}</span>
          <select className="input" value={lgaId} onChange={(e) => onChange(e.target.value, lgaOf(e.target.value).areas[0], undefined)}>
            {dep.lgas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('r.area')}</span>
          <select className="input" value={area} onChange={(e) => onChange(lgaId, e.target.value, undefined)}>
            {lga.areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function Receipt({ done, onNew }: { done: { ref: string; incident: Incident; merged: boolean }; onNew: () => void }) {
  const [lang, t] = useLang();
  useStore((s) => s.incidents);
  const i = done.incident;
  return (
    <div className="phone">
      <div className="card receipt">
        <div className="big-check">
          <Icon name="check" size={34} />
        </div>
        <h1>{t('r.done')}</h1>
        <div className="muted small">{t('r.ref')}</div>
        <div className="ref mono">{done.ref}</div>
        <div className="notice warn small">{t('r.save')}</div>
        <div>
          <StatusPill i={i} lang={lang} big />
        </div>
        {done.merged && <div className="notice small">Others have reported this too. Your report was added to {i.ref} so responders see one job, not many.</div>}
        <div className="notice small" style={{ textAlign: 'left' }}>
          <b>{t('r.next.title')}:</b> {i.restricted ? t('r.next.sec') : t('r.next.civic')}
        </div>
        <div className="stack">
          <button className="btn primary lg block" onClick={() => go(`/track/${done.ref}`)}>
            {t('r.track')}
          </button>
          <button className="btn lg block" onClick={onNew}>
            {t('r.new')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- SOS (signed in or not) ----------

export function Emergency() {
  const me = persona();
  const guest = !signedIn();
  const [lang, t] = useLang();
  const [category, setCategory] = useState<CategoryId>('security');
  const [lgaId, setLga] = useState('ibn');
  const [area, setArea] = useState('Bodija');
  const [gps, setGps] = useState<{ lat: number; lng: number }>();
  const [confirm, setConfirm] = useState(false);
  const [ref, setRef] = useState<string>();

  const send = () => {
    const sos = category === 'security' || category === 'other';
    const res = submitReport({
      text: sos ? `SOS — ${guest ? 'anonymous caller' : 'reporter'} needs help now at ${area}` : `EMERGENCY: ${catLabel(category)} at ${area} — needs help now`,
      category: sos ? 'security' : category,
      lgaId,
      area,
      lat: gps?.lat,
      lng: gps?.lng,
      identity: guest ? 'anonymous' : 'confidential',
      channel: sos ? 'sos' : 'web',
      sos,
      reporter: guest ? undefined : { personId: me.id, name: me.name, phone: me.phone },
    });
    setRef(res.ref);
  };

  if (ref) return <SosSent refNo={ref} />;

  return (
    <div className="phone">
      <div className="row between">
        <h1 style={{ color: 'var(--crit)' }}>{t('sos.title')}</h1>
        <LangToggle />
      </div>
      {guest && <div className="notice small">{t('sos.anon')}</div>}
      <div className="card pad stack lg">
        <div className="field">
          <span>{t('sos.what')}</span>
          <div className="cat-grid four">
            {SOS_TILES.map((c) => (
              <button key={c} className={`cat-tile${category === c ? ' on' : ''}`} onClick={() => setCategory(c)}>
                <CatIcon c={c} size={26} />
                <span>{catLabel(c, lang)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t('sos.where')}</span>
          <LocationPicker lgaId={lgaId} area={area} gps={gps} onChange={(l, a, g) => (setLga(l), setArea(a), setGps(g))} />
        </div>
      </div>
      {!confirm ? (
        <>
          <HoldButton label={t('sos.hold')} holding={t('sos.holding')} onDone={send} />
          <button className="btn lg block" onClick={() => setConfirm(true)}>
            {t('sos.or')}
          </button>
        </>
      ) : (
        <div className="card pad stack" style={{ borderColor: 'var(--crit)' }}>
          <b>
            SOS · {catLabel(category, lang)} · {area}, {lgaOf(lgaId).name}
          </b>
          <button className="btn danger lg block" onClick={send}>
            {t('sos.confirm')}
          </button>
          <button className="btn lg block" onClick={() => setConfirm(false)}>
            {t('sos.cancel')}
          </button>
        </div>
      )}
      <p className="tiny muted center">{t('sos.call')}</p>
    </div>
  );
}

export function HoldButton({ label, holding, onDone, ms = 3000, text = 'SOS', small }: { label: string; holding: string; onDone: () => void; ms?: number; text?: string; small?: boolean }) {
  const [p, setP] = useState(0);
  const startRef = useRef<number>(0);
  const raf = useRef<number>(0);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    startRef.current = 0;
    setP(0);
  };
  const tickFn = () => {
    const v = Math.min(1, (performance.now() - startRef.current) / ms);
    setP(v);
    if (v >= 1) {
      startRef.current = 0;
      onDone();
      return;
    }
    raf.current = requestAnimationFrame(tickFn);
  };
  const begin = () => {
    startRef.current = performance.now();
    raf.current = requestAnimationFrame(tickFn);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const R = 54;
  const C = 2 * Math.PI * R;
  return (
    <button
      className={`hold${small ? " small" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        begin();
      }}
      onPointerUp={stop}
      onPointerLeave={() => p > 0 && p < 1 && stop()}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !startRef.current && begin()}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
    >
      <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden>
        <circle cx="66" cy="66" r={R} className="ring-bg" />
        <circle cx="66" cy="66" r={R} className="ring" strokeDasharray={C} strokeDashoffset={C * (1 - p)} />
        <text x="66" y="74" textAnchor="middle" className="ring-text">
          {text}
        </text>
      </svg>
      <span>{p > 0 ? holding : label}</span>
    </button>
  );
}

function SosSent({ refNo }: { refNo: string }) {
  const [lang, t] = useLang();
  useStore((s) => s.incidents);
  const i = incidentByRef(refNo);
  return (
    <div className="phone">
      <div className="card receipt sos-sent">
        <div className="big-check sos">
          <Icon name="check" size={34} />
        </div>
        <h1>{t('sos.sent')}</h1>
        <p>{t('sos.safe')}</p>
        <div className="muted small">{t('r.ref')}</div>
        <div className="ref mono">{refNo}</div>
        <div className="notice warn small">{t('r.save')}</div>
        {i && (
          <div className="stack" style={{ textAlign: 'left' }}>
            <div className="row between">
              <b>{t('sos.live')}</b>
              <StatusPill i={i} lang={lang} big />
            </div>
            <Stepper i={i} safe lang={lang} compact />
          </div>
        )}
        <button className="btn primary lg block" onClick={() => go(`/track/${refNo}`)}>
          {t('r.track')}
        </button>
        <p className="tiny muted">{t('sos.call')}</p>
      </div>
    </div>
  );
}

// ---------- My reports ----------

export function MyReports() {
  const me = persona();
  const at = useNow();
  const [lang, t] = useLang();
  const incidents = useStore((s) => s.incidents);
  const mine = incidents.filter((i) => i.reports.some((r) => r.reporter?.personId === me.id));
  return (
    <div className="phone">
      <div className="row between">
        <h1>{t('home.mine')}</h1>
        <LangToggle />
      </div>
      <a className="misconduct-link" href="#/misconduct">
        Report misconduct — help is free, never pay
      </a>
      {!mine.length && (
        <div className="empty">
          You haven't reported anything yet. <a href="#/report">{t('home.report')}</a>
        </div>
      )}
      {mine.map((i) => {
        const r = i.reports.find((x) => x.reporter?.personId === me.id)!;
        const confirm = i.status === 'resolved' && dep.categories.find((c) => c.id === i.category)?.citizenVerification;
        return (
          <button key={i.id} className="card pad stack report-card" onClick={() => go(`/track/${r.ref}`)}>
            <div className="row between">
              <span className="row" style={{ gap: 8 }}>
                <CatIcon c={i.category} size={18} />
                <span className="mono small">{r.ref}</span>
              </span>
              <StatusPill i={i} lang={lang} />
            </div>
            <b>{i.restricted ? subLabel(i.category, i.subcategory) : i.title}</b>
            <Stepper i={i} compact safe lang={lang} />
            <div className="small muted">
              {i.area} · {ago(r.submittedAt, at)}
              {confirm && (
                <span className="badge warn" style={{ marginLeft: 8 }}>
                  {t('t.fixed')}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Tracking (no sign-in) ----------

export function Track({ initial }: { initial?: string }) {
  const [lang, t] = useLang();
  const [ref, setRef] = useState(initial ?? '');
  const [q, setQ] = useState(initial ?? '');
  useStore((s) => s.incidents);
  useNow(5000);
  const i = q ? incidentByRef(q) : undefined;
  const r = i?.reports.find((x) => x.ref === q.trim().toUpperCase()) ?? i?.reports[0];
  const civicConfirm = i && i.status === 'resolved' && dep.categories.find((c) => c.id === i.category)?.citizenVerification;
  const who = !i ? '' : i.status === 'pending' || i.status === 'verified' ? (i.restricted ? t('t.control') : 'Central review') : i.restricted ? t('t.secunit') : agency(i.agencyId)?.short;
  return (
    <div className="phone">
      <div className="row between">
        <h1>{t('t.title')}</h1>
        <LangToggle />
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(ref);
          go(`/track/${ref.trim().toUpperCase()}`);
        }}
      >
        <input className="input mono lg" style={{ flex: 1 }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="OY-SEC-261016-00482" />
        <button className="btn primary lg">Track</button>
      </form>
      {q && !i && <div className="empty">No report with that reference. Check the number and try again.</div>}
      {i && r && (
        <div className="card pad stack lg">
          <div className="row between">
            <span className="mono">{r.ref}</span>
            <StatusPill i={i} lang={lang} big />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <CatIcon c={i.category} size={20} />
            <b>{i.restricted ? catLabel('security', lang) : i.title}</b>
          </div>
          <div className="small muted">
            {i.area}, {lgaOf(i.lgaId).name}
            {i.reports.length > 1 ? ` · ${i.reports.length} people reported this` : ''}
          </div>
          <Stepper i={i} safe lang={lang} />
          <div className="kv">
            <span>{t('t.who')}</span>
            <b>{who}</b>
          </div>
          {civicConfirm && (
            <div className="notice warn stack">
              <b>{t('t.fixed')}</b>
              <span className="small">{agency(i.agencyId)?.short} says this is fixed.</span>
              <div className="confirm-fix">
                <button className="btn primary lg" onClick={() => run(actions.confirmFix(i.id, 'yes', r.ref), 'Thank you. The case is now closed.')}>
                  {t('t.yes')}
                </button>
                <button className="btn lg" onClick={() => run(actions.confirmFix(i.id, 'partial', r.ref), 'Thank you. It has been reopened and escalated.')}>
                  {t('t.partly')}
                </button>
                <button className="btn danger lg" onClick={() => run(actions.confirmFix(i.id, 'no', r.ref), 'Thank you. It has been reopened and escalated.')}>
                  {t('t.no')}
                </button>
              </div>
            </div>
          )}
          <div className="stack" style={{ gap: 6 }}>
            <h3>{t('t.updates')}</h3>
            {i.updates
              .slice()
              .reverse()
              .map((u, k) => (
                <div key={k} className="small update">
                  <span className="muted tnum">{hhmm(u.at)}</span> {u.text}
                </div>
              ))}
          </div>
          {i.status === 'pending' && (
            <button className="btn ghost" onClick={() => run(actions.cancelReport(i.id, r.ref), 'Your report was cancelled.')}>
              {t('t.cancel')}
            </button>
          )}
          {(i.status === 'closed' || i.status === 'referred') && !i.officerSos && <ConductForm caseId={i.id} reportRef={r.ref} />}
          {i.restricted && isOpen(i) && <p className="tiny muted">For your safety, security reports show progress only — not which unit or officer is responding.</p>}
          <a className="misconduct-link" href={`#/misconduct?ref=${r.ref}`}>
            Report misconduct (someone asked for money, or treated you badly)
          </a>
        </div>
      )}
    </div>
  );
}

/** "How were you treated?" — asked when a case is Closed (v2.3 §4.1). */
export function ConductForm({ caseId, reportRef }: { caseId: string; reportRef: string }) {
  const done = useStore((s) => feedbackFor(s, reportRef));
  const [money, setMoney] = useState<boolean>();
  const [respect, setRespect] = useState<'yes' | 'somewhat' | 'no'>();
  const [speed, setSpeed] = useState(0);
  const [text, setText] = useState('');
  if (done) return <div className="notice good small">Thank you for telling us how you were treated.</div>;
  return (
    <div className="conduct stack">
      <h3>How were you treated?</h3>
      <div className="field">
        <span>Did anyone ask you for money, a gift or "something for the boys"?</span>
        <div className="radios">
          <label className={money === true ? 'on' : ''}>
            <input type="radio" checked={money === true} onChange={() => setMoney(true)} /> Yes
          </label>
          <label className={money === false ? 'on' : ''}>
            <input type="radio" checked={money === false} onChange={() => setMoney(false)} /> No
          </label>
        </div>
      </div>
      <div className="field">
        <span>Were you treated with respect?</span>
        <div className="radios">
          {(['yes', 'somewhat', 'no'] as const).map((v) => (
            <label key={v} className={respect === v ? 'on' : ''}>
              <input type="radio" checked={respect === v} onChange={() => setRespect(v)} /> {v === 'yes' ? 'Yes' : v === 'somewhat' ? 'Somewhat' : 'No'}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <span>How fast was the response? (optional)</span>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((k) => (
            <button key={k} type="button" className={k <= speed ? 'on' : ''} onClick={() => setSpeed(k)} aria-label={`${k} stars`}>
              ★
            </button>
          ))}
        </div>
      </div>
      <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything else? (optional)" />
      <button className="btn primary lg block" disabled={money === undefined || !respect} onClick={() => run(conduct.answer(caseId, reportRef, { money: !!money, respect: respect!, speed: speed || undefined, text }, 'track'), money || respect === 'no' ? 'Thank you. An independent oversight panel will look into this. The unit will not see your name.' : 'Thank you for your feedback.')}>
        Send answers
      </button>
      <p className="tiny muted">Your answers about money or disrespect go to an independent oversight panel, never to the unit.</p>
    </div>
  );
}

/** Report misconduct — always available, with or without a case reference. */
export function Misconduct({ ref0 = '' }: { ref0?: string }) {
  const [ref, setRef] = useState(ref0);
  const [text, setText] = useState('');
  const [money, setMoney] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent)
    return (
      <div className="phone">
        <div className="card receipt">
          <div className="big-check">
            <Icon name="check" size={34} />
          </div>
          <h1>Thank you</h1>
          <p>An independent oversight panel will review this. The unit and the officers involved will not see your name.</p>
          <button className="btn primary lg block" onClick={() => go('')}>
            Done
          </button>
        </div>
      </div>
    );
  return (
    <div className="phone">
      <h1>Report misconduct</h1>
      <div className="notice small">Help from police, Amotekun and 615 is free. Never pay. What you tell us goes to the independent Oyo Security Oversight Panel, not to the unit.</div>
      <div className="card pad stack lg">
        <label className="field">
          <span>Case reference (if you have one)</span>
          <input className="input mono" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="OY-SEC-…" />
        </label>
        <label className="optin">
          <input type="checkbox" checked={money} onChange={(e) => setMoney(e.target.checked)} />
          <span>
            <b>Someone asked me for money or a gift</b>
          </span>
        </label>
        <label className="field">
          <span>What happened?</span>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Who, where, when — in your own words" />
        </label>
        <button className="btn primary lg block" disabled={text.trim().length < 8} onClick={() => run(conduct.report({ ref: ref || undefined, text, money })) && setSent(true)}>
          Send to the oversight panel
        </button>
      </div>
    </div>
  );
}
