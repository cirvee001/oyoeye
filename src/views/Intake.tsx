import { useState } from 'react';
import type { CategoryId, Identity } from '../platform/types';
import { dep, lgaOf, persona, submitReport } from '../store';
import { Card, CatIcon, go, toast } from '../ui';

/** A 615 operator turns a phone call into a case — the same 3 steps as the citizen form. */
export function Intake() {
  const me = persona();
  const [callRef] = useState(() => `CALL-615-${String(88413 + Math.floor(Math.random() * 900))}`);
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<CategoryId>('security');
  const [sub, setSub] = useState('suspicious');
  const [text, setText] = useState('');
  const [lgaId, setLga] = useState('ibn');
  const [area, setArea] = useState(lgaOf('ibn').areas[0]);
  const [landmark, setLandmark] = useState('');
  const [identity, setIdentity] = useState<Identity>('confidential');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const c = dep.categories.find((x) => x.id === category)!;

  const submit = () => {
    const res = submitReport({
      text,
      category,
      subcategory: sub,
      lgaId,
      area,
      landmark: landmark || undefined,
      identity,
      channel: 'call_615',
      callRef,
      reporter: identity === 'anonymous' ? undefined : { name: name || 'Caller', phone: phone || undefined },
      actor: me,
    });
    const civicRouted = !res.incident.restricted && res.incident.status !== 'pending';
    toast(civicRouted ? `Case ${res.ref} created and sent to the responsible agency.` : `Case ${res.ref} created from ${callRef}.`);
    go(civicRouted ? '/control' : `/case/${res.incident.id}`);
  };

  return (
    <div className="narrow stack lg">
      <div className="page-head">
        <div>
          <h1>New {dep.emergencyLine} call</h1>
          <p>Log the call as a case. It joins the same board as app, WhatsApp, SMS and USSD reports and gets the same clocks and audit.</p>
        </div>
        <div className="spacer" />
        <span className="mono muted">{callRef}</span>
      </div>
      <div className="progress3">
        {[1, 2, 3].map((k) => (
          <span key={k} className={k <= step ? 'on' : ''} />
        ))}
      </div>
      {step === 1 && (
        <Card title="1. What is the caller reporting?">
          <div className="stack lg">
            <div className="cat-grid">
              {dep.categories.map((x) => (
                <button
                  key={x.id}
                  className={`cat-tile${category === x.id ? ' on' : ''}`}
                  onClick={() => {
                    setCategory(x.id);
                    setSub(x.subcategories[0].id);
                  }}
                >
                  <CatIcon c={x.id} size={22} />
                  <span>{x.label}</span>
                </button>
              ))}
            </div>
            <label className="field">
              <span>Type</span>
              <select className="input" value={sub} onChange={(e) => setSub(e.target.value)}>
                {c.subcategories.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>In the caller's words</span>
              <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write it in the caller's words where possible" />
            </label>
            <button className="btn primary lg" disabled={text.trim().length < 6} onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        </Card>
      )}
      {step === 2 && (
        <Card title="2. Where?">
          <div className="stack lg">
            <div className="grid g2">
              <label className="field">
                <span>LGA</span>
                <select
                  className="input"
                  value={lgaId}
                  onChange={(e) => {
                    setLga(e.target.value);
                    setArea(lgaOf(e.target.value).areas[0]);
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
                  {lgaOf(lgaId).areas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Landmark</span>
              <input className="input" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. opposite the filling station" />
            </label>
            <div className="row">
              <button className="btn lg" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn primary lg" onClick={() => setStep(3)}>
                Next
              </button>
            </div>
          </div>
        </Card>
      )}
      {step === 3 && (
        <Card title="3. Caller">
          <div className="stack lg">
            <div className="seg">
              {(['standard', 'confidential', 'anonymous'] as Identity[]).map((x) => (
                <button key={x} className={identity === x ? 'on' : ''} onClick={() => setIdentity(x)}>
                  {x[0].toUpperCase() + x.slice(1)}
                </button>
              ))}
            </div>
            {identity === 'anonymous' ? (
              <div className="notice small">The caller's number will not be stored with this case.</div>
            ) : (
              <>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Caller name (if given)" />
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Call-back number" />
                {identity === 'confidential' && <div className="notice sealed small">Sealed: only restricted-cases officers can unseal it, and every unseal is logged.</div>}
              </>
            )}
            <div className="small muted">
              Recording reference {callRef} is attached to the case. Operator: {me.name}.
            </div>
            <div className="row">
              <button className="btn lg" onClick={() => setStep(2)}>
                Back
              </button>
              <button className="btn primary lg" onClick={submit}>
                Create case
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
