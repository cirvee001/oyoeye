import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canOpen } from './platform/engine';
import type { Person } from './platform/types';
import { LANDING, MENUS, initials, roleKind, roleName } from './roles';
import { advanceClock, chatUnread, dep, incidentByRef, needsOnboarding, publishRulebook, now, persona, resetDemo, setDuty, signIn, signOut, signedIn, tick, useStore } from './store';
import { CaseView } from './views/CaseView';
import { CitizenHome, Emergency, Misconduct, MyReports, ReportFlow, Track } from './views/Citizen';
import { ChairCommunity, FocalHome, HelpBanner, MyCommunity } from './views/Community';
import { ComplaintPage, Complaints, UnsealReviews } from './views/Oversight';
import { CheckInPrompt, OfficerSosButton, silentSos } from './views/Safety';
import { Onboarding, RuleBookPage } from './views/RuleBook';
import { CitizenDashboard } from './views/CitizenDashboard';
import { Intake } from './views/Intake';
import { Field } from './views/Field';
import { Cases, scopeFor, tabsFor } from './views/Cases';
import { Overview } from './views/Overview';
import { Reports } from './views/Reports';
import { Officers } from './views/Officers';
import { Profile } from './views/Profile';
import { Transparency } from './views/Dashboards';
import { AuditLog, DutyRoster, Outbox } from './views/Admin';
import { SignIn, DemoCards } from './views/SignIn';
import { Bell, InboxPage } from './views/Inbox';
import { Ussd } from './views/Ussd';
import { Chat } from './views/Chat';
import { Rules, StationPage, Stations } from './views/Stations';
import { Icon, Sheet, Toaster, dayTime, go } from './ui';

export { roleName };

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

const PUBLIC = ['signin', 'emergency', 'track', 'public', 'ussd', 'report', 'misconduct', 'rules'];

// Old v2 paths still work, so bookmarks and the demo script keep landing somewhere sensible.
const ALIAS: Record<string, string> = {
  control: '/cases',
  queue: '/cases',
  restricted: '/cases',
  lga: '/overview',
  state: '/overview',
  security: '/reports',
  performance: '/reports',
  brief: '/reports',
};

const TITLE: Record<string, string> = {
  overview: 'Overview',
  cases: 'Cases',
  case: 'Case',
  inbox: 'Inbox',
  intake: 'New 615 call',
  reports: 'Reports',
  officers: 'My officers',
  profile: 'Profile',
  admin: 'Settings',
  chat: 'Chat',
  community: 'Community',
  mycommunity: 'My community',
  complaints: 'Complaints',
  complaint: 'Complaint',
  unseals: 'Unseal reviews',
  misconduct: 'Report misconduct',
  rules: 'Rule book',
  home: 'Home',
  report: 'Report a problem',
  my: 'My reports',
  sos: 'SOS',
  audit: 'Audit log',
  outbox: 'WhatsApp / SMS outbox',
  ussd: 'USSD simulator',
  public: 'Transparency portal',
  track: 'Track a report',
};

export function App() {
  const route = useRoute();
  const s = useStore((x) => x);
  const me = persona();
  const authed = signedIn();
  const [, force] = useState(0);
  const [switcher, setSwitcher] = useState(false);

  // Dropdown menus are <details>: close them on an outside click or once an item is picked.
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Element;
      for (const d of document.querySelectorAll<HTMLDetailsElement>('details[open]')) {
        if (!d.contains(target) || (target.closest('.menu-item') && d.contains(target))) d.open = false;
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      tick();
      force((x) => x + 1);
    }, 10_000);
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSwitcher((x) => !x);
      }
    };
    addEventListener('keydown', key);
    return () => {
      clearInterval(t);
      removeEventListener('keydown', key);
    };
  }, []);

  const [pathPart, queryPart = ''] = (route || '').split('?');
  const [head, id] = pathPart.split('/').filter(Boolean);
  const switchTo = (pid: string) => {
    signIn(pid);
    setSwitcher(false);
    go('');
  };
  const demo = <DemoControls onSwitch={() => setSwitcher(true)} />;
  const switchSheet = switcher && (
    <Sheet title="Switch account" onClose={() => setSwitcher(false)} wide>
      <p className="small muted" style={{ marginBottom: 12 }}>
        Presenter shortcut: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>
      </p>
      <DemoCards onPick={switchTo} />
    </Sheet>
  );

  // ---- Signed out: sign-in screen plus the public pages ----
  if (!authed) {
    let page: ReactNode;
    const bare = !head || head === 'signin' || !PUBLIC.includes(head);
    if (bare) page = <SignIn />;
    else if (head === 'emergency') page = <Emergency />;
    else if (head === 'track') page = <Track initial={id} />;
    else if (head === 'public') page = <Transparency />;
    else if (head === 'ussd') page = <Ussd />;
    else if (head === 'rules') page = <RuleBookPage />;
    else if (head === 'misconduct') page = <Misconduct ref0={new URLSearchParams(queryPart).get('ref') ?? ''} />;
    else page = <ReportFlow />;
    return (
      <div className="public-shell">
        {!bare && (
          <header className="topbar pub">
            <a href="#/signin" className="brand-sm">
              <Eye size={30} /> <b>OyoEye</b>
            </a>
            <div className="spacer" />
            <a className="btn sm" href="#/signin">
              Sign in
            </a>
          </header>
        )}
        {!bare && head !== 'public' && head !== 'ussd' && <HelpBanner />}
        <main className={bare ? '' : 'page'} key={route}>
          {page}
        </main>
        {demo}
        {switchSheet}
        <Toaster />
      </div>
    );
  }

  const kind = roleKind(me);
  const landing = LANDING[kind];
  let path = pathPart && pathPart !== '/signin' && pathPart !== '/' ? pathPart : landing;
  if (ALIAS[path.split('/')[1]]) path = ALIAS[path.split('/')[1]];
  const [h2, id2] = path.split('/').filter(Boolean);
  const q = new URLSearchParams(queryPart).get('q') ?? '';

  let page: ReactNode;
  if (h2 === 'case') page = <CaseView id={id2} />;
  else if (h2 === 'track') page = <Track initial={id2} />;
  else if (h2 === 'admin')
    page =
      kind !== 'admin' ? (
        <NoAccess />
      ) : id2 === 'stations' ? (
        <Stations />
      ) : id2 === 'station' ? (
        <StationPage id={path.split('/')[3]} />
      ) : id2 === 'duty' ? (
        <DutyRoster />
      ) : (
        <Rules key={id2} tab={id2 === 'sla' ? 'sla' : 'routing'} />
      );
  else if (h2 === 'chat') page = ['gov', 'chair', 'admin', 'citizen', 'oversight'].includes(kind) ? <NoAccess /> : <Chat channelId={id2} />;
  else if (h2 === 'complaints' || h2 === 'complaint' || h2 === 'unseals') page = kind !== 'oversight' ? <NoAccess /> : h2 === 'complaints' ? <Complaints /> : h2 === 'complaint' ? <ComplaintPage id={id2} /> : <UnsealReviews />;
  else if (h2 === 'community') page = kind === 'chair' ? <ChairCommunity /> : <NoAccess />;
  else if (h2 === 'mycommunity') page = kind === 'focal' ? <MyCommunity /> : <NoAccess />;
  else if (h2 === 'misconduct') page = <Misconduct ref0={new URLSearchParams(queryPart).get('ref') ?? ''} />;
  else if (h2 === 'cases') page = ['admin', 'oversight', 'focal', 'citizen'].includes(kind) ? <NoAccess /> : <Cases key={q} q={q} />;
  else
    page =
      {
        home: kind === 'focal' ? <FocalHome /> : kind === 'citizen' ? <CitizenDashboard /> : <CitizenHome />,
        rules: <RuleBookPage />,
        onboarding: <Onboarding replay />,
        report: <ReportFlow />,
        sos: <Emergency />,
        emergency: <Emergency />,
        my: <MyReports />,
        intake: <Intake />,
        field: <Field />,
        overview: <Overview />,
        reports: <Reports />,
        officers: <Officers />,
        profile: <Profile />,
        public: <Transparency />,
        outbox: <Outbox />,
        audit: <AuditLog />,
        inbox: <InboxPage />,
        ussd: <Ussd />,
      }[h2] ?? (
        <div className="empty">
          Page not found. <a href="#/">Go home</a>
        </div>
      );

  const unread = s.inbox.filter((n) => n.to === me.id && !n.read).length;
  const chatN = ['gov', 'chair', 'admin', 'citizen', 'oversight'].includes(kind) ? 0 : chatUnread(s, me);

  // ---- Field officers and citizens: phone-first, bottom tab bar ----
  // v2.4: first-time onboarding before Home. SOS is never blocked by it.
  if (needsOnboarding(me) && h2 !== 'sos' && h2 !== 'emergency' && h2 !== 'rules') {
    return (
      <>
        <Onboarding />
        {demo}
        {switchSheet}
        <Toaster />
      </>
    );
  }

  // v2.4: citizens and focal persons get the staff shell at ≥1024 px and phone tabs below.
  if (kind === 'citizen' || kind === 'focal') {
    const desktop =
      kind === 'citizen'
        ? [
            { path: '/home', label: 'Home', icon: 'home', n: 0 },
            { path: '/report', label: 'Report', icon: 'plus', n: 0 },
            { path: '/my', label: 'My reports', icon: 'list', n: 0 },
            { path: '/rules', label: 'Rule book', icon: 'file', n: 0 },
            { path: '/inbox', label: 'Inbox', icon: 'inbox', n: unread },
          ]
        : [
            { path: '/home', label: 'Home', icon: 'home', n: 0 },
            { path: '/report', label: 'Report', icon: 'plus', n: 0 },
            { path: '/mycommunity', label: 'My community', icon: 'officers', n: 0 },
            { path: '/chat', label: 'Chat', icon: 'chat', n: chatN },
            { path: '/inbox', label: 'Inbox', icon: 'inbox', n: unread },
          ];
    return (
      <Shell me={me} menu={desktop} path={path} title={TITLE[h2] ?? 'OyoEye'} citizen>
        <HelpBanner />
        <main className="page" key={path + me.id}>
          {page}
        </main>
        <nav className="bottom-nav">
          {desktop.map((n) => (
            <a key={n.path} href={`#${n.path}`} className={path.startsWith(n.path) ? 'on' : ''}>
              <Icon name={n.icon} size={22} />
              <span>
                {n.path === '/rules' ? 'Rules' : n.label}
                {n.n > 0 && <span className="bn-count">{n.n}</span>}
              </span>
            </a>
          ))}
        </nav>
        {demo}
        {switchSheet}
        <Toaster />
      </Shell>
    );
  }

  if (kind === 'officer') {
    const tabs = [
      { path: '/field', label: 'My cases', icon: 'cases' },
      { path: '/chat', label: 'Chat', icon: 'chat' },
      { path: '/inbox', label: 'Inbox', icon: 'inbox' },
      { path: '/profile', label: 'Profile', icon: 'user' },
    ];
    return (
      <div className="app mobile">
        <TopBar me={me} title="OyoEye Field" mobile />
        <main className="page" key={path + me.id}>
          {page}
        </main>
        <CheckInPrompt />
        <nav className="bottom-nav">
          <div className="bn-sos">
            <OfficerSosButton compact />
          </div>
          {tabs.map((n) => (
            <a key={n.path} href={`#${n.path}`} className={path.startsWith(n.path) ? 'on' : ''}>
              <Icon name={n.icon} size={22} />
              <span>
                {n.label}
                {n.path === '/inbox' && unread > 0 && <span className="bn-count">{unread}</span>}
                {n.path === '/chat' && chatN > 0 && <span className="bn-count">{chatN}</span>}
              </span>
            </a>
          ))}
        </nav>
        {demo}
        {switchSheet}
        <Toaster />
      </div>
    );
  }

  // ---- Every other staff role: the same simple shell ----
  const at = now();
  const firstTab = ['operator', 'lead', 'commander', 'agency', 'desk'].includes(kind) ? tabsFor(kind, me, at)[0] : undefined;
  const caseCount = firstTab ? scopeFor(me, s.incidents).filter(firstTab.test).length : 0;
  const menu = MENUS[kind];
  const newComplaints = kind === 'oversight' ? s.complaints.filter((c) => c.status === 'new').length : 0;
  return (
    <Shell me={me} menu={menu.map((m) => ({ ...m, n: m.count === 'cases' ? caseCount : m.count === 'inbox' ? unread : m.count === 'chat' ? chatN : m.count === 'complaints' ? newComplaints : 0 }))} path={path} title={TITLE[h2] ?? 'OyoEye'}>
      <main className="page" key={path + me.id}>
        {page}
      </main>
      {demo}
      {switchSheet}
      <Toaster />
    </Shell>
  );
}

function NoAccess() {
  return <div className="empty">Your role cannot open this page.</div>;
}

function Shell({ me, menu, path, title, children, citizen }: { me: Person; menu: { path: string; label: string; icon: string; n: number }[]; path: string; title: string; children: ReactNode; citizen?: boolean }) {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    const close = () => setDrawer(false);
    addEventListener('hashchange', close);
    return () => removeEventListener('hashchange', close);
  }, []);
  return (
    <div className={`shell${drawer ? ' drawer-open' : ''}${citizen ? ' citizen-shell' : ''}`}>
      <div className="scrim-drawer" onClick={() => setDrawer(false)} />
      <aside className="sidebar">
        <a className="sb-logo" href="#/">
          <Eye size={34} />
          <span className="sb-text">
            <b>OyoEye</b>
            <small>{dep.state} State</small>
          </span>
        </a>
        <nav className="sb-nav">
          {menu.map((m) => (
            <a key={m.path} href={`#${m.path}`} className={path === m.path || path.startsWith(m.path + '/') || (m.path === '/cases' && path.startsWith('/case/')) ? 'on' : ''} title={m.label}>
              <Icon name={m.icon} size={20} />
              <span className="sb-text">{m.label}</span>
              {m.n > 0 && <span className="sb-count">{m.n > 99 ? '99+' : m.n}</span>}
            </a>
          ))}
        </nav>
        <button
          className="sb-signout"
          onClick={() => {
            signOut();
            go('/signin');
          }}
          title="Sign out"
        >
          <Icon name="logout" size={20} />
          <span className="sb-text">Sign out</span>
        </button>
      </aside>
      <div className="shell-main">
        <TopBar me={me} title={title} onMenu={citizen ? undefined : () => setDrawer(true)} />
        {children}
      </div>
    </div>
  );
}

function TopBar({ me, title, mobile, onMenu }: { me: Person; title: string; mobile?: boolean; onMenu?: () => void }) {
  const staff = me.role !== 'citizen';
  const on = useStore((s) => s.duty[me.id]?.on ?? true);
  const [q, setQ] = useState('');
  const taps = useRef<number[]>([]);
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    const i = incidentByRef(v);
    setQ('');
    if (i && canOpen(me, i, dep)) go(`/case/${i.id}`);
    else go(`/cases?q=${encodeURIComponent(v)}`);
  };
  return (
    <header className="topbar">
      {onMenu && (
        <button className="icon-btn hamburger" onClick={onMenu} aria-label="Open menu">
          <Icon name="menu" size={22} />
        </button>
      )}
      {mobile && (
        <a
          href="#/"
          className="brand-sm"
          onClick={(e) => {
            if (me.role !== 'officer') return;
            const t = performance.now();
            taps.current = [...taps.current.filter((x) => t - x < 1500), t];
            if (taps.current.length >= 3) {
              e.preventDefault();
              taps.current = [];
              silentSos(); // the officer's own screen does not change
            }
          }}
        >
          <Eye size={30} />
        </a>
      )}
      <h1 className="tb-title">{title}</h1>
      {!mobile && !['admin', 'citizen', 'focal', 'oversight'].includes(me.role) && (
        <form className="tb-search" onSubmit={search} role="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by reference, area or LGA" aria-label="Search cases" />
        </form>
      )}
      <div className="spacer" />
      {staff && (
        <label className={`switch duty${on ? ' on' : ''}`} title="Your on-duty status. New cases and escalations go to on-duty staff first.">
          <input type="checkbox" checked={on} onChange={(e) => setDuty(me.id, e.target.checked)} />
          <span>{on ? 'On duty' : 'Off duty'}</span>
        </label>
      )}
      <Bell />
      <details className="avatar-menu">
        <summary>
          <span className="avatar">{initials(me.name)}</span>
          <span className="who">
            <b>{me.name}</b>
            <small>{roleName(me)}</small>
          </span>
          <Icon name="down" size={16} />
        </summary>
        <div className="am-menu">
          <a className="menu-item" href="#/profile">
            <Icon name="user" size={16} /> Profile
          </a>
          {(me.role === 'citizen' || me.role === 'focal') && (
            <a className="menu-item" href="#/rules">
              <Icon name="file" size={16} /> Rule book
            </a>
          )}
          {me.role === 'officer' && (
            <button className="menu-item" onClick={() => silentSos()}>
              <Icon name="sos" size={16} /> Silent SOS
            </button>
          )}
          <button
            className="menu-item danger"
            onClick={() => {
              signOut();
              go('/signin');
            }}
          >
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      </details>
    </header>
  );
}

function DemoControls({ onSwitch }: { onSwitch: () => void }) {
  const [open, setOpen] = useState(false);
  useStore((s) => s.clockOffset);
  return (
    <div className={`demo-pill${open ? ' open' : ''}`}>
      {open && (
        <div className="demo-panel">
          <div className="row between">
            <b className="small">Demo controls</b>
            <span className="tiny muted">for the presenter</span>
          </div>
          <div className="small">
            Demo clock: <b className="tnum">{dayTime(now())}</b>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => advanceClock(15)} title="Move time forward to watch SLA clocks and escalation">
              +15m
            </button>
            <button className="btn sm" onClick={() => advanceClock(60)}>
              +1h
            </button>
            <button className="btn sm" onClick={() => advanceClock(360)}>
              +6h
            </button>
          </div>
          <button className="btn sm block" onClick={onSwitch}>
            Switch account <kbd>Ctrl+Shift+S</kbd>
          </button>
          <a className="btn sm block" href="#/outbox" onClick={() => setOpen(false)}>
            WhatsApp / SMS outbox
          </a>
          <button className="btn sm block" onClick={() => publishRulebook()} title="Citizens see “The Rule Book was updated” once">
            Publish Rule Book update
          </button>
          <a className="btn sm block" href="#/ussd" onClick={() => setOpen(false)}>
            USSD *615# simulator
          </a>
          <button
            className="btn sm block danger"
            onClick={() => {
              if (confirm('Reset the demo? All changes will be lost and fresh data is generated.')) resetDemo();
            }}
          >
            Reset demo
          </button>
          {/* <span className="tiny muted">{getState().audit.length.toLocaleString()} audit entries · prototype, fictional data</span> */}
        </div>
      )}
      <button className="pill-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Close' : 'Demo controls'}
      </button>
    </div>
  );
}

export function Eye({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0B6E4F" />
      <path d="M4 16c3-5.5 7.3-8 12-8s9 2.5 12 8c-3 5.5-7.3 8-12 8S7 21.5 4 16Z" fill="#fff" />
      <circle cx="16" cy="16" r="4.6" fill="#0c1a13" />
      <circle cx="17.6" cy="14.4" r="1.4" fill="#fff" />
    </svg>
  );
}
