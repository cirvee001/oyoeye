import { fmtLong, fmtNum, fmtTimeWat, lagosHour } from '../format';
import { useState, type ReactNode } from 'react';
import { countBy, hotspots, lastDays, metrics, securityClusters, startOfDay } from '../platform/analytics';
import { DAY, HOUR, dur, isOpen, isOverdue } from '../platform/engine';
import type { CategoryId, Incident } from '../platform/types';
import { agency, cat, dep, lgaOf, persona, subLabel, useStore } from '../store';
import { Bars, Card, CaseTable, Sev, Stat, dayTime, pct, useNow } from '../ui';
import { LiveMap } from './LiveMap';

const catLabel = (c: CategoryId) => cat(c).label;
const pctChange = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;

// ---------- Security picture ----------

export function SecurityPicture() {
  const at = useNow(10_000);
  const all = useStore((s) => s.incidents);
  const me = persona();
  const sec = lastDays(all, at, 7).filter((i) => i.category === 'security');
  const visible = sec.filter((i) => !i.sensitiveOnly);
  const m = metrics(visible, at);
  const triage = visible.filter((i) => i.t.verified).map((i) => i.t.verified! - i.createdAt);
  const clusters = securityClusters(all, at);
  const hours = Array.from({ length: 24 }, (_, h) => visible.filter((i) => lagosHour(i.createdAt) === h).length);
  const units = dep.agencies.filter((a) => a.kind === 'police' || a.kind === 'corps');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Security picture</h1>
          <p>Last 7 days. Patterns describe places and times — never individuals. Restricted-desk cases appear only as counts.</p>
        </div>
      </div>
      <div className="stats">
        <Stat k="Security incidents" v={m.total} s={`${m.reports} reports · ${sec.length - visible.length} restricted`} />
        <Stat k="Median triage" v={dur(triage.length ? triage.sort((a, b) => a - b)[Math.floor(triage.length / 2)] : 0)} s="report → operator decision" />
        <Stat k="Median time to scene" v={dur(m.medianArrive)} />
        <Stat k="Arrived within target" v={pct(m.arriveWithin, m.arrived)} alert={m.arrived > 0 && m.arriveWithin / m.arrived < 0.7} />
        <Stat k="False alarm / invalid" v={pct(m.invalid, m.total)} s={`${m.invalid} closed by operators`} />
        <Stat k="Critical" v={m.critical} />
      </div>
      <Card title="Pattern alerts" right={<span className="small muted">3+ incidents at one place in 72h</span>}>
        {!clusters.length ? (
          <div className="empty">No clusters</div>
        ) : (
          <div className="grid g2">
            {clusters.map((c) => (
              <div key={c.lgaId + c.area} className="notice warn stack" style={{ gap: 6 }}>
                <div className="row between">
                  <b>
                    {c.area}, {lgaOf(c.lgaId).name}
                  </b>
                  <span className="badge bad">{c.incidents.length} incidents</span>
                </div>
                <div className="small">
                  {c.types.map(([t, n]) => `${subLabel('security', t)} ×${n}`).join(' · ')}
                </div>
                <div className="small muted">
                  {dayTime(c.first)} → {dayTime(c.last)} · {c.night} at night · {c.reports} citizen reports
                </div>
                <div className="small">
                  Suggested: increase night patrol visibility around {c.area}; brief {agency(dep.agencies.find((a) => a.kind === 'corps' && a.lgaIds.includes(c.lgaId))?.id)?.short}.
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid g2">
        <Card title="Security map">
          <LiveMap rows={sec} height={460} page="security-picture" />
        </Card>
        <div className="stack lg">
          <Card title="By type">
            <Bars rows={countBy(sec, (i) => i.subcategory ?? 'other').map(([t, n]) => ({ label: subLabel('security', t), n }))} />
          </Card>
          <Card title="By hour of day">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2, alignItems: 'end', height: 80 }}>
              {hours.map((n, h) => (
                <div key={h} title={`${h}:00 — ${n}`} style={{ height: `${(n / Math.max(1, ...hours)) * 100}%`, minHeight: 2, background: h >= 19 || h < 5 ? 'var(--sealed)' : 'var(--brand)', borderRadius: 2 }} />
              ))}
            </div>
            <div className="row between tiny muted" style={{ marginTop: 4 }}>
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
          </Card>
        </div>
      </div>
      <Card title="Unit performance" pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Cases</th>
                <th>Acknowledged in target</th>
                <th>Arrived in target</th>
                <th>Median to scene</th>
                <th>Open</th>
                <th>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const rows = visible.filter((i) => i.agencyId === u.id);
                const um = metrics(rows, at);
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="tnum">{um.total}</td>
                    <td className="tnum">{pct(um.ackWithin, um.acked)}</td>
                    <td className="tnum">{pct(um.arriveWithin, um.arrived)}</td>
                    <td className="tnum">{um.arrived ? dur(um.medianArrive) : '—'}</td>
                    <td className="tnum">{um.open}</td>
                    <td className="tnum">{um.overdue ? <span className="badge bad">{um.overdue}</span> : 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {me.role === 'executive' && <p className="tiny muted">Executive view shows no reporter identities. Case details open read-only and each view is logged.</p>}
    </>
  );
}

// ---------- Morning brief & command search ----------

export function Brief() {
  const at = useNow(30_000);
  const all = useStore((s) => s.incidents).filter((i) => !i.sensitiveOnly);
  const y0 = startOfDay(at) - DAY;
  const y1 = startOfDay(at);
  const yest = all.filter((i) => i.createdAt >= y0 && i.createdAt < y1);
  const m = metrics(yest, at);
  const critical = yest.filter((i) => i.severity === 'critical');
  const escalated = yest.filter((i) => i.escalationLevel >= 4);
  const overdue = all.filter((i) => isOverdue(i, at) && (i.severity === 'critical' || i.severity === 'high'));
  const hot = hotspots(dep, all, at);
  const clusters = securityClusters(all, at);
  const big = all.filter((i) => i.reports.length >= 5 && i.createdAt > y0).sort((a, b) => b.reports.length - a.reports.length);
  const lastWeek = all.filter((i) => i.category === 'waste' && i.createdAt >= y1 - 7 * DAY && i.createdAt < y1).length;
  const prevWeek = all.filter((i) => i.category === 'waste' && i.createdAt >= y1 - 14 * DAY && i.createdAt < y1 - 7 * DAY).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{dep.product} morning brief</h1>
          <p>{fmtLong(at)} · {fmtTimeWat(at)} · generated from platform records</p>
        </div>
      </div>
      <Ask />
      <div className="grid g2">
        <Card title="Yesterday">
          <div className="stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Stat k="Citizen reports" v={fmtNum(m.reports)} />
            <Stat k="Resolved" v={m.resolved} />
            <Stat k="Still active" v={m.open} />
            <Stat k="Awaiting citizen confirmation" v={yest.filter((i) => i.status === 'resolved' && cat(i.category).citizenVerification).length} />
          </div>
        </Card>
        <Card title="Significant events">
          <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
            {big.slice(0, 2).map((i) => (
              <li key={i.id}>
                {subLabel(i.category, i.subcategory)} cluster at <b>{i.area}</b> — {i.reports.length} citizen reports merged into one incident.
              </li>
            ))}
            {clusters.slice(0, 2).map((c) => (
              <li key={c.area}>
                Repeated security reports around <b>{c.area}, {lgaOf(c.lgaId).name}</b> ({c.incidents.length} in 72h, {c.night} at night).
              </li>
            ))}
            {critical.filter((i) => i.restricted).length > 0 && <li>{critical.filter((i) => i.restricted).length} critical security incidents; {escalated.filter((i) => i.restricted).length} escalated to the security coordinator or above.</li>}
            {critical.filter((i) => i.category === 'fire').length > 0 && <li>{critical.filter((i) => i.category === 'fire').length} critical fire incidents.</li>}
          </ul>
        </Card>
        <Card title="Attention required">
          <p>
            <b>{overdue.length}</b> priority incidents are past their operational targets.
          </p>
          <div style={{ marginTop: 10 }}>
            <Bars rows={countBy(overdue, (i) => i.agencyId).slice(0, 5).map(([id, n]) => ({ label: agency(id)?.short ?? id, n }))} color="var(--crit)" />
          </div>
        </Card>
        <Card title="Emerging patterns">
          <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
            {hot.slice(0, 3).map((h) => (
              <li key={h.lga.id + h.category}>
                {catLabel(h.category)} reports in {h.lga.name} {pctChange(h.change)} (last 72h vs previous).
              </li>
            ))}
            {prevWeek > 0 && (
              <li>
                Waste complaints {pctChange((lastWeek - prevWeek) / prevWeek)} week-on-week statewide.
              </li>
            )}
            {!hot.length && <li>No unusual trends.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

const CAT_WORDS: [RegExp, CategoryId][] = [
  [/flood|drain/, 'flooding'],
  [/road|pothole/, 'roads'],
  [/waste|refuse|rubbish/, 'waste'],
  [/fire/, 'fire'],
  [/secur|crime|robber|kidnap|attack/, 'security'],
  [/infrastruct|streetlight|pole|pipe|electric/, 'infrastructure'],
];

function answer(q: string, all: Incident[], at: number): { text: string; rows?: Incident[]; bars?: { label: ReactNode; n: number }[] } {
  const s = q.toLowerCase();
  let rows = all;
  const bits: string[] = [];
  const c = CAT_WORDS.find(([re]) => re.test(s))?.[1];
  if (c) {
    rows = rows.filter((i) => i.category === c);
    bits.push(catLabel(c).toLowerCase());
  }
  if (/unresolved|open|active|outstanding/.test(s)) {
    rows = rows.filter(isOpen);
    bits.unshift('unresolved');
  } else if (/overdue|breach|late|outside/.test(s)) {
    rows = rows.filter((i) => isOverdue(i, at) || (i.t.resolved && i.t.resolved > i.resolveDueAt));
    bits.unshift('overdue / target-breached');
  } else if (/resolved|fixed|closed/.test(s)) {
    rows = rows.filter((i) => i.status === 'closed' || i.status === 'resolved');
    bits.unshift('resolved');
  }
  const hrs = s.match(/(\d+)\s*(h|hour)/);
  const days = s.match(/(\d+)\s*(d|day)/);
  if (hrs) rows = rows.filter((i) => i.createdAt > at - Number(hrs[1]) * HOUR), bits.push(`last ${hrs[1]}h`);
  else if (days) rows = rows.filter((i) => i.createdAt > at - Number(days[1]) * DAY), bits.push(`last ${days[1]} days`);
  else if (/today/.test(s)) rows = rows.filter((i) => i.createdAt >= startOfDay(at)), bits.push('today');
  else if (/this week|week/.test(s)) rows = rows.filter((i) => i.createdAt > at - 7 * DAY), bits.push('this week');
  const lga = dep.lgas.slice().sort((a, b) => b.name.length - a.name.length).find((l) => s.includes(l.name.toLowerCase()));
  if (lga) rows = rows.filter((i) => i.lgaId === lga.id), bits.push(`in ${lga.name}`);
  else if (/ibadan/.test(s)) rows = rows.filter((i) => lgaOf(i.lgaId).metro), bits.push('in Ibadan metro');
  const area = dep.lgas.flatMap((l) => l.areas).find((a) => s.includes(a.toLowerCase()));
  if (area && !lga) rows = rows.filter((i) => i.area === area), bits.push(`at ${area}`);

  if (/summary|brief/.test(s)) {
    const m = metrics(rows.filter((i) => i.createdAt >= startOfDay(at)), at);
    return { text: `Today so far: ${m.reports} reports (${m.total} incidents), ${m.resolved} resolved, ${m.open} active, ${m.criticalOpen} critical still active, ${m.overdue} overdue.` };
  }
  if (/which lga|lgas|by lga/.test(s)) {
    const bars = countBy(rows, (i) => i.lgaId).slice(0, 8).map(([id, n]) => ({ label: lgaOf(id).name, n }));
    return { text: `${bits.join(' ') || 'All'} incidents by LGA:`, bars };
  }
  if (/which agenc|agencies|by agency/.test(s)) {
    const bars = countBy(rows, (i) => i.agencyId).slice(0, 8).map(([id, n]) => ({ label: agency(id)?.short ?? id, n }));
    return { text: `${bits.join(' ') || 'All'} incidents by agency:`, bars };
  }
  // "12 unresolved flooding incidents last 72h in Ibadan metro"
  const scope = (b: string) => /^(last|in |at |today|this week)/.test(b);
  const label = [bits.filter((b) => !scope(b)).join(' '), 'incidents', ...bits.filter(scope)].filter(Boolean).join(' ');
  return { text: `${rows.length} ${label}${rows.length > 20 ? ' — showing the 20 most recent' : ''}.`, rows: rows.slice(0, 20) };
}

function Ask() {
  const at = useNow(30_000);
  const all = useStore((s) => s.incidents).filter((i) => !i.sensitiveOnly);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ReturnType<typeof answer>>();
  const examples = ['Show unresolved flooding incidents in Ibadan from the last 72 hours', 'Which LGAs currently have the highest number of unresolved road reports?', "Give me today's summary", 'Which agencies have breached response targets this week?'];
  return (
    <Card title="Ask OyoEye" right={<span className="tiny muted">Answers come only from platform records</span>}>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setRes(answer(q, all, at));
        }}
      >
        <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about incidents, places, agencies, time…" />
        <button className="btn primary">Ask</button>
      </form>
      <div className="chips" style={{ marginTop: 8 }}>
        {examples.map((x) => (
          <button
            key={x}
            className="chip"
            onClick={() => {
              setQ(x);
              setRes(answer(x, all, at));
            }}
          >
            {x}
          </button>
        ))}
      </div>
      {res && (
        <div className="stack" style={{ marginTop: 12 }}>
          <b>{res.text}</b>
          {res.bars && <Bars rows={res.bars} />}
          {res.rows && <CaseTable rows={res.rows} at={at} />}
        </div>
      )}
    </Card>
  );
}

// ---------- Agency performance ----------

export function Performance() {
  const me = persona();
  const at = useNow(30_000);
  const all = useStore((s) => s.incidents);
  const own = agency(me.agencyId);
  const oversight = !own || own.kind === 'control_room';
  const choices = dep.agencies.filter((a) => (own?.kind === 'control_room' ? ['police', 'corps'].includes(a.kind) : !['control_room', 'sensitive_desk', 'lga_council'].includes(a.kind)));
  const [sel, setSel] = useState(oversight ? '' : own!.id);
  const week = lastDays(all, at, 7).filter((i) => !i.sensitiveOnly);

  if (!sel)
    return (
      <>
        <div className="page-head">
          <div>
            <h1>{own?.kind === 'control_room' ? 'Unit performance' : 'Agency performance'}</h1>
            <p>Last 7 days. Operational facts, not ratings.</p>
          </div>
        </div>
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Assigned</th>
                  <th>Acknowledged in target</th>
                  <th>Resolved in target</th>
                  <th>Median resolution</th>
                  <th>Open</th>
                  <th>Overdue</th>
                  <th>Reopened</th>
                  <th>Citizen confirmed</th>
                </tr>
              </thead>
              <tbody>
                {choices
                  .map((a) => ({ a, m: metrics(week.filter((i) => i.agencyId === a.id), at) }))
                  .filter((x) => x.m.total)
                  .sort((x, y) => y.m.overdue - x.m.overdue)
                  .map(({ a, m }) => (
                    <tr key={a.id} className="click" onClick={() => setSel(a.id)}>
                      <td>{a.name}</td>
                      <td className="tnum">{m.total}</td>
                      <td className="tnum">{pct(m.ackWithin, m.acked)}</td>
                      <td className="tnum">{pct(m.resolvedWithin, m.resolved)}</td>
                      <td className="tnum">{m.resolved ? dur(m.medianResolve) : '—'}</td>
                      <td className="tnum">{m.open}</td>
                      <td className="tnum">{m.overdue ? <span className="badge bad">{m.overdue}</span> : 0}</td>
                      <td className="tnum">{m.reopened}</td>
                      <td className="tnum">{pct(m.verifiedYes, m.verified)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </>
    );

  const a = agency(sel)!;
  const rows = week.filter((i) => i.agencyId === sel);
  const allRows = all.filter((i) => i.agencyId === sel);
  const m = metrics(rows, at);
  const officers = dep.people.filter((p) => p.agencyId === sel && p.role === 'officer');
  const ageing = allRows.filter(isOpen).map((i) => at - i.createdAt);
  const bucket = (lo: number, hi: number) => ageing.filter((x) => x >= lo * HOUR && x < hi * HOUR).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{a.name}</h1>
          <p>Last 7 days</p>
        </div>
        <div className="spacer" />
        {oversight && (
          <button className="btn" onClick={() => setSel('')}>
            All agencies
          </button>
        )}
      </div>
      <div className="stats">
        <Stat k="Assigned" v={m.total} />
        <Stat k="Acknowledged in target" v={pct(m.ackWithin, m.acked)} />
        <Stat k="Resolved in target" v={pct(m.resolvedWithin, m.resolved)} />
        <Stat k="Median acknowledgement" v={dur(m.medianAck)} />
        <Stat k="Median resolution" v={m.resolved ? dur(m.medianResolve) : '—'} />
        <Stat k="Open now" v={allRows.filter(isOpen).length} />
        <Stat k="Overdue" v={allRows.filter((i) => isOverdue(i, at)).length} alert />
        <Stat k="Reopened" v={m.reopened} />
        <Stat k="Citizen confirmed" v={pct(m.verifiedYes, m.verified)} />
      </div>
      <div className="grid g3">
        <Card title="Officer workload" pad={false}>
          <table className="table">
            <thead>
              <tr>
                <th>Officer</th>
                <th>Open</th>
                <th>Closed (7d)</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td className="tnum">{allRows.filter((i) => i.officerId === o.id && isOpen(i)).length}</td>
                  <td className="tnum">{rows.filter((i) => i.officerId === o.id && !isOpen(i)).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="By LGA">
          <Bars rows={countBy(rows, (i) => i.lgaId).slice(0, 8).map(([id, n]) => ({ label: lgaOf(id).name, n }))} />
        </Card>
        <Card title="Unresolved ageing">
          <Bars
            rows={[
              { label: '< 6 hours', n: bucket(0, 6) },
              { label: '6–24 hours', n: bucket(6, 24) },
              { label: '1–3 days', n: bucket(24, 72) },
              { label: '3–7 days', n: bucket(72, 168) },
              { label: '> 7 days', n: bucket(168, 1e6) },
            ]}
            color="var(--high)"
          />
        </Card>
      </div>
      <Card title="Overdue cases" pad={false}>
        <CaseTable rows={allRows.filter((i) => isOverdue(i, at))} at={at} empty="Nothing overdue" />
      </Card>
    </>
  );
}

// ---------- Public transparency ----------

export function Transparency() {
  const at = useNow(60_000);
  const all = useStore((s) => s.incidents);
  const month = lastDays(all, at, 30);
  const civic = month.filter((i) => !i.restricted);
  const sec = month.filter((i) => i.restricted);
  const m = metrics(civic, at);
  const sm = metrics(sec.filter((i) => !i.sensitiveOnly), at);
  const fixed = civic.filter((i) => i.status === 'closed' && i.verification === 'yes').sort((a, b) => (b.t.resolved ?? 0) - (a.t.resolved ?? 0)).slice(0, 8);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{dep.product} Transparency</h1>
          <p>Public, aggregated figures for {dep.state} State. No reporter identities, security locations, operations or restricted cases are published.</p>
        </div>
      </div>
      <div className="stats">
        <Stat k="Reports this period" v={fmtNum(m.reports + sm.reports)} />
        <Stat k="Civic issues resolved" v={m.resolved} s={pct(m.resolved, m.total)} />
        <Stat k="Median civic resolution" v={dur(m.medianResolve)} />
        <Stat k="Confirmed fixed by citizens" v={pct(m.verifiedYes, m.verified)} />
        <Stat k="Security reports handled" v={sec.length} s={`median time to scene ${dur(sm.medianArrive)}`} />
      </div>
      <div className="grid g2">
        <Card title="Issues by category">
          <Bars rows={countBy(civic, (i) => i.category).map(([c, n]) => ({ label: catLabel(c), n }))} />
        </Card>
        <Card title="Issues by LGA (civic)">
          <Bars rows={countBy(civic, (i) => i.lgaId).slice(0, 10).map(([id, n]) => ({ label: lgaOf(id).name, n }))} />
        </Card>
      </div>
      <Card title="Recently fixed and confirmed by residents" pad={false}>
        <table className="table">
          <tbody>
            {fixed.map((i) => (
              <tr key={i.id}>
                <td>
                  <Sev s={i.severity} />
                </td>
                <td>{subLabel(i.category, i.subcategory)}</td>
                <td>
                  {i.area}, {lgaOf(i.lgaId).name}
                </td>
                <td className="small muted">{agency(i.agencyId)?.short}</td>
                <td className="small tnum">fixed in {dur((i.t.resolved ?? at) - i.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="tiny muted">Figures cover the last 30 days and are generated from platform records. Security figures are statewide totals only.</p>
    </>
  );
}
