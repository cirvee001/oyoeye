import { useEffect, useState, type ReactNode } from 'react';
import { isOpen } from './platform/engine';
import type { RoleId } from './platform/types';
import { advanceClock, agency, dep, getState, now, persona, resetDemo, setPersona, tick, useStore } from './store';
import { CaseView } from './views/CaseView';
import { Citizen, MyReports, Track } from './views/Citizen';
import { ControlRoom } from './views/ControlRoom';
import { Intake } from './views/Intake';
import { Field } from './views/Field';
import { Queue } from './views/Queue';
import { Brief, LgaDashboard, Performance, SecurityPicture, StateLive, Transparency } from './views/Dashboards';
import { AuditLog, Outbox, Routing, Sla } from './views/Admin';
import { Restricted } from './views/Restricted';
import { dayTime } from './ui';

function useRoute() {
  const [hash, setHash] = useState(location.hash.slice(1) || '');
  useEffect(() => {
    const on = () => {
      setHash(location.hash.slice(1));
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

interface NavItem {
  path: string;
  label: string;
  count?: number;
}

function navFor(role: RoleId, agencyKind: string | undefined, counts: { triage: number; mine: number; restricted: number }): { section: string; items: NavItem[] }[] {
  const shared = { section: 'Public', items: [{ path: '/public', label: 'Transparency portal' }, { path: '/track', label: 'Track a report' }] };
  const demo = { section: 'Demo', items: [{ path: '/outbox', label: 'WhatsApp / SMS outbox' }] };
  switch (role) {
    case 'citizen':
      return [{ section: 'Citizen', items: [{ path: '/report', label: 'Report' }, { path: '/my', label: 'My reports' }] }, shared];
    case 'dispatcher':
      return [{ section: '615 Control room', items: [{ path: '/control', label: 'Live board', count: counts.triage }, { path: '/intake', label: 'New 615 call' }] }, demo, shared];
    case 'ops_manager':
    case 'agency_head':
    case 'supervisor':
      if (agencyKind === 'control_room')
        return [
          { section: '615 Control room', items: [{ path: '/control', label: 'Live board', count: counts.triage }, { path: '/intake', label: 'New 615 call' }] },
          { section: 'Oversight', items: [{ path: '/security', label: 'Security picture' }, { path: '/performance', label: 'Unit performance' }] },
          demo,
          shared,
        ];
      return [{ section: agencyKind === 'police' || agencyKind === 'corps' ? 'Unit' : 'Agency', items: [{ path: '/queue', label: 'Case queue', count: counts.mine }, { path: '/performance', label: 'Performance' }] }, demo, shared];
    case 'officer':
      return [{ section: 'Field', items: [{ path: '/field', label: 'My cases', count: counts.mine }] }, demo, shared];
    case 'chairman':
      return [{ section: 'Local government', items: [{ path: '/lga', label: 'My LGA' }] }, shared];
    case 'command':
      return [
        { section: 'Central command', items: [{ path: '/state', label: 'State live' }, { path: '/queue', label: 'All cases', count: counts.triage }, { path: '/security', label: 'Security picture' }, { path: '/performance', label: 'Agency performance' }, { path: '/brief', label: 'Morning brief' }] },
        demo,
        shared,
      ];
    case 'executive':
      return [{ section: 'Executive', items: [{ path: '/state', label: 'State live' }, { path: '/security', label: 'Security picture' }, { path: '/brief', label: 'Morning brief & ask' }, { path: '/performance', label: 'Agency performance' }] }, shared];
    case 'sensitive':
      return [{ section: 'Restricted desk', items: [{ path: '/restricted', label: 'Restricted cases', count: counts.restricted }, { path: '/security', label: 'Security patterns' }] }, shared];
    case 'admin':
      return [{ section: 'Platform', items: [{ path: '/admin/routing', label: 'Routing matrix' }, { path: '/admin/sla', label: 'Service targets' }, { path: '/audit', label: 'Audit log' }] }, shared];
  }
}

const HOME: Record<RoleId, string> = {
  citizen: '/report',
  dispatcher: '/control',
  ops_manager: '/control',
  agency_head: '/control',
  supervisor: '/queue',
  officer: '/field',
  chairman: '/lga',
  command: '/state',
  executive: '/state',
  sensitive: '/restricted',
  admin: '/admin/routing',
};

function homeFor() {
  const me = persona();
  const kind = agency(me.agencyId)?.kind;
  if ((me.role === 'agency_head' || me.role === 'ops_manager') && kind !== 'control_room') return '/queue';
  if (me.role === 'supervisor' && kind === 'control_room') return '/control';
  return HOME[me.role];
}

export function App() {
  const route = useRoute();
  const s = useStore((x) => x);
  const me = persona();
  const kind = agency(me.agencyId)?.kind;
  const [, force] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      tick();
      force((x) => x + 1);
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  const counts = {
    triage: s.incidents.filter((i) => i.status === 'triage' && (me.role === 'command' ? !i.restricted : i.restricted && !i.sensitiveOnly)).length,
    mine: s.incidents.filter((i) => isOpen(i) && (me.role === 'officer' ? i.officerId === me.id : i.agencyId === me.agencyId)).length,
    restricted: s.incidents.filter((i) => i.sensitiveOnly && isOpen(i)).length,
  };
  const nav = navFor(me.role, kind, counts);
  const path = route || homeFor();
  const demoPeople = dep.people.filter((p) => p.demo);

  let page: ReactNode;
  const [head, id] = path.split('/').filter(Boolean);
  if (path.startsWith('/case/')) page = <CaseView id={id} />;
  else if (path.startsWith('/track')) page = <Track initial={id} />;
  else
    page =
      {
        report: <Citizen />,
        my: <MyReports />,
        control: <ControlRoom />,
        intake: <Intake />,
        field: <Field />,
        queue: <Queue />,
        state: <StateLive />,
        security: <SecurityPicture />,
        brief: <Brief />,
        lga: <LgaDashboard />,
        performance: <Performance />,
        public: <Transparency />,
        outbox: <Outbox />,
        restricted: <Restricted />,
        audit: <AuditLog />,
        admin: id === 'sla' ? <Sla /> : <Routing />,
      }[head] ?? <div className="empty">Page not found</div>;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <Eye />
          <div>
            <b>{dep.product}</b>
            <small>See it. Report it. Act on it.</small>
          </div>
        </div>
        <nav className="nav">
          {nav.map((g) => (
            <div key={g.section} style={{ display: 'contents' }}>
              <div className="label">{g.section}</div>
              {g.items.map((n) => (
                <a key={n.path} href={`#${n.path}`} className={path.startsWith(n.path) ? 'on' : ''}>
                  {n.label}
                  {!!n.count && <span className="count">{n.count}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="who">
          <span className="t">Viewing as (demo)</span>
          <select
            value={me.id}
            onChange={(e) => {
              setPersona(e.target.value);
              location.hash = '';
            }}
          >
            {demoPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.title}
              </option>
            ))}
          </select>
          <span className="t">
            {me.title}
            {me.agencyId ? ` · ${agency(me.agencyId)?.short}` : ''}
          </span>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <span className="badge good">Prototype · fictional data</span>
          <span className="small muted">{dep.state} State deployment</span>
          <div className="clock">
            <span className="small muted">Demo clock</span>
            <b className="tnum">{dayTime(now())}</b>
            <button className="btn sm" onClick={() => advanceClock(15)} title="Move time forward to watch SLA clocks and escalation">
              +15m
            </button>
            <button className="btn sm" onClick={() => advanceClock(60)}>
              +1h
            </button>
            <button className="btn sm" onClick={() => advanceClock(360)}>
              +6h
            </button>
            <button
              className="btn sm ghost"
              onClick={() => {
                if (confirm('Reset the demo? All changes will be lost.')) resetDemo();
              }}
            >
              Reset
            </button>
          </div>
        </header>
        <main className="page" key={path + getState().personaId}>
          {page}
        </main>
      </div>
    </div>
  );
}

function Eye() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0d8a4d" />
      <path d="M4 16c3-5.5 7.3-8 12-8s9 2.5 12 8c-3 5.5-7.3 8-12 8S7 21.5 4 16Z" fill="#fff" />
      <circle cx="16" cy="16" r="4.6" fill="#0c1a13" />
      <circle cx="17.6" cy="14.4" r="1.4" fill="#fff" />
    </svg>
  );
}
