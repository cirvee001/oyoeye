import { useSyncExternalStore } from 'react';
import { OYO } from './deployments/oyo';
import {
  DAY,
  HOUR,
  LEVEL_LABEL,
  MIN,
  SECURITY_LEVEL_LABEL,
  deadlines,
  escalationContact,
  escalationFor,
  findDuplicate,
  fnv,
  pickOfficer,
  route,
} from './platform/engine';
import { titleFor, triage } from './platform/triage';
import type {
  AuditEntry,
  CategoryId,
  Channel,
  Evidence,
  EvidenceKind,
  Identity,
  Incident,
  OutboundMessage,
  Person,
  RoutingRule,
  Severity,
  SlaTable,
} from './platform/types';

export const dep = OYO;
const KEY = 'oyoeye:v1';

export interface Unseal {
  incidentId: string;
  personId: string;
  at: number;
  until: number;
  reason: string;
}

export interface State {
  v: 1;
  clockOffset: number;
  seq: number;
  incidents: Incident[];
  audit: AuditEntry[];
  outbox: OutboundMessage[];
  matrix: RoutingRule[];
  sla: SlaTable;
  personaId: string;
  unseals: Unseal[];
  lastViewLog: Record<string, number>;
}

let state: State;
const listeners = new Set<() => void>();
let quietBefore = 0; // while seeding, drop outbound messages older than this

export const now = () => Date.now() + (state?.clockOffset ?? 0);
const get = () => state;

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
  );
}

let saveTimer: number | undefined;
function commit() {
  state = { ...state, incidents: [...state.incidents], audit: [...state.audit], outbox: [...state.outbox] };
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — the demo keeps running in memory */
    }
  }, 300);
}

// ---------- lookups ----------

export const person = (id?: string) => dep.people.find((p) => p.id === id);
export const agency = (id?: string) => dep.agencies.find((a) => a.id === id);
export const lgaOf = (id: string) => dep.lgas.find((l) => l.id === id)!;
export const cat = (id: CategoryId) => dep.categories.find((c) => c.id === id)!;
export const subLabel = (c: CategoryId, s?: string) => cat(c).subcategories.find((x) => x.id === s)?.label ?? cat(c).label;
export const persona = () => person(state.personaId)!;
export const levelLabel = (i: Incident, level = i.escalationLevel) => (i.restricted ? SECURITY_LEVEL_LABEL : LEVEL_LABEL)[level];
export const incidentByRef = (ref: string) =>
  state.incidents.find((i) => i.ref === ref || i.reports.some((r) => r.ref === ref.trim().toUpperCase()));
const controlRoom = () => dep.agencies.find((a) => a.kind === 'control_room')!;

// ---------- audit & messages ----------

function audit(at: number, actor: Person | { id: string; name: string }, action: string, detail: string, incidentId?: string) {
  const prev = state.audit.length ? state.audit[state.audit.length - 1].hash : '00000000';
  const seq = state.audit.length + 1;
  const hash = fnv(`${prev}|${seq}|${at}|${actor.id}|${action}|${detail}|${incidentId ?? ''}`);
  state.audit.push({ seq, at, incidentId, actorId: actor.id, actor: actor.name, action, detail, prev, hash });
}

export function verifyChain(entries = state.audit) {
  let prev = '00000000';
  for (const e of entries) {
    const h = fnv(`${prev}|${e.seq}|${e.at}|${e.actorId}|${e.action}|${e.detail}|${e.incidentId ?? ''}`);
    if (e.prev !== prev || e.hash !== h) return { ok: false, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true as const, brokenAt: undefined };
}

const SYSTEM = { id: 'system', name: 'OyoEye' };
const AI = { id: 'ai', name: 'Triage assistant' };

function send(at: number, to: Person | undefined, channel: OutboundMessage['channel'], text: string, incidentId?: string, phone?: string) {
  if (at < quietBefore) return;
  if (!to && !phone) return;
  state.outbox.unshift({ id: `m${state.seq}-${state.outbox.length}`, at, channel, to: to?.name ?? 'Reporter', phone: phone ?? to!.phone, text, incidentId });
  if (state.outbox.length > 200) state.outbox.length = 200;
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function place(i: Incident) {
  return `${i.area}, ${lgaOf(i.lgaId).name}`;
}

function alertText(i: Incident, heading = 'OYOEYE ALERT') {
  const lines = [
    heading,
    `${i.severity.toUpperCase()} PRIORITY`,
    `${subLabel(i.category, i.subcategory)} — ${place(i)}${i.landmark ? ` (near ${i.landmark})` : ''}.`,
    `Case: ${i.ref}`,
    `Acknowledge by: ${hhmm(i.ackDueAt)}`,
  ];
  if (i.restricted) lines.push('Reporter: via control room only. Treat as unverified until confirmed.');
  if (i.reports.length > 1) lines.push(`${i.reports.length} independent reports`);
  lines.push('Reply 1 to ACCEPT · Open case in OyoEye');
  return lines.join('\n');
}

function notifyReporters(i: Incident, at: number, text: string) {
  i.updates.push({ at, text });
  for (const r of i.reports) {
    if (r.identity === 'anonymous' || !r.reporter?.phone) continue;
    send(at, undefined, r.channel === 'whatsapp' ? 'whatsapp' : 'sms', `OyoEye ${r.ref}: ${text}`, i.id, r.reporter.phone);
  }
}

// ---------- reports ----------

export interface ReportInput {
  text: string;
  category?: CategoryId;
  subcategory?: string;
  lgaId: string;
  area: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  identity: Identity;
  channel: Channel;
  reporter?: { personId?: string; name?: string; phone?: string };
  photo?: string;
  sos?: boolean;
  callRef?: string;
  actor?: Person;
}

function jitter(seed: string, spread: number) {
  const h = parseInt(fnv(seed), 16);
  return ((h % 1000) / 1000 - 0.5) * spread;
}

export function coordsFor(lgaId: string, area: string, salt = '') {
  const l = lgaOf(lgaId);
  const idx = Math.max(0, l.areas.indexOf(area));
  const spread = l.metro ? 0.035 : 0.09;
  const ang = (idx / Math.max(1, l.areas.length)) * Math.PI * 2;
  return {
    lat: l.lat + Math.sin(ang) * spread * 0.6 + jitter(area + salt + 'a', spread * 0.25),
    lng: l.lng + Math.cos(ang) * spread * 0.6 + jitter(area + salt + 'b', spread * 0.25),
  };
}

function refFor(code: string, at: number) {
  const d = new Date(at);
  const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  state.seq += 1;
  return `${dep.prefix}-${code}-${yymmdd}-${String(state.seq).padStart(5, '0')}`;
}

function applyDeadlines(i: Incident) {
  const d = deadlines(i.createdAt, state.sla[i.category][i.severity]);
  i.ackDueAt = i.t.assigned ? i.t.assigned + state.sla[i.category][i.severity].ack * MIN : d.ackDueAt;
  i.arriveDueAt = d.arriveDueAt;
  i.resolveDueAt = d.resolveDueAt;
}

function submitAt(at: number, input: ReportInput) {
  const ai = triage(input.text, { category: input.category, subcategory: input.subcategory, sos: input.sos });
  const category = ai.category;
  const c = cat(category);
  const subcategory = ai.subcategory;
  const sub = c.subcategories.find((s) => s.id === subcategory);
  let identity = input.identity;
  if (sub?.forceConfidential && identity === 'standard') identity = 'confidential';
  const salt = String(state.seq);
  const { lat, lng } = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : coordsFor(input.lgaId, input.area, salt);
  const reportRef = refFor(c.code, at);
  const report = {
    ref: reportRef,
    text: input.text,
    channel: input.sos ? ('sos' as Channel) : input.channel,
    identity,
    reporter: identity === 'anonymous' ? undefined : input.reporter,
    submittedAt: at,
    lat,
    lng,
    photo: input.photo,
    callRef: input.callRef,
  };
  // The audit trail never names a protected reporter.
  const actor =
    input.actor ??
    (identity === 'standard' ? (input.reporter?.personId ? person(input.reporter.personId) : undefined) ?? { id: 'reporter', name: input.reporter?.name || 'Reporter' } : { id: 'protected', name: identity === 'anonymous' ? 'Anonymous reporter' : 'Protected reporter' });

  const dup = sub?.sensitiveOnly ? undefined : findDuplicate(state.incidents, { category, subcategory, lat, lng, at });
  if (dup) {
    dup.reports.push(report);
    audit(at, actor, 'Report received', `${reportRef} via ${report.channel} — merged into ${dup.ref} (${dup.reports.length} reports)`, dup.id);
    const order: Severity[] = ['low', 'normal', 'high', 'critical'];
    if (dup.unverified && dup.reports.length >= 2) {
      dup.unverified = false;
      audit(at, SYSTEM, 'Corroborated', `Independent reports: ${dup.reports.length}. Marked corroborated (not proven).`, dup.id);
    }
    if (ai.severity && order.indexOf(ai.severity) > order.indexOf(dup.severity)) {
      audit(at, AI, 'Severity suggestion', `New report suggests ${ai.severity}; current ${dup.severity}. Left for a person to decide.`, dup.id);
    }
    if (dup.reports.length === 5 && dup.severity !== 'critical') {
      const from = dup.severity;
      dup.severity = order[Math.min(3, order.indexOf(dup.severity) + 1)];
      applyDeadlines(dup);
      audit(at, SYSTEM, 'Severity raised', `${from} → ${dup.severity}: 5 independent reports`, dup.id);
    }
    send(at, undefined, 'sms', `OyoEye: Report received. ID ${reportRef}. Others have reported this too — it is already with responders under ${dup.ref}.`, dup.id, report.reporter?.phone);
    return { ref: reportRef, incident: dup, merged: true };
  }

  const routed = route(dep, state.matrix, category, subcategory, input.lgaId);
  const restricted = c.restricted;
  const sensitiveOnly = !!sub?.sensitiveOnly;
  const i: Incident = {
    id: `i${state.seq}`,
    ref: reportRef,
    category,
    subcategory,
    severity: ai.severity,
    title: titleFor(input.text),
    lgaId: input.lgaId,
    area: input.area,
    lat,
    lng,
    landmark: input.landmark,
    status: 'triage',
    agencyId: routed.agency?.id ?? controlRoom().id,
    suggestedAgencyId: routed.agency?.id,
    escalationLevel: 1,
    restricted,
    sensitiveOnly,
    unverified: restricted,
    createdAt: at,
    ackDueAt: 0,
    resolveDueAt: 0,
    t: {},
    evidence: [],
    reports: [report],
    updates: [],
    reopenCount: 0,
    ai,
  };
  applyDeadlines(i);
  state.incidents.unshift(i);
  audit(at, actor, 'Report received', `${reportRef} via ${report.channel}, identity ${identity}${input.callRef ? `, call ${input.callRef}` : ''}`, i.id);
  audit(at, AI, 'Triage suggestion', `${c.label} / ${subLabel(category, subcategory)}, ${ai.severity}, confidence ${Math.round(ai.confidence * 100)}% — ${ai.signals.join('; ')}`, i.id);
  audit(at, SYSTEM, 'Routing', `Rule ${routed.rule?.id ?? 'none'} → ${routed.agency?.short ?? 'no match'}`, i.id);

  if (restricted) {
    // Security never auto-dispatches: a person in the control room (or the sensitive desk) decides.
    i.agencyId = sensitiveOnly ? routed.agency!.id : controlRoom().id;
    const desk = sensitiveOnly ? dep.people.filter((p) => p.agencyId === i.agencyId) : dep.people.filter((p) => p.agencyId === controlRoom().id && p.role === 'dispatcher');
    for (const d of desk) send(at, d, 'push', alertText(i, input.sos ? 'SOS — OYOEYE' : 'NEW SECURITY REPORT'), i.id);
    if (input.sos || i.severity === 'critical') {
      const duty = dep.people.find((p) => p.agencyId === controlRoom().id && p.role === 'ops_manager');
      send(at, duty, 'sms', alertText(i, input.sos ? 'SOS — OYOEYE' : 'CRITICAL SECURITY REPORT'), i.id);
    }
    notifyReporters(i, at, `Report received. Location: ${i.area}. The ${dep.emergencyLine} control room is reviewing it now.${input.sos ? ' Stay safe; move away if you can.' : ''}`);
  } else if (ai.confidence < 0.5 && !input.category) {
    audit(at, SYSTEM, 'Held for triage', 'Low confidence — central command to confirm category', i.id);
    notifyReporters(i, at, `Report received. Location: ${i.area}. Status: being reviewed.`);
  } else {
    assign(i, at, i.agencyId, SYSTEM);
    notifyReporters(i, at, `Report received. Location: ${i.area}. Sent to ${agency(i.agencyId)?.short}.`);
  }
  return { ref: reportRef, incident: i, merged: false };
}

function assign(i: Incident, at: number, agencyId: string, actor: Person | typeof SYSTEM, officerId?: string) {
  i.agencyId = agencyId;
  i.status = 'assigned';
  i.t.assigned = i.t.assigned ?? at;
  // The acknowledgement clock starts when responsibility is assigned.
  i.ackDueAt = at + state.sla[i.category][i.severity].ack * MIN;
  const officer = officerId ? person(officerId) : pickOfficer(dep, state.incidents, agencyId);
  i.officerId = officer?.id;
  audit(at, actor, 'Assigned', `${agency(agencyId)?.short}${officer ? ` → ${officer.name}` : ''}`, i.id);
  send(at, officer, 'whatsapp', alertText(i), i.id);
  if (i.severity === 'critical') {
    send(at, officer, 'sms', alertText(i), i.id);
    const sup = dep.people.find((p) => p.agencyId === agencyId && p.role === 'supervisor');
    send(at, sup, 'whatsapp', alertText(i, 'OYOEYE — FOR YOUR ATTENTION'), i.id);
  }
}

// ---------- escalation ----------

function escalate(i: Incident, at: number) {
  const target = escalationFor(i, at);
  while (i.escalationLevel < target) {
    i.escalationLevel += 1;
    const who = escalationContact(dep, i, i.escalationLevel);
    const reason = !i.t.acknowledged && at > i.ackDueAt ? 'not acknowledged in time' : i.arriveDueAt && !i.t.onScene && at > i.arriveDueAt ? 'no arrival within target' : i.reopenCount ? 'citizen said it is not fixed' : 'resolution target missed';
    audit(at, SYSTEM, 'Escalated', `Level ${i.escalationLevel} — ${levelLabel(i)}${who ? ` (${who.name})` : ''}: ${reason}`, i.id);
    send(at, who, i.escalationLevel >= 4 ? 'sms' : 'whatsapp', `${alertText(i, `OYOEYE ESCALATION — LEVEL ${i.escalationLevel}`)}\nReason: ${reason}.`, i.id);
  }
}

export function tick() {
  const at = now();
  let changed = false;
  for (const i of state.incidents) {
    const before = i.escalationLevel;
    escalate(i, at);
    if (i.status === 'awaiting_verification' && i.t.actionTaken && at - i.t.actionTaken > 72 * HOUR) {
      i.status = 'resolved';
      i.verification = 'timeout';
      i.t.resolved = at;
      audit(at, SYSTEM, 'Resolved', 'No citizen response in 72h — closed as resolved (unconfirmed)', i.id);
      changed = true;
    }
    if (i.escalationLevel !== before) changed = true;
  }
  state.unseals = state.unseals.filter((u) => u.until > at);
  if (changed) commit();
}

// ---------- actions (current persona) ----------

type Act = (i: Incident, at: number, me: Person) => void | string;
function act(id: string, fn: Act): string | undefined {
  const i = state.incidents.find((x) => x.id === id);
  if (!i) return 'Case not found';
  const at = now();
  escalate(i, at);
  const err = fn(i, at, persona());
  if (typeof err === 'string') return err;
  commit();
}

export function submitReport(input: ReportInput) {
  const res = submitAt(now(), input);
  commit();
  return res;
}

export const actions = {
  confirmTriage: (id: string, v: { category: CategoryId; subcategory?: string; severity: Severity; agencyId: string; note?: string }) =>
    act(id, (i, at, me) => {
      const changes: string[] = [];
      if (v.category !== i.category) changes.push(`category ${i.category} → ${v.category}`);
      if (v.subcategory !== i.subcategory) changes.push(`type → ${subLabel(v.category, v.subcategory)}`);
      if (v.severity !== i.severity) changes.push(`severity ${i.severity} → ${v.severity}`);
      if (v.agencyId !== i.suggestedAgencyId) changes.push(`responder ${agency(i.suggestedAgencyId)?.short ?? '—'} → ${agency(v.agencyId)?.short}`);
      i.category = v.category;
      i.subcategory = v.subcategory;
      i.severity = v.severity;
      i.restricted = cat(v.category).restricted;
      i.sensitiveOnly = !!cat(v.category).subcategories.find((s) => s.id === v.subcategory)?.sensitiveOnly;
      applyDeadlines(i);
      i.t.triaged = at;
      audit(at, me, 'Triage confirmed', `${changes.length ? `Changed AI suggestion: ${changes.join(', ')}` : 'Accepted AI suggestion'}${v.note ? `. Note: ${v.note}` : ''}`, i.id);
      assign(i, at, v.agencyId, me);
      notifyReporters(i, at, i.restricted ? 'A response unit has been dispatched.' : `Sent to ${agency(v.agencyId)?.short}.`);
    }),
  markInvalid: (id: string, reason: string) =>
    act(id, (i, at, me) => {
      if (!reason.trim()) return 'Give a reason';
      i.status = 'invalid';
      i.outcome = reason;
      i.t.resolved = at;
      audit(at, me, 'Closed as invalid', reason, i.id);
    }),
  accept: (id: string) =>
    act(id, (i, at, me) => {
      i.t.acknowledged = at;
      i.status = 'accepted';
      if (!i.officerId && me.role === 'officer') i.officerId = me.id;
      audit(at, me, 'Acknowledged', `${agency(i.agencyId)?.short} accepted the case`, i.id);
      notifyReporters(i, at, i.restricted ? 'A unit has acknowledged your report.' : `${agency(i.agencyId)?.short} has accepted your report.`);
    }),
  assignOfficer: (id: string, officerId: string) =>
    act(id, (i, at, me) => {
      i.officerId = officerId;
      audit(at, me, 'Reassigned', `→ ${person(officerId)?.name}`, i.id);
      send(at, person(officerId), 'whatsapp', alertText(i), i.id);
    }),
  transfer: (id: string, agencyId: string, reason: string) =>
    act(id, (i, at, me) => {
      if (!reason.trim()) return 'Give a reason for the transfer';
      audit(at, me, 'Transferred', `${agency(i.agencyId)?.short} → ${agency(agencyId)?.short}: ${reason}`, i.id);
      i.t.acknowledged = undefined;
      assign(i, at, agencyId, me);
    }),
  enRoute: (id: string) =>
    act(id, (i, at, me) => {
      i.t.enRoute = at;
      i.t.acknowledged = i.t.acknowledged ?? at;
      i.status = 'in_progress';
      audit(at, me, i.restricted || i.category === 'fire' ? 'En route' : 'Work started', '', i.id);
      notifyReporters(i, at, i.restricted || i.category === 'fire' ? 'Responders are on the way.' : 'Work on your report has started.');
    }),
  onScene: (id: string) =>
    act(id, (i, at, me) => {
      i.t.onScene = at;
      i.status = 'in_progress';
      audit(at, me, 'On scene', `GPS confirmed near ${i.area}`, i.id);
    }),
  addEvidence: (id: string, kind: EvidenceKind, text: string, photo?: string) =>
    act(id, (i, at, me) => {
      if (!text.trim() && !photo) return 'Add a note or a photo';
      i.evidence.push({ at, by: me.name, kind, text, photo });
      audit(at, me, kind === 'photo' ? 'Evidence photo added' : i.restricted ? 'Situation report' : 'Update added', text || 'photo', i.id);
    }),
  requestBackup: (id: string, text: string) =>
    act(id, (i, at, me) => {
      i.backupRequested = true;
      audit(at, me, 'Backup requested', text, i.id);
      const duty = dep.people.find((p) => p.agencyId === controlRoom().id && p.role === 'ops_manager');
      send(at, duty, 'sms', `${alertText(i, 'OYOEYE — BACKUP REQUESTED')}\n${me.name}: ${text}`, i.id);
    }),
  complete: (id: string, v: { note: string; outcome?: string; photo?: string }) =>
    act(id, (i, at, me) => {
      const c = cat(i.category);
      if (!v.note.trim()) return 'Describe what was done';
      if (c.outcomes && !v.outcome) return 'Choose an outcome';
      const ev: Evidence[] = [...i.evidence, { at, by: me.name, kind: 'note', text: v.note }];
      if (v.photo) ev.push({ at, by: me.name, kind: 'photo', text: 'Completion photo', photo: v.photo });
      const missing = c.evidence.filter((k) => !ev.some((e) => e.kind === k));
      if (missing.length) return `Evidence needed before closing: ${missing.join(', ')}`;
      i.evidence = ev;
      i.t.actionTaken = at;
      i.t.acknowledged = i.t.acknowledged ?? at;
      i.outcome = v.outcome;
      audit(at, me, 'Action taken', `${v.outcome ? `${v.outcome}. ` : ''}${v.note}`, i.id);
      // Anonymous reporters confirm through the tracking page with their reference.
      if (c.citizenVerification) {
        i.status = 'awaiting_verification';
        notifyReporters(i, at, `${agency(i.agencyId)?.short} says this is fixed: "${v.note}". Is it? Reply YES, NO or PARTLY.`);
      } else {
        i.status = v.outcome === 'Referred to investigation' ? 'investigation' : 'resolved';
        i.t.resolved = at;
        notifyReporters(i, at, i.restricted ? 'The response to your report has been completed. Thank you for keeping your community safe.' : 'Your report has been closed.');
      }
    }),
  verify: (id: string, answer: 'yes' | 'no' | 'partial', reportRef: string) =>
    act(id, (i, at) => {
      const r = i.reports.find((x) => x.ref === reportRef);
      const who = r?.identity === 'standard' ? { id: r.reporter?.personId ?? 'reporter', name: r.reporter?.name ?? 'Reporter' } : { id: 'protected', name: 'Protected reporter' };
      i.verification = answer;
      if (answer === 'yes') {
        i.status = 'resolved';
        i.t.resolved = at;
        audit(at, who, 'Citizen confirmed', `${reportRef}: fixed`, i.id);
      } else {
        i.status = 'reopened';
        i.reopenCount += 1;
        audit(at, who, 'Citizen disputed', `${reportRef}: ${answer === 'no' ? 'not fixed' : 'partly fixed'} — case reopened`, i.id);
        escalate(i, at);
        const sup = dep.people.find((p) => p.agencyId === i.agencyId && p.role === 'supervisor');
        send(at, sup, 'whatsapp', `${alertText(i, 'OYOEYE — CASE REOPENED BY CITIZEN')}\nCitizen says: ${answer === 'no' ? 'not fixed' : 'partly fixed'}`, i.id);
      }
    }),
  changeSeverity: (id: string, severity: Severity, reason: string) =>
    act(id, (i, at, me) => {
      if (!reason.trim()) return 'Give a reason';
      audit(at, me, 'Severity changed', `${i.severity} → ${severity}: ${reason}`, i.id);
      i.severity = severity;
      applyDeadlines(i);
    }),
  requestInfo: (id: string, question: string) =>
    act(id, (i, at, me) => {
      if (!question.trim()) return 'Write the question';
      audit(at, me, 'More information requested', question, i.id);
      notifyReporters(i, at, `The control room asks: ${question} (reply to this message; your identity stays protected)`);
    }),
  breakGlass: (id: string, reason: string) =>
    act(id, (i, at, me) => {
      if (reason.trim().length < 12) return 'Write a proper reason (it is reviewed)';
      state.unseals.push({ incidentId: i.id, personId: me.id, at, until: at + 30 * MIN, reason });
      audit(at, me, 'IDENTITY UNSEALED', `Break-glass for 30 min. Reason: ${reason}`, i.id);
      const coord = dep.people.find((p) => p.agencyId === controlRoom().id && p.role === 'agency_head');
      send(at, coord, 'sms', `OyoEye oversight: ${me.name} unsealed a reporter identity on ${i.ref}. Reason: ${reason}`, i.id);
    }),
};

export function logView(i: Incident) {
  if (!i.restricted) return;
  const me = persona();
  const key = `${me.id}:${i.id}`;
  const at = now();
  if (state.lastViewLog[key] && at - state.lastViewLog[key] < 10 * MIN) return;
  state.lastViewLog[key] = at;
  audit(at, me, 'Viewed restricted case', me.title, i.id);
  commit();
}

export const isUnsealed = (incidentId: string) => state.unseals.some((u) => u.incidentId === incidentId && u.personId === state.personaId && u.until > now());

export function setPersona(id: string) {
  state.personaId = id;
  commit();
}
export function advanceClock(mins: number) {
  state.clockOffset += mins * MIN;
  tick();
  commit();
}
export function updateRule(rule: RoutingRule) {
  const at = now();
  const me = persona();
  const idx = state.matrix.findIndex((r) => r.id === rule.id);
  const before = idx >= 0 ? state.matrix[idx] : undefined;
  if (idx >= 0) state.matrix[idx] = rule;
  else state.matrix.push(rule);
  state.matrix = [...state.matrix];
  audit(at, me, 'Routing rule changed', `${rule.id}: ${before ? `${before.target} → ` : 'new → '}${rule.target} (${rule.category}${rule.subcategory ? '/' + rule.subcategory : ''}${rule.lgaIds?.length ? ' in ' + rule.lgaIds.join(',') : ''})`);
  commit();
}
export function removeRule(id: string) {
  state.matrix = state.matrix.filter((r) => r.id !== id);
  audit(now(), persona(), 'Routing rule removed', id);
  commit();
}
export function updateSla(c: CategoryId, s: Severity, field: 'ack' | 'arrive' | 'resolve', mins: number | undefined) {
  const before = state.sla[c][s][field];
  state.sla = { ...state.sla, [c]: { ...state.sla[c], [s]: { ...state.sla[c][s], [field]: mins } } };
  audit(now(), persona(), 'SLA changed', `${c}/${s} ${field}: ${before ?? '—'} → ${mins ?? '—'} min (applies to new cases)`);
  commit();
}
export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  location.hash = '';
  location.reload();
}

// ---------- boot ----------

import { buildSeed } from './seed';

function fresh(): State {
  return {
    v: 1,
    clockOffset: 0,
    seq: 470,
    incidents: [],
    audit: [],
    outbox: [],
    matrix: dep.matrix.map((r) => ({ ...r })),
    sla: JSON.parse(JSON.stringify(dep.sla)),
    personaId: 'disp1',
    unseals: [],
    lastViewLog: {},
  };
}

function boot() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.v === 1) {
        state = s;
        return;
      }
    }
  } catch {
    /* fall through to a fresh seed */
  }
  state = fresh();
  const start = Date.now();
  quietBefore = start - 6 * HOUR;
  buildSeed({ start, submitAt: (at, input) => submitAt(at, input).incident, actAt, escalate });
  quietBefore = 0;
  tick();
  state.incidents.sort((a, b) => b.createdAt - a.createdAt);
  commit();
}

/** Seeding helper: run an action as a given person at a given time. */
function actAt(at: number, personId: string, id: string, fn: keyof typeof actions, ...args: unknown[]) {
  const offset = state.clockOffset;
  const who = state.personaId;
  state.clockOffset = at - Date.now();
  state.personaId = personId;
  const i = state.incidents.find((x) => x.id === id);
  if (i) escalate(i, at);
  (actions[fn] as (...a: unknown[]) => unknown)(id, ...args);
  state.clockOffset = offset;
  state.personaId = who;
}

export type SeedApi = {
  start: number;
  submitAt: (at: number, input: ReportInput) => Incident;
  actAt: typeof actAt;
  escalate: typeof escalate;
};

boot();
export { get as getState, DAY };
