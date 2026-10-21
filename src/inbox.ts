import { DAY, isOpen, pendingHandoff } from './platform/engine';
import type { Incident, Notice, Person } from './platform/types';
import { agency, canCloseOfficerSos, canDecide, canManageStation, cat, controlRoom, feedbackFor, isControl, isManagerOf, person, type State } from './store';

// A calmer inbox (PRD v2.6 §4): "Needs your action" is worked out from the live state, so an
// action item can't be marked read away — it leaves when it's done (or expires). Everything
// else is grouped: one row per case, plus one row per kind of non-case update.

export type ActionKind = 'sos' | 'officer_sos' | 'help' | 'handoff' | 'review' | 'assign' | 'signoff' | 'escalated' | 'transfer' | 'hoax' | 'notice' | 'appeal' | 'confirm' | 'rate';
/** §4 order: SOS / Officer SOS → officer-help requests → handoffs to accept → other decisions. */
export const ACTION_RANK: Record<ActionKind, number> = { sos: 0, officer_sos: 0, help: 1, handoff: 2, review: 3, assign: 3, signoff: 3, escalated: 3, transfer: 3, hoax: 3, notice: 3, appeal: 3, confirm: 3, rate: 3 };

export interface ActionItem {
  key: string;
  kind: ActionKind;
  rank: number;
  at: number;
  title: string;
  incidentId?: string;
  ref?: string;
  handoffId?: string;
  transferId?: string;
  complaintId?: string;
  sosAgencyId?: string;
  reportRef?: string;
}

export interface UpdateGroup {
  key: string;
  /** Case group, or a kind of non-case update. */
  incidentId?: string;
  title: string;
  items: Notice[];
  latest: Notice;
  unread: number;
}

const isCitizenSos = (i: Incident) => i.reports[0]?.channel === 'sos' || i.subcategory === 'sos';
const mineRef = (i: Incident, me: Person) => i.reports.find((r) => r.reporter?.personId === me.id)?.ref;

/** Everything waiting on this person, in the §4 order. */
export function actionsFor(s: State, me: Person, at: number): ActionItem[] {
  const out: ActionItem[] = [];
  const control = isControl(me);
  const lead = control && me.role === 'ops_manager';
  const coordinator = me.role === 'agency_head' && me.agencyId === controlRoom().id;
  const resident = me.role === 'citizen' || me.role === 'focal';
  for (const i of s.incidents) {
    if (!resident) {
      if (control && i.status === 'pending' && isCitizenSos(i) && !i.sensitiveOnly) out.push({ key: `sos-${i.id}`, kind: 'sos', rank: 0, at: i.createdAt, title: `SOS — ${i.area}`, incidentId: i.id, ref: i.ref });
      if (i.officerSos && isOpen(i)) {
        const asked = i.officerSos.responses.find((r) => r.status === 'asked' && isManagerOf(me, r.agencyId));
        if (asked) out.push({ key: `help-${i.id}-${asked.agencyId}`, kind: 'help', rank: 1, at: i.createdAt, title: `Officer needs help — ${person(i.officerSos.officerId)?.name}, ${i.area}`, incidentId: i.id, ref: i.ref, sosAgencyId: asked.agencyId });
        else if (canCloseOfficerSos(me, i)) out.push({ key: `osos-${i.id}`, kind: 'officer_sos', rank: 0, at: i.createdAt, title: `Officer SOS — ${person(i.officerSos.officerId)?.name}, ${i.area}`, incidentId: i.id, ref: i.ref });
      }
      const h = isOpen(i) ? pendingHandoff(i) : undefined;
      if (h && canDecide(me, h)) out.push({ key: `h-${h.id}`, kind: 'handoff', rank: 2, at: h.at, title: `Pass from ${h.fromName}`, incidentId: i.id, ref: i.ref, handoffId: h.id });
      // other decisions: the control room verifies pending reports;
      // commanders pass accepted cases to an officer and sign off resolved ones.
      if (control && (i.status === 'pending' || i.status === 'verified') && !isCitizenSos(i) && !i.sensitiveOnly) out.push({ key: `rev-${i.id}`, kind: 'review', rank: 3, at: i.createdAt, title: `Verify & pass — ${i.area}`, incidentId: i.id, ref: i.ref });
      const manager = !!me.agencyId && i.agencyId === me.agencyId && isManagerOf(me, i.agencyId) && agency(i.agencyId)?.kind !== 'control_room';
      if (manager && i.status === 'accepted' && !i.officerId && ['police', 'corps'].includes(agency(i.agencyId)?.kind ?? '')) out.push({ key: `as-${i.id}`, kind: 'assign', rank: 3, at: i.t.acknowledged ?? i.createdAt, title: `Pass to an officer — ${i.area}`, incidentId: i.id, ref: i.ref });
      if (manager && i.status === 'resolved' && !cat(i.category).citizenVerification) out.push({ key: `so-${i.id}`, kind: 'signoff', rank: 3, at: i.t.resolved ?? i.createdAt, title: `Sign off — ${i.area}`, incidentId: i.id, ref: i.ref });
      if (lead && i.status === 'rejected' && i.rejectKind === 'hoax' && i.hoax && !i.hoax.confirmedAt && !i.hoax.dismissedBy) out.push({ key: `hoax-${i.id}`, kind: 'hoax', rank: 3, at: i.t.closed ?? i.createdAt, title: `Confirm hoax? ${i.ref}`, incidentId: i.id, ref: i.ref });
      if (coordinator && i.noticeHold?.length) out.push({ key: `notice-${i.id}`, kind: 'notice', rank: 3, at: i.createdAt, title: `Approve community notice — ${i.area}`, incidentId: i.id, ref: i.ref });
    } else {
      const ref = mineRef(i, me);
      if (!ref) continue;
      if (i.status === 'resolved' && cat(i.category).citizenVerification) out.push({ key: `fix-${i.id}`, kind: 'confirm', rank: 3, at: i.t.resolved ?? i.createdAt, title: `Is it fixed? ${ref}`, incidentId: i.id, ref: i.ref, reportRef: ref });
      if ((i.status === 'closed' || i.status === 'referred') && !i.officerSos && !feedbackFor(s, ref) && at - (i.t.closed ?? 0) < 30 * DAY && s.inbox.some((n) => n.to === me.id && n.kind === 'feedback' && n.incidentId === i.id))
        out.push({ key: `rate-${i.id}`, kind: 'rate', rank: 3, at: i.t.closed ?? i.createdAt, title: `Rate the response — ${ref}`, incidentId: i.id, ref: i.ref, reportRef: ref });
    }
  }
  for (const t of s.transfers)
    if (t.status === 'pending' && canManageStation(me, t.toStationId)) out.push({ key: `tr-${t.id}`, kind: 'transfer', rank: 3, at: t.at, title: `Officer transfer: ${person(t.personId)?.name} → ${agency(t.toStationId)?.short}`, transferId: t.id });
  if (me.role === 'oversight') for (const c of s.complaints) if (c.kind === 'appeal' && c.status === 'new') out.push({ key: `ap-${c.id}`, kind: 'appeal', rank: 3, at: c.at, title: `Standing appeal ${c.id}`, complaintId: c.id });
  return out.sort((a, b) => a.rank - b.rank || b.at - a.at);
}

/** Notices that are the "action" itself (shown in the action section while still open). */
function isActionNotice(n: Notice, acts: ActionItem[]) {
  return acts.some((a) => (a.handoffId && a.handoffId === n.handoffId) || (a.transferId && a.transferId === n.transferId) || (a.sosAgencyId && a.incidentId === n.incidentId && n.sosAgencyId === a.sosAgencyId));
}

const KIND_GROUP: Partial<Record<Notice['kind'], string>> = { chat: 'Chat mentions', transfer: 'Officer transfers', info: 'Notices', feedback: 'Notices', citizen: 'Updates' };

/** Updates: one row per case (latest first), then one row per kind of non-case update. */
export function updateGroups(s: State, me: Person, acts: ActionItem[]): UpdateGroup[] {
  const mine = s.inbox.filter((n) => n.to === me.id && !isActionNotice(n, acts));
  const by = new Map<string, Notice[]>();
  for (const n of mine) {
    const k = n.incidentId ? `case:${n.incidentId}` : `kind:${KIND_GROUP[n.kind] ?? 'Notices'}`;
    const xs = by.get(k);
    if (xs) xs.push(n);
    else by.set(k, [n]);
  }
  return [...by.entries()]
    .map(([key, items]) => {
      const sorted = items.slice().sort((a, b) => b.at - a.at);
      return { key, incidentId: key.startsWith('case:') ? key.slice(5) : undefined, title: key.startsWith('kind:') ? key.slice(5) : sorted[0].ref ?? 'Case', items: sorted, latest: sorted[0], unread: sorted.filter((n) => !n.read).length };
    })
    .sort((a, b) => b.latest.at - a.latest.at);
}

export interface InboxView {
  actions: ActionItem[];
  groups: UpdateGroup[];
  unreadGroups: number;
  /** Bell badge: action items + unread case groups (not raw messages). */
  badge: number;
}
export function inboxView(s: State, me: Person, at: number): InboxView {
  const actions = actionsFor(s, me, at);
  const groups = updateGroups(s, me, actions);
  const unreadGroups = groups.filter((g) => g.unread > 0).length;
  return { actions, groups, unreadGroups, badge: actions.length + groups.filter((g) => g.incidentId && g.unread > 0).length };
}
