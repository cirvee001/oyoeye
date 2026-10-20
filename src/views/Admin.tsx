import { useState } from 'react';
import { SEVERITIES, route } from '../platform/engine';
import type { CategoryId, RoutingRule, Shift } from '../platform/types';
import { dep, getState, removeRule, setDuty, subLabel, updateRule, updateSla, useStore, verifyChain } from '../store';
import { Card, dayTime, go } from '../ui';

const TARGETS = [
  { id: '@police', label: 'Police unit covering the LGA' },
  { id: '@corps', label: 'Security corps zone covering the LGA' },
  { id: '@lga', label: 'The LGA council' },
  ...dep.agencies.filter((a) => !['police', 'corps', 'lga_council', 'control_room'].includes(a.kind)).map((a) => ({ id: a.id, label: a.name })),
];
const targetLabel = (t: string) => TARGETS.find((x) => x.id === t)?.label ?? t;

export function Routing() {
  const matrix = useStore((s) => s.matrix);
  const [test, setTest] = useState<{ category: CategoryId; sub: string; lga: string }>({ category: 'security', sub: 'armed', lga: 'aki' });
  const res = route(dep, matrix, test.category, test.sub, test.lga);
  const [draft, setDraft] = useState<RoutingRule>();
  const c = dep.categories.find((x) => x.id === test.category)!;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Routing matrix</h1>
          <p>Problem type → location → responsible authority. Nothing is hard-coded: change a rule here and new reports follow it. Every change is audited.</p>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setDraft({ id: `r${Date.now() % 100000}`, category: 'waste', target: 'waste' })}>
          + Add rule
        </button>
      </div>
      <Card title="Test the router">
        <div className="row">
          <select
            className="input"
            style={{ width: 180 }}
            value={test.category}
            onChange={(e) => {
              const v = e.target.value as CategoryId;
              setTest({ ...test, category: v, sub: dep.categories.find((x) => x.id === v)!.subcategories[0].id });
            }}
          >
            {dep.categories.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <select className="input" style={{ width: 240 }} value={test.sub} onChange={(e) => setTest({ ...test, sub: e.target.value })}>
            {c.subcategories.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <select className="input" style={{ width: 200 }} value={test.lga} onChange={(e) => setTest({ ...test, lga: e.target.value })}>
            {dep.lgas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <span>→</span>
          <b>{res.agency?.name ?? 'No rule matches'}</b>
          {res.rule && <span className="badge info">rule {res.rule.id}</span>}
          {c.restricted && <span className="badge sealed">via 615 control-room triage</span>}
        </div>
      </Card>
      {draft && (
        <Card title={`Rule ${draft.id}`} right={<button className="btn sm ghost" onClick={() => setDraft(undefined)}>Cancel</button>}>
          <RuleForm rule={draft} onSave={(r) => (updateRule(r), setDraft(undefined))} />
        </Card>
      )}
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Problem type</th>
                <th>Where</th>
                <th>Responsible</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {matrix
                .slice()
                .sort((a, b) => a.category.localeCompare(b.category))
                .map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>
                      <b>{dep.categories.find((x) => x.id === r.category)?.label}</b>
                      <div className="small muted">{r.subcategory ? subLabel(r.category, r.subcategory) : 'any type'}</div>
                    </td>
                    <td className="small">{r.lgaIds?.length ? r.lgaIds.map((id) => dep.lgas.find((l) => l.id === id)?.name).join(', ') : 'All LGAs'}</td>
                    <td>{targetLabel(r.target)}</td>
                    <td className="small muted">{r.note}</td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => setDraft({ ...r })}>
                          Edit
                        </button>
                        <button className="btn sm ghost" onClick={() => confirm(`Remove rule ${r.id}?`) && removeRule(r.id)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="tiny muted">The most specific rule wins: type + place, then type, then place, then category.</p>
    </>
  );
}

function RuleForm({ rule, onSave }: { rule: RoutingRule; onSave: (r: RoutingRule) => void }) {
  const [r, setR] = useState(rule);
  const c = dep.categories.find((x) => x.id === r.category)!;
  return (
    <div className="grid g2">
      <label className="field">
        <span>Category</span>
        <select className="input" value={r.category} onChange={(e) => setR({ ...r, category: e.target.value as CategoryId, subcategory: undefined })}>
          {dep.categories.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Type</span>
        <select className="input" value={r.subcategory ?? ''} onChange={(e) => setR({ ...r, subcategory: e.target.value || undefined })}>
          <option value="">Any type</option>
          {c.subcategories.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Only in these LGAs (hold ⌘ to pick several; none = all)</span>
        <select className="input" multiple style={{ height: 120 }} value={r.lgaIds ?? []} onChange={(e) => setR({ ...r, lgaIds: [...e.target.selectedOptions].map((o) => o.value) })}>
          {dep.lgas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <div className="stack">
        <label className="field">
          <span>Responsible</span>
          <select className="input" value={r.target} onChange={(e) => setR({ ...r, target: e.target.value })}>
            {TARGETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Note</span>
          <input className="input" value={r.note ?? ''} onChange={(e) => setR({ ...r, note: e.target.value })} />
        </label>
        <button className="btn primary" onClick={() => onSave(r)}>
          Save rule
        </button>
      </div>
    </div>
  );
}

export function Sla() {
  const sla = useStore((s) => s.sla);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Service targets</h1>
          <p>Minutes, by category and severity. Acknowledge, arrive (emergencies) and resolve are separate clocks. Changes apply to new cases.</p>
        </div>
      </div>
      {dep.categories.map((c) => (
        <Card key={c.id} title={c.label} pad={false}>
          <table className="table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Acknowledge</th>
                <th>Arrive on scene</th>
                <th>Resolve</th>
              </tr>
            </thead>
            <tbody>
              {SEVERITIES.map((s) => (
                <tr key={s}>
                  <td>{s}</td>
                  {(['ack', 'arrive', 'resolve'] as const).map((f) => (
                    <td key={f}>
                      <input
                        className="input tnum"
                        style={{ width: 110 }}
                        type="number"
                        min={1}
                        placeholder="—"
                        defaultValue={sla[c.id][s][f] ?? ''}
                        onBlur={(e) => {
                          const v = e.target.value ? Number(e.target.value) : undefined;
                          if (v !== sla[c.id][s][f]) updateSla(c.id, s, f, v);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </>
  );
}

export function AuditLog() {
  const audit = useStore((s) => s.audit);
  const [q, setQ] = useState('');
  const [check, setCheck] = useState<ReturnType<typeof verifyChain>>();
  const incidents = getState().incidents;
  const refOf = (id?: string) => incidents.find((i) => i.id === id)?.ref;
  const restrictedIds = new Set(incidents.filter((i) => i.restricted).map((i) => i.id));
  const rows = audit
    .filter((e) => !q || `${e.actor} ${e.action} ${e.detail} ${refOf(e.incidentId)}`.toLowerCase().includes(q.toLowerCase()))
    .slice(-300)
    .reverse();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Append-only. Each entry carries the hash of the one before it, so any silent edit or deletion breaks the chain.</p>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setCheck(verifyChain())}>
          Verify chain
        </button>
      </div>
      {check && <div className={`notice ${check.ok ? 'good' : 'bad'}`}>{check.ok ? `Chain intact — ${audit.length.toLocaleString()} entries verified.` : `Chain broken at entry ${check.brokenAt}.`}</div>}
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by case reference, person or action (e.g. UNSEALED, Escalated, Routing rule)" />
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Who</th>
                <th>Action</th>
                <th>Case</th>
                <th>Detail</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.seq}>
                  <td className="tnum small muted">{e.seq}</td>
                  <td className="small tnum">{dayTime(e.at)}</td>
                  <td className="small">{e.actor}</td>
                  <td className="small">
                    <b style={{ color: e.action === 'IDENTITY UNSEALED' ? 'var(--sealed)' : undefined }}>{e.action}</b>
                  </td>
                  <td className="mono">{refOf(e.incidentId) ?? '—'}</td>
                  <td className="small muted">{e.incidentId && restrictedIds.has(e.incidentId) ? '[restricted case — detail hidden from administrators]' : e.detail}</td>
                  <td className="mono muted">{e.hash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export function Outbox() {
  const outbox = useStore((s) => s.outbox);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>WhatsApp / SMS outbox</h1>
          <p>What the platform would send. Officers don't need to live in a dashboard: alerts, escalations and citizen updates go to their phones.</p>
        </div>
      </div>
      {!outbox.length && <div className="empty">No messages yet. Submit a report or move the demo clock forward.</div>}
      <div className="grid g3">
        {outbox.slice(0, 60).map((m) => (
          <div key={m.id} className="stack" style={{ gap: 4 }}>
            <div className="row between tiny muted">
              <span>
                <b>{m.channel === 'whatsapp' ? 'WhatsApp' : m.channel === 'sms' ? 'SMS' : 'Push'}</b> → {m.to} · {m.phone}
              </span>
              <span>{dayTime(m.at)}</span>
            </div>
            <div className={`msg ${m.channel}`} style={{ cursor: m.incidentId ? 'pointer' : undefined }} onClick={() => m.incidentId && go(`/case/${m.incidentId}`)}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Duty roster ----------

const SHIFTS: { id: Shift; label: string }[] = [
  { id: 'morning', label: 'Morning 06–14' },
  { id: 'afternoon', label: 'Afternoon 14–22' },
  { id: 'night', label: 'Night 22–06' },
];

/** Escalation and auto-assignment pick on-duty people first, then the next role up. */
export function DutyRoster() {
  const duty = useStore((s) => s.duty);
  const [q, setQ] = useState('');
  const [agencyId, setAgencyId] = useState('pol-bdj');
  const staff = dep.people.filter((p) => p.role !== 'citizen' && p.agencyId && (q ? `${p.name} ${p.staffId}`.toLowerCase().includes(q.toLowerCase()) : p.agencyId === agencyId));
  const units = dep.agencies.filter((a) => dep.people.some((p) => p.agencyId === a.id));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Duty roster</h1>
          <p>Who is on duty right now. New cases and escalations go to on-duty people first; if nobody in a role is on duty, they go to the next role up.</p>
        </div>
      </div>
      <div className="row">
        <select className="input" style={{ width: 280 }} value={agencyId} onChange={(e) => (setAgencyId(e.target.value), setQ(''))}>
          {units.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input className="input" style={{ width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Or search any staff by name / ID" />
      </div>
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Role</th>
                <th>Unit</th>
                <th>Shift</th>
                <th>On duty</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => {
                const d = duty[p.id] ?? { on: true, shift: 'morning' as Shift };
                return (
                  <tr key={p.id}>
                    <td>
                      <span className={`duty-dot${d.on ? ' on' : ''}`} /> <b>{p.name}</b>
                      <div className="tiny muted mono">{p.staffId}</div>
                    </td>
                    <td className="small">{p.title}</td>
                    <td className="small">{dep.agencies.find((a) => a.id === p.agencyId)?.short}</td>
                    <td>
                      <select className="input" style={{ width: 170 }} value={d.shift} onChange={(e) => setDuty(p.id, d.on, e.target.value as Shift)}>
                        {SHIFTS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label className="switch">
                        <input type="checkbox" checked={d.on} onChange={(e) => setDuty(p.id, e.target.checked)} />
                        <span>{d.on ? 'On duty' : 'Off duty'}</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="tiny muted">Every change is written to the audit log. Staff can also switch their own status in the header.</p>
    </>
  );
}
