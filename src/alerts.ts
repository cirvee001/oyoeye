import { isOpen, pendingHandoff } from './platform/engine';
import type { Incident, Person } from './platform/types';
import { agency, alertKey, alertMutedUntil, isControl, isManagerOf, lgaOf, type State } from './store';

// Control-room alert sound and flash (PRD v2.5 §1). Pure: who is alerted, for which cases, and when it repeats.

export type AlertKind = 'sos' | 'critical';
export interface AlertItem {
  id: string;
  ref: string;
  kind: AlertKind;
  /** "SOS — Agbowo, Ibadan North" */
  label: string;
  createdAt: number;
}

/** The chime repeats every 30 s until the case is opened (or leaves Pending review). */
export const ALERT_REPEAT_MS = 30_000;
/** New rows flash for 10 s, then stay tinted until opened. */
export const ALERT_FLASH_MS = 10_000;

export type AlertScope = 'control' | 'commander' | 'officer';
export function alertScope(me: Person): AlertScope | undefined {
  if (isControl(me)) return 'control';
  if (me.role === 'officer') return 'officer';
  if (me.agencyId && isManagerOf(me, me.agencyId) && ['police', 'corps'].includes(agency(me.agencyId)?.kind ?? '')) return 'commander';
  return undefined;
}

const isCitizenSos = (i: Incident) => i.reports[0]?.channel === 'sos' || i.subcategory === 'sos';
const officerSosOpen = (i: Incident) => !!i.officerSos && isOpen(i) && !i.officerSos.safeAt;
const label = (i: Incident, what: string) => (i.locationUnknown ? `${what} — location unknown` : `${what} — ${i.area}, ${lgaOf(i.lgaId).name}`);

function kindFor(me: Person, scope: AlertScope, i: Incident): AlertKind | undefined {
  if (scope === 'control') {
    if (officerSosOpen(i)) return 'sos';
    if (i.status !== 'pending' || i.sensitiveOnly) return undefined;
    if (isCitizenSos(i)) return 'sos';
    if (i.severity === 'critical') return 'critical';
    return undefined;
  }
  if (scope === 'commander') {
    if (officerSosOpen(i)) {
      const mine = i.agencyId === me.agencyId;
      const asked = i.officerSos!.responses.some((r) => r.agencyId === me.agencyId && r.status === 'asked');
      return mine || asked ? 'sos' : undefined;
    }
    const h = pendingHandoff(i);
    if (h && h.toAgencyId === me.agencyId && !h.toPersonId && i.severity === 'critical') return 'critical';
    return undefined;
  }
  // field officer: an incoming "OFFICER NEEDS HELP — GO?" for their unit
  if (officerSosOpen(i) && i.officerSos!.officerId !== me.id && i.officerSos!.responses.some((r) => r.agencyId === me.agencyId && r.status === 'asked')) return 'sos';
  return undefined;
}

/** Unopened alerts for this person, newest first. */
export function alertsFor(s: State, me: Person): AlertItem[] {
  const scope = alertScope(me);
  if (!scope) return [];
  const out: AlertItem[] = [];
  for (const i of s.incidents) {
    if (i.createdAt < s.alertsSince) continue;
    if (s.alertOpened[alertKey(me, i.id)]) continue;
    const kind = kindFor(me, scope, i);
    if (!kind) continue;
    out.push({ id: i.id, ref: i.ref, kind, createdAt: i.createdAt, label: label(i, i.officerSos ? 'Officer SOS' : kind === 'sos' ? 'SOS' : 'Critical') });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export const isMuted = (s: State, me: Person, at: number) => alertMutedUntil(s, me.id) > at;

/** Play now? First time, or 30 s since the last chime. */
export const alertDue = (lastPlayed: number | undefined, at: number) => lastPlayed == null || at - lastPlayed >= ALERT_REPEAT_MS;

/** Browser tab title while anything is unopened: "(1) SOS — OyoEye". */
export function alertTitle(alerts: AlertItem[]) {
  if (!alerts.length) return 'OyoEye';
  return `(${alerts.length}) ${alerts.some((a) => a.kind === 'sos') ? 'SOS' : 'Critical'} — OyoEye`;
}
