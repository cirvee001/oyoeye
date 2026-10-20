import type { Agency, CategoryId, Deployment, Handoff, Incident, Person, RoutingRule, Severity, SlaWindow } from './types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const SEVERITIES: Severity[] = ['critical', 'high', 'normal', 'low'];

// ---------- Routing ----------

/** Most specific matching rule wins: subcategory + LGA > subcategory > LGA > category. */
export function matchRule(matrix: RoutingRule[], category: CategoryId, subcategory: string | undefined, lgaId: string) {
  const candidates = matrix.filter(
    (r) =>
      r.category === category &&
      (!r.subcategory || r.subcategory === subcategory) &&
      (!r.lgaIds?.length || r.lgaIds.includes(lgaId)),
  );
  const score = (r: RoutingRule) => (r.subcategory ? 2 : 0) + (r.lgaIds?.length ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

/** Stations that are setting up or suspended are skipped by routing (PRD v2.2 §4.2). */
export const isLive = (a: Agency) => (a.status ?? 'live') === 'live';
/** Seeded staff have no status and count as active. */
export const isActive = (p: Person) => (p.staffStatus ?? 'active') === 'active';

export function resolveTarget(dep: Deployment, target: string, lgaId: string): Agency | undefined {
  const covering = (kind: Agency['kind']) =>
    dep.agencies.find((a) => a.kind === kind && isLive(a) && a.lgaIds.includes(lgaId)) ?? dep.agencies.find((a) => a.kind === kind && isLive(a) && !a.lgaIds.length);
  if (target === '@police') return covering('police');
  if (target === '@corps') return covering('corps');
  if (target === '@lga') return covering('lga_council');
  return dep.agencies.find((a) => a.id === target && isLive(a));
}

export function route(dep: Deployment, matrix: RoutingRule[], category: CategoryId, subcategory: string | undefined, lgaId: string) {
  const rule = matchRule(matrix, category, subcategory, lgaId);
  const agency = rule ? resolveTarget(dep, rule.target, lgaId) : undefined;
  return { rule, agency };
}

// ---------- Duty ----------

export type OnDuty = (personId: string) => boolean;
const always: OnDuty = () => true;

/**
 * On-duty field officer in the agency with the fewest open cases.
 * If nobody is on duty it returns undefined, so the case goes to the next
 * role up (the unit commander / agency managers), never to an off-duty phone.
 */
export function pickOfficer(dep: Deployment, incidents: Incident[], agencyId: string, onDuty: OnDuty = always) {
  const officers = dep.people.filter((p) => p.agencyId === agencyId && p.role === 'officer' && isActive(p) && onDuty(p.id));
  if (!officers.length) return undefined;
  const load = (id: string) => incidents.filter((i) => i.officerId === id && isOpen(i)).length;
  return officers.sort((a, b) => load(a.id) - load(b.id))[0];
}

export const MANAGER_ROLES: Person['role'][] = ['supervisor', 'ops_manager', 'agency_head'];

/** People who answer for an agency: managers on duty first, else all managers. */
export function agencyManagers(dep: Deployment, agencyId: string, onDuty: OnDuty = always) {
  const kind = dep.agencies.find((a) => a.id === agencyId)?.kind;
  const roles: Person['role'][] = kind === 'control_room' ? ['dispatcher', 'ops_manager'] : kind === 'sensitive_desk' ? ['sensitive'] : MANAGER_ROLES;
  const all = dep.people.filter((p) => p.agencyId === agencyId && roles.includes(p.role) && isActive(p));
  const on = all.filter((p) => onDuty(p.id));
  return on.length ? on : all;
}

// ---------- SLA & escalation ----------

export function deadlines(createdAt: number, w: SlaWindow) {
  return {
    ackDueAt: createdAt + w.ack * MIN,
    arriveDueAt: w.arrive ? createdAt + w.arrive * MIN : undefined,
    resolveDueAt: createdAt + w.resolve * MIN,
  };
}

export const MAX_LEVEL: Record<Severity, number> = { critical: 5, high: 4, normal: 3, low: 2 };

/** Statuses where someone still owes action: SLA clocks run and escalation applies. */
export const OPEN: Incident['status'][] = ['pending', 'verified', 'assigned', 'accepted', 'in_progress', 'reopened'];
export const FINAL: Incident['status'][] = ['closed', 'rejected', 'referred'];
export const isOpen = (i: Incident) => OPEN.includes(i.status);
export const isFinal = (i: Incident) => FINAL.includes(i.status);
export const pendingHandoff = (i: Incident): Handoff | undefined => i.handoffs.find((h) => h.status === 'pending');

/** Level the case *should* be at now. Levels only ever go up. */
export function escalationFor(i: Incident, now: number): number {
  if (!isOpen(i)) return i.escalationLevel;
  let level = 1;
  const ackWin = i.ackDueAt - (i.t.assigned ?? i.createdAt);
  // Not accepted in the window → supervisor; half a window more → operations lead.
  if (!i.t.acknowledged && now > i.ackDueAt) level = 2;
  if (!i.t.acknowledged && now > i.ackDueAt + ackWin * 0.5) level = 3;
  if (i.arriveDueAt && !i.t.onScene) {
    const w = i.arriveDueAt - i.createdAt;
    if (now > i.arriveDueAt) level = Math.max(level, 3);
    if (now > i.arriveDueAt + w) level = Math.max(level, 4);
  }
  const resWin = i.resolveDueAt - i.createdAt;
  if (now > i.resolveDueAt) level = Math.max(level, 3);
  if (now > i.resolveDueAt + resWin * 0.5) level = Math.max(level, 4);
  if (now > i.resolveDueAt + resWin) level = Math.max(level, 5);
  if (i.reopenCount > 0) level = Math.max(level, 2);
  return Math.max(i.escalationLevel, Math.min(level, MAX_LEVEL[i.severity]));
}

export const LEVEL_LABEL = ['', 'Responder', 'Supervisor', 'Operations lead', 'Agency head', 'Central command'];
export const SECURITY_LEVEL_LABEL = ['', 'Patrol lead', 'Unit commander', 'Control-room duty lead', 'State security coordinator', 'Executive security brief'];

const LADDER: Person['role'][] = ['officer', 'officer', 'supervisor', 'ops_manager', 'agency_head'];

/**
 * Who gets told at each level. On-duty people first; if nobody in that role is
 * on duty, the next role up in the same agency; security units (which have no
 * operations lead) hand levels 3–5 to the control room.
 */
export function escalationContact(dep: Deployment, i: Incident, level: number, onDuty: OnDuty = always): Person | undefined {
  const find = (agencyId: string, role: Person['role'], duty = true) => dep.people.find((p) => p.agencyId === agencyId && p.role === role && isActive(p) && (!duty || onDuty(p.id)));
  const controlRoom = dep.agencies.find((a) => a.kind === 'control_room');
  if (level <= 1) return i.officerId ? dep.people.find((p) => p.id === i.officerId) : find(i.agencyId, 'officer') ?? find(i.agencyId, 'supervisor', false);
  if (level >= 5) return dep.people.find((p) => p.role === (i.restricted ? 'executive' : 'command'));
  for (let k = level; k < LADDER.length; k++) {
    const own = find(i.agencyId, LADDER[k]);
    if (own) return own;
  }
  if (controlRoom) return find(controlRoom.id, LADDER[level]) ?? find(controlRoom.id, 'ops_manager') ?? find(controlRoom.id, LADDER[level], false) ?? find(controlRoom.id, 'ops_manager', false);
  return find(i.agencyId, LADDER[level], false);
}

export type Clock = 'ok' | 'due_soon' | 'breached' | 'met' | 'missed';
export function clockState(due: number | undefined, done: number | undefined, now: number, window: number): Clock | undefined {
  if (!due) return undefined;
  if (done) return done <= due ? 'met' : 'missed';
  if (now > due) return 'breached';
  if (due - now < window * 0.25) return 'due_soon';
  return 'ok';
}

export function isOverdue(i: Incident, now: number) {
  if (!isOpen(i)) return false;
  return now > i.resolveDueAt || (!i.t.acknowledged && now > i.ackDueAt) || (!!i.arriveDueAt && !i.t.onScene && now > i.arriveDueAt);
}

// ---------- Geography & duplicates ----------

export function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const DUP_WINDOW: Record<CategoryId, { hours: number; km: number }> = {
  security: { hours: 2, km: 0.8 },
  fire: { hours: 3, km: 0.5 },
  flooding: { hours: 12, km: 1.5 },
  roads: { hours: 24 * 14, km: 0.3 },
  waste: { hours: 72, km: 0.3 },
  infrastructure: { hours: 72, km: 0.3 },
  other: { hours: 2, km: 0.2 },
};

export function findDuplicate(incidents: Incident[], c: { category: CategoryId; subcategory?: string; lat: number; lng: number; at: number }) {
  if (c.category === 'other') return undefined; // unclassified reports are read by a person first
  const w = DUP_WINDOW[c.category];
  return incidents
    .filter(
      (i) =>
        i.category === c.category &&
        (c.category !== 'security' || !i.subcategory || !c.subcategory || i.subcategory === c.subcategory) &&
        isOpen(i) &&
        c.at - lastReportAt(i) < w.hours * HOUR &&
        km(i.lat, i.lng, c.lat, c.lng) <= w.km,
    )
    .sort((a, b) => km(a.lat, a.lng, c.lat, c.lng) - km(b.lat, b.lng, c.lat, c.lng))[0];
}

export const lastReportAt = (i: Incident) => Math.max(...i.reports.map((r) => r.submittedAt));

/** A1: one key per distinct reporter. Anonymous reports only count as distinct by channel. */
export const reporterKey = (r: Incident['reports'][number]) => r.reporter?.personId ?? r.reporter?.phone ?? `anon:${r.channel}`;
export const distinctReporters = (i: Incident) => new Set(i.reports.map(reporterKey)).size;

export function affectedRadius(i: Incident) {
  if (i.reports.length < 2) return 0;
  return Math.max(...i.reports.map((r) => km(i.lat, i.lng, r.lat, r.lng)));
}

// ---------- Access ----------

export type Viewer = Person;

const involved = (i: Incident, agencyId?: string) =>
  !!agencyId && (i.agencyId === agencyId || i.handoffs.some((h) => h.toAgencyId === agencyId || h.fromAgencyId === agencyId) || !!i.officerSos?.responses.some((r) => r.agencyId === agencyId));

export function canOpen(v: Viewer, i: Incident, dep: Deployment): boolean {
  if (v.role === 'admin') return false; // administrators run the platform; they do not read cases
  if (i.sensitiveOnly && v.role !== 'sensitive') {
    // Restricted-desk cases reach a partner unit only when the desk passes them on.
    if (!['supervisor', 'officer'].includes(v.role)) return false;
  }
  switch (v.role) {
    case 'citizen':
      return i.reports.some((r) => r.reporter?.personId === v.id);
    case 'officer':
      return i.officerId === v.id || i.handoffs.some((h) => h.toPersonId === v.id || h.fromId === v.id);
    case 'supervisor':
    case 'ops_manager':
    case 'agency_head': {
      const own = dep.agencies.find((a) => a.id === v.agencyId);
      if (own?.kind === 'control_room') return (i.restricted && !i.sensitiveOnly) || i.status === 'pending' || involved(i, own.id);
      return involved(i, v.agencyId);
    }
    case 'dispatcher': {
      const cr = dep.agencies.find((a) => a.kind === 'control_room')?.id;
      return (i.restricted && !i.sensitiveOnly) || i.status === 'pending' || involved(i, cr);
    }
    case 'chairman':
      return i.lgaId === v.lgaId && !i.restricted;
    case 'command':
    case 'executive':
      return !i.sensitiveOnly;
    case 'sensitive':
      return true;
  }
  return false;
}

/** Reporter identity. Confidential needs break-glass by the sensitive role; anonymous is never stored. */
export function reporterVisibility(v: Viewer, i: Incident, r: Incident['reports'][number]): 'visible' | 'sealed' | 'masked' | 'none' {
  if (r.identity === 'anonymous') return 'none';
  if (r.identity === 'confidential' || i.sensitiveOnly) return v.role === 'sensitive' ? 'sealed' : 'none';
  if (['dispatcher', 'command', 'sensitive'].includes(v.role)) return 'visible';
  if (v.role === 'agency_head' || v.role === 'ops_manager' || v.role === 'supervisor') return i.restricted ? 'masked' : 'visible';
  if (v.role === 'officer') return i.restricted ? 'masked' : 'visible';
  return 'none';
}

// ---------- Hashing (tamper-evident audit chain) ----------

export function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------- Formatting ----------

export function dur(ms: number) {
  const neg = ms < 0;
  let m = Math.round(Math.abs(ms) / MIN);
  const d = Math.floor(m / 1440);
  m -= d * 1440;
  const h = Math.floor(m / 60);
  m -= h * 60;
  const s = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return neg ? `-${s}` : s;
}

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
