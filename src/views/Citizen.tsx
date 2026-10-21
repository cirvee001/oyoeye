import { useEffect, useRef, useState } from 'react';
import { isOpen } from '../platform/engine';
import type { CategoryId, Identity, Incident } from '../platform/types';
import { catLabel, errText, msgText, statusExplain, useLang, type StrKey } from '../i18n';
import { markCaseRead, actions, addSosLocation, agency, conduct, dep, feedbackFor, incidentByRef, lgaOf, persona, setLang, signedIn, submitReport, suggest, subLabel, useStore } from '../store';
import { AnonRules, anonRulesSeen } from './RuleBook';
import { AreaPickers, LocationStep, PlaceChip, placeFromPoint, useLocator, type Place } from './Location';
import { CatIcon, Icon, PhotoInput, StatusPill, Stepper, ago, go, hhmm, run, useNow, useQuery } from '../ui';
import { myReports } from '../filters';

const TILES: CategoryId[] = ['security', 'fire', 'flooding', 'roads', 'waste', 'infrastructure', 'other'];
const SOS_TILES: CategoryId[] = ['security', 'fire', 'flooding', 'other'];

/** EN / YO — in the top bar of every citizen screen and on the sign-in page; remembered (§5). */
export function LangToggle() {
  const [lang, t] = useLang();
  return (
    <div className="seg lang" role="group" aria-label={t('lang.label')}>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'} aria-label="English" lang="en">
        EN
      </button>
      <button className={lang === 'yo' ? 'on' : ''} onClick={() => setLang('yo')} aria-pressed={lang === 'yo'} aria-label="Yorùbá" lang="yo">
        YO
      </button>
    </div>
  );
}

// ---------- Home ----------

export function CitizenHome() {
  const me = persona();
  const [, t] = useLang();
  const incidents = useStore((s) => s.incidents);
  const mine = incidents.filter((i) => i.reports.some((r) => r.reporter?.personId === me.id));
  const waiting = mine.filter((i) => i.status === 'resolved' && dep.categories.find((c) => c.id === i.category)?.citizenVerification).length;
  return (
    <div className="phone">
      <h1>{`${t('home.hello')}, ${me.name.split(' ')[0]}`}</h1>
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
          <small>{`${mine.length} · ${t('home.mine.sub')}`}</small>
          {waiting > 0 && <span className="badge warn">{t('home.waiting', { n: waiting })}</span>}
        </button>
      </div>
      <p className="tiny muted center">
        {t('home.nophone')} <b>*615#</b> {t('home.orcall')} <b>615</b>.
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
  const [place, setPlace] = useState<Place | undefined>(() => (focal && me.lgaId ? placeFromPoint(me.lgaId, me.community && lgaOf(me.lgaId).areas.includes(me.community) ? me.community : lgaOf(me.lgaId).areas[0]) : undefined));
  const [landmark, setLandmark] = useState('');
  const [noLandmark, setNoLandmark] = useState(false);
  const [tried, setTried] = useState(0);
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
  const step1Ok = !!category || text.trim().length >= 4 || !!voice;
  const step2Ok = !!place && (!!landmark.trim() || noLandmark);

  const record = () => {
    setRecording(true);
    setTimeout(() => {
      setRecording(false);
      setVoice(`Voice note 0:${String(8 + Math.floor(Math.random() * 40)).padStart(2, '0')} (simulated)`);
    }, 1600);
  };

  const submit = () => {
    if (!place) return;
    const res = submitReport({
      text: text.trim() || (voice ? `Voice note: ${catLabel(category ?? 'other')}` : catLabel(category ?? 'other')),
      category: category === 'other' ? undefined : category,
      lgaId: place.lgaId,
      area: place.area,
      landmark: landmark.trim() || undefined,
      lat: place.lat,
      lng: place.lng,
      identity: focal ? 'standard' : identity,
      channel: 'web',
      reporter: guest ? undefined : { personId: me.id, name: me.name, phone: me.phone, optInUpdates: optIn || focal },
      photo,
      voice,
      focal: focal ? { how, atRisk: Number(atRisk) || undefined, canAssist } : undefined,
      lang,
    });
    setDone(res);
  };

  if (!rulesOk) return <AnonRules onOk={() => setRulesOk(true)} />;
  if (done) return <Receipt done={done} onNew={() => (setDone(undefined), setStep(1), setText(''), setPhoto(undefined), setVoice(undefined), setCategory(undefined), setLandmark(''), setNoLandmark(false), setTried(0))} />;

  return (
    <div className="phone">
      <span className="small muted">{t('r.stepof', { n: step, m: 3 })}</span>
      <div className="progress3" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={t('r.stepof', { n: step, m: 3 })}>
        {[1, 2, 3].map((k) => (
          <span key={k} className={k <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 1 && (
        <div className="card pad stack lg">
          <div>
            <h1>{focal ? t('r.focal.title') : t('r.what')}</h1>
            <p className="muted small">{t('r.what.sub')}</p>
          </div>
          <div className="cat-grid" role="group" aria-label={t('r.what')}>
            {TILES.map((c) => (
              <button key={c} className={`cat-tile${category === c ? ' on' : ''}`} onClick={() => setCategory(category === c ? undefined : c)} aria-pressed={category === c}>
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
              {t('r.looks')} <b>{suggestion.category === 'other' ? t('r.looks.unsure') : lang === 'yo' ? catLabel(suggestion.category, lang) : subLabel(suggestion.category, suggestion.subcategory)}</b>
            </div>
          )}
          <PhotoInput value={photo} onChange={setPhoto} label={`${t('r.photo')} ${t('r.optional')}`} sample="Reported by citizen" sampleTone="#5d6b3c" lang={lang} />
          <div className="row">
            <button className={`btn${recording ? ' danger' : ''}`} onClick={record} disabled={recording} aria-label={recording ? t('r.voice.rec') : voice ? t('r.voice.done') : t('r.voice')}>
              <Icon name="mic" /> {recording ? `● ${t('r.voice.rec')}` : voice ? t('r.voice.done') : t('r.voice')}
            </button>
            {voice && <span className="small muted">{voice}</span>}
          </div>
          {tried === 1 && !step1Ok && (
            <span className="field-err" role="alert">
              {t('r.what.err')}
            </span>
          )}
          <button className="btn primary lg block" aria-disabled={!step1Ok} onClick={() => (step1Ok ? (setStep(2), setTried(0)) : setTried(1))}>
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
          <LocationStep place={place} onChange={setPlace} landmark={landmark} onLandmark={setLandmark} landmarkUnknown={noLandmark} onLandmarkUnknown={setNoLandmark} landmarkRequired showErrors={tried === 2} />
          {tried === 2 && !place && (
            <span className="field-err" role="alert">
              {t('r.denied')}
            </span>
          )}
          <div className="row">
            <button className="btn lg" onClick={() => setStep(1)}>
              {t('r.back')}
            </button>
            <button className="btn primary lg" style={{ flex: 1 }} aria-disabled={!step2Ok} onClick={() => (step2Ok ? (setStep(3), setTried(0)) : setTried(2))}>
              {t('r.next')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card pad stack lg">
          <div>
            <h1>{focal ? t('r.about') : t('r.who')}</h1>
            <p className="muted small">{focal ? t('r.focal.as', { name: me.name, title: me.title }) : t('r.who.sub')}</p>
          </div>
          {focal && (
            <>
              <fieldset className="field">
                <legend>{t('r.how')}</legend>
                <div className="opts">
                  {(
                    [
                      ['saw', 'r.how.saw'],
                      ['told', 'r.how.told'],
                      ['at_scene', 'r.how.scene'],
                    ] as const
                  ).map(([k, l]) => (
                    <label key={k} className={`pick${how === k ? ' on' : ''}`}>
                      <input type="radio" name="how" checked={how === k} onChange={() => setHow(k)} /> {t(l)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                <span>{t('r.atrisk')}</span>
                <input className="input lg" inputMode="numeric" value={atRisk} onChange={(e) => setAtRisk(e.target.value.replace(/\D/g, ''))} placeholder="6" />
              </label>
              <label className="optin">
                <input type="checkbox" checked={canAssist} onChange={(e) => setCanAssist(e.target.checked)} />
                <span>
                  <b>{t('r.assist')}</b>
                  <div className="tiny muted">{t('r.assist.sub')}</div>
                </span>
              </label>
            </>
          )}
          {!focal &&
            (['standard', 'confidential', 'anonymous'] as Identity[]).map((o) => (
              <label key={o} className={`idopt${identity === o ? ' on' : ''}${guest && o !== 'anonymous' ? ' disabled' : ''}`}>
                <input type="radio" name="identity" disabled={guest && o !== 'anonymous'} checked={identity === o} onChange={() => setIdentity(o)} />
                <span>
                  <b>{t(`id.${o}` as StrKey)}</b>
                  <div className="small muted">{t(`id.${o}.sub` as StrKey)}</div>
                </span>
              </label>
            ))}
          {guest && (
            <p className="small muted">
              {t('r.guest')} <a href="#/signin">{t('r.guest.link')}</a> {t('r.guest.tail')}
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
          <p className="tiny muted">{t('r.false')}</p>
        </div>
      )}
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
        {done.merged && <div className="notice small">{t('r.merged', { ref: i.ref })}</div>}
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

/** How long the SOS waits for a location before it goes anyway (§2.6). */
export const SOS_LOCATION_WAIT_MS = 5000;
/** One hold time for both SOS buttons (§3). */
export const SOS_HOLD_MS = 2000;

export function Emergency() {
  const me = persona();
  const guest = !signedIn();
  const [lang, t] = useLang();
  const [category, setCategory] = useState<CategoryId>('security');
  const [place, setPlace] = useState<Place>();
  const [choosing, setChoosing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ref, setRef] = useState<string>();
  const opened = useRef(Date.now());
  const sent = useRef(false);
  // Location is captured in the background as soon as the screen opens, so the hold is never delayed.
  const loc = useLocator((r) => r.status === 'ok' && setPlace((p) => (p?.source === 'manual' ? p : { lgaId: r.lgaId, area: r.area, lat: r.lat, lng: r.lng, source: 'gps' })));
  useEffect(() => {
    opened.current = Date.now();
    loc.locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSend = (p: Place | undefined) => {
    if (sent.current) return;
    sent.current = true;
    const sos = category === 'security' || category === 'other';
    const where = p?.area ?? 'Location unknown';
    const res = submitReport({
      text: sos ? `SOS — ${guest ? 'anonymous caller' : 'reporter'} needs help now at ${where}` : `EMERGENCY: ${catLabel(category)} at ${where} — needs help now`,
      category: sos ? 'security' : category,
      lgaId: p?.lgaId ?? 'ibn',
      area: where,
      lat: p?.lat,
      lng: p?.lng,
      landmark: p ? undefined : 'Location unknown — operator will call',
      locationUnknown: !p || undefined,
      identity: guest ? 'anonymous' : 'confidential',
      channel: sos ? 'sos' : 'web',
      sos,
      reporter: guest ? undefined : { personId: me.id, name: me.name, phone: me.phone },
      lang,
    });
    setRef(res.ref);
  };
  /** Send now with the location we have; if it is still being found, wait up to 5 s from opening, then send anyway. */
  const send = () => {
    if (place) return doSend(place);
    if (loc.status === 'finding' && Date.now() - opened.current < SOS_LOCATION_WAIT_MS) return setWaiting(true);
    doSend(undefined);
  };
  useEffect(() => {
    if (!waiting) return;
    if (place) return doSend(place);
    if (loc.status !== 'finding') return doSend(undefined);
    const tm = setTimeout(() => doSend(undefined), Math.max(0, SOS_LOCATION_WAIT_MS - (Date.now() - opened.current)));
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, place, loc.status]);

  if (ref) return <SosSent refNo={ref} />;

  const locLine =
    place && place.source !== 'manual' ? (
      <PlaceChip place={place} editing={choosing} onEdit={() => setChoosing(!choosing)} />
    ) : loc.status === 'finding' ? (
      <span className="small">{t('sos.loc.finding')}</span>
    ) : !place ? (
      <span className="small">{t('sos.loc.unknown')}</span>
    ) : null;

  return (
    <div className="phone">
      <h1 style={{ color: 'var(--crit)' }}>{t('sos.title')}</h1>
      {guest && <div className="notice small">{t('sos.anon')}</div>}
      <div className="card pad stack lg">
        <div className="field">
          <span id="sos-what">{t('sos.what')}</span>
          <div className="cat-grid four" role="group" aria-labelledby="sos-what">
            {SOS_TILES.map((c) => (
              <button key={c} className={`cat-tile${category === c ? ' on' : ''}`} onClick={() => setCategory(c)} aria-pressed={category === c}>
                <CatIcon c={c} size={26} />
                <span>{catLabel(c, lang)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t('sos.where')}</span>
          <div className="sos-loc" aria-live="polite">
            {locLine}
            {(!place || place.source === 'manual') && !choosing && (
              <button type="button" className="link-btn" onClick={() => setChoosing(true)}>
                {t('sos.loc.choose')}
              </button>
            )}
          </div>
          {choosing && <AreaPickers place={place ?? placeFromPoint('ibn', 'Bodija')} onChange={setPlace} idPrefix="sos" />}
        </div>
      </div>
      {waiting ? (
        <div className="notice warn" role="status">
          {t('sos.sending')}
        </div>
      ) : !confirm ? (
        <>
          <HoldButton label={t('sos.hold')} holding={t('sos.holding')} onDone={send} />
          <button className="btn lg block" onClick={() => setConfirm(true)}>
            {t('sos.or')}
          </button>
        </>
      ) : (
        <div className="card pad stack" style={{ borderColor: 'var(--crit)' }}>
          <b>{`SOS · ${catLabel(category, lang)} · ${place ? `${place.area}, ${lgaOf(place.lgaId).name}` : t('sos.loc.unknown')}`}</b>
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

const vibrate = (p: number | number[]) => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(p);
  } catch {
    /* not supported */
  }
};

/** Press-and-hold: the same 2 s ring and haptics for citizen SOS and Officer SOS (§3). */
export function HoldButton({ label, holding, onDone, ms = SOS_HOLD_MS, text = 'SOS', small }: { label: string; holding: string; onDone: () => void; ms?: number; text?: string; small?: boolean }) {
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
      vibrate([100, 50, 100]);
      onDone();
      return;
    }
    raf.current = requestAnimationFrame(tickFn);
  };
  const begin = () => {
    startRef.current = performance.now();
    vibrate(50);
    raf.current = requestAnimationFrame(tickFn);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const R = 54;
  const C = 2 * Math.PI * R;
  return (
    <button
      className={`hold${small ? ' small' : ''}`}
      data-hold-ms={ms}
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
  const [place, setPlace] = useState<Place>(() => placeFromPoint('ibn', 'Bodija'));
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
        {i?.locationUnknown && (
          <div className="card pad stack" style={{ textAlign: 'left' }}>
            <b>{t('sos.loc.unknown')}</b>
            <span className="small">{t('sos.addarea.sub')}</span>
            <h3>{t('sos.addarea')}</h3>
            <AreaPickers place={place} onChange={setPlace} idPrefix="sosadd" />
            <button className="btn primary lg block" onClick={() => run(errText(addSosLocation(refNo, place.lgaId, place.area, place.lat, place.lng), lang), t('sos.addarea.done'))}>
              {t('sos.addarea.save')}
            </button>
          </div>
        )}
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
  const s = useStore((x) => x);
  const f = useQuery().get('f') ?? undefined;
  const mine = myReports(me, s, at, f);
  const FKEY: Record<string, 'cd.open' | 'cd.progress' | 'cd.waiting' | 'cd.closed'> = { open: 'cd.open', progress: 'cd.progress', waiting: 'cd.waiting', closed: 'cd.closed' };
  return (
    <div className="phone">
      <h1>{t('home.mine')}</h1>
      {f && FKEY[f] && (
        <div className="row between my-filter">
          <span className="chip on">{t('my.filter', { f: t(FKEY[f]) })}</span>
          <a href="#/my">{t('my.all')}</a>
        </div>
      )}
      <a className="misconduct-link" href="#/misconduct">
        {t('my.misconduct')}
      </a>
      {!mine.length && (
        <div className="empty">
          {t('my.empty')} <a href="#/report">{t('home.report')}</a>
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
              <StatusPill i={i} lang={lang} cta={!!confirm} />
            </div>
            <b>{i.restricted ? (lang === 'yo' ? catLabel(i.category, lang) : subLabel(i.category, i.subcategory)) : i.title}</b>
            <Stepper i={i} compact safe lang={lang} />
            <div className="small muted">
              {`${i.area} · ${ago(r.submittedAt, at, lang)}`}
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
  useEffect(() => {
    if (i && signedIn()) markCaseRead(i.id);
  }, [i?.id]);
  const civicConfirm = i && i.status === 'resolved' && dep.categories.find((c) => c.id === i.category)?.citizenVerification;
  const who = !i ? '' : i.status === 'pending' || i.status === 'verified' ? (i.restricted ? t('t.control') : t('t.central')) : i.restricted ? t('t.secunit') : agency(i.agencyId)?.short;
  return (
    <div className="phone">
      <h1>{t('t.title')}</h1>
      <form
        className="row track-form"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(ref);
          go(`/track/${ref.trim().toUpperCase()}`);
        }}
      >
        <label className="field" style={{ flex: 1 }}>
          <span>{t('t.refLabel')}</span>
          <input className="input mono lg" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="OY-SEC-261016-00482" />
        </label>
        <button className="btn primary lg">{t('t.go')}</button>
      </form>
      {q && !i && (
        <div className="empty" role="alert">
          {t('t.notfound')}
        </div>
      )}
      {i && r && (
        <div className="card pad stack lg">
          <div className="row between">
            <span className="mono">{r.ref}</span>
            <StatusPill i={i} lang={lang} big cta={!!civicConfirm} />
          </div>
          <p className="small stx">{statusExplain(i, lang)}</p>
          <div className="row" style={{ gap: 8 }}>
            <CatIcon c={i.category} size={20} />
            <b>{i.restricted ? catLabel('security', lang) : i.title}</b>
          </div>
          <div className="small muted">
            {`${i.area}, ${lgaOf(i.lgaId).name}${i.reports.length > 1 ? ` · ${t('t.many', { n: i.reports.length })}` : ''}`}
          </div>
          <Stepper i={i} safe lang={lang} />
          <div className="kv">
            <span>{t('t.who')}</span>
            <b>{who}</b>
          </div>
          {civicConfirm && (
            <div className="notice warn stack">
              <b>{t('t.fixed')}</b>
              <span className="small">{t('t.saysfixed', { unit: agency(i.agencyId)?.short ?? '' })}</span>
              <div className="confirm-fix">
                <button className="btn primary lg" onClick={() => run(errText(actions.confirmFix(i.id, 'yes', r.ref), lang), t('t.closedOk'))}>
                  {t('t.yes')}
                </button>
                <button className="btn lg" onClick={() => run(errText(actions.confirmFix(i.id, 'partial', r.ref), lang), t('t.reopenOk'))}>
                  {t('t.partly')}
                </button>
                <button className="btn danger lg" onClick={() => run(errText(actions.confirmFix(i.id, 'no', r.ref), lang), t('t.reopenOk'))}>
                  {t('t.no')}
                </button>
              </div>
            </div>
          )}
          <div className="stack" style={{ gap: 6 }}>
            <h3>{t('t.updates')}</h3>
            {!i.updates.length && <div className="small muted">{t('t.noupdates')}</div>}
            {i.updates
              .slice()
              .reverse()
              .map((u, k) => (
                <div key={k} className="small update">
                  <span className="muted tnum">{hhmm(u.at)}</span> {u.msg ? msgText(u.msg, lang) : u.text}
                </div>
              ))}
          </div>
          {i.status === 'pending' && (
            <button className="btn ghost" onClick={() => run(errText(actions.cancelReport(i.id, r.ref), lang), t('t.cancelOk'))}>
              {t('t.cancel')}
            </button>
          )}
          {(i.status === 'closed' || i.status === 'referred') && !i.officerSos && <ConductForm caseId={i.id} reportRef={r.ref} />}
          {i.restricted && isOpen(i) && <p className="tiny muted">{t('t.secnote')}</p>}
          <a className="misconduct-link" href={`#/misconduct?ref=${r.ref}`}>
            {t('t.misconduct')}
          </a>
        </div>
      )}
    </div>
  );
}

/** "How were you treated?" — asked when a case is Closed (v2.3 §4.1). */
export function ConductForm({ caseId, reportRef }: { caseId: string; reportRef: string }) {
  const [lang, t] = useLang();
  const done = useStore((s) => feedbackFor(s, reportRef));
  const [money, setMoney] = useState<boolean>();
  const [respect, setRespect] = useState<'yes' | 'somewhat' | 'no'>();
  const [speed, setSpeed] = useState(0);
  const [text, setText] = useState('');
  if (done) return <div className="notice good small">{t('cf.thanks')}</div>;
  const n = `cf-${reportRef}`;
  return (
    <div className="conduct stack">
      <h3>{t('cf.title')}</h3>
      <fieldset className="field">
        <legend>{t('cf.money')}</legend>
        <div className="radios">
          <label className={money === true ? 'on' : ''}>
            <input type="radio" name={`${n}-money`} checked={money === true} onChange={() => setMoney(true)} /> {t('t.yesShort')}
          </label>
          <label className={money === false ? 'on' : ''}>
            <input type="radio" name={`${n}-money`} checked={money === false} onChange={() => setMoney(false)} /> {t('t.no')}
          </label>
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{t('cf.respect')}</legend>
        <div className="radios">
          {(['yes', 'somewhat', 'no'] as const).map((v) => (
            <label key={v} className={respect === v ? 'on' : ''}>
              <input type="radio" name={`${n}-respect`} checked={respect === v} onChange={() => setRespect(v)} /> {v === 'yes' ? t('t.yesShort') : v === 'somewhat' ? t('cf.somewhat') : t('t.no')}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{t('cf.speed')}</legend>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((k) => (
            <button key={k} type="button" className={k <= speed ? 'on' : ''} onClick={() => setSpeed(k)} aria-label={t('cf.stars', { n: k })} aria-pressed={k <= speed}>
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>{t('cf.more')}</span>
        <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button className="btn primary lg block" disabled={money === undefined || !respect} onClick={() => run(errText(conduct.answer(caseId, reportRef, { money: !!money, respect: respect!, speed: speed || undefined, text }, 'track'), lang), money || respect === 'no' ? t('cf.ok.panel') : t('cf.ok'))}>
        {t('cf.send')}
      </button>
      <p className="tiny muted">{t('cf.note')}</p>
    </div>
  );
}

/** Report misconduct — always available, with or without a case reference. */
export function Misconduct({ ref0 = '' }: { ref0?: string }) {
  const [lang, t] = useLang();
  const [ref, setRef] = useState(ref0);
  const [text, setText] = useState('');
  const [money, setMoney] = useState(false);
  const [sent, setSent] = useState(false);
  const [tried, setTried] = useState(false);
  if (sent)
    return (
      <div className="phone">
        <div className="card receipt">
          <div className="big-check">
            <Icon name="check" size={34} />
          </div>
          <h1>{t('mc.thanks')}</h1>
          <p>{t('mc.thanks.sub')}</p>
          <button className="btn primary lg block" onClick={() => go('')}>
            {t('mc.done')}
          </button>
        </div>
      </div>
    );
  const short = text.trim().length < 8;
  return (
    <div className="phone">
      <h1>{t('mc.title')}</h1>
      <div className="notice small">{t('mc.intro')}</div>
      <div className="card pad stack lg">
        <label className="field">
          <span>{t('mc.ref')}</span>
          <input className="input mono" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="OY-SEC-…" />
        </label>
        <label className="optin">
          <input type="checkbox" checked={money} onChange={(e) => setMoney(e.target.checked)} />
          <span>
            <b>{t('mc.money')}</b>
          </span>
        </label>
        <label className="field">
          <span>{t('mc.what')}</span>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('mc.what.ph')} aria-invalid={(tried && short) || undefined} />
          {tried && short && <span className="field-err">{t('mc.what.err')}</span>}
        </label>
        <button className="btn primary lg block" aria-disabled={short} onClick={() => (short ? setTried(true) : run(errText(conduct.report({ ref: ref || undefined, text, money }), lang)) && setSent(true))}>
          {t('mc.send')}
        </button>
      </div>
    </div>
  );
}
