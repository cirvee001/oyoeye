import { HOUR, MIN, escalationContact, pendingHandoff } from './platform/engine';
import type { Handoff, Incident, Transfer } from './platform/types';
import { dep, handoffTarget, onDuty } from './store';

// Live handoff countdown (PRD v2.6 §6). Pure, so the thresholds can be tested against the demo clock.

export type CountdownTone = 'ok' | 'amber' | 'red';
export interface Countdown {
  /** ms left (negative once overdue) */
  left: number;
  window: number;
  due: number;
  tone: CountdownTone;
  /** "8 min left" / "Overdue by 3 min" */
  short: string;
}

const mins = (ms: number) => Math.max(1, Math.ceil(ms / MIN));
export const fmtLeft = (ms: number) => {
  const m = mins(ms);
  return m >= 120 ? `${Math.floor(m / 60)} h left` : `${m} min left`;
};
export const fmtOver = (ms: number) => {
  const m = Math.max(1, Math.floor(ms / MIN));
  return m >= 120 ? `${Math.floor(m / 60)} h` : `${m} min`;
};

/** Normal until 25% of the window is left, then amber; red once expired. */
export function countdown(from: number, due: number, at: number): Countdown {
  const window = Math.max(1, due - from);
  const left = due - at;
  const tone: CountdownTone = left <= 0 ? 'red' : left <= window * 0.25 ? 'amber' : 'ok';
  return { left, window, due, tone, short: left > 0 ? fmtLeft(left) : `Overdue by ${fmtOver(-left)}` };
}

/** The pending pass on a case, with its acceptance clock. */
export function handoffClock(i: Incident, at: number): (Countdown & { h: Handoff; target: string; escalatedTo?: string; overdueText?: string }) | undefined {
  const h = pendingHandoff(i);
  if (!h || !i.ackDueAt) return undefined;
  const c = countdown(h.at, i.ackDueAt, at);
  const target = handoffTarget(h);
  const who = escalationContact(dep, i, Math.max(2, i.escalationLevel), onDuty);
  return { ...c, h, target, escalatedTo: who?.name, overdueText: c.tone === 'red' ? `${c.short}${who ? ` — escalated to ${who.name}` : ' — escalated'}` : undefined };
}

/** Officer transfers wait up to a day for the receiving commander. */
export const TRANSFER_WINDOW = 24 * HOUR;
export const transferClock = (t: Transfer, at: number) => countdown(t.at, t.at + TRANSFER_WINDOW, at);
