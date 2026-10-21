import { fmtLong } from '../format';
import { startOfDay } from '../platform/analytics';
import { DAY, isOpen, isOverdue, pendingHandoff } from '../platform/engine';
import type { Incident, Status } from '../platform/types';
import { STATUS_COLOR, statusLabel } from '../i18n';
import { roleKind, roleName } from '../roles';
import { canDecide, cat, conductScore, getState, persona, useStore } from '../store';
import { LiveMap } from './LiveMap';
import { Complaints } from './Oversight';
import { CaseTable, Card, StatCard, dayTime, useNow } from '../ui';
import { scopeFor, urgentFirst } from './Cases';
import { overviewCards } from '../filters';

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

  const stats = overviewCards(me, getState(), at);
  let action: Incident[] = [];
  let actionTitle = 'Needs your action';
  if (kind === 'operator' || kind === 'lead') {
    const pending = scope.filter((i) => i.status === 'pending' || i.status === 'verified');
    action = [...pending, ...(kind === 'lead' ? open.filter((i) => i.escalationLevel >= 3 && !pending.includes(i)) : [])].sort(urgentFirst);
  } else if (kind === 'commander' || kind === 'agency') {
    const signOff = scope.filter((i) => i.status === 'resolved' && i.agencyId === me.agencyId && !cat(i.category).citizenVerification);
    action = [...scope.filter(toAccept), ...signOff, ...scope.filter((i) => i.status === 'reopened')].sort(urgentFirst);
  } else if (kind === 'desk') {
    action = scope.filter((i) => i.status === 'pending').sort(urgentFirst);
  } else if (kind === 'coord' || kind === 'gov') {
    actionTitle = 'Escalated cases';
    action = open.filter((i) => i.escalationLevel >= 3).sort((a, b) => b.escalationLevel - a.escalationLevel || urgentFirst(a, b));
  } else if (kind === 'chair') {
    actionTitle = 'Overdue in my LGA';
    action = open.filter((i) => isOverdue(i, at)).sort(urgentFirst);
  }
  void week;
  void duty;
  void today0;

  const configLog = audit.filter((e) => !e.incidentId).slice(-6).reverse();

  return (
    <>
      <div className="page-title">
        <h1>
          Welcome, {me.name.split(' ').filter((w) => !/\.$|^\(/.test(w))[0] ?? me.name}
        </h1>
        <p className="muted">
          {`${roleName(me)} · ${fmtLong(at)}`}
        </p>
      </div>
      <div className="statgrid">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} sub={s.sub} tone={s.tone} to={s.to} />
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
