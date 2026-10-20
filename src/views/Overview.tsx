import { metrics, startOfDay } from '../platform/analytics';
import { DAY, dur, isOpen, isOverdue, pendingHandoff } from '../platform/engine';
import type { Incident, Status } from '../platform/types';
import { STATUS_COLOR, statusLabel } from '../i18n';
import { roleKind, roleName } from '../roles';
import { canDecide, cat, conductScore, dep, getState, persona, useStore, verifyChain } from '../store';
import { LiveMap } from './LiveMap';
import { Complaints } from './Oversight';
import { CaseTable, Card, StatCard, dayTime, go, pct, useNow } from '../ui';
import { scopeFor, urgentFirst } from './Cases';

const STATUS_ROWS: Status[] = ['pending', 'verified', 'assigned', 'accepted', 'in_progress', 'resolved', 'closed', 'reopened', 'rejected', 'referred'];

/** Cases by status — the one chart on every Overview. */
export function StatusChart({ rows, title = 'Cases by status — last 7 days' }: { rows: Incident[]; title?: string }) {
  const by = STATUS_ROWS.map((st) => ({ st, n: rows.filter((i) => i.status === st).length }));
  const max = Math.max(1, ...by.map((x) => x.n));
  return (
    <Card title={title}>
      <div className="vbars" role="img" aria-label="Cases by status">
        {by.map((x) => (
          <div key={x.st} className="vbar" title={`${statusLabel({ status: x.st })}: ${x.n}`}>
            <span className="vn tnum">{x.n}</span>
            <span className="vfill" style={{ height: `${(x.n / max) * 100}%`, background: STATUS_COLOR[x.st] }} />
            <span className="vl">{statusLabel({ status: x.st })}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Overview() {
  const me = persona();
  const at = useNow(10_000);
  const incidents = useStore((s) => s.incidents);
  const duty = useStore((s) => s.duty);
  const audit = useStore((s) => s.audit);
  const kind = roleKind(me);
  const scope = kind === 'gov' || kind === 'admin' ? incidents.filter((i) => !i.sensitiveOnly) : scopeFor(me, incidents);
  const week = scope.filter((i) => i.createdAt > at - 7 * DAY);
  const today0 = startOfDay(at);
  const open = scope.filter(isOpen);
  const toAccept = (i: Incident) => {
    const h = pendingHandoff(i);
    return i.status === 'assigned' && ((!!h && canDecide(me, h)) || (i.agencyId === me.agencyId && !i.officerId));
  };

  let stats: { icon: string; label: string; value: string | number; sub?: string; tone: 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'grey'; to?: string }[] = [];
  let action: Incident[] = [];
  let actionTitle = 'Needs your action';

  if (kind === 'operator' || kind === 'lead') {
    const pending = scope.filter((i) => i.status === 'pending' || i.status === 'verified');
    stats = [
      { icon: 'alert', label: 'Pending review', value: pending.length, sub: `${pending.filter((i) => i.reports[0].channel === 'sos').length} SOS`, tone: pending.length ? 'red' : 'green', to: '/cases' },
      { icon: 'pass', label: 'Assigned, not accepted', value: scope.filter((i) => i.status === 'assigned').length, tone: 'blue' },
      { icon: 'clock', label: 'In progress', value: scope.filter((i) => ['accepted', 'in_progress', 'reopened'].includes(i.status)).length, tone: 'amber' },
      { icon: 'done', label: 'Closed today', value: scope.filter((i) => (i.status === 'closed' || i.status === 'referred') && (i.t.closed ?? 0) >= today0).length, tone: 'green' },
    ];
    action = [...pending, ...(kind === 'lead' ? open.filter((i) => i.escalationLevel >= 3 && !pending.includes(i)) : [])].sort(urgentFirst);
  } else if (kind === 'commander' || kind === 'agency') {
    const signOff = scope.filter((i) => i.status === 'resolved' && i.agencyId === me.agencyId && !cat(i.category).citizenVerification);
    const waiting = scope.filter(toAccept);
    stats = [
      { icon: 'inbox', label: 'Waiting for us to accept', value: waiting.length, tone: waiting.length ? 'red' : 'green', to: '/cases' },
      { icon: 'clock', label: 'In progress', value: scope.filter((i) => i.status === 'in_progress').length, tone: 'amber' },
      { icon: 'done', label: 'Resolved, needs sign-off', value: signOff.length, sub: `${scope.filter((i) => i.status === 'resolved').length - signOff.length} waiting for citizens`, tone: 'blue' },
      { icon: 'alert', label: 'Overdue', value: open.filter((i) => isOverdue(i, at)).length, tone: 'red' },
    ];
    action = [...waiting, ...signOff, ...scope.filter((i) => i.status === 'reopened')].sort(urgentFirst);
  } else if (kind === 'desk') {
    const pending = scope.filter((i) => i.status === 'pending');
    stats = [
      { icon: 'alert', label: 'Waiting to be taken', value: pending.length, tone: pending.length ? 'red' : 'green' },
      { icon: 'clock', label: 'Open', value: open.length, tone: 'amber' },
      { icon: 'done', label: 'Closed (7 days)', value: week.filter((i) => !isOpen(i)).length, tone: 'green' },
      { icon: 'security', label: 'Identity unseals', value: audit.filter((e) => e.action === 'IDENTITY UNSEALED').length, sub: 'each reviewed by the coordinator', tone: 'purple' },
    ];
    action = pending.sort(urgentFirst);
  } else if (kind === 'coord' || kind === 'gov') {
    const m = metrics(scope.filter((i) => i.createdAt >= today0), at);
    const day = metrics(scope.filter((i) => i.createdAt > at - DAY), at);
    stats = [
      { icon: 'cases', label: 'Open cases', value: open.length, sub: `${m.reports} reports today`, tone: 'blue' },
      { icon: 'alert', label: 'Critical open', value: open.filter((i) => i.severity === 'critical').length, sub: `${open.filter((i) => i.severity === 'critical' && isOverdue(i, at)).length} past target`, tone: 'red' },
      { icon: 'clock', label: 'Median arrival today', value: m.arrived ? dur(m.medianArrive) : '—', sub: `${m.arrived} emergency arrivals`, tone: 'amber' },
      { icon: 'done', label: 'Acknowledged on time', value: pct(day.ackWithin, day.acked), sub: 'last 24 hours', tone: 'green' },
    ];
    const sc = conductScore(getState());
    const allIn30 = incidents.filter((i) => i.createdAt > at - 30 * DAY);
    stats.push({ icon: 'alert', label: 'Asked for money', value: sc.hidden ? '—' : `${sc.money}%`, sub: `of closed cases rated (30 days, n=${sc.n})`, tone: 'red' });
    if (kind === 'gov') stats.push({ icon: 'sos', label: 'Officer SOS (30 days)', value: allIn30.filter((i) => i.officerSos).length, sub: `${allIn30.filter((i) => i.officerSos?.kind === 'missed').length} missed check-ins`, tone: 'purple' });
    actionTitle = 'Escalated cases';
    action = open.filter((i) => i.escalationLevel >= 3).sort((a, b) => b.escalationLevel - a.escalationLevel || urgentFirst(a, b));
  } else if (kind === 'chair') {
    stats = [
      { icon: 'cases', label: 'Open in my LGA', value: open.length, tone: 'blue' },
      { icon: 'done', label: 'Resolved this week', value: week.filter((i) => ['resolved', 'closed'].includes(i.status)).length, tone: 'green' },
      { icon: 'alert', label: 'Overdue', value: open.filter((i) => isOverdue(i, at)).length, tone: 'red' },
      { icon: 'pass', label: 'Reopened', value: scope.filter((i) => i.status === 'reopened').length, tone: 'amber' },
    ];
    actionTitle = 'Overdue in my LGA';
    action = open.filter((i) => isOverdue(i, at)).sort(urgentFirst);
  } else if (kind === 'oversight') {
    const cs = getState().complaints;
    const unseals = audit.filter((e) => e.action === 'IDENTITY UNSEALED' || e.action === 'COMPLAINANT UNSEALED');
    stats = [
      { icon: 'alert', label: 'New complaints', value: cs.filter((c) => c.status === 'new').length, tone: 'red', to: '/complaints' },
      { icon: 'clock', label: 'Under review', value: cs.filter((c) => c.status === 'review').length, tone: 'amber', to: '/complaints' },
      { icon: 'pass', label: 'Referred', value: cs.filter((c) => c.status === 'referred').length, tone: 'blue', to: '/complaints' },
      { icon: 'key', label: 'Unseals to review', value: unseals.filter((e) => !getState().unsealReviews[e.seq]).length, sub: `${unseals.length} in total`, tone: 'purple', to: '/unseals' },
    ];
  } else if (kind === 'admin') {
    const staff = dep.people.filter((p) => p.role !== 'citizen');
    const chain = verifyChain(getState().audit);
    stats = [
      { icon: 'officers', label: 'Active staff', value: staff.length, tone: 'blue', to: '/admin/duty' },
      { icon: 'duty', label: 'On duty now', value: staff.filter((p) => duty[p.id]?.on ?? true).length, tone: 'green', to: '/admin/duty' },
      { icon: 'routing', label: 'Routing rules', value: getState().matrix.length, tone: 'purple', to: '/admin/routing' },
      { icon: 'audit', label: 'Audit chain', value: chain.ok ? '✓ Intact' : '✗ Broken', sub: `${audit.length.toLocaleString()} entries`, tone: chain.ok ? 'green' : 'red', to: '/audit' },
    ];
  }

  const configLog = audit.filter((e) => !e.incidentId).slice(-6).reverse();

  return (
    <>
      <div className="page-title">
        <h1>
          Welcome, {me.name.split(' ').filter((w) => !/\.$|^\(/.test(w))[0] ?? me.name}
        </h1>
        <p className="muted">
          {roleName(me)} · {new Date(at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      <div className="statgrid">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} sub={s.sub} tone={s.tone} onClick={s.to ? () => go(s.to!) : undefined} />
        ))}
      </div>
      {(kind === 'coord' || kind === 'gov') && (
        <Card title="Security map" right={<span className="small muted">Live · simulated unit positions</span>}>
          <LiveMap rows={scope.filter((i) => i.restricted || isOpen(i))} />
        </Card>
      )}
      {(kind === 'commander' || kind === 'agency') && <ConductCard agencyId={me.agencyId!} />}
      {kind !== 'oversight' && <StatusChart rows={week} />}
      {kind === 'oversight' ? (
        <Complaints />
      ) : kind === 'admin' ? (
        <Card title="Recent configuration changes" right={<a href="#/audit">View all</a>} pad={false}>
          {!configLog.length ? (
            <div className="empty">No configuration changes yet. Changes to routing, service targets and the duty roster appear here.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {configLog.map((e) => (
                    <tr key={e.seq}>
                      <td className="nowrap">{dayTime(e.at)}</td>
                      <td>{e.actor}</td>
                      <td className="strong">{e.action}</td>
                      <td className="muted">{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card title={actionTitle} right={kind !== 'gov' ? <a href="#/cases">View all</a> : undefined} pad={false}>
          <CaseTable rows={action.slice(0, 5)} at={at} pageSize={5} empty="Nothing waiting on you. New cases appear here and in your inbox." />
        </Card>
      )}
    </>
  );
}

/** Commander / agency head: their unit's conduct score, aggregate only (hidden below 5 responses). */
function ConductCard({ agencyId }: { agencyId: string }) {
  const s = useStore((x) => x);
  const sc = conductScore(s, agencyId);
  return (
    <Card title="How citizens say they were treated" right={<span className="small muted">Your unit · last 30 days · aggregate only</span>}>
      {sc.hidden ? (
        <p className="small muted">Not enough responses yet (n={sc.n}). Scores show from 5 responses so no single answer can be traced.</p>
      ) : (
        <p className="conduct-score">
          Respectful treatment <b>{sc.respectful}%</b> · Money asked <b>{sc.money}%</b> <span className="muted">(n={sc.n})</span>
        </p>
      )}
      <p className="tiny muted">Individual complaints go to the independent oversight panel. They are never shown to the unit.</p>
    </Card>
  );
}
