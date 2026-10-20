import type { Person } from './platform/types';
import { agency } from './store';

/** The handful of role "shapes" the layout cares about (PRD v2.1 §3). */
export type RoleKind = 'operator' | 'lead' | 'commander' | 'agency' | 'desk' | 'coord' | 'gov' | 'chair' | 'admin' | 'officer' | 'citizen' | 'focal' | 'oversight';

export function roleKind(p: Person): RoleKind {
  const kind = agency(p.agencyId)?.kind;
  switch (p.role) {
    case 'citizen':
      return 'citizen';
    case 'officer':
      return 'officer';
    case 'dispatcher':
      return 'operator';
    case 'ops_manager':
      return kind === 'control_room' ? 'lead' : 'agency';
    case 'supervisor':
      return kind === 'control_room' ? 'lead' : kind === 'police' || kind === 'corps' ? 'commander' : 'agency';
    case 'agency_head':
      return kind === 'control_room' ? 'coord' : 'agency';
    case 'command':
      return 'coord';
    case 'sensitive':
      return 'desk';
    case 'executive':
      return 'gov';
    case 'chairman':
      return 'chair';
    case 'admin':
      return 'admin';
    case 'focal':
      return 'focal';
    case 'oversight':
      return 'oversight';
  }
}

/** Plain role names for officials (sign-in list and top bar). */
export function roleName(p: Person) {
  const kind = agency(p.agencyId)?.kind;
  switch (p.role) {
    case 'citizen':
      return 'Citizen';
    case 'dispatcher':
      return '615 Operator';
    case 'ops_manager':
      return kind === 'control_room' ? 'Control-room Duty Lead' : 'Operations Manager';
    case 'supervisor':
      return kind === 'police' ? 'Unit Commander (Police)' : kind === 'corps' ? 'Unit Commander (Amotekun)' : 'Supervisor';
    case 'officer':
      return kind === 'police' || kind === 'corps' ? 'Field Officer' : `Agency Field Officer (${agency(p.agencyId)?.short})`;
    case 'agency_head':
      return kind === 'control_room' ? 'Security Coordinator' : `Agency Head (${agency(p.agencyId)?.short})`;
    case 'sensitive':
      return 'Restricted Desk (SGBV)';
    case 'executive':
      return "Governor's Office";
    case 'chairman':
      return 'LGA Chairman';
    case 'command':
      return 'Central Command';
    case 'admin':
      return 'Administrator';
    case 'focal':
      return 'Community focal person';
    case 'oversight':
      return 'Oversight panel';
  }
}

export const initials = (name: string) =>
  name
    .replace(/^(Insp\.|CSP|Comdr\.|Col\.|Dr\.|Hon\.|\(rtd\))\s*/g, '')
    .replace(/\(rtd\)\s*/g, '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export interface MenuItem {
  path: string;
  label: string;
  icon: string;
  count?: 'cases' | 'inbox' | 'chat' | 'complaints';
}

const OVERVIEW: MenuItem = { path: '/overview', label: 'Overview', icon: 'overview' };
const CASES: MenuItem = { path: '/cases', label: 'Cases', icon: 'cases', count: 'cases' };
const INBOX: MenuItem = { path: '/inbox', label: 'Inbox', icon: 'inbox', count: 'inbox' };
const CHAT: MenuItem = { path: '/chat', label: 'Chat', icon: 'chat', count: 'chat' };
const REPORTS: MenuItem = { path: '/reports', label: 'Reports', icon: 'reports' };
const OFFICERS: MenuItem = { path: '/officers', label: 'My officers', icon: 'officers' };

/** Max 5 items per role (PRD v2.2 §6). New 615 call is a button on the Cases header. */
export const MENUS: Record<Exclude<RoleKind, 'officer' | 'citizen' | 'focal'>, MenuItem[]> = {
  operator: [OVERVIEW, CASES, CHAT, INBOX],
  lead: [OVERVIEW, CASES, CHAT, INBOX, REPORTS],
  commander: [OVERVIEW, CASES, OFFICERS, CHAT, INBOX],
  agency: [OVERVIEW, CASES, OFFICERS, CHAT, INBOX],
  desk: [OVERVIEW, CASES, CHAT, INBOX],
  coord: [OVERVIEW, CASES, REPORTS, CHAT, INBOX],
  gov: [OVERVIEW, REPORTS, INBOX],
  chair: [OVERVIEW, CASES, { path: '/community', label: 'Community', icon: 'officers' }, INBOX],
  oversight: [OVERVIEW, { path: '/complaints', label: 'Complaints', icon: 'alert', count: 'complaints' }, { path: '/unseals', label: 'Unseal reviews', icon: 'key' }, { path: '/audit', label: 'Audit log', icon: 'audit' }],
  admin: [
    OVERVIEW,
    { path: '/admin/stations', label: 'Stations & staff', icon: 'station' },
    { path: '/admin/rules', label: 'Rules', icon: 'routing' },
    { path: '/admin/duty', label: 'Duty roster', icon: 'duty' },
    { path: '/audit', label: 'Audit log', icon: 'audit' },
  ],
};

export const LANDING: Record<RoleKind, string> = {
  operator: '/cases',
  lead: '/cases',
  commander: '/cases',
  agency: '/cases',
  desk: '/cases',
  coord: '/overview',
  gov: '/overview',
  chair: '/overview',
  admin: '/overview',
  officer: '/field',
  citizen: '/home',
  focal: '/home',
  oversight: '/overview',
};
