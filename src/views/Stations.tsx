import { useRef, useState } from 'react';
import { isActive } from '../platform/engine';
import type { AgencyKind, Station } from '../platform/types';
import { LEADERS, NOTICE_TYPES, setKidnapApproval, setLoneMinutes, setNoticeRule, setStationLocation, CSV_HEADER, CSV_SAMPLE, activeStaff, agency, channelOf, channelIdOf, dep, lgaOf, onboarding, onDuty, org, parseStationsCsv, person, persona, readiness, useStore, validPhone, type CsvRow } from '../store';
import { initials } from '../roles';
import { Card, CountTitle, Icon, Sheet, StatCard, Tabs, go, run } from '../ui';
import { Routing, Sla } from './Admin';
import { LiveMap } from './LiveMap';

const STATUS_LABEL: Record<NonNullable<Station['status']>, string> = { live: 'Live', setting_up: 'Setting up', suspended: 'Suspended' };
export function StationStatus({ a }: { a: Station }) {
  const st = a.status ?? 'live';
  return <span className={`pill ss-${st}`}>{STATUS_LABEL[st]}</span>;
}
export function StaffStatus({ s }: { s?: string }) {
  const st = s ?? 'active';
  return <span className={`pill sf-${st}`}>{st[0].toUpperCase() + st.slice(1)}</span>;
}

const KIND_FOR: Record<string, AgencyKind> = { police: 'police', amotekun: 'corps', fire: 'emergency', agency: 'state', lga: 'lga_council' };
const KIND_LABEL: Record<string, string> = { police: 'Police division', corps: 'Amotekun command', emergency: 'Fire station', state: 'Agency zone office', lga_council: 'LG council office' };

/** Admin: Stations & staff (PRD v2.2 §4.2). */
export function Stations() {
  useStore((s) => s.audit.length);
  const [add, setAdd] = useState(false);
  const [imp, setImp] = useState(false);
  const all = dep.agencies.filter((a) => a.kind !== 'control_room' || true);
  const staff = dep.people.filter((p) => p.role !== 'citizen');
  const groups = dep.organisations.map((o) => ({ o, rows: all.filter((a) => a.organisationId === o.id) })).filter((g) => g.rows.length);
  return (
    <>
      <div className="statgrid">
        <StatCard icon="station" label="Stations live" value={all.filter((a) => (a.status ?? 'live') === 'live').length} tone="green" />
        <StatCard icon="clock" label="Stations setting up" value={all.filter((a) => a.status === 'setting_up').length} tone="amber" />
        <StatCard icon="officers" label="Active staff" value={staff.filter(isActive).length} tone="blue" />
        <StatCard icon="inbox" label="Invites pending" value={staff.filter((p) => p.staffStatus === 'invited').length} tone="purple" />
      </div>
      <section className="card worklist">
        <div className="wl-head">
          <h2>
            <CountTitle title="Stations" n={all.length} />
          </h2>
          <button className="btn" onClick={() => setImp(true)}>
            <Icon name="upload" size={16} /> Import from spreadsheet
          </button>
          <button className="btn primary" onClick={() => setAdd(true)}>
            <Icon name="plus" size={16} /> Add station
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Organisation</th>
                <th>Covers</th>
                <th>Commander</th>
                <th>Officers</th>
                <th>Readiness</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => [
                <tr key={g.o.id} className="group-row">
                  <td colSpan={8}>{g.o.name}</td>
                </tr>,
                ...g.rows
                  .sort((a, b) => Number(b.status === 'setting_up') - Number(a.status === 'setting_up') || a.name.localeCompare(b.name))
                  .map((a) => {
                    const r = readiness(a.id);
                    const officers = dep.people.filter((p) => p.agencyId === a.id && p.role === 'officer');
                    return (
                      <tr key={a.id} className="click" onClick={() => go(`/admin/station/${a.id}`)}>
                        <td className="strong">{a.name}</td>
                        <td className="small">{org(a.organisationId)?.short}</td>
                        <td className="small">{a.lgaIds.length ? a.lgaIds.map((l) => lgaOf(l).name).join(', ') : 'Statewide'}</td>
                        <td className="small">{person(a.commanderId)?.name ?? <span className="muted">—</span>}</td>
                        <td className="tnum">
                          {officers.filter(isActive).length}
                          <span className="muted">/{officers.filter((p) => p.staffStatus === 'invited').length} invited</span>
                        </td>
                        <td>
                          <span className={`ready r${r.score}`} title={r.items.map((x) => `${x.done ? '✓' : '○'} ${x.label}`).join('\n')}>
                            {`${r.score}/4`}
                          </span>
                        </td>
                        <td>
                          <StationStatus a={a} />
                        </td>
                        <td>
                          <button className="link-btn">View</button>
                        </td>
                      </tr>
                    );
                  }),
              ])}
            </tbody>
          </table>
        </div>
      </section>
      {add && <AddStation onClose={() => setAdd(false)} />}
      {imp && <ImportStations onClose={() => setImp(false)} />}
    </>
  );
}

function AddStation({ onClose }: { onClose: () => void }) {
  const orgs = dep.organisations.filter((o) => KIND_FOR[o.kind]);
  const [orgId, setOrg] = useState('org-amo');
  const o = org(orgId)!;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AgencyKind>(KIND_FOR[o.kind]);
  const [lgaIds, setLgas] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [phone, setPhone] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number }>();
  const [mode, setMode] = useState<'invite' | 'existing'>('invite');
  const [existing, setExisting] = useState('');
  const [c, setC] = useState({ name: '', rank: o.ranks[o.ranks.length - 1], serviceNumber: '', phone: '' });
  const candidates = dep.people.filter((p) => isActive(p) && ['supervisor', 'agency_head', 'ops_manager', 'officer'].includes(p.role) && org(agency(p.agencyId)?.organisationId)?.id === orgId);
  const save = () => {
    const err = onboarding.addStation({ organisationId: orgId, name, kind, lgaIds, address, landmark, phone: phone || undefined, lat: pos?.lat, lng: pos?.lng, commanderId: mode === 'existing' ? existing || undefined : undefined, newCommander: mode === 'invite' ? c : undefined });
    if (run(err, `${name} created — Setting up. Readiness shows what is left.`)) onClose();
  };
  return (
    <Sheet title="Add station" onClose={onClose} wide>
      <div className="stack lg">
        <div className="grid g2">
          <label className="field">
            <span>Organisation</span>
            <select
              className="input"
              value={orgId}
              onChange={(e) => {
                const no = org(e.target.value)!;
                setOrg(no.id);
                setKind(KIND_FOR[no.kind]);
                setC({ ...c, rank: no.ranks[no.ranks.length - 1] });
              }}
            >
              {orgs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AgencyKind)}>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Station name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amotekun — Ido Command" />
          </label>
          <label className="field">
            <span>Station phone</span>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" />
          </label>
          <label className="field">
            <span>Address</span>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, town" />
          </label>
          <label className="field">
            <span>Landmark</span>
            <input className="input" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. opposite the LG secretariat" />
          </label>
        </div>
        <div className="field">
          <span>LGAs covered</span>
          <div className="lga-grid">
            {dep.lgas.map((l) => (
              <label key={l.id} className={`chk${lgaIds.includes(l.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={lgaIds.includes(l.id)} onChange={(e) => setLgas(e.target.checked ? [...lgaIds, l.id] : lgaIds.filter((x) => x !== l.id))} />
                {l.name}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Location — click on the map to place the station{pos ? ` (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})` : ' (default: first LGA centre)'}</span>
          <LiveMap rows={[]} controls={false} height={220} picker={{ lat: pos?.lat, lng: pos?.lng, onPick: (lat, lng) => setPos({ lat, lng }) }} />
        </div>
        <div className="field">
          <span>Commander</span>
          <div className="radios">
            <label className={mode === 'invite' ? 'on' : ''}>
              <input type="radio" checked={mode === 'invite'} onChange={() => setMode('invite')} /> Invite a new person
            </label>
            <label className={mode === 'existing' ? 'on' : ''}>
              <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} /> Pick an existing person
            </label>
          </div>
        </div>
        {mode === 'existing' ? (
          <select className="input" value={existing} onChange={(e) => setExisting(e.target.value)} aria-label="Existing commander">
            <option value="">Choose…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.rank} · {agency(p.agencyId)?.short}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid g2">
            <input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Full name" aria-label="Commander name" />
            <select className="input" value={c.rank} onChange={(e) => setC({ ...c, rank: e.target.value })} aria-label="Commander rank">
              {o.ranks.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input className="input" value={c.serviceNumber} onChange={(e) => setC({ ...c, serviceNumber: e.target.value })} placeholder="Service number" aria-label="Commander service number" />
            <input className="input" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="Phone, e.g. 0806 111 2233" aria-label="Commander phone" />
          </div>
        )}
        {mode === 'invite' && c.phone && !validPhone(c.phone) && <span className="small muted">Enter a Nigerian mobile number.</span>}
        <button className="btn primary lg block" disabled={!name.trim() || !lgaIds.length} onClick={save}>
          Save station (Setting up)
        </button>
        <p className="tiny muted center">Routing skips the station until its readiness checklist is 4/4.</p>
      </div>
    </Sheet>
  );
}

function ImportStations({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<CsvRow[]>();
  const fileRef = useRef<HTMLInputElement>(null);
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_HEADER + '\n')}`;
  const valid = rows?.filter((r) => !r.errors.length) ?? [];
  return (
    <Sheet title="Import stations from a spreadsheet" onClose={onClose} wide>
      <div className="stack lg">
        <p className="small muted">
          One row per station. Columns: <span className="mono">{CSV_HEADER}</span>. Separate several LGAs with “;”.
        </p>
        <div className="row">
          <a className="btn" href={template} download="oyoeye-stations-template.csv">
            <Icon name="download" size={16} /> Download CSV template
          </a>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Upload file
          </button>
          <button className="btn good" onClick={() => setRows(parseStationsCsv(CSV_SAMPLE))}>
            Use sample file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setRows(parseStationsCsv(await f.text()));
            }}
          />
        </div>
        {rows && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Station</th>
                  <th>Organisation</th>
                  <th>LGAs</th>
                  <th>Commander</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={r.errors.length ? 'bad-row' : ''}>
                    <td className="tnum">{r.line}</td>
                    <td className="strong">{r.station}</td>
                    <td className="small">{r.organisation}</td>
                    <td className="small">{r.lgas}</td>
                    <td className="small">
                      {r.commander_name} · {r.commander_rank} · {r.commander_phone}
                    </td>
                    <td className="small">{r.errors.length ? <span className="clk bad">{r.errors.join('; ')}</span> : <span className="clk good">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          className="btn primary lg block"
          disabled={!valid.length}
          onClick={() => {
            const res = onboarding.importStations(valid);
            if (run(res.error, `${res.created} station(s) imported as Setting up. Their commanders were sent activation codes.`)) onClose();
          }}
        >
          Import {valid.length} valid row{valid.length === 1 ? '' : 's'}
        </button>
      </div>
    </Sheet>
  );
}

/** Station page: details, readiness, members, chat (admins see members but never messages). */
export function StationPage({ id }: { id: string }) {
  useStore((s) => s.audit.length);
  const duty = useStore((s) => s.duty);
  const me = persona();
  const a = agency(id);
  if (!a) return <div className="empty">Station not found.</div>;
  const r = readiness(a.id);
  const members = dep.people.filter((p) => p.agencyId === a.id && p.role !== 'citizen');
  const ch = channelOf(channelIdOf(a.id));
  return (
    <div className="detail">
      <button className="backlink" onClick={() => go('/admin/stations')}>
        <Icon name="back" size={18} /> Stations & staff
      </button>
      <section className="card case-head">
        <div className="ch-row">
          <span className="avatar lg">{initials(a.short)}</span>
          <div className="ch-main">
            <div className="row" style={{ gap: 8 }}>
              <StationStatus a={a} />
              <span className={`ready r${r.score}`}>{`Readiness ${r.score}/4`}</span>
            </div>
            <h1>{a.name}</h1>
            <p className="muted small">
              {org(a.organisationId)?.name} · covers {a.lgaIds.length ? a.lgaIds.map((l) => lgaOf(l).name).join(', ') : 'all LGAs'}
            </p>
          </div>
        </div>
      </section>
      <Card title="Details">
        <div className="inforow">
          {(
            [
              ['Organisation', org(a.organisationId)?.short],
              ['Type', KIND_LABEL[a.kind] ?? a.kind],
              ['Commander', person(a.commanderId) ? `${person(a.commanderId)!.name}${person(a.commanderId)!.staffStatus === 'invited' ? ' (invited)' : ''}` : '—'],
              ['Station phone', a.phone],
              ['Address', a.address],
              ['Landmark', a.landmark],
              ['Created', a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-GB') : 'At launch'],
              ['Routing', (a.status ?? 'live') === 'live' ? 'Receives new cases' : 'Skipped until live'],
            ] as [string, string | undefined][]
          ).map(([k, v]) => (
            <div key={k}>
              <div className="ir-label">{k}</div>
              <div className="ir-value">{v || '—'}</div>
            </div>
          ))}
        </div>
      </Card>
      <StationLocation id={a.id} />
      <Card title="Readiness checklist" right={<span className="small muted">A station turns Live at 4/4</span>}>
        <ul className="checklist">
          {r.items.map((x) => (
            <li key={x.label} className={x.done ? 'done' : ''}>
              <span className="ck">{x.done ? '✓' : ''}</span>
              {x.label}
              {'detail' in x && x.detail ? <span className="muted small"> · {x.detail}</span> : null}
            </li>
          ))}
        </ul>
        {!r.items[3].done && (
          <button className="btn" onClick={() => run(onboarding.runTestCase(a.id), 'Test case recorded.')}>
            Mark test case completed
          </button>
        )}
      </Card>
      <Card title={<CountTitle title="Members" n={members.length} />} pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Rank</th>
                <th>Service no.</th>
                <th>Role</th>
                <th>On duty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.name}</td>
                  <td className="small">{p.rank}</td>
                  <td className="mono">{p.serviceNumber}</td>
                  <td className="small">{p.title}</td>
                  <td>
                    <span className={`duty-dot${isActive(p) && duty[p.id]?.on ? ' on' : ''}`} /> <span className="small muted">{isActive(p) && onDuty(p.id) && duty[p.id] ? 'On duty' : 'Off'}</span>
                  </td>
                  <td>
                    <StaffStatus s={p.staffStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Station chat">
        <p className="small">
          <b>{ch?.name}</b> · {ch?.memberIds.length ?? 0} members{ch?.monitorIds.length ? `, monitored by the control room` : ''}.
        </p>
        <p className="small muted">{me.role === 'admin' ? 'Administrators can see who is in a chat but never its messages.' : 'Open Chat to read and post.'}</p>
        <p className="tiny muted">Active now: {activeStaff(a.id).length} staff.</p>
      </Card>
    </div>
  );
}

/** Admin "Rules": Routing · Service targets · Community notices. */
export function Rules({ tab: t0 = 'routing' }: { tab?: 'routing' | 'sla' | 'notices' }) {
  const [tab, setTab] = useState<'routing' | 'sla' | 'notices'>(t0);
  return (
    <section className="card reports">
      <div className="wl-head">
        <h2>Rules</h2>
      </div>
      <Tabs<'routing' | 'sla' | 'notices'>
        tabs={[
          { id: 'routing', label: 'Routing' },
          { id: 'sla', label: 'Service targets' },
          { id: 'notices', label: 'Community notices' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="reports-body">
        {tab === 'routing' ? (
          <Routing />
        ) : tab === 'sla' ? (
          <>
            <LoneSetting />
            <Sla />
          </>
        ) : (
          <NoticeRules />
        )}
      </div>
    </section>
  );
}

function LoneSetting() {
  const mins = useStore((s) => s.loneCheckMins);
  const [v, setV] = useState(String(mins));
  return (
    <Card title="Lone-worker check-in">
      <div className="row">
        <span className="small">An officer working alone on scene is asked "Are you OK?" every</span>
        <input className="input tnum" style={{ width: 90 }} type="number" min={5} max={120} value={v} onChange={(e) => setV(e.target.value)} aria-label="Lone-worker check-in minutes" />
        <span className="small">minutes. No answer in 3 minutes raises an Officer SOS.</span>
        <button className="btn sm primary" onClick={() => run(setLoneMinutes(Number(v)), 'Saved.')}>
          Save
        </button>
      </div>
    </Card>
  );
}

const NOTICE_LABEL: Record<string, string> = { armed: 'Armed persons / shooting', robbery: 'Robbery', kidnapping: 'Kidnapping', violence: 'Violence / clash', suspicious: 'Suspicious activity', threat: 'Threats / extortion', sos: 'SOS' };
const NOTICE_SAMPLE = 'OyoEye 615: A security incident has been reported in <area>. Response units have been dispatched. Please keep calm and report anything you see to 615.';

function NoticeRules() {
  const rules = useStore((s) => s.noticeRules);
  return (
    <div className="stack lg">
      <p className="small muted">
        When an operator verifies a <b>High</b> or <b>Critical</b> security case in a traditional ruler's area, OyoEye sends them an SMS: “{NOTICE_SAMPLE}” It never names the type, the people or the reporter.
      </p>
      <Card title="Send notices for" pad={false}>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {NOTICE_TYPES.map((t) => (
                <tr key={t}>
                  <td>{NOTICE_LABEL[t] ?? t}</td>
                  <td>
                    <label className="switch">
                      <input type="checkbox" checked={!!rules.enabled[t]} onChange={(e) => setNoticeRule(t, e.target.checked)} aria-label={NOTICE_LABEL[t]} />
                      <span>{rules.enabled[t] ? 'On' : 'Off'}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <label className="switch">
        <input type="checkbox" checked={rules.kidnapApproval} onChange={(e) => setKidnapApproval(e.target.checked)} />
        <span>Kidnapping: notify only after the security coordinator approves</span>
      </label>
      <Card title={`Traditional-ruler contacts (${LEADERS.length})`} pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Name</th>
                <th>LGA</th>
                <th>Areas</th>
              </tr>
            </thead>
            <tbody>
              {LEADERS.map((l) => (
                <tr key={l.id}>
                  <td className="strong">{l.title}</td>
                  <td>{l.name}</td>
                  <td className="small">{lgaOf(l.lgaId).name}</td>
                  <td className="small">{l.areas.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StationLocation({ id }: { id: string }) {
  const me = persona();
  const a = agency(id)!;
  const [pos, setPos] = useState<{ lat: number; lng: number }>();
  if (me.role !== 'admin') return null;
  return (
    <Card title="Location" right={<span className="small muted">Click on the map to move the station</span>}>
      <LiveMap rows={[]} controls={false} height={240} picker={{ lat: pos?.lat ?? a.lat, lng: pos?.lng ?? a.lng, onPick: (lat, lng) => setPos({ lat, lng }) }} />
      <div className="row" style={{ marginTop: 8 }}>
        <span className="small muted">
          {(pos?.lat ?? a.lat)?.toFixed(4)}, {(pos?.lng ?? a.lng)?.toFixed(4)}
        </span>
        {pos && (
          <button className="btn sm primary" onClick={() => run(setStationLocation(id, pos.lat, pos.lng), 'Station location saved.') && setPos(undefined)}>
            Save location
          </button>
        )}
      </div>
    </Card>
  );
}
