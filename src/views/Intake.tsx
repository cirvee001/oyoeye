import { useState } from 'react';
import type { CategoryId, Identity } from '../platform/types';
import { dep, lgaOf, persona, submitReport } from '../store';
import { Card, go } from '../ui';

/** A 615 operator turns a phone call into an OyoEye incident, in the same system as app reports. */
export function Intake() {
  const me = persona();
  const [callRef] = useState(() => `CALL-615-${String(88413 + Math.floor(Math.random() * 900))}`);
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
    go(res.incident.restricted ? '/control' : `/case/${res.incident.id}`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New {dep.emergencyLine} call</h1>
          <p>Log the call as an incident. It joins the same queue as app, WhatsApp and SMS reports and gets the same routing, clocks and audit.</p>
        </div>
      </div>
      <div className="grid split">
        <Card title="Call details" right={<span className="mono muted">{callRef}</span>}>
          <div className="stack lg">
            <label className="field">
              <span>What is the caller reporting?</span>
              <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write it in the caller's words where possible" />
            </label>
            <div className="grid g2">
              <label className="field">
                <span>Category</span>
                <select
                  className="input"
                  value={category}
                  onChange={(e) => {
                    const v = e.target.value as CategoryId;
                    setCategory(v);
                    setSub(dep.categories.find((x) => x.id === v)!.subcategories[0].id);
                  }}
                >
                  {dep.categories.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
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
          </div>
        </Card>
        <Card title="Caller">
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
            <div className="hr" />
            <div className="small muted">Recording reference {callRef} is attached to the case. Operator: {me.name}.</div>
            <button className="btn primary lg" disabled={text.trim().length < 6} onClick={submit}>
              Create incident
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
