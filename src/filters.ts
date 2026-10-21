import { metrics, startOfDay } from './platform/analytics';
import { DAY, canOpen, dur, isOpen, isOverdue, pendingHandoff } from './platform/engine';
import type { Incident, Person, Severity } from './platform/types';
import { roleKind, type RoleKind } from './roles';
import { canDecide, cat, conductScore, dep, feedbackFor, lgaOf, verifyChain, type State } from './store';
import { fmtNum, fmtPct } from './format';

// Filters live in the URL (PRD v2.6 §3): #/cases?tab=pending&flag=overdue&lga=ibn&status=open&priority=critical
// Every Overview / dashboard card links to one of these and shows the same count as the list it opens.

export type Tab = { id: string; label: string; test: (i: Incident) => boolean; newestFirst?: boolean };
const final = (i: Incident) => ['closed', 'rejected', 'referred'].includes(i.status);

export function tabsFor(kind: RoleKind, me: Person, at: number): Tab[] {
  const toAccept = (i: Incident) => {
    const h = pendingHandoff(i);
    return (
      (i.status === 'assigned' && ((!!h && canDecide(me, h)) || (i.agencyId === me.agencyId && !i.officerId))) ||
      (!!i.officerSos && isOpen(i) && (i.officerSos.responses.some((r) => r.agencyId === me.agencyId && r.status === 'asked') || (i.agencyId === me.agencyId && i.status === 'verified')))
    );
  };
  const all: Tab = { id: 'all', label: 'All', test: () => true, newestFirst: true };
  switch (kind) {
    case 'commander':
    case 'agency':
      return [
        { id: 'toaccept', label: 'To accept', test: toAccept },
        { id: 'accepted', label: 'Accepted', test: (i) => i.status === 'accepted' || (i.status === 'assigned' && !toAccept(i)) },
        { id: 'progress', label: 'In progress', test: (i) => i.status === 'in_progress' },
        { id: 'resolved', label: 'Resolved', test: (i) => i.status === 'resolved' },
        { id: 'reopened', label: 'Reopened', test: (i) => i.status === 'reopened' },
        { id: 'closed', label: 'Closed', test: final, newestFirst: true },
        all,
      ];
    case 'desk':
      return [
        { id: 'pending', label: 'Pending review', test: (i) => i.status === 'pending' || i.status === 'verified' },
        { id: 'open', label: 'Open', test: (i) => (isOpen(i) && i.status !== 'pending' && i.status !== 'verified') || i.status === 'resolved' },
        { id: 'closed', label: 'Closed', test: final, newestFirst: true },
        all,
      ];
    case 'coord':
    case 'gov':
    case 'chair':
      return [
        { id: 'open', label: 'Open', test: (i) => isOpen(i) || i.status === 'resolved' },
        { id: 'overdue', label: 'Overdue', test: (i) => isOverdue(i, at) },
        { id: 'closed', label: 'Closed', test: final, newestFirst: true },
        all,
      ];
    default:
      return [
        { id: 'pending', label: 'Pending review', test: (i) => i.status === 'pending' || i.status === 'verified' },
        { id: 'assigned', label: 'Assigned', test: (i) => i.status === 'assigned' },
        { id: 'progress', label: 'In progress', test: (i) => ['accepted', 'in_progress', 'reopened'].includes(i.status) },
        { id: 'resolved', label: 'Resolved', test: (i) => i.status === 'resolved' },
        { id: 'closed', label: 'Closed', test: final, newestFirst: true },
        all,
      ];
  }
}

/** Every case this person may open (the same rule as the case page). */
export function scopeFor(me: Person, incidents: Incident[]) {
  const kind = roleKind(me);
  return incidents.filter((i) => canOpen(me, i, dep) && (kind !== 'desk' || i.sensitiveOnly));
}

export interface CaseQuery {
  tab?: string;
  flag?: string;
  lga?: string;
  status?: string;
  priority?: string;
  cat?: string;
  q?: string;
}
export const QUERY_KEYS: (keyof CaseQuery)[] = ['tab', 'flag', 'lga', 'status', 'priority', 'cat', 'q'];
export const parseQuery = (search: string): CaseQuery => {
  const p = new URLSearchParams(search);
  const out: CaseQuery = {};
  for (const k of QUERY_KEYS) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return out;
};
export const queryString = (q: CaseQuery) =>
  QUERY_KEYS.filter((k) => q[k])
    .map((k) => `${k}=${encodeURIComponent(q[k]!)}`)
    .join('&');
export const casesLink = (q: CaseQuery) => `/cases${queryString(q) ? `?${queryString(q)}` : ''}`;

export const FLAG_LABEL: Record<string, string> = { overdue: 'Overdue', handoff: 'Handoff pending', signoff: 'Needs sign-off', today: 'Closed today', week: 'Last 7 days', sos: 'SOS', critical: 'Critical' };
function flagTest(flag: string, me: Person, at: number): (i: Incident) => boolean {
  switch (flag) {
    case 'overdue':
      return (i) => isOverdue(i, at);
    case 'handoff':
      return (i) => !!pendingHandoff(i);
    case 'signoff':
      return (i) => i.status === 'resolved' && i.agencyId === me.agencyId && !cat(i.category).citizenVerification;
    case 'today':
      return (i) => (i.t.closed ?? 0) >= startOfDay(at);
    case 'week':
      return (i) => i.createdAt > at - 7 * DAY;
    case 'sos':
      return (i) => (i.reports[0]?.channel === 'sos' || !!i.officerSos) && isOpen(i);
    default:
      return () => true;
  }
}

/** The Cases list for a URL query. Cards use the same function, so their numbers always match. */
export function filterCases(me: Person, incidents: Incident[], q: CaseQuery, at: number) {
  const tabs = tabsFor(roleKind(me), me, at);
  const tab = tabs.find((t) => t.id === q.tab) ?? tabs[0];
  const needle = (q.q ?? '').trim().toLowerCase();
  const flags = (q.flag ?? '').split(',').filter(Boolean).map((f) => flagTest(f, me, at));
  const statuses = (q.status ?? '').split(',').filter(Boolean);
  const filtered = scopeFor(me, incidents).filter(
    (i) =>
      (!q.lga || i.lgaId === q.lga) &&
      (!q.cat || i.category === q.cat) &&
      (!q.priority || i.severity === (q.priority as Severity)) &&
      (!statuses.length || statuses.some((st) => (st === 'open' ? isOpen(i) : i.status === st))) &&
      flags.every((f) => f(i)) &&
      (!needle || `${i.ref} ${i.reports.map((r) => r.ref).join(' ')} ${i.area} ${lgaOf(i.lgaId).name} ${i.sensitiveOnly ? '' : i.title}`.toLowerCase().includes(needle)),
  );
  return { tabs, tab, filtered, rows: filtered.filter(tab.test) };
}

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'grey';
export interface CardDef {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  tone: Tone;
  /** Where the card goes ("#" is added by the link). */
  to: string;
  /** For case cards: the URL query, so a check can compare the count with the list. */
  query?: CaseQuery;
  count?: number;
}

/** Every Overview card for this role, each a link to the matching filtered list (PRD v2.6 §3). */
export function overviewCards(me: Person, s: State, at: number): CardDef[] {
  const kind = roleKind(me);
  const n = (query: CaseQuery) => filterCases(me, s.incidents, query, at).rows.length;
  const caseCard = (icon: string, label: string, query: CaseQuery, tone: Tone | ((v: number) => Tone), sub?: string): CardDef => {
    const v = n(query);
    return { icon, label, value: v, count: v, sub, tone: typeof tone === 'function' ? tone(v) : tone, to: casesLink(query), query };
  };
  const scope = scopeFor(me, s.incidents);
  const today0 = startOfDay(at);
  switch (kind) {
    case 'operator':
    case 'lead': {
      const pend = filterCases(me, s.incidents, { tab: 'pending' }, at).rows;
      return [
        caseCard('alert', 'Pending review', { tab: 'pending' }, (v) => (v ? 'red' : 'green'), `${pend.filter((i) => i.reports[0].channel === 'sos').length} SOS`),
        caseCard('pass', 'Assigned, not accepted', { tab: 'assigned', flag: 'handoff' }, 'blue'),
        caseCard('clock', 'In progress', { tab: 'progress' }, 'amber'),
        caseCard('done', 'Closed today', { tab: 'closed', flag: 'today' }, 'green'),
      ];
    }
    case 'commander':
    case 'agency': {
      const waitingCitizens = scope.filter((i) => i.status === 'resolved' && cat(i.category).citizenVerification).length;
      return [
        caseCard('inbox', 'Waiting for us to accept', { tab: 'toaccept' }, (v) => (v ? 'red' : 'green')),
        caseCard('clock', 'In progress', { tab: 'progress' }, 'amber'),
        caseCard('done', 'Resolved, needs sign-off', { tab: 'resolved', flag: 'signoff' }, 'blue', `${waitingCitizens} waiting for citizens`),
        caseCard('alert', 'Overdue', { tab: 'all', flag: 'overdue' }, 'red'),
      ];
    }
    case 'desk': {
      const unseals = s.audit.filter((e) => e.action === 'IDENTITY UNSEALED').length;
      return [
        caseCard('alert', 'Waiting to be taken', { tab: 'pending', status: 'pending' }, (v) => (v ? 'red' : 'green')),
        caseCard('clock', 'Open', { tab: 'all', status: 'open' }, 'amber'),
        caseCard('done', 'Closed (7 days)', { tab: 'closed', flag: 'week' }, 'green'),
        { icon: 'security', label: 'Identity unseals', value: unseals, sub: 'each reviewed by the coordinator', tone: 'purple', to: '/audit?q=IDENTITY%20UNSEALED' },
      ];
    }
    case 'coord':
    case 'gov': {
      const m = metrics(scope.filter((i) => i.createdAt >= today0), at);
      const day = metrics(scope.filter((i) => i.createdAt > at - DAY), at);
      const open = scope.filter(isOpen);
      const sc = conductScore(s);
      const all30 = s.incidents.filter((i) => i.createdAt > at - 30 * DAY);
      const cards: CardDef[] = [
        caseCard('cases', 'Open cases', { tab: 'all', status: 'open' }, 'blue', `${fmtNum(m.reports)} reports today`),
        caseCard('alert', 'Critical open', { tab: 'all', status: 'open', priority: 'critical' }, 'red', `${open.filter((i) => i.severity === 'critical' && isOverdue(i, at)).length} past target`),
        { icon: 'clock', label: 'Median arrival today', value: m.arrived ? dur(m.medianArrive) : '—', sub: `${m.arrived} emergency arrivals`, tone: 'amber', to: '/reports?tab=performance' },
        { icon: 'done', label: 'Acknowledged on time', value: fmtPct(day.ackWithin, day.acked), sub: 'last 24 hours', tone: 'green', to: '/reports?tab=performance' },
        { icon: 'alert', label: 'Asked for money', value: sc.hidden ? '—' : `${sc.money}%`, sub: `of closed cases rated (30 days, n=${sc.n})`, tone: 'red', to: '/reports?tab=conduct' },
      ];
      if (kind === 'gov') cards.push({ icon: 'sos', label: 'Officer SOS (30 days)', value: all30.filter((i) => i.officerSos).length, sub: `${all30.filter((i) => i.officerSos?.kind === 'missed').length} missed check-ins`, tone: 'purple', to: '/reports?tab=safety' });
      return cards;
    }
    case 'chair':
      return [
        caseCard('cases', 'Open in my LGA', { tab: 'all', status: 'open' }, 'blue'),
        caseCard('done', 'Resolved this week', { tab: 'all', status: 'resolved,closed', flag: 'week' }, 'green'),
        caseCard('alert', 'Overdue', { tab: 'overdue' }, 'red'),
        caseCard('pass', 'Reopened', { tab: 'all', status: 'reopened' }, 'amber'),
      ];
    case 'oversight': {
      const cs = s.complaints;
      const unseals = s.audit.filter((e) => e.action === 'IDENTITY UNSEALED' || e.action === 'COMPLAINANT UNSEALED');
      return [
        { icon: 'alert', label: 'New complaints', value: cs.filter((c) => c.status === 'new').length, tone: 'red', to: '/complaints?status=new' },
        { icon: 'clock', label: 'Under review', value: cs.filter((c) => c.status === 'review').length, tone: 'amber', to: '/complaints?status=review' },
        { icon: 'pass', label: 'Referred', value: cs.filter((c) => c.status === 'referred').length, tone: 'blue', to: '/complaints?status=referred' },
        { icon: 'key', label: 'Unseals to review', value: unseals.filter((e) => !s.unsealReviews[e.seq]).length, sub: `${unseals.length} in total`, tone: 'purple', to: '/unseals' },
      ];
    }
    case 'admin': {
      const staff = staffList();
      const chain = verifyChain(s.audit);
      return [
        { icon: 'officers', label: 'Active staff', value: staff.length, tone: 'blue', to: '/admin/duty?show=all' },
        { icon: 'duty', label: 'On duty now', value: staff.filter((p) => s.duty[p.id]?.on ?? true).length, tone: 'green', to: '/admin/duty?show=on' },
        { icon: 'routing', label: 'Routing rules', value: s.matrix.length, tone: 'purple', to: '/admin/routing' },
        { icon: 'audit', label: 'Audit chain', value: chain.ok ? '✓ Intact' : '✗ Broken', sub: `${fmtNum(s.audit.length)} entries`, tone: chain.ok ? 'green' : 'red', to: '/audit' },
      ];
    }
    default:
      return [];
  }
}
export const staffList = () => dep.people.filter((p) => p.role !== 'citizen' && p.role !== 'focal');
/** Duty roster "show" filter: all staff, or only those on duty. */
export const dutyFilter = (s: State, show?: string) => staffList().filter((p) => show !== 'on' || (s.duty[p.id]?.on ?? true));

// ---------- citizen dashboard ----------

export type MyFilter = 'open' | 'progress' | 'waiting' | 'closed';
export function myReports(me: Person, s: State, at: number, f?: string) {
  const mine = s.incidents.filter((i) => i.reports.some((r) => r.reporter?.personId === me.id)).sort((a, b) => b.createdAt - a.createdAt);
  const refOf = (i: Incident) => i.reports.find((r) => r.reporter?.personId === me.id)!.ref;
  const civic = (i: Incident) => i.status === 'resolved' && !!cat(i.category).citizenVerification;
  const tests: Record<MyFilter, (i: Incident) => boolean> = {
    open: (i) => isOpen(i) || i.status === 'resolved',
    progress: (i) => ['accepted', 'in_progress'].includes(i.status),
    waiting: (i) => civic(i) || ((i.status === 'closed' || i.status === 'referred') && !i.officerSos && !feedbackFor(s, refOf(i)) && at - (i.t.closed ?? 0) < 30 * DAY),
    closed: (i) => i.status === 'closed' || i.status === 'referred',
  };
  return f && f in tests ? mine.filter(tests[f as MyFilter]) : mine;
}
export function citizenCards(me: Person, s: State, at: number): CardDef[] {
  const c = (f: MyFilter) => myReports(me, s, at, f).length;
  const waiting = c('waiting');
  return [
    { icon: 'cases', label: 'My open reports', value: c('open'), count: c('open'), tone: 'blue', to: '/my?f=open' },
    { icon: 'clock', label: 'In progress', value: c('progress'), count: c('progress'), tone: 'amber', to: '/my?f=progress' },
    { icon: 'alert', label: 'Waiting for you', value: waiting, count: waiting, sub: waiting ? 'confirm a fix or rate the response' : 'nothing to do', tone: waiting ? 'amber' : 'grey', to: '/my?f=waiting' },
    { icon: 'done', label: 'Closed', value: c('closed'), count: c('closed'), tone: 'green', to: '/my?f=closed' },
  ];
}
