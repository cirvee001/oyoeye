import { DAY, dur, median } from '../platform/engine';
import { agency, checkInDue, conductScore, dep, persona, safety, useStore } from '../store';
import { Card, Icon, StatCard, go, hhmm, run, useNow } from '../ui';
import { HoldButton } from './Citizen';

/** Officer SOS: hold 2 s. This is an alert from a verified officer, so units are alerted at once. */
export function OfficerSosButton({ compact }: { compact?: boolean }) {
  const me = persona();
  const s = useStore((x) => x);
  const active = s.incidents.find((i) => i.officerSos?.officerId === me.id && !['closed', 'rejected', 'referred'].includes(i.status) && !i.officerSos.silent);
  if (me.role !== 'officer') return null;
  if (active) {
    const going = active.officerSos!.responses.filter((r) => r.status === 'going');
    return (
      <div className="sos-active">
        <b>Officer SOS active — help is on the way.</b>
        <div className="small">{going.length ? `${going.map((r) => agency(r.agencyId)?.short).join(', ')} going to you.` : 'Nearest units have been alerted.'}</div>
        {!active.officerSos!.safeAt ? (
          <button className="btn lg block" onClick={() => run(safety.imSafe(active.id), 'Everyone has been told you are safe. The commander will close the alert.')}>
            I'm safe now
          </button>
        ) : (
          <div className="small">You said you are safe at {hhmm(active.officerSos!.safeAt)}.</div>
        )}
      </div>
    );
  }
  return (
    <div className={`officer-sos${compact ? ' compact' : ''}`}>
      <HoldButton ms={2000} label="Hold 2 s for Officer SOS" holding="Keep holding…" text="SOS" small={compact} onDone={() => run(safety.sos(false), 'OFFICER SOS sent. The nearest units, your commander and the duty lead have been alerted.')} />
    </div>
  );
}

/** "Are you OK?" — full-screen check-in prompt for an officer working alone. */
export function CheckInPrompt() {
  const me = persona();
  const s = useStore((x) => x);
  useNow(5000);
  const i = me.role === 'officer' ? checkInDue(s, me.id) : undefined;
  if (!i) return null;
  return (
    <div className="checkin" role="alertdialog" aria-modal aria-label="Are you OK?">
      <div className="checkin-box">
        <Icon name="alert" size={40} />
        <h1>Are you OK?</h1>
        <p>You are working alone on {i.ref} ({i.area}). Please check in. If you don't answer in 3 minutes, an Officer SOS is raised automatically.</p>
        <button className="btn primary xl block" onClick={() => run(safety.checkIn(i.id, true), 'Thanks — timer reset.')}>
          I'm OK
        </button>
        <button className="btn danger xl block" onClick={() => run(safety.checkIn(i.id, false), 'OFFICER SOS sent.')}>
          I need help
        </button>
      </div>
    </div>
  );
}

/** Silent SOS: same alert, the screen does not change. */
export function silentSos() {
  safety.sos(true);
}

/** Reports → Officer safety (v2.3 §5.3). */
export function SafetyReport() {
  const at = useNow(30_000);
  const rows = useStore((s) => s.incidents).filter((i) => i.officerSos && i.createdAt > at - 30 * DAY);
  const firsts = rows.map((i) => i.officerSos!.responses.find((r) => r.status === 'going')?.at).map((t, k) => (t ? t - rows[k].createdAt : undefined)).filter((x): x is number => x != null);
  const outcomes = ['Officer safe', 'Officer injured — hospital', 'Officer missing'].map((o) => ({ o, n: rows.filter((i) => i.officerSos!.closedAs === o).length }));
  return (
    <div className="stack lg">
      <div className="statgrid">
        <StatCard icon="sos" label="Officer SOS (30 days)" value={rows.length} tone="red" />
        <StatCard icon="clock" label="Time to first responding unit" value={firsts.length ? dur(median(firsts)) : '—'} sub="median" tone="amber" />
        <StatCard icon="alert" label="Missed check-ins" value={rows.filter((i) => i.officerSos!.kind === 'missed').length} tone="purple" />
        <StatCard icon="done" label="Officer safe" value={outcomes[0].n} sub={`${outcomes[1].n} injured · ${outcomes[2].n} missing`} tone="green" />
      </div>
      <Card title="Officer SOS alerts" pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Type</th>
                <th>Where</th>
                <th>Units going</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="empty">
                    No officer SOS in the last 30 days.
                  </td>
                </tr>
              )}
              {rows.map((i) => (
                <tr key={i.id} className="click" onClick={() => go(`/case/${i.id}`)}>
                  <td className="mono">{i.ref}</td>
                  <td>{i.officerSos!.kind === 'missed' ? 'Missed check-in' : 'Officer in distress'}</td>
                  <td className="small">{i.area}</td>
                  <td className="small">{i.officerSos!.responses.filter((r) => r.status === 'going').map((r) => agency(r.agencyId)?.short).join(', ') || '—'}</td>
                  <td className="small">{i.officerSos!.closedAs ?? 'Open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** Reports → Conduct: per-unit scores, aggregate only (hidden below 5 responses). */
export function ConductReport() {
  const s = useStore((x) => x);
  const units = dep.agencies.filter((a) => !['control_room', 'sensitive_desk'].includes(a.kind));
  const rows = units.map((a) => ({ a, sc: conductScore(s, a.id) })).filter((x) => x.sc.n > 0).sort((x, y) => y.sc.n - x.sc.n);
  const all = conductScore(s);
  return (
    <div className="stack lg">
      <div className="statgrid">
        <StatCard icon="officers" label="Responses (30 days)" value={all.n} tone="blue" />
        <StatCard icon="done" label="Treated with respect" value={all.hidden ? '—' : `${all.respectful}%`} tone="green" />
        <StatCard icon="alert" label="Asked for money" value={all.hidden ? '—' : `${all.money}%`} tone="red" />
        <StatCard icon="key" label="Complaints" value={s.complaints.length} sub="handled by the oversight panel" tone="purple" />
      </div>
      <Card title="Conduct by unit" right={<span className="small muted">Aggregate only · shown from 5 responses</span>} pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Responses</th>
                <th>Respectful treatment</th>
                <th>Money asked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, sc }) => (
                <tr key={a.id}>
                  <td>{a.short}</td>
                  <td className="tnum">{sc.n}</td>
                  <td className="tnum">{sc.hidden ? <span className="muted">fewer than 5</span> : `${sc.respectful}%`}</td>
                  <td className="tnum">{sc.hidden ? <span className="muted">—</span> : `${sc.money}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

