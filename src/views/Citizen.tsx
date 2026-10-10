import { useState } from 'react';
import { isOpen, km } from '../platform/engine';
import { triage } from '../platform/triage';
import type { CategoryId, Channel, Identity, Incident } from '../platform/types';
import { actions, agency, dep, incidentByRef, lgaOf, persona, submitReport, subLabel, useStore } from '../store';
import { Card, ago, go, hhmm, Stage, useNow } from '../ui';
import { PhotoInput } from './CaseView';

const CHIPS: { id: CategoryId; label: string }[] = [
  { id: 'security', label: 'Security' },
  { id: 'fire', label: 'Fire' },
  { id: 'flooding', label: 'Flooding / drainage' },
  { id: 'roads', label: 'Road' },
  { id: 'waste', label: 'Waste' },
  { id: 'infrastructure', label: 'Public infrastructure' },
];

const IDENTITY: { id: Identity; label: string; text: string }[] = [
  { id: 'standard', label: 'Standard', text: 'Government can contact you about this report.' },
  { id: 'confidential', label: 'Confidential', text: 'Only specially authorised officers can see who you are. Responding units never see it.' },
  { id: 'anonymous', label: 'Anonymous', text: 'Your name and number are not stored at all. Keep your reference number to track it.' },
];

function nearestLga(lat: number, lng: number) {
  return dep.lgas.slice().sort((a, b) => km(a.lat, a.lng, lat, lng) - km(b.lat, b.lng, lat, lng))[0];
}

export function Citizen() {
  const me = persona();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<CategoryId>();
  const [lgaId, setLga] = useState(me.id === 'cit1' ? 'ibn' : 'ibn');
  const [area, setArea] = useState('Bodija');
  const [landmark, setLandmark] = useState('');
  const [identity, setIdentity] = useState<Identity>('standard');
  const [channel, setChannel] = useState<Channel>('web');
  const [photo, setPhoto] = useState<string>();
  const [gps, setGps] = useState<{ lat: number; lng: number }>();
  const [done, setDone] = useState<{ ref: string; incident: Incident; merged: boolean }>();
  const [sos, setSos] = useState<'idle' | 'confirm'>('idle');
  const [tab, setTab] = useState<'app' | 'whatsapp'>('app');
  const lga = lgaOf(lgaId);
  const suggestion = text.trim().length > 12 ? triage(text, { category }) : undefined;

  const locate = () => {
    const fallback = () => {
      const l = lgaOf(lgaId);
      setGps({ lat: l.lat + 0.004, lng: l.lng - 0.003 });
    };
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng } = p.coords;
        const b = dep.bounds;
        if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) return fallback(); // outside the state: demo location
        const l = nearestLga(lat, lng);
        setLga(l.id);
        setArea(l.areas[0]);
        setGps({ lat, lng });
      },
      fallback,
      { timeout: 4000 },
    );
  };

  const reporter = { personId: me.id, name: me.name, phone: me.phone };
  const submit = (isSos = false) => {
    const res = submitReport({
      text: isSos ? text.trim() || 'SOS button pressed — reporter needs help now' : text,
      category: isSos ? 'security' : category,
      lgaId,
      area,
      landmark: landmark || undefined,
      lat: gps?.lat,
      lng: gps?.lng,
      identity: isSos && identity === 'standard' ? 'confidential' : identity,
      channel,
      reporter,
      photo,
      sos: isSos,
    });
    setDone(res);
    setSos('idle');
  };

  if (done) return <Receipt done={done} onNew={() => { setDone(undefined); setText(''); setPhoto(undefined); setCategory(undefined); }} />;

  return (
    <div className="phone">
      <div className="seg" style={{ justifySelf: 'center' }}>
        <button className={tab === 'app' ? 'on' : ''} onClick={() => setTab('app')}>
          App / web
        </button>
        <button className={tab === 'whatsapp' ? 'on' : ''} onClick={() => setTab('whatsapp')}>
          WhatsApp
        </button>
      </div>
      {tab === 'whatsapp' ? (
        <WhatsApp />
      ) : (
        <>
          {sos === 'idle' ? (
            <button className="sos-btn" onClick={() => setSos('confirm')}>
              SOS — I need help now
              <small>Sends your location to the {dep.emergencyLine} control room immediately</small>
            </button>
          ) : (
            <div className="card pad stack" style={{ borderColor: 'var(--crit)' }}>
              <h2>Send SOS from {area}, {lga.name}?</h2>
              <p className="small muted">An operator sees it at once. Add one line if you can do so safely. Your identity will be kept confidential.</p>
              <input className="input" placeholder="What is happening? (optional)" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row">
                <button className="btn danger lg" onClick={() => submit(true)}>
                  Send SOS
                </button>
                <button className="btn" onClick={() => setSos('idle')}>
                  Cancel
                </button>
              </div>
              <p className="tiny muted">In immediate danger you can also call {dep.emergencyLine}.</p>
            </div>
          )}

          <div className="card pad stack lg">
            <div>
              <h1>What would you like to report?</h1>
              <p className="muted" style={{ marginTop: 4 }}>
                Just describe it — in English, Yoruba or Pidgin. You don't need to know which agency is responsible.
              </p>
            </div>
            <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. The drainage here is overflowing onto the road…" />
            {suggestion && (
              <div className="small muted">
                Looks like: <b>{subLabel(suggestion.category, suggestion.subcategory)}</b>
                {suggestion.category === 'security' ? ' — a control-room operator will read it now.' : ''}
              </div>
            )}
            <div className="field">
              <span>Category (optional)</span>
              <div className="chips">
                {CHIPS.map((c) => (
                  <button key={c.id} className={`chip${category === c.id ? ' on' : ''}`} onClick={() => setCategory(category === c.id ? undefined : c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid g2">
              <label className="field">
                <span>Local government</span>
                <select
                  className="input"
                  value={lgaId}
                  onChange={(e) => {
                    setLga(e.target.value);
                    setArea(lgaOf(e.target.value).areas[0]);
                    setGps(undefined);
                  }}
                >
                  {dep.lgas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Area</span>
                <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
                  {lga.areas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row">
              <button className="btn sm" onClick={locate}>
                {gps ? 'Location attached ✓' : 'Use my location'}
              </button>
              <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Landmark (optional)" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
            </div>
            <PhotoInput value={photo} onChange={setPhoto} label="Photo (optional)" />
            <div className="field">
              <span>How should we handle your identity?</span>
              {IDENTITY.map((o) => (
                <label key={o.id} className={`idopt${identity === o.id ? ' on' : ''}`}>
                  <input type="radio" checked={identity === o.id} onChange={() => setIdentity(o.id)} />
                  <span>
                    <b>{o.label}</b>
                    <div className="small muted">{o.text}</div>
                  </span>
                </label>
              ))}
            </div>
            {identity !== 'anonymous' && (
              <label className="field">
                <span>Send updates by</span>
                <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                  <option value="web">SMS to {me.phone}</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
            )}
            <button className="btn primary lg block" disabled={text.trim().length < 6} onClick={() => submit()}>
              Submit report
            </button>
            <p className="tiny muted">
              False reports are an offence. A report is treated as information to check, not as proof against anyone. Also available by WhatsApp, SMS, USSD and the {dep.emergencyLine} line.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Receipt({ done, onNew }: { done: { ref: string; incident: Incident; merged: boolean }; onNew: () => void }) {
  const i = done.incident;
  return (
    <div className="phone">
      <div className="card receipt">
        <div className="badge good" style={{ justifySelf: 'center' }}>
          Report received
        </div>
        <div className="muted small">Report ID</div>
        <div className="ref mono">{done.ref}</div>
        <div>
          Location: <b>{i.area}</b>
        </div>
        <div>
          Status: <Stage i={i} />
        </div>
        {done.merged && <div className="notice small">Others have reported this too. Your report was added to {i.ref} ({i.reports.length} reports) so responders see one job, not many.</div>}
        {i.restricted && <div className="notice small">A control-room operator is reading your report now. If you are in danger, move to safety and call {dep.emergencyLine}.</div>}
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button className="btn primary" onClick={() => go(`/track/${done.ref}`)}>
            Track this report
          </button>
          <button className="btn" onClick={onNew}>
            New report
          </button>
        </div>
      </div>
    </div>
  );
}

export function MyReports() {
  const me = persona();
  const at = useNow();
  const incidents = useStore((s) => s.incidents);
  const mine = incidents.filter((i) => i.reports.some((r) => r.reporter?.personId === me.id));
  return (
    <div className="phone" style={{ maxWidth: 640 }}>
      <h1>My reports</h1>
      {!mine.length && <div className="empty">You haven't reported anything yet.</div>}
      {mine.map((i) => {
        const r = i.reports.find((x) => x.reporter?.personId === me.id)!;
        return (
          <div key={i.id} className="card pad stack" style={{ cursor: 'pointer' }} onClick={() => go(`/track/${r.ref}`)}>
            <div className="row between">
              <span className="mono small">{r.ref}</span>
              <Stage i={i} />
            </div>
            <b>{i.title}</b>
            <div className="small muted">
              {i.area} · {ago(r.submittedAt, at)}
              {i.status === 'awaiting_verification' && <span className="badge warn" style={{ marginLeft: 8 }}>Please confirm</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Public tracking by reference: works for anonymous reporters too. */
export function Track({ initial }: { initial?: string }) {
  const [ref, setRef] = useState(initial ?? '');
  const [q, setQ] = useState(initial ?? '');
  useStore((s) => s.incidents);
  const i = q ? incidentByRef(q) : undefined;
  const r = i?.reports.find((x) => x.ref === q.trim().toUpperCase()) ?? i?.reports[0];
  return (
    <div className="phone">
      <h1>Track a report</h1>
      <div className="row">
        <input className="input mono" style={{ flex: 1 }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="OY-SEC-260930-00482" />
        <button className="btn primary" onClick={() => setQ(ref)}>
          Track
        </button>
      </div>
      {q && !i && <div className="empty">No report with that reference.</div>}
      {i && r && (
        <div className="card pad stack">
          <div className="row between">
            <span className="mono">{r.ref}</span>
            <Stage i={i} />
          </div>
          <b>{i.restricted ? subLabel(i.category, i.subcategory) : i.title}</b>
          <div className="small muted">
            {i.area}, {lgaOf(i.lgaId).name}
            {!i.restricted && ` · ${agency(i.agencyId)?.short}`}
          </div>
          {i.reports.length > 1 && <div className="small">{i.reports.length} people reported this.</div>}
          <div className="hr" />
          <div className="stack" style={{ gap: 6 }}>
            {i.updates
              .slice()
              .reverse()
              .map((u, k) => (
                <div key={k} className="small">
                  <span className="muted tnum">{hhmm(u.at)}</span> {u.text}
                </div>
              ))}
          </div>
          {i.status === 'awaiting_verification' && (
            <div className="notice warn stack">
              <b>Government has marked your report as resolved. Has the issue been resolved?</b>
              <div className="row">
                <button className="btn primary" onClick={() => actions.verify(i.id, 'yes', r.ref)}>
                  Yes
                </button>
                <button className="btn" onClick={() => actions.verify(i.id, 'partial', r.ref)}>
                  Partly
                </button>
                <button className="btn danger" onClick={() => actions.verify(i.id, 'no', r.ref)}>
                  No
                </button>
              </div>
            </div>
          )}
          {i.restricted && isOpen(i) && <p className="tiny muted">For your safety, security reports show progress only — not which unit or officer is responding.</p>}
        </div>
      )}
    </div>
  );
}

// ---------- WhatsApp simulator ----------

type Msg = { from: 'bot' | 'me'; text: string };

function WhatsApp() {
  const me = persona();
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: `Welcome to ${dep.product} 👁️\nTell us what is happening. You can type or send a voice note (English, Yoruba or Pidgin).\nIn danger now? Reply SOS.` }]);
  const [step, setStep] = useState<'what' | 'where' | 'identity' | 'done'>('what');
  const [draft, setDraft] = useState({ text: '', lgaId: '', area: '', sos: false });
  const [input, setInput] = useState('');
  const areas = dep.lgas.flatMap((l) => l.areas.map((a) => ({ l, a })));

  const say = (text: string) => {
    const next: Msg[] = [...msgs, { from: 'me', text }];
    const t = text.trim();
    if (step === 'what' || step === 'done') {
      const sos = /^sos\b/i.test(t);
      setDraft({ text: sos ? t.replace(/^sos\s*/i, '') || 'SOS via WhatsApp' : t, lgaId: '', area: '', sos });
      next.push({ from: 'bot', text: 'Where is this? Reply with the area or landmark (e.g. Mokola, Ojoo, Sabo). Or share your location 📍' });
      setStep('where');
    } else if (step === 'where') {
      const hit = areas.find((x) => x.a.toLowerCase() === t.toLowerCase()) ?? areas.find((x) => x.a.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(x.a.toLowerCase()));
      if (!hit) next.push({ from: 'bot', text: "Sorry, I couldn't find that area. Try a nearby area or market name." });
      else {
        setDraft({ ...draft, lgaId: hit.l.id, area: hit.a });
        next.push({ from: 'bot', text: `${hit.a}, ${hit.l.name}. How should we treat your identity?\n1 — Standard (we can contact you)\n2 — Confidential\n3 — Anonymous` });
        setStep('identity');
      }
    } else if (step === 'identity') {
      const identity: Identity = t.startsWith('3') ? 'anonymous' : t.startsWith('2') ? 'confidential' : 'standard';
      const res = submitReport({ text: draft.text, lgaId: draft.lgaId, area: draft.area, identity, channel: 'whatsapp', reporter: { personId: me.id, name: me.name, phone: me.phone }, sos: draft.sos });
      next.push({
        from: 'bot',
        text: `✅ Report received.\nReport ID: ${res.ref}\nLocation: ${draft.area}\nStatus: ${res.incident.restricted ? 'The control room is reviewing it now' : 'Being reviewed'}${res.merged ? `\n${res.incident.reports.length} people have reported this.` : ''}\n\nReply with a new message any time to report something else.`,
      });
      setStep('done');
    }
    setMsgs(next);
    setInput('');
  };

  return (
    <Card title="WhatsApp — OyoEye" right={<span className="tiny muted">simulated</span>}>
      <div className="stack" style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 10, minHeight: 360, maxHeight: 520, overflowY: 'auto' }}>
        {msgs.map((m, k) => (
          <div key={k} style={{ justifySelf: m.from === 'me' ? 'end' : 'start', maxWidth: '85%', background: m.from === 'me' ? 'color-mix(in srgb, #25d366 22%, var(--surface))' : 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 10px', whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {m.text}
          </div>
        ))}
      </div>
      <form
        className="row"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) say(input);
        }}
      >
        <input className="input" style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder={step === 'identity' ? '1, 2 or 3' : 'Type a message'} />
        <button className="btn primary">Send</button>
      </form>
    </Card>
  );
}
