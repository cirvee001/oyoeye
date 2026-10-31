import { useSyncExternalStore } from 'react';
import { LEADERS, OYO, areaPoint } from './deployments/oyo';
export { LEADERS };
import {
  DAY,
  HOUR,
  LEVEL_LABEL,
  MANAGER_ROLES,
  MAX_LEVEL,
  MIN,
  SECURITY_LEVEL_LABEL,
  agencyManagers,
  deadlines,
  distinctReporters,
  escalationContact,
  escalationFor,
  findDuplicate,
  fnv,
  isActive,
  isLive,
  isOpen,
  km,
  pendingHandoff,
  pickOfficer,
  route,
} from './platform/engine';
import { titleFor, triage } from './platform/triage';
import type {
  RejectKind,
  Complaint,
  Feedback,
  FocalGroup,
  Agency,
  AgencyKind,
  AuditEntry,
  ChatChannel,
  ChatMessage,
  StationRole,
  Transfer,
  CategoryId,
  Channel,
  Evidence,
  EvidenceKind,
  Handoff,
  HandoffKind,
  Identity,
  Incident,
  Notice,
  NoticeKind,
  OutboundMessage,
  Person,
  Report,
  RoutingRule,
  Severity,
  Shift,
  SlaTable,
  Vehicle,
  Checkpoint,
  CheckpointKind,
  OutOfServiceReason,
} from './platform/types';

import { msg, msgText, type Lang, type Msg } from './strings';
import { HOSPITALS, ROUTES, canDispatch, nearestVehicles, seedCheckpoints, seedVehicles, vehiclePosition } from './fleet';
import { PHONE_HINT, fmtTimeWat, lagosIsoDate, lagosYymmdd, normalisePhone, validPhone } from './format';

export const dep = OYO;
// v2 changes the status model; old v1 state is ignored and the demo reseeds.
const KEY = 'oyoeye:v2.8'; // v2.2 adds stations, staff onboarding and chat to the saved state

export interface Unseal {
  incidentId: string;
  personId: string;
  at: number;
  until: number;
  reason: string;
}

export interface DutyEntry {
  on: boolean;
  shift: Shift;
}

export interface State {
  v: 2;
  clockOffset: number;
  seq: number;
  incidents: Incident[];
  audit: AuditEntry[];
  outbox: OutboundMessage[];
  inbox: Notice[];
  matrix: RoutingRule[];
  sla: SlaTable;
  signedInId?: string;
  /** Citizens who signed up with phone + OTP during the demo. */
  citizens: Person[];
  duty: Record<string, DutyEntry>;
  lang: 'en' | 'yo';
  unseals: Unseal[];
  lastViewLog: Record<string, number>;
  /** Stations and staff live in state so onboarding persists (the same arrays as dep.agencies / dep.people). */
  agencies: Agency[];
  people: Person[];
  transfers: Transfer[];
  chat: ChatMessage[];
  /** personId → channelId → last read time. */
  chatRead: Record<string, Record<string, number>>;
  // v2.3
  feedback: Feedback[];
  complaints: Complaint[];
  unsealReviews: Record<number, { verdict: 'reviewed' | 'concern'; by: string; at: number; note?: string }>;
  noticeRules: { enabled: Record<string, boolean>; kidnapApproval: boolean };
  loneCheckMins: number;
  mapPrefs: Record<string, { layers: string[]; time: '24h' | '7d' | '30d'; base?: 'osm' | 'dark' | 'light' }>;
  /** v2.4: current OyoEye Rule Book version. */
  rulebookVersion: number;
  // v2.5
  /** Demo control: "Use my location" returns this point instead of the presenter's real one. */
  simLocation: 'off' | 'agbowo' | 'igangan' | 'moniya' | 'ogbomoso';
  /** Cases created before this time never ring (seeded history). */
  alertsSince: number;
  /** "control|caseId" (any operator opened it) or "personId|caseId". */
  alertOpened: Record<string, number>;
  /** personId → alert sound muted until. */
  alertMute: Record<string, number>;
  /** "personId|page" → last map view. */
  mapViews: Record<string, { lat: number; lng: number; zoom: number }>;
  // v2.8 operational map
  vehicles: Vehicle[];
  checkpoints: Checkpoint[];
}

let state: State;
let seeding = false; // case events don't post chat system messages while history is generated
const listeners = new Set<() => void>();
let quietBefore = 0; // while seeding, drop messages older than this
let readBefore = 0; // while seeding, mark older inbox items as read

export const now = () => Date.now() + (state?.clockOffset ?? 0);
const get = () => state;

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
    () => sel(state),
  );
}

let saveTimer: number | undefined;
function commit() {
  state = { ...state, incidents: [...state.incidents], audit: [...state.audit], outbox: [...state.outbox], inbox: [...state.inbox], chat: [...state.chat], transfers: [...state.transfers], feedback: [...state.feedback], complaints: [...state.complaints], vehicles: [...state.vehicles], checkpoints: [...state.checkpoints] };
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

export const GUEST: Person = { id: 'guest', name: 'Guest', role: 'citizen', title: 'Not signed in', phone: '' };
export const person = (id?: string) => (id ? dep.people.find((p) => p.id === id) ?? state.citizens.find((p) => p.id === id) : undefined);
export const agency = (id?: string) => dep.agencies.find((a) => a.id === id);
export const lgaOf = (id: string) => dep.lgas.find((l) => l.id === id)!;
export const cat = (id: CategoryId) => dep.categories.find((c) => c.id === id)!;
export const subLabel = (c: CategoryId, s?: string) => cat(c).subcategories.find((x) => x.id === s)?.label ?? cat(c).label;
export const persona = () => person(state.signedInId) ?? GUEST;
export const signedIn = () => !!person(state.signedInId);
export const levelLabel = (i: Incident, level = i.escalationLevel) => (i.restricted ? SECURITY_LEVEL_LABEL : LEVEL_LABEL)[level];
export const incidentByRef = (ref: string) => {
  const r = ref.trim().toUpperCase();
  return state.incidents.find((i) => i.ref === r || i.reports.some((x) => x.ref === r));
};
export const controlRoom = () => dep.agencies.find((a) => a.kind === 'control_room')!;
export const onDuty = (id: string) => state.duty[id]?.on ?? true;
export const ackMinutes = (i: Incident) => state.sla[i.category][i.severity].ack;
export const isControl = (p: Person) => agency(p.agencyId)?.kind === 'control_room' && ['dispatcher', 'ops_manager'].includes(p.role);
export const isManagerOf = (p: Person, agencyId: string) =>
  p.agencyId === agencyId && (MANAGER_ROLES.includes(p.role) || (p.role === 'sensitive' && agency(agencyId)?.kind === 'sensitive_desk'));
export const handoffTarget = (h: Pick<Handoff, 'toAgencyId' | 'toPersonId'>) => (h.toPersonId ? person(h.toPersonId)?.name ?? 'officer' : agency(h.toAgencyId)?.short ?? h.toAgencyId);
export const holderLabel = (i: Incident) => (i.officerId ? `${person(i.officerId)?.name} · ${agency(i.agencyId)?.short}` : agency(i.agencyId)?.short ?? '—');

/** Can this person accept or decline the handoff? */
export function canDecide(me: Person, h: Handoff) {
  if (h.status !== 'pending') return false;
  if (h.kind === 'officer') return me.id === h.toPersonId || (!!h.vehicleId && isManagerOf(me, h.toAgencyId));
  if (h.kind === 'handback') return me.id === h.toPersonId || isManagerOf(me, h.toAgencyId);
  if (me.agencyId !== h.toAgencyId) return false;
  const kind = agency(h.toAgencyId)?.kind;
  if (kind === 'control_room') return ['dispatcher', 'ops_manager'].includes(me.role);
  return isManagerOf(me, h.toAgencyId);
}

// ---------- audit, inbox & outbound messages ----------

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

function send(at: number, to: Person | undefined, channel: OutboundMessage['channel'], text: string, incidentId?: string, phone?: string, lang?: Lang) {
  if (at < quietBefore) return;
  if (!to && !phone) return;
  state.outbox.unshift({ id: `m${state.seq}-${state.outbox.length}-${at}`, at, channel, to: to?.name ?? 'Reporter', phone: phone ?? to!.phone, text, incidentId, lang });
  if (state.outbox.length > 600) state.outbox.length = 600;
}

let noticeSeq = 0;
function notify(at: number, to: (string | undefined)[], kind: NoticeKind, body: string | Msg, i?: Incident, handoffId?: string, transferId?: string, channelId?: string, sosAgencyId?: string) {
  if (at < quietBefore) return;
  const text = typeof body === 'string' ? body : msgText(body, 'en');
  const m = typeof body === 'string' ? undefined : body;
  for (const id of new Set(to.filter(Boolean) as string[])) {
    state.inbox.unshift({ id: `n${at}-${noticeSeq++}`, at, to: id, kind, text, msg: m, incidentId: i?.id, ref: i?.ref, handoffId, transferId, channelId, sosAgencyId, read: at < readBefore });
  }
  if (state.inbox.length > 800) state.inbox.length = 800;
}

const hhmm = (t: number) => fmtTimeWat(t); // SMS and audit timestamps carry WAT (v2.6 §2)
const place = (i: Incident) => `${i.area}, ${lgaOf(i.lgaId).name}`;

function alertText(i: Incident, heading = 'OYOEYE ALERT') {
  const lines = [
    heading,
    `${i.severity.toUpperCase()} PRIORITY`,
    `${subLabel(i.category, i.subcategory)} — ${place(i)}${i.landmark ? ` (near ${i.landmark})` : ''}.`,
    `Case: ${i.ref}`,
    `Accept by: ${hhmm(i.ackDueAt)}`,
  ];
  if (i.restricted) lines.push('Reporter: via control room only. Treat as unverified until confirmed.');
  if (i.reports.length > 1) lines.push(`${distinctReporters(i)} independent reporters`);
  lines.push('Open OyoEye to ACCEPT or DECLINE');
  return lines.join('\n');
}

/**
 * A2: SMS/WhatsApp to a reporter only when it is safe. Never for confidential
 * identities or sensitive types (GBV, kidnapping, tips) unless they opted in.
 * Wording never names the case type.
 */
function canText(i: Incident, r: Report) {
  if (r.identity === 'anonymous' || !r.reporter?.phone) return false;
  const quiet = r.identity === 'confidential' || !!cat(i.category).subcategories.find((s) => s.id === i.subcategory)?.quiet || i.sensitiveOnly;
  return !quiet || !!r.reporter.optInUpdates;
}

/** The reporter's language: their saved choice when signed in, else the language they reported in. */
export function reporterLang(r: Pick<Report, 'reporter' | 'lang'>): Lang {
  return person(r.reporter?.personId)?.language ?? r.lang ?? 'en';
}

function tellReporter(at: number, i: Incident, r: Report, m: Msg) {
  if (r.reporter?.personId) notify(at, [r.reporter.personId], 'citizen', m, i);
  if (canText(i, r)) {
    const lang = reporterLang(r);
    send(at, undefined, r.channel === 'whatsapp' ? 'whatsapp' : 'sms', msgText(msg('m.sms', { ref: r.ref, text: m }), lang), i.id, r.reporter!.phone, lang);
  }
}

function notifyReporters(i: Incident, at: number, m: Msg) {
  i.updates.push({ at, text: msgText(m, 'en'), msg: m });
  for (const r of i.reports) tellReporter(at, i, r, m);
  tellFocalWatchers(at, i, m);
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
  reporter?: { personId?: string; name?: string; phone?: string; optInUpdates?: boolean };
  photo?: string;
  voice?: string;
  sos?: boolean;
  callRef?: string;
  actor?: Person;
  focal?: Report['focal'];
  /** v2.5: reporter's language (defaults to the signed-in person's or the device's). */
  lang?: Lang;
  /** v2.5: SOS sent before a location arrived. */
  locationUnknown?: boolean;
  /** Seeding only: scripted demo cases are never merged into background history. */
  noMerge?: boolean;
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
  const yymmdd = lagosYymmdd(at);
  state.seq += 1;
  return `${dep.prefix}-${code}-${yymmdd}-${String(state.seq).padStart(5, '0')}`;
}

function applyDeadlines(i: Incident) {
  const d = deadlines(i.createdAt, state.sla[i.category][i.severity]);
  i.ackDueAt = i.t.assigned ? i.t.assigned + state.sla[i.category][i.severity].ack * MIN : d.ackDueAt;
  i.arriveDueAt = d.arriveDueAt;
  i.resolveDueAt = d.resolveDueAt;
}

/** A3: place names are removed before keyword matching. */
const GAZETTEER = [...dep.lgas.map((l) => l.name), ...dep.lgas.flatMap((l) => l.areas)];
export const suggest = (text: string, hint?: { category?: CategoryId; subcategory?: string; sos?: boolean }) => triage(text, hint, GAZETTEER);

const SEV_ORDER: Severity[] = ['low', 'normal', 'high', 'critical'];
const dispatchers = () => dep.people.filter((p) => p.agencyId === controlRoom().id && p.role === 'dispatcher').map((p) => p.id);
const dutyLeads = () => {
  const all = dep.people.filter((p) => p.agencyId === controlRoom().id && p.role === 'ops_manager');
  const on = all.filter((p) => onDuty(p.id));
  return (on.length ? on : all).map((p) => p.id);
};

function submitAt(at: number, input: ReportInput) {
  const ai = suggest(input.text, { category: input.category, subcategory: input.subcategory, sos: input.sos });
  const category = ai.category;
  const c = cat(category);
  const subcategory = ai.subcategory;
  const sub = c.subcategories.find((s) => s.id === subcategory);
  let identity = input.identity;
  if (sub?.forceConfidential && identity === 'standard') identity = 'confidential';
  const salt = String(state.seq);
  const { lat, lng } = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : coordsFor(input.lgaId, input.area, salt);
  const reportRef = refFor(c.code, at);
  const report: Report = {
    lang: input.lang ?? person(input.reporter?.personId)?.language ?? (seeding || input.actor ? 'en' : state.lang),
    ref: reportRef,
    text: input.text,
    channel: input.sos && input.channel !== 'ussd' ? 'sos' : input.channel,
    identity,
    reporter: identity === 'anonymous' ? undefined : input.reporter,
    submittedAt: at,
    lat,
    lng,
    photo: input.photo,
    voice: input.voice,
    callRef: input.callRef,
    focal: input.focal,
  };
  // The audit trail never names a protected reporter.
  const actor =
    input.actor ??
    (identity === 'standard' ? (input.reporter?.personId ? person(input.reporter.personId) : undefined) ?? { id: 'reporter', name: input.reporter?.name || 'Reporter' } : { id: 'protected', name: identity === 'anonymous' ? 'Anonymous reporter' : 'Protected reporter' });

  // SOS is never merged away: each one is a person asking for help. Operators can merge by hand.
  const dup = sub?.sensitiveOnly || input.sos || input.noMerge ? undefined : findDuplicate(state.incidents, { category, subcategory, lat, lng, at });
  if (dup) {
    const before = distinctReporters(dup);
    dup.reports.push(report);
    const distinct = distinctReporters(dup);
    audit(at, actor, 'Report received', `${reportRef} via ${report.channel} — merged into ${dup.ref} (${dup.reports.length} reports, ${distinct} distinct reporters)`, dup.id);
    // A1: corroboration counts distinct reporters only.
    if (dup.unverified && distinct >= 2 && before < 2) {
      dup.unverified = false;
      audit(at, SYSTEM, `Reported by ${distinct} people`, `${distinct} independent reporters (still not proof).`, dup.id);
    }
    if (SEV_ORDER.indexOf(ai.severity) > SEV_ORDER.indexOf(dup.severity)) {
      audit(at, AI, 'Severity suggestion', `New report suggests ${ai.severity}; current ${dup.severity}. Left for a person to decide.`, dup.id);
    }
    if (distinct >= 5 && !dup.bumped && dup.severity !== 'critical') {
      dup.bumped = true;
      const from = dup.severity;
      dup.severity = SEV_ORDER[Math.min(3, SEV_ORDER.indexOf(dup.severity) + 1)];
      applyDeadlines(dup);
      audit(at, SYSTEM, 'Severity raised', `${from} → ${dup.severity}: 5 distinct reporters`, dup.id);
    }
    tellReporter(at, dup, report, msg('m.recv.dup', { ref: dup.ref }));
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
    status: 'pending',
    agencyId: controlRoom().id,
    suggestedAgencyId: routed.agency?.id,
    escalationLevel: 1,
    restricted,
    sensitiveOnly,
    unverified: restricted,
    createdAt: at,
    ackDueAt: 0,
    resolveDueAt: 0,
    t: {},
    by: {},
    handoffs: [],
    evidence: [],
    reports: [report],
    updates: [],
    reopenCount: 0,
    ai,
    locationUnknown: input.locationUnknown || undefined,
  };
  applyDeadlines(i);
  state.incidents.unshift(i);
  audit(at, actor, 'Report received', `${reportRef} via ${report.channel}, identity ${identity}${input.callRef ? `, call ${input.callRef}` : ''}`, i.id);
  audit(at, AI, 'Triage suggestion', `${c.label} / ${subLabel(category, subcategory)}, ${ai.severity}, confidence ${Math.round(ai.confidence * 100)}% — ${ai.signals.join('; ')}`, i.id);
  audit(at, SYSTEM, 'Routing', `Rule ${routed.rule?.id ?? 'none'} → ${routed.agency?.short ?? 'no match'}`, i.id);
  if (namesGroup(input.text)) {
    i.namesGroup = true;
    audit(at, SYSTEM, 'Names a group', 'Supervisor review before armed dispatch', i.id);
  }
  const reporterPerson = person(input.reporter?.personId);
  if (restricted && isVerifiedFocal(reporterPerson)) {
    i.unverified = false;
    audit(at, SYSTEM, 'Registered focal person', 'Report from a registered community focal person — still needs a person to verify; never auto-dispatched', i.id);
  }

  const heading = input.sos ? 'SOS — OYOEYE' : 'NEW SECURITY REPORT';
  if (restricted) {
    // Security never auto-dispatches: a person in the control room (or the restricted desk) decides.
    if (sensitiveOnly && routed.agency) i.agencyId = routed.agency.id;
    const desk = sensitiveOnly ? dep.people.filter((p) => p.agencyId === i.agencyId).map((p) => p.id) : dispatchers();
    notify(at, desk, 'info', `${input.sos ? 'SOS' : 'New security report'}: ${subLabel(category, subcategory)} — ${place(i)}. Pending review.`, i);
    for (const d of desk) send(at, person(d), 'push', alertText(i, heading), i.id);
    if (!sensitiveOnly && (input.sos || i.severity === 'critical')) {
      notify(at, dutyLeads(), 'info', `${input.sos ? 'SOS' : 'Critical report'} waiting for review: ${place(i)}.`, i);
      send(at, person(dutyLeads()[0]), 'sms', alertText(i, input.sos ? 'SOS — OYOEYE' : 'CRITICAL SECURITY REPORT'), i.id);
    }
    notifyReporters(i, at, msg(input.sos ? 'm.recv.sos' : 'm.recv.sec', { area: i.area }));
  } else if (category === 'other' || !routed.agency || (ai.confidence < 0.5 && !input.category)) {
    // A4: unclear reports wait for central review in the control room — not Security.
    audit(at, SYSTEM, 'Held for review', 'Unclassified or low confidence — a person must confirm the category', i.id);
    notify(at, dispatchers(), 'info', `Unclassified report needs review: "${titleFor(input.text, 50)}" — ${place(i)}.`, i);
    notifyReporters(i, at, msg('m.recv.pending', { area: i.area }));
  } else {
    const officer = pickOfficer(dep, state.incidents, routed.agency.id, onDuty);
    createHandoff(i, at, SYSTEM, { agencyId: routed.agency.id, personId: officer?.id }, 'Routing rule — covers this problem and area');
    notifyReporters(i, at, msg('m.recv.sent', { area: i.area, unit: routed.agency.short }));
  }
  return { ref: reportRef, incident: i, merged: false };
}

// ---------- handoffs ----------

function createHandoff(i: Incident, at: number, from: Person | typeof SYSTEM, to: { agencyId: string; personId?: string; kind?: HandoffKind; vehicleId?: string }, reason: string, note?: string) {
  const toAgency = agency(to.agencyId);
  const kind: HandoffKind =
    to.kind ?? (to.personId && person(to.personId)?.role === 'officer' ? 'officer' : toAgency?.kind === 'control_room' ? 'control' : toAgency?.kind === 'sensitive_desk' ? 'desk' : 'unit');
  // A newer handoff replaces an unanswered one; a decline still returns to where it was before both.
  const superseded = pendingHandoff(i);
  if (superseded) superseded.status = 'superseded';
  const prev = superseded?.prev ?? {
    agencyId: from === SYSTEM ? controlRoom().id : i.agencyId,
    officerId: from === SYSTEM ? undefined : i.officerId,
    status: from === SYSTEM ? 'pending' : i.status,
    acknowledged: from === SYSTEM ? undefined : i.t.acknowledged,
  };
  const h: Handoff = {
    id: `${i.id}-h${i.handoffs.length + 1}`,
    at,
    kind,
    fromId: from.id,
    fromName: from.name,
    fromAgencyId: from === SYSTEM ? undefined : (from as Person).agencyId,
    toAgencyId: to.agencyId,
    toPersonId: to.personId,
    reason,
    note,
    status: 'pending',
    prev,
    vehicleId: to.vehicleId,
  };
  i.handoffs.push(h);
  const fromLabel = from === SYSTEM ? 'OyoEye routing' : `${from.name}${(from as Person).agencyId ? ` (${agency((from as Person).agencyId)?.short})` : ''}`;
  i.agencyId = to.agencyId;
  i.officerId = kind === 'officer' ? to.personId : undefined;
  i.status = 'assigned';
  i.t.assigned = at;
  i.t.acknowledged = undefined;
  // The acceptance clock starts at handoff.
  i.ackDueAt = at + ackMinutes(i) * MIN;
  i.by.assigned = handoffTarget(h);
  const target = to.personId ? `${person(to.personId)?.name} (${toAgency?.short})` : toAgency?.short;
  const fromUnit = from === SYSTEM ? 'OyoEye routing' : agency((from as Person).agencyId)?.short ?? from.name;
  const what =
    kind === 'handback' ? `Passed back to ${person(to.personId)?.name ?? toAgency?.short}` : kind === 'control' ? `Passed back to the ${dep.emergencyLine} control room` : kind === 'officer' ? `Passed to ${person(to.personId)?.name}` : i.t.verified === at && from !== SYSTEM ? `Verified and passed to ${target}` : `Passed from ${fromUnit} to ${target}`;
  audit(at, from, kind === 'handback' || kind === 'control' ? 'Passed back' : 'Passed', `${what} — ${reason}${note ? `. Note: ${note}` : ''}${from === SYSTEM ? '' : ` (by ${fromLabel})`}`, i.id);
  if (!seeding && prev.agencyId !== to.agencyId && toAgency?.kind !== 'control_room') systemPost(to.agencyId, `Case ${i.ref} (${subLabel(i.category, i.subcategory)}, ${i.area}) was passed to this station.`, at);
  const receivers = to.personId ? [to.personId] : agencyManagers(dep, to.agencyId, onDuty).map((p) => p.id);
  const verb = kind === 'handback' || kind === 'control' ? 'passed back' : 'passed';
  notify(at, receivers, 'handoff', `${from === SYSTEM ? 'New case' : `${from.name} ${verb} a case`}: ${subLabel(i.category, i.subcategory)} — ${place(i)}. Reason: ${reason}. Accept within ${ackMinutes(i)} min.`, i, h.id);
  for (const r of receivers) send(at, person(r), 'whatsapp', alertText(i, kind === 'handback' ? 'OYOEYE — CASE PASSED BACK TO YOU' : 'OYOEYE — CASE PASSED TO YOU'), i.id);
  if (i.severity === 'critical' && to.personId) send(at, person(to.personId), 'sms', alertText(i), i.id);
  return h;
}

function acceptAt(i: Incident, at: number, me: Person) {
  const h = pendingHandoff(i);
  if (!h) return 'Nothing to accept';
  if (!canDecide(me, h)) return 'This handoff is for someone else';
  h.status = 'accepted';
  h.decidedAt = at;
  h.decidedBy = me.name;
  i.t.acknowledged = at;
  i.by.accepted = me.name;
  if (h.kind === 'handback') i.officerId = undefined;
  if (h.kind === 'officer') i.officerId = h.toPersonId;
  if (h.kind === 'officer' && me.loneDuty && !i.lone) startLone(at, i, me.id);
  if (h.vehicleId) vehicleRespond(at, h.vehicleId, i, me);
  i.status = agency(h.toAgencyId)?.kind === 'control_room' ? (i.t.verified ? 'verified' : 'pending') : 'accepted';
  audit(at, me, 'Handoff accepted', `${me.name} accepted${h.kind === 'unit' ? ` for ${agency(h.toAgencyId)?.short}` : ''}`, i.id);
  if (h.fromId !== SYSTEM.id) notify(at, [h.fromId], 'accepted', `${me.name} accepted ${i.ref} (${subLabel(i.category, i.subcategory)}).`, i);
  if (h.kind !== 'handback' && h.kind !== 'control') notifyReporters(i, at, i.restricted ? msg('m.accepted.sec') : msg('m.accepted', { unit: agency(i.agencyId)?.short ?? '' }));
}

// ---------- escalation ----------

function escalate(i: Incident, at: number) {
  const target = escalationFor(i, at);
  while (i.escalationLevel < target) {
    i.escalationLevel += 1;
    raise(i, at, !i.t.acknowledged && at > i.ackDueAt ? 'not accepted in time' : i.arriveDueAt && !i.t.onScene && at > i.arriveDueAt ? 'no arrival within target' : i.reopenCount ? 'reopened' : 'resolution target missed');
  }
}

function raise(i: Incident, at: number, reason: string) {
  const who = escalationContact(dep, i, i.escalationLevel, onDuty);
  audit(at, SYSTEM, 'Escalated', `Level ${i.escalationLevel} — ${levelLabel(i)}${who ? ` (${who.name})` : ''}: ${reason}`, i.id);
  if (!seeding && agency(i.agencyId)?.kind !== 'control_room') systemPost(i.agencyId, `Case ${i.ref} escalated to L${i.escalationLevel} (${levelLabel(i)}): ${reason}.`, at);
  notify(at, [who?.id], 'escalation', `Escalated to you (L${i.escalationLevel} · ${levelLabel(i)}): ${subLabel(i.category, i.subcategory)} — ${place(i)}. Reason: ${reason}. Held by ${holderLabel(i)}.`, i);
  send(at, who, i.escalationLevel >= 4 ? 'sms' : 'whatsapp', `${alertText(i, `OYOEYE ESCALATION — LEVEL ${i.escalationLevel}`)}\nReason: ${reason}.`, i.id);
  // The sender of an unanswered handoff is told.
  const h = pendingHandoff(i);
  if (h && h.fromId !== SYSTEM.id && h.fromId !== who?.id && reason === 'not accepted in time') {
    notify(at, [h.fromId], 'escalation', `${handoffTarget(h)} has not accepted ${i.ref} — escalated to ${levelLabel(i)}${who ? ` (${who.name})` : ''}.`, i);
  }
}

export function tick() {
  const at = now();
  let changed = false;
  for (const i of state.incidents) {
    const before = i.escalationLevel;
    escalate(i, at);
    if (i.status === 'resolved' && cat(i.category).citizenVerification && i.t.resolved && at - i.t.resolved > 72 * HOUR) {
      i.status = 'closed';
      i.verification = 'timeout';
      i.t.closed = at;
      i.by.closed = 'OyoEye (no reply in 72h)';
      audit(at, SYSTEM, 'Closed', 'No citizen response in 72h — Closed (unconfirmed)', i.id);
      askFeedback(at, i);
      changed = true;
    }
    if (i.escalationLevel !== before) changed = true;
  }
  if (runCheckIns(at)) changed = true;
  const n = state.unseals.length;
  state.unseals = state.unseals.filter((u) => u.until > at);
  if (changed || n !== state.unseals.length) commit();
}

// ---------- actions (signed-in person) ----------

type Act = (i: Incident, at: number, me: Person) => void | string;
function act(id: string, fn: Act): string | undefined {
  const i = state.incidents.find((x) => x.id === id);
  if (!i) return 'Case not found';
  const at = now();
  escalate(i, at);
  const err = fn(i, at, persona());
  if (typeof err === 'string') {
    commit();
    return err;
  }
  commit();
}

export function submitReport(input: ReportInput) {
  const res = submitAt(now(), input);
  commit();
  return res;
}

function classify(i: Incident, v: { category?: CategoryId; subcategory?: string; severity?: Severity }) {
  const category = v.category ?? i.category;
  const changes: string[] = [];
  if (category !== i.category) changes.push(`category ${cat(i.category).label} → ${cat(category).label}`);
  if (v.subcategory && v.subcategory !== i.subcategory) changes.push(`type → ${subLabel(category, v.subcategory)}`);
  if (v.severity && v.severity !== i.severity) changes.push(`severity ${i.severity} → ${v.severity}`);
  if (category !== i.category && !v.subcategory) i.subcategory = cat(category).subcategories[0].id;
  i.category = category;
  if (v.subcategory) i.subcategory = v.subcategory;
  if (v.severity) i.severity = v.severity;
  i.restricted = cat(i.category).restricted;
  i.sensitiveOnly = !!cat(i.category).subcategories.find((s) => s.id === i.subcategory)?.sensitiveOnly;
  applyDeadlines(i);
  return changes;
}

function markVerified(i: Incident, at: number, me: Person, how: string) {
  i.t.verified = at;
  i.by.verified = me.name;
  i.unverified = false;
  i.status = 'verified';
  audit(at, me, 'Verified', how, i.id);
  maybeNotifyLeaders(at, i, me);
}

function resolveEvidence(i: Incident, since: number) {
  return i.evidence.filter((e) => e.at > since);
}

function reopen(i: Incident, at: number, actor: { id: string; name: string }, why: string) {
  i.status = 'reopened';
  i.reopenCount += 1;
  i.t.reopened = at;
  i.t.acknowledged = undefined;
  i.t.assigned = at;
  i.ackDueAt = at + ackMinutes(i) * MIN;
  i.side = { kind: 'reopened', at, step: 5, by: actor.name, reason: why };
  audit(at, actor, 'Reopened', why, i.id);
  // Escalation +1 on every reopen (capped by severity).
  if (i.escalationLevel < MAX_LEVEL[i.severity]) {
    i.escalationLevel += 1;
    raise(i, at, 'reopened');
  }
  const managers = agencyManagers(dep, i.agencyId, onDuty).map((p) => p.id);
  notify(at, [i.officerId, ...managers], 'reopened', `${i.ref} reopened: ${why}. Accept it again and fix it.`, i);
  notifyReporters(i, at, i.restricted ? msg('m.reopened.sec') : msg('m.reopened', { unit: agency(i.agencyId)?.short ?? '' }));
}

const iCan = {
  work: (i: Incident, me: Person) => (me.role === 'officer' && i.officerId === me.id) || (!i.officerId && isManagerOf(me, i.agencyId)) || (me.role === 'sensitive' && i.sensitiveOnly && me.agencyId === i.agencyId),
};

export const actions = {
  /** Operator: confirm it is real without passing it yet. */
  verify: (id: string, v: { subcategory?: string; severity?: Severity; category?: CategoryId; how?: string } = {}) =>
    act(id, (i, at, me) => {
      if (!isControl(me) && !(me.role === 'sensitive' && i.sensitiveOnly)) return 'Only the control room can verify reports';
      if (i.status !== 'pending') return 'Already reviewed';
      if (callbackNeeded(state, i)) return 'Call back the reporter before verifying (Restricted standing)';
      const changes = classify(i, v);
      markVerified(i, at, me, `${v.how ?? 'Checked by operator'}${changes.length ? `. Changed: ${changes.join(', ')}` : ''}`);
    }),

  /** Operator: Verify & pass to unit (or agency / restricted desk) in one step. */
  verifyAndPass: (id: string, v: { category?: CategoryId; subcategory?: string; severity?: Severity; toAgencyId: string; reason: string; note?: string; vehicleId?: string }) =>
    act(id, (i, at, me) => {
      const desk = me.role === 'sensitive' && i.sensitiveOnly;
      if (!isControl(me) && !desk) return 'Only the control room can verify and pass reports';
      if (!['pending', 'verified'].includes(i.status)) return 'This case has already been passed';
      if (!v.reason.trim()) return 'Choose a reason';
      if (callbackNeeded(state, i)) return 'Call back the reporter before verifying (Restricted standing)';
      const changes = classify(i, v);
      if (i.status === 'pending') markVerified(i, at, me, `${distinctReporters(i) > 1 ? `Reported by ${distinctReporters(i)} people` : 'Operator judgement'}${changes.length ? `. Changed: ${changes.join(', ')}` : ''}`);
      const to = agency(v.toAgencyId);
      if (!to) return 'Choose who to pass it to';
      if (holdArmed(i, at, me, to, v.reason, v.note)) return;
      const civic = !['police', 'corps', 'sensitive_desk', 'control_room'].includes(to.kind);
      const veh = v.vehicleId ? state.vehicles.find((x) => x.id === v.vehicleId) : undefined;
      if (veh && (!canDispatch(veh) || veh.stationId !== to.id)) return `${veh.callSign} can't be sent (${veh.status === 'out_of_service' ? `out of service — ${veh.statusReason}` : 'busy'})`;
      const officer = veh ? person(veh.crewIds[0]) : civic ? pickOfficer(dep, state.incidents, to.id, onDuty) : undefined;
      createHandoff(i, at, me, { agencyId: to.id, personId: officer?.id, vehicleId: veh?.id }, veh ? `${v.reason} · nearest vehicle ${veh.callSign}` : v.reason, v.note);
      notifyReporters(i, at, i.restricted ? msg('m.checked.sec') : msg('m.checked', { unit: to.short }));
    }),

  /** Pass case: the rules depend on who you are (PRD 3.3). */
  passCase: (id: string, v: { toAgencyId: string; toPersonId?: string; reason: string; note?: string; vehicleId?: string }) =>
    act(id, (i, at, me) => {
      if (!isOpen(i)) return 'This case is closed';
      if (!v.reason.trim()) return 'Choose or write a reason';
      const to = agency(v.toAgencyId);
      if (!to) return 'Choose who to pass it to';
      const h = pendingHandoff(i);
      if (isControl(me)) {
        if (i.status === 'pending') return 'Verify the report first';
      } else if (me.role === 'sensitive') {
        if (!['police', 'sensitive_desk'].includes(to.kind)) return 'The restricted desk passes only to police or SGBV partners';
      } else if (MANAGER_ROLES.includes(me.role) && (i.agencyId === me.agencyId || h?.fromAgencyId === me.agencyId)) {
        if (v.toPersonId) {
          const p = person(v.toPersonId);
          if (!p || p.agencyId !== me.agencyId || p.role !== 'officer') return 'You can assign only officers in your own unit';
        }
      } else return 'Your role cannot pass this case';
      if (isControl(me) && holdArmed(i, at, me, to, v.reason, v.note)) return;
      // Assigning an officer from "Assigned to us" accepts for the unit first.
      if (h && canDecide(me, h) && h.toAgencyId === me.agencyId) acceptAt(i, at, me);
      const veh = v.vehicleId ? state.vehicles.find((x) => x.id === v.vehicleId) : undefined;
      if (veh && (!canDispatch(veh) || veh.stationId !== v.toAgencyId)) return `${veh.callSign} can't be sent (${veh.status === 'out_of_service' ? `out of service — ${veh.statusReason}` : 'busy'})`;
      createHandoff(i, at, me, { agencyId: v.toAgencyId, personId: v.toPersonId ?? (veh ? veh.crewIds[0] : undefined), vehicleId: veh?.id }, veh ? `${v.reason} · nearest vehicle ${veh.callSign}` : v.reason, v.note);
    }),

  /** Field officer: hand the case back to their own commander, with a reason. */
  handBack: (id: string, reason: string) =>
    act(id, (i, at, me) => {
      if (me.role !== 'officer' || i.officerId !== me.id) return 'Only the assigned officer can pass it back';
      if (!reason.trim()) return 'Give a reason';
      const cmdr = agencyManagers(dep, me.agencyId!, onDuty).find((p) => p.role === 'supervisor') ?? agencyManagers(dep, me.agencyId!, onDuty)[0];
      if (!cmdr) return 'No commander found for your unit';
      createHandoff(i, at, me, { agencyId: me.agencyId!, personId: cmdr.id, kind: 'handback' }, reason);
    }),

  acceptHandoff: (id: string) => act(id, (i, at, me) => acceptAt(i, at, me)),

  /** Duty lead: second click for passing a "names a group" case to an armed unit. */
  confirmArmed: (id: string) =>
    act(id, (i, at, me) => {
      if (!(me.role === 'ops_manager' && me.agencyId === controlRoom().id)) return 'Only the duty lead can confirm armed dispatch';
      const h = i.armedHold;
      if (!h) return 'Nothing waiting for confirmation';
      i.armedHold = undefined;
      audit(at, me, 'Armed dispatch confirmed', `${agency(h.toAgencyId)?.short} — names-a-group case reviewed`, i.id);
      createHandoff(i, at, me, { agencyId: h.toAgencyId }, h.reason, h.note);
      notify(at, [h.byId], 'info', `${me.name} confirmed armed dispatch of ${i.ref} to ${agency(h.toAgencyId)?.short}.`, i);
      notifyReporters(i, at, msg('m.checked.sec'));
    }),
  /** Coordinator: approve a held kidnapping notice to traditional rulers. */
  approveNotice: (id: string) =>
    act(id, (i, at, me) => {
      if (!(me.role === 'agency_head' && me.agencyId === controlRoom().id)) return 'Only the security coordinator can approve';
      if (!i.noticeHold?.length) return 'No notice waiting';
      const ids = i.noticeHold;
      i.noticeHold = undefined;
      sendLeaderNotices(at, i, ids, me);
    }),

  /** v2.4: duty lead confirms a "Deliberate false alarm / hoax" rejection (see standing.*). */
  confirmHoax: (id: string) => standing.confirmHoax(id),

  /** Restricted desk: take a pending survivor-centred case and own it. */
  takeCase: (id: string) =>
    act(id, (i, at, me) => {
      if (me.role !== 'sensitive' || !i.sensitiveOnly) return 'Only the restricted desk can take this case';
      if (i.status !== 'pending' && i.status !== 'verified') return 'Already taken';
      if (i.status === 'pending') markVerified(i, at, me, 'Reviewed by the restricted desk');
      i.agencyId = me.agencyId ?? i.agencyId;
      i.t.assigned = at;
      i.by.assigned = agency(i.agencyId)?.short;
      i.t.acknowledged = at;
      i.by.accepted = me.name;
      i.status = 'accepted';
      audit(at, me, 'Taken by restricted desk', `${agency(i.agencyId)?.short} owns the case. Survivor contact only through the protected channel.`, i.id);
    }),

  declineHandoff: (id: string, reason: string) =>
    act(id, (i, at, me) => {
      const h = pendingHandoff(i);
      if (!h) return 'Nothing to decline';
      if (!canDecide(me, h)) return 'This handoff is for someone else';
      if (!reason.trim()) return 'Give a reason';
      h.status = 'declined';
      h.decidedAt = at;
      h.decidedBy = me.name;
      h.declineReason = reason;
      i.agencyId = h.prev.agencyId;
      i.officerId = h.prev.officerId;
      i.status = h.prev.status;
      i.t.acknowledged = h.prev.acknowledged;
      if (!i.t.acknowledged) {
        i.t.assigned = at;
        i.ackDueAt = at + ackMinutes(i) * MIN;
      }
      const back = h.fromId === SYSTEM.id ? 'central review' : h.fromName;
      audit(at, me, 'Handoff declined', `${handoffTarget(h)} declined — ${reason}. Returned to ${back}.`, i.id);
      const to = h.fromId === SYSTEM.id ? dispatchers() : [h.fromId];
      notify(at, to, 'declined', `${me.name} declined ${i.ref}: "${reason}". The case is back with you.`, i);
    }),

  /** Reopened cases: the officer (or unit) takes it back on. */
  acceptCase: (id: string) =>
    act(id, (i, at, me) => {
      if (i.status !== 'reopened') return 'Nothing to accept';
      if (!iCan.work(i, me) && !isManagerOf(me, i.agencyId)) return 'Not your case';
      i.status = 'accepted';
      i.t.acknowledged = at;
      i.by.accepted = me.name;
      audit(at, me, 'Accepted', 'Reopened case accepted again', i.id);
    }),

  callBack: (id: string) =>
    act(id, (i, at, me) => {
      if (i.reports.every((r) => r.identity === 'anonymous' || !r.reporter?.phone)) return 'Anonymous reporter — no call-back possible';
      audit(at, me, 'Call-back to reporter', 'Masked call placed by the control room; number not shown to units', i.id);
    }),

  requestInfo: (id: string, question: string) =>
    act(id, (i, at, me) => {
      if (!question.trim()) return 'Write the question';
      if (i.reports.every((r) => r.identity === 'anonymous')) return 'Anonymous reporter — no way to ask';
      audit(at, me, 'Question to reporter', question, i.id);
      notifyReporters(i, at, msg('m.ask', { q: question }));
    }),

  mergeInto: (id: string, targetId: string) =>
    act(id, (i, at, me) => {
      const t = state.incidents.find((x) => x.id === targetId);
      if (!t || t.id === i.id) return 'Choose the case to merge into';
      if (!isControl(me)) return 'Only the control room can merge reports';
      t.reports.push(...i.reports);
      if (t.unverified && distinctReporters(t) >= 2) t.unverified = false;
      i.side = { kind: 'rejected', at, step: stepOf(i), by: me.name, reason: `Duplicate — merged into ${t.ref}` };
      i.status = 'rejected';
      i.outcome = `Duplicate — merged into ${t.ref}`;
      i.t.closed = at;
      i.by.closed = me.name;
      audit(at, me, 'Merged', `Duplicate — reports moved to ${t.ref}`, i.id);
      audit(at, me, 'Merged', `Received ${i.reports.length} report(s) from ${i.ref}`, t.id);
    }),

  reject: (id: string, reason: string, kind: RejectKind = 'no_trace') =>
    act(id, (i, at, me) => {
      if (!reason.trim()) return 'Give a reason';
      if (!isControl(me) && !(me.role === 'sensitive' && i.sensitiveOnly)) return 'Only the control room can reject a report';
      if (kind === 'hoax' && reason.trim().length < 20) return 'For a deliberate false alarm, write a reason of at least 20 characters';
      if (kind === 'hoax' && i.reports.every((r) => r.identity === 'anonymous')) return 'Anonymous reports have no standing — use another reason';
      i.rejectKind = kind;
      if (kind === 'hoax') i.hoax = { reason: reason.trim(), by: me.name, at };
      i.side = { kind: 'rejected', at, step: stepOf(i), by: me.name, reason };
      i.status = 'rejected';
      i.outcome = reason;
      i.t.closed = at;
      i.by.closed = me.name;
      audit(at, me, kind === 'hoax' ? 'Rejected — deliberate false alarm (awaiting duty lead)' : 'Rejected', `${rejectLabel(kind)}: ${reason}`, i.id);
      if (kind === 'hoax') {
        if (isDutyLead(me)) confirmHoaxAt(at, i, me);
        else notify(at, dutyLeads(), 'info', `Confirm hoax? ${me.name} rejected ${i.ref} as a deliberate false alarm: "${reason.trim()}"`, i);
      }
      notifyReporters(i, at, msg('m.rejected'));
    }),

  /** Citizen: cancel my own report while it is still pending review. */
  cancelReport: (id: string, ref: string) =>
    act(id, (i, at) => {
      if (i.status !== 'pending') return 'It is already being handled — it can no longer be cancelled';
      const r = i.reports.find((x) => x.ref === ref);
      const who = r?.identity === 'standard' ? { id: r.reporter?.personId ?? 'reporter', name: r.reporter?.name ?? 'Reporter' } : { id: 'protected', name: 'Protected reporter' };
      i.side = { kind: 'rejected', at, step: 0, by: 'Reporter', reason: 'Cancelled by reporter' };
      i.status = 'rejected';
      i.outcome = 'Cancelled by reporter';
      i.t.closed = at;
      i.by.closed = 'Reporter';
      audit(at, who, 'Cancelled by reporter', ref, i.id);
    }),

  /** En route (security/fire) or Start work (civic). */
  start: (id: string) =>
    act(id, (i, at, me) => {
      if (!iCan.work(i, me)) return 'Only the assigned officer can do this';
      if (i.status !== 'accepted' && i.status !== 'in_progress') return 'Accept the case first';
      const emergency = i.restricted || i.category === 'fire';
      i.status = 'in_progress';
      i.t.started = at;
      if (emergency) i.t.enRoute = at;
      if (emergency) {
        const v = crewVehicle(me.id);
        if (v && v.caseId !== i.id) vehicleRespond(at, v.id, i, me);
      }
      i.t.acknowledged = i.t.acknowledged ?? at;
      i.by.started = me.name;
      audit(at, me, emergency ? 'En route' : 'Work started', '', i.id);
      notifyReporters(i, at, msg(emergency ? 'm.onway' : 'm.started'));
    }),

  onScene: (id: string) =>
    act(id, (i, at, me) => {
      if (!iCan.work(i, me)) return 'Only the assigned officer can do this';
      i.t.onScene = i.t.onScene ?? at;
      i.status = 'in_progress';
      if (me.loneDuty && !i.lone) startLone(at, i, me.id);
      if (i.lone && !i.lone.nextDue) i.lone = { ...i.lone, nextDue: at + state.loneCheckMins * MIN };
      audit(at, me, 'On scene', `Location confirmed near ${i.area}`, i.id);
      const veh = crewVehicle(me.id);
      if (veh && (veh.caseId === i.id || veh.status === 'responding')) {
        veh.status = 'onscene';
        veh.caseId = i.id;
      }
      notifyReporters(i, at, msg('m.arrived'));
    }),

  addEvidence: (id: string, kind: EvidenceKind, text: string, photo?: string) =>
    act(id, (i, at, me) => {
      if (!text.trim() && !photo) return 'Add a note or a photo';
      i.evidence.push({ at, by: me.name, kind, text: text || 'Photo', photo });
      audit(at, me, kind === 'photo' ? 'Photo added' : i.restricted ? 'Situation report' : 'Update added', text || 'photo', i.id);
    }),

  requestBackup: (id: string, text: string) =>
    act(id, (i, at, me) => {
      i.backupRequested = true;
      audit(at, me, 'Backup requested', text, i.id);
      const managers = agencyManagers(dep, i.agencyId, onDuty).map((p) => p.id);
      notify(at, [...dutyLeads(), ...managers], 'backup', `Backup requested by ${me.name} on ${i.ref} — ${place(i)}: "${text}"`, i);
      send(at, person(dutyLeads()[0]), 'sms', `${alertText(i, 'OYOEYE — BACKUP REQUESTED')}\n${me.name}: ${text}`, i.id);
    }),

  sendBackup: (id: string, agencyId: string) =>
    act(id, (i, at, me) => {
      const a = agency(agencyId);
      if (!a) return 'Choose a unit';
      i.backupSent = a.short;
      audit(at, me, 'Backup sent', `${a.short} sent to support ${agency(i.agencyId)?.short}`, i.id);
      notify(at, [...agencyManagers(dep, a.id, onDuty).map((p) => p.id), i.officerId], 'backup', `${me.name}: ${a.short} is sending backup to ${place(i)} (${i.ref}).`, i);
    }),

  /** Mark resolved: needs an outcome (security) and evidence (civic photo). */
  resolve: (id: string, v: { note: string; outcome?: string; photo?: string }) =>
    act(id, (i, at, me) => {
      if (!iCan.work(i, me)) return 'Only the assigned officer can mark this resolved';
      if (i.status !== 'in_progress') return 'Start the work first';
      const c = cat(i.category);
      if (c.outcomes && !v.outcome) return 'Choose an outcome';
      const since = i.t.reopened ?? 0;
      const fresh: Evidence[] = [...resolveEvidence(i, since)];
      if (v.note.trim()) fresh.push({ at, by: me.name, kind: 'note', text: v.note });
      if (v.photo) fresh.push({ at, by: me.name, kind: 'photo', text: 'Completion photo', photo: v.photo });
      const missing = c.evidence.filter((k) => !fresh.some((e) => e.kind === k));
      if (missing.includes('photo')) return i.t.reopened ? 'A new photo is needed — the case was reopened' : 'A photo of the finished work is needed before you can mark it resolved';
      if (missing.length) return 'Write a short note on what was done';
      if (v.note.trim()) i.evidence.push({ at, by: me.name, kind: 'note', text: v.note });
      if (v.photo) i.evidence.push({ at, by: me.name, kind: 'photo', text: 'Completion photo', photo: v.photo });
      i.t.resolved = at;
      i.by.resolved = me.name;
      i.outcome = v.outcome;
      i.status = 'resolved';
      releaseVehicles(i.id);
      audit(at, me, 'Marked resolved', `${v.outcome ? `${v.outcome}. ` : ''}${v.note}`, i.id);
      if (c.citizenVerification) {
        notifyReporters(i, at, v.note ? msg('m.fixed.note', { unit: agency(i.agencyId)?.short ?? '', note: v.note }) : msg('m.fixed', { unit: agency(i.agencyId)?.short ?? '' }));
      } else {
        const managers = agencyManagers(dep, i.agencyId, onDuty).map((p) => p.id).filter((x) => x !== me.id);
        notify(at, managers, 'resolved', `${me.name} marked ${i.ref} resolved (${v.outcome ?? 'done'}). Waiting for your sign-off.`, i);
      }
    }),

  /** Commander: sign off & close a resolved case. */
  signOff: (id: string) =>
    act(id, (i, at, me) => {
      if (!isManagerOf(me, i.agencyId)) return 'Only the unit commander can sign off';
      if (i.status !== 'resolved') return 'Nothing to sign off';
      const referred = i.outcome === 'Referred to investigation';
      i.status = referred ? 'referred' : 'closed';
      i.t.closed = at;
      i.by.closed = me.name;
      if (referred) i.side = { kind: 'referred', at, step: 6, by: me.name, reason: 'Handed to investigation' };
      audit(at, me, referred ? 'Referred to investigation' : 'Signed off & closed', i.outcome ?? '', i.id);
      if (!referred) askFeedback(at, i);
      if (i.officerId) notify(at, [i.officerId], 'info', `${me.name} signed off ${i.ref}. Case closed.`, i);
      notifyReporters(i, at, msg(i.restricted ? 'm.closed.sec' : 'm.closed'));
    }),

  rejectResolution: (id: string, reason: string) =>
    act(id, (i, at, me) => {
      if (!isManagerOf(me, i.agencyId)) return 'Only the unit commander can do this';
      if (i.status !== 'resolved') return 'Nothing to reject';
      if (!reason.trim()) return 'Give a reason';
      reopen(i, at, me, `Resolution rejected by ${me.name}: ${reason}`);
    }),

  /** Citizen: Yes, fixed / No / Partly (by reference — works without sign-in). */
  confirmFix: (id: string, answer: 'yes' | 'no' | 'partial', reportRef: string) =>
    act(id, (i, at) => {
      if (i.status !== 'resolved' || !cat(i.category).citizenVerification) return 'Nothing to confirm';
      const r = i.reports.find((x) => x.ref === reportRef);
      const who = r?.identity === 'standard' ? { id: r.reporter?.personId ?? 'reporter', name: r.reporter?.name ?? 'Reporter' } : { id: 'protected', name: 'Protected reporter' };
      i.verification = answer;
      if (answer === 'yes') {
        i.status = 'closed';
        i.t.closed = at;
        i.by.closed = 'Citizen confirmed';
        audit(at, who, 'Citizen confirmed', `${reportRef}: fixed — Closed`, i.id);
        askFeedback(at, i);
        const managers = agencyManagers(dep, i.agencyId, onDuty).map((p) => p.id);
        notify(at, [i.officerId, ...managers], 'info', `Citizen confirmed ${i.ref} is fixed. Case closed.`, i);
      } else {
        audit(at, who, 'Citizen disputed', `${reportRef}: ${answer === 'no' ? 'not fixed' : 'partly fixed'}`, i.id);
        reopen(i, at, who, `Citizen says ${answer === 'no' ? 'not fixed' : 'only partly fixed'}`);
      }
    }),

  changeSeverity: (id: string, severity: Severity, reason: string) =>
    act(id, (i, at, me) => {
      if (!reason.trim()) return 'Give a reason';
      audit(at, me, 'Severity changed', `${i.severity} → ${severity}: ${reason}`, i.id);
      i.severity = severity;
      applyDeadlines(i);
    }),

  breakGlass: (id: string, reason: string) =>
    act(id, (i, at, me) => {
      if (reason.trim().length < 12) return 'Write a proper reason (it is reviewed)';
      state.unseals.push({ incidentId: i.id, personId: me.id, at, until: at + 30 * MIN, reason });
      audit(at, me, 'IDENTITY UNSEALED', `Break-glass for 30 min. Reason: ${reason}`, i.id);
      const coord = dep.people.find((p) => p.agencyId === controlRoom().id && p.role === 'agency_head');
      notify(at, [coord?.id], 'info', `${me.name} unsealed a reporter identity on ${i.ref}. Reason: ${reason}`, i);
      send(at, coord, 'sms', `OyoEye oversight: ${me.name} unsealed a reporter identity on ${i.ref}. Reason: ${reason}`, i.id);
    }),
};

/** Index of the stepper step a case is on (0 = Pending review … 6 = Closed). */
export function stepOf(i: Incident): number {
  switch (i.status) {
    case 'pending':
      return 0;
    case 'verified':
      return 1;
    case 'assigned':
      return 2;
    case 'accepted':
      return 3;
    case 'in_progress':
      return 4;
    case 'resolved':
      return 5;
    case 'closed':
    case 'referred':
      return 6;
    case 'reopened':
      return 2;
    case 'rejected':
      return i.side?.step ?? 0;
  }
}

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

export const isUnsealed = (incidentId: string) => state.unseals.some((u) => u.incidentId === incidentId && u.personId === state.signedInId && u.until > now());

// ---------- organisations, stations & staff (PRD v2.2 §4) ----------

export const org = (id?: string) => dep.organisations.find((o) => o.id === id);
export const stations = () => dep.agencies;
const isAdmin = (p: Person) => p.role === 'admin';
export const activeStaff = (stationId: string) => dep.people.filter((p) => p.agencyId === stationId && isActive(p));
export const canManageStation = (p: Person, stationId: string) => isAdmin(p) || isManagerOf(p, stationId);

/** The 4-item readiness checklist a pilot rollout tracks. */
export function readiness(stationId: string) {
  const a = agency(stationId);
  const staff = activeStaff(stationId);
  const officers = staff.filter((p) => p.role === 'officer');
  const items = [
    { label: 'Commander assigned', done: !!a?.commanderId && !!person(a.commanderId) && person(a.commanderId)!.staffStatus !== 'deactivated' },
    { label: 'At least 3 active officers', done: officers.length >= 3, detail: `${officers.length} active` },
    { label: 'Duty roster set for today', done: staff.some((p) => state.duty[p.id]?.on) },
    { label: 'One test case completed', done: !!a?.testDone || state.incidents.some((i) => i.agencyId === stationId && (i.status === 'closed' || i.status === 'referred')) },
  ];
  return { items, score: items.filter((x) => x.done).length };
}

/** A station turns Live only when all 4 readiness items are done. */
function refreshStations(at: number) {
  for (const a of dep.agencies) {
    if (a.status !== 'setting_up') continue;
    if (readiness(a.id).score === 4) {
      a.status = 'live';
      audit(at, SYSTEM, 'Station live', `${a.name}: readiness 4/4 — routing now includes it`);
      systemPost(a.id, `${a.short} is now live. New cases can be routed here.`, at);
    }
  }
}

const RANK_ABBR: Record<string, string> = { Constable: 'PC', Corporal: 'Cpl.', Sergeant: 'Sgt.', Inspector: 'Insp.', ASP: 'ASP', DSP: 'DSP', SP: 'SP', CSP: 'CSP', 'Squad Leader': 'SL', 'Unit Commander': 'Comdr.' };
const withRank = (name: string, rank?: string) => {
  const abbr = rank ? RANK_ABBR[rank] : undefined;
  const n = name.trim().replace(/\s+/g, ' ');
  return abbr && !n.toLowerCase().startsWith(abbr.toLowerCase()) ? `${abbr} ${n}` : n;
};
const code6 = () => String(100000 + Math.floor(Math.random() * 900000));
let staffSeq = 600;
const newStaffId = (kind?: string) => `OY-${{ police: 'POL', corps: 'AMO', control_room: '615', sensitive_desk: 'SGB', emergency: 'FIR', lga_council: 'LGC' }[kind ?? ''] ?? 'AGY'}-${++staffSeq}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
const fmtPhone = (s: string) => {
  const d = digits(s);
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
};

function inviteSms(at: number, p: Person, by: Person, stationName: string) {
  send(at, p, 'sms', `OyoEye: ${by.name} added you to ${stationName}. Activation code ${p.inviteCode}. Open oyoeye.oy.gov.ng or dial *615*9#`);
}

export interface InviteInput {
  name: string;
  rank: string;
  serviceNumber: string;
  phone: string;
  stationRole?: StationRole;
}

function createInvite(at: number, me: Person, stationId: string, v: InviteInput, role: Person['role'] = 'officer', code = code6()): Person | string {
  const a = agency(stationId);
  if (!a) return 'Station not found';
  if (!v.name.trim()) return 'Enter the full name';
  if (!v.serviceNumber.trim()) return 'Enter the service number';
  if (!validPhone(v.phone)) return PHONE_HINT;
  if (dep.people.some((p) => p.role !== 'citizen' && p.staffStatus !== 'deactivated' && digits(p.phone) === digits(v.phone))) return 'Someone on OyoEye already uses that phone number';
  const p: Person = {
    id: `st${at}${++staffSeq}`,
    name: withRank(v.name, v.rank),
    role,
    title: role === 'officer' ? (v.stationRole === 'desk' ? 'Desk officer' : v.stationRole === 'deputy' ? 'Deputy commander' : 'Field officer') : 'Station commander',
    agencyId: stationId,
    phone: fmtPhone(v.phone),
    staffId: newStaffId(a.kind),
    rank: v.rank,
    serviceNumber: v.serviceNumber.trim(),
    staffStatus: 'invited',
    stationRole: v.stationRole ?? 'field',
    invitedBy: me.id,
    inviteCode: code,
    postings: [],
  };
  dep.people.push(p);
  audit(at, me, 'Staff invited', `${p.name} (${p.rank}, ${p.serviceNumber}) invited to ${a.name} as ${p.title.toLowerCase()}`);
  inviteSms(at, p, me, a.short);
  return p;
}

export interface StationInput {
  organisationId: string;
  name: string;
  kind: AgencyKind;
  lgaIds: string[];
  address?: string;
  landmark?: string;
  phone?: string;
  commanderId?: string;
  newCommander?: InviteInput;
  lat?: number;
  lng?: number;
}

function createStation(at: number, me: Person, v: StationInput): Agency | string {
  if (!isAdmin(me)) return 'Only an administrator can create stations';
  if (!org(v.organisationId)) return 'Choose the organisation';
  if (!v.name.trim()) return 'Enter the station name';
  if (dep.agencies.some((a) => a.name.toLowerCase() === v.name.trim().toLowerCase())) return 'A station with that name already exists';
  if (!v.lgaIds.length) return 'Choose at least one LGA';
  if (v.phone && !validPhone(v.phone)) return 'The station phone is not a Nigerian number';
  let id = `st-${slug(v.name)}`;
  while (agency(id)) id += '-2';
  const a: Agency = {
    id,
    name: v.name.trim(),
    short: v.name.trim().replace(/^Police Division — /, 'Police ').replace(/ Command$/, ''),
    kind: v.kind,
    lgaIds: v.lgaIds,
    organisationId: v.organisationId,
    address: v.address,
    landmark: v.landmark,
    phone: v.phone ? fmtPhone(v.phone) : undefined,
    createdAt: at,
    status: 'setting_up',
    lat: v.lat ?? lgaOf(v.lgaIds[0]).lat + 0.004,
    lng: v.lng ?? lgaOf(v.lgaIds[0]).lng - 0.003,
  };
  dep.agencies.push(a);
  audit(at, me, 'Station created', `${a.name} (${org(a.organisationId)?.short}) covering ${a.lgaIds.map((l) => lgaOf(l).name).join(', ')} — setting up`);
  if (v.commanderId) {
    const c = person(v.commanderId);
    if (c) {
      a.commanderId = c.id;
      audit(at, me, 'Commander named', `${c.name} → ${a.name}`);
    }
  } else if (v.newCommander) {
    const c = createInvite(at, me, a.id, v.newCommander, v.kind === 'police' || v.kind === 'corps' ? 'supervisor' : 'agency_head');
    if (typeof c === 'string') {
      dep.agencies.pop();
      return `Commander: ${c}`;
    }
    a.commanderId = c.id;
  }
  systemPost(a.id, `${a.name} was created. This is the station's group chat.`, at);
  return a;
}

export const CSV_HEADER = 'station,organisation,lgas,commander_name,commander_rank,commander_service_no,commander_phone';
export const CSV_SAMPLE = `${CSV_HEADER}
Police Division — Ojoo,Police,Akinyele,Musa Adeyemi,SP,AP/218841,0806 214 7781
Amotekun — Oyo Town Command,Amotekun,Oyo East;Oyo West,Femi Ayinde,Unit Commander,AMO/OY/3310,0703 552 1904
Fire Station — Ogbomoso,Fire Service,Ogbomosho North;Ogbomosho South,Ronke Lawal,Station Officer,FRS/0442,0813 777 2045
Police Division — Igangan,Police,Ibarapa North,Sola Ojo,CSP,AP/129904,0905 12 34`;

export interface CsvRow {
  line: number;
  station: string;
  organisation: string;
  lgas: string;
  commander_name: string;
  commander_rank: string;
  commander_service_no: string;
  commander_phone: string;
  orgId?: string;
  lgaIds: string[];
  errors: string[];
}

const KIND_FOR_ORG: Record<string, AgencyKind> = { police: 'police', amotekun: 'corps', fire: 'emergency', agency: 'state', lga: 'lga_council' };

export function parseStationsCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const body = lines[0]?.toLowerCase().startsWith('station,') ? lines.slice(1) : lines;
  return body.map((l, k) => {
    const [station = '', organisation = '', lgas = '', commander_name = '', commander_rank = '', commander_service_no = '', commander_phone = ''] = l.split(',').map((x) => x.trim());
    const errors: string[] = [];
    const o = dep.organisations.find((x) => x.short.toLowerCase() === organisation.toLowerCase() || x.name.toLowerCase().includes(organisation.toLowerCase()) && organisation.length > 3);
    if (!station) errors.push('Station name missing');
    else if (dep.agencies.some((a) => a.name.toLowerCase() === station.toLowerCase())) errors.push('Station already exists');
    if (!o) errors.push(`Unknown organisation "${organisation}"`);
    else if (!KIND_FOR_ORG[o.kind]) errors.push('Stations cannot be imported for this organisation');
    const lgaIds: string[] = [];
    for (const n of lgas.split(/[;|]/).map((x) => x.trim()).filter(Boolean)) {
      const lg = dep.lgas.find((x) => x.name.toLowerCase() === n.toLowerCase());
      if (lg) lgaIds.push(lg.id);
      else errors.push(`Unknown LGA "${n}"`);
    }
    if (!lgaIds.length && !errors.some((e) => e.startsWith('Unknown LGA'))) errors.push('No LGA given');
    if (!commander_name) errors.push('Commander name missing');
    if (!commander_service_no) errors.push('Commander service number missing');
    if (!validPhone(commander_phone)) errors.push(`Commander phone: ${PHONE_HINT}`);
    return { line: k + 2, station, organisation, lgas, commander_name, commander_rank, commander_service_no, commander_phone, orgId: o?.id, lgaIds, errors };
  });
}

/** Station staff the given person may manage: their own station (commander) or any (admin). */
const managedStation = (me: Person, p: Person) => !!p.agencyId && canManageStation(me, p.agencyId);
const openCasesOf = (personId: string) => state.incidents.filter((i) => i.officerId === personId && isOpen(i));

export const onboarding = {
  addStation: (v: StationInput): string | undefined => {
    const at = now();
    const r = createStation(at, persona(), v);
    if (typeof r === 'string') return r;
    commit();
  },
  importStations: (rows: CsvRow[]): { created: number; error?: string } => {
    const at = now();
    const me = persona();
    if (!isAdmin(me)) return { created: 0, error: 'Only an administrator can import stations' };
    let created = 0;
    for (const r of rows.filter((x) => !x.errors.length)) {
      const o = org(r.orgId)!;
      const res = createStation(at, me, {
        organisationId: o.id,
        name: r.station,
        kind: KIND_FOR_ORG[o.kind],
        lgaIds: r.lgaIds,
        newCommander: { name: r.commander_name, rank: r.commander_rank, serviceNumber: r.commander_service_no, phone: r.commander_phone },
      });
      if (typeof res !== 'string') created++;
    }
    audit(at, me, 'Stations imported', `${created} station(s) from spreadsheet`);
    commit();
    return { created };
  },
  invite: (stationId: string, v: InviteInput): string | undefined => {
    const me = persona();
    if (!canManageStation(me, stationId)) return 'Only the station commander or an administrator can invite officers';
    const r = createInvite(now(), me, stationId, v);
    if (typeof r === 'string') return r;
    commit();
  },
  inviteMany: (stationId: string, text: string): { ok: number; errors: string[] } => {
    const me = persona();
    if (!canManageStation(me, stationId)) return { ok: 0, errors: ['Only the station commander or an administrator can invite officers'] };
    const at = now();
    const errors: string[] = [];
    let ok = 0;
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((l, k) => {
        const [name = '', rank = '', serviceNumber = '', phone = ''] = l.split(/[,\t]/).map((x) => x.trim());
        const r = createInvite(at, me, stationId, { name, rank, serviceNumber, phone });
        if (typeof r === 'string') errors.push(`Row ${k + 1}: ${r}`);
        else ok++;
      });
    commit();
    return { ok, errors };
  },
  resendCode: (personId: string): string | undefined => {
    const me = persona();
    const p = person(personId);
    if (!p || !managedStation(me, p)) return 'Not your officer';
    if (p.staffStatus !== 'invited' && !p.needsCode) return 'This officer is already active';
    const at = now();
    p.inviteCode = code6();
    audit(at, me, 'Activation code resent', p.name);
    inviteSms(at, p, me, agency(p.agencyId)?.short ?? '');
    commit();
  },
  cancelInvite: (personId: string): string | undefined => {
    const me = persona();
    const p = person(personId);
    if (!p || !managedStation(me, p)) return 'Not your officer';
    if (p.staffStatus !== 'invited') return 'Only invites can be cancelled';
    p.staffStatus = 'deactivated';
    p.inviteCode = undefined;
    audit(now(), me, 'Invite cancelled', p.name);
    commit();
  },
  requestTransfer: (personId: string, toStationId: string, reason: string, effective: string): string | undefined => {
    const me = persona();
    const p = person(personId);
    if (!p || !managedStation(me, p)) return 'Only the officer’s commander can transfer them';
    if (!isActive(p)) return 'Only active officers can be transferred';
    const to = agency(toStationId);
    if (!to || to.id === p.agencyId) return 'Choose the receiving station';
    if (!reason) return 'Choose a reason';
    if (openCasesOf(p.id).length) return `${p.name} still holds ${openCasesOf(p.id).length} open case(s). Pass them to another officer first.`;
    if (state.transfers.some((t) => t.personId === p.id && t.status === 'pending')) return 'A transfer is already waiting for this officer';
    const at = now();
    const t: Transfer = { id: `tr${at}${++staffSeq}`, personId: p.id, fromStationId: p.agencyId!, toStationId: to.id, reason, effective, byId: me.id, at, status: 'pending' };
    state.transfers.push(t);
    audit(at, me, 'Transfer requested', `${p.name}: ${agency(p.agencyId)?.short} → ${to.short} (${reason}, effective ${effective})`);
    notifyTransfer(at, t, me);
    commit();
  },
  decideTransfer: (transferId: string, accept: boolean, reason = ''): string | undefined => {
    const me = persona();
    const t = state.transfers.find((x) => x.id === transferId);
    if (!t || t.status !== 'pending') return 'This transfer has already been decided';
    if (!canManageStation(me, t.toStationId)) return 'Only the receiving commander can decide';
    const at = now();
    const p = person(t.personId)!;
    const from = agency(t.fromStationId)!;
    const to = agency(t.toStationId)!;
    t.decidedAt = at;
    t.decidedBy = me.name;
    if (!accept) {
      if (!reason.trim()) return 'Give a reason';
      t.status = 'declined';
      t.declineReason = reason;
      audit(at, me, 'Transfer declined', `${p.name} → ${to.short}: ${reason}`);
      notify(at, [t.byId], 'declined', `${me.name} declined the transfer of ${p.name} to ${to.short}: "${reason}".`);
      commit();
      return;
    }
    if (openCasesOf(p.id).length) return `${p.name} still holds open cases at ${from.short}. Their commander must pass them to another officer first.`;
    t.status = 'accepted';
    p.postings = [...(p.postings ?? []).map((x) => (x.stationId === from.id && !x.to ? { ...x, to: at } : x)), { stationId: to.id, from: at }];
    p.agencyId = to.id;
    p.title = p.role === 'officer' ? `Officer, ${to.short}` : p.title;
    moveCrew(at, me, p, to.id);
    audit(at, me, 'Transfer accepted', `${p.name}: ${from.short} → ${to.short}. Posting history updated; chat membership moved.`);
    systemPost(from.id, `${p.name} was transferred out to ${to.short}.`, at);
    systemPost(to.id, `${p.name} joined ${to.short} (transferred from ${from.short}).`, at);
    send(at, p, 'sms', `OyoEye: you have been posted to ${to.short} from ${t.effective}. Your cases and station chat have moved.`);
    notify(at, [t.byId, p.id], 'accepted', `${me.name} accepted ${p.name} at ${to.short}.`);
    commit();
  },
  suspend: (personId: string, reason: string): string | undefined => {
    const me = persona();
    const p = person(personId);
    if (!p || !managedStation(me, p)) return 'Not your officer';
    if (!reason.trim()) return 'Give a reason';
    p.staffStatus = 'suspended';
    if (state.signedInId === p.id) state.signedInId = undefined;
    audit(now(), me, 'Staff suspended', `${p.name}: ${reason}`);
    commit();
  },
  reinstate: (personId: string): string | undefined => {
    const me = persona();
    const p = person(personId);
    if (!p || !managedStation(me, p)) return 'Not your officer';
    if (p.staffStatus !== 'suspended') return 'Not suspended';
    p.staffStatus = 'active';
    audit(now(), me, 'Staff reinstated', p.name);
    commit();
  },
  deactivate: (personId: string, reason: string): string | undefined => {
    const me = persona();
    const p = person(personId);
    if (!p || !managedStation(me, p)) return 'Not your officer';
    if (!reason.trim()) return 'Give a reason';
    if (openCasesOf(p.id).length) return `${p.name} still holds ${openCasesOf(p.id).length} open case(s). Pass them to another officer first.`;
    const at = now();
    p.staffStatus = 'deactivated';
    p.postings = (p.postings ?? []).map((x) => (!x.to ? { ...x, to: at } : x));
    if (state.signedInId === p.id) state.signedInId = undefined;
    audit(at, me, 'Staff deactivated', `${p.name}: ${reason}. Signed out, removed from chat; history kept.`);
    systemPost(p.agencyId!, `${p.name} was deactivated and no longer has access.`, at);
    commit();
  },
  reportLostPhone: (personId: string): string | undefined => {
    const me = persona();
    const p = person(personId);
    if (!p || (!managedStation(me, p) && me.id !== p.id)) return 'Not your officer';
    const at = now();
    p.needsCode = true;
    p.inviteCode = code6();
    if (state.signedInId === p.id && me.id !== p.id) state.signedInId = undefined;
    audit(at, me, 'Lost phone reported', `${p.name}: all sessions signed out; next sign-in needs a new SMS code`);
    send(at, p, 'sms', `OyoEye: your account was signed out everywhere. To sign in again use code ${p.inviteCode}.`);
    commit();
  },
  runTestCase: (stationId: string): string | undefined => {
    const me = persona();
    if (!canManageStation(me, stationId)) return 'Only the station commander or an administrator can do this';
    const a = agency(stationId);
    if (!a) return 'Station not found';
    const at = now();
    a.testDone = true;
    audit(at, me, 'Test case completed', `${a.name}: test case run end to end`);
    refreshStations(at);
    commit();
  },
};

function notifyTransfer(at: number, t: Transfer, by: Person) {
  const p = person(t.personId)!;
  const receivers = agencyManagers(dep, t.toStationId, onDuty).map((x) => x.id);
  notify(at, receivers, 'transfer', `${by.name} wants to transfer ${p.name} (${p.rank ?? 'officer'}) from ${agency(t.fromStationId)?.short} to ${agency(t.toStationId)?.short}. Reason: ${t.reason}, effective ${t.effective}.`, undefined, undefined, t.id);
}

// ---------- activation (sign-in → "Activate my account") ----------

export const findInvite = (phone: string) => dep.people.find((p) => p.role !== 'citizen' && (p.staffStatus === 'invited' || p.needsCode) && digits(p.phone) === digits(phone));
export function checkCode(phone: string, code: string): Person | string {
  const p = findInvite(phone);
  if (!p) return 'No invite for this number. Ask your commander to invite you.';
  if (p.inviteCode !== code.trim()) return 'That code is not right. Check the SMS or ask for a new code.';
  return p;
}
export function notMe(personId: string) {
  const p = person(personId);
  if (!p) return;
  const at = now();
  const to = [p.invitedBy, agency(p.agencyId)?.commanderId];
  audit(at, { id: 'protected', name: 'Invitee' }, 'Invite details disputed', `${p.name} at ${agency(p.agencyId)?.short} says the details are wrong`);
  notify(at, to, 'info', `The person invited as ${p.name} (${p.serviceNumber}) says the details are wrong. Please check and resend the invite.`);
  commit();
}
export function activate(personId: string, code: string, pin: string): string | undefined {
  const p = person(personId);
  if (!p || (p.staffStatus !== 'invited' && !p.needsCode)) return 'Nothing to activate';
  if (p.inviteCode !== code.trim()) return 'That code is not right';
  if (!/^\d{4}$/.test(pin)) return 'Choose a 4-digit PIN';
  const at = now();
  const first = p.staffStatus === 'invited';
  p.staffStatus = 'active';
  p.needsCode = false;
  p.pin = pin;
  p.inviteCode = undefined;
  p.activatedAt = at;
  if (first && p.agencyId) p.postings = [...(p.postings ?? []), { stationId: p.agencyId, from: at }];
  state.duty = { ...state.duty, [p.id]: { on: true, shift: state.duty[p.id]?.shift ?? 'morning' } };
  audit(at, p, first ? 'Account activated' : 'Account re-activated', `${p.name} at ${agency(p.agencyId)?.short} (${p.serviceNumber})`);
  if (first) {
    systemPost(p.agencyId!, `${p.name} joined ${agency(p.agencyId)?.short}.`, at);
    notify(at, [p.invitedBy, agency(p.agencyId)?.commanderId], 'info', `${p.name} activated their account at ${agency(p.agencyId)?.short}.`);
  }
  refreshStations(at);
  commit();
}

// ---------- station group chat (PRD v2.2 §5) ----------

export const BROADCAST = 'ch-broadcast';
export const channelIdOf = (stationId: string) => `ch-${stationId}`;
const stationOfChannel = (channelId: string) => (channelId.startsWith('ch-') && channelId !== BROADCAST ? channelId.slice(3) : channelId.startsWith('cm-') ? channelId.slice(3) : undefined);
/** v2.3 §3.2: each police / Amotekun station also has a community channel with its focal persons. */
export const communityIdOf = (stationId: string) => 'cm-' + stationId;
export const isCommunityChannel = (id: string) => id.startsWith('cm-');
const hasCommunity = (a?: Agency) => !!a && (a.kind === 'police' || a.kind === 'corps');
const isControlRoomStaff = (p: Person) => isControl(p);
const isCoordinator = (p: Person) => p.role === 'agency_head' && agency(p.agencyId)?.kind === 'control_room';
export const canBroadcast = (p: Person) => isActive(p) && (isControlRoomStaff(p) || isCoordinator(p));
const NO_CHAT: Person['role'][] = ['admin', 'executive', 'chairman', 'citizen', 'command', 'oversight'];

/** Membership is derived from postings: everyone currently posted, plus monitors. */
export function channelOf(id: string): ChatChannel | undefined {
  if (id === BROADCAST) {
    const members = dep.people.filter((p) => canBroadcast(p)).map((p) => p.id);
    return { id, kind: 'broadcast', name: 'Control room alerts', memberIds: members, monitorIds: [], readOnlyIds: [] };
  }
  const sid = stationOfChannel(id);
  const a = agency(sid);
  if (!a) return undefined;
  if (isCommunityChannel(id)) {
    if (!hasCommunity(a)) return undefined;
    const members = [...activeStaff(a.id).map((p) => p.id), ...focalPersons().filter((p) => isVerifiedFocal(p) && !!p.lgaId && a.lgaIds.includes(p.lgaId)).map((p) => p.id)];
    const monitors = dep.people.filter((p) => p.agencyId === controlRoom().id && isActive(p) && p.role === 'ops_manager').map((p) => p.id);
    return { id, kind: 'station', stationId: a.id, name: a.short + ' — Community', memberIds: members, monitorIds: monitors, readOnlyIds: [], community: true };
  }
  const memberIds = activeStaff(a.id).map((p) => p.id);
  const desk = a.kind === 'sensitive_desk';
  const cr = controlRoom().id;
  // The control room monitors every station chat (except the restricted desks).
  const monitorIds = desk || a.id === cr ? [] : dep.people.filter((p) => p.agencyId === cr && isActive(p) && (p.role === 'ops_manager' || p.role === 'dispatcher')).map((p) => p.id);
  // The coordinator reads police and Amotekun chats.
  const readOnlyIds = a.kind === 'police' || a.kind === 'corps' ? dep.people.filter((p) => isCoordinator(p) && isActive(p)).map((p) => p.id) : [];
  return { id, kind: 'station', stationId: a.id, name: a.short, memberIds, monitorIds, readOnlyIds };
}

export function canReadChannel(p: Person, id: string) {
  if (NO_CHAT.includes(p.role) || !isActive(p)) return false;
  const c = channelOf(id);
  if (!c) return false;
  if (c.kind === 'broadcast') return canBroadcast(p);
  return c.memberIds.includes(p.id) || c.monitorIds.includes(p.id) || c.readOnlyIds.includes(p.id);
}
export function canPostChannel(p: Person, id: string) {
  const c = channelOf(id);
  if (!c || !canReadChannel(p, id)) return false;
  if (c.kind === 'broadcast') return canBroadcast(p);
  return !c.readOnlyIds.includes(p.id) || c.memberIds.includes(p.id);
}
export const canPin = (p: Person, id: string) => {
  const sid = stationOfChannel(id);
  return !!sid && isActive(p) && (isManagerOf(p, sid) || (p.agencyId === sid && p.stationRole === 'deputy'));
};

/** Messages shown in a channel: its own, plus broadcasts that target its station. */
export function messagesIn(s: State, id: string) {
  const sid = isCommunityChannel(id) ? undefined : stationOfChannel(id);
  return s.chat.filter((m) => m.channelId === id || (!!sid && m.kind === 'broadcast' && m.targets?.includes(sid))).sort((a, b) => a.at - b.at);
}

/** The channels a person sees, broadcasts first, then by latest activity. */
export function channelsFor(s: State, p: Person): ChatChannel[] {
  if (NO_CHAT.includes(p.role) || !isActive(p)) return [];
  const out: ChatChannel[] = [];
  if (canBroadcast(p)) out.push(channelOf(BROADCAST)!);
  const own = p.agencyId ? channelOf(channelIdOf(p.agencyId)) : undefined;
  if (own) out.push(own);
  if (p.agencyId && hasCommunity(agency(p.agencyId))) {
    const cm = channelOf(communityIdOf(p.agencyId));
    if (cm && canReadChannel(p, cm.id)) out.push(cm);
  }
  if (isVerifiedFocal(p))
    for (const a of dep.agencies.filter((x) => hasCommunity(x) && isLive(x) && !!p.lgaId && x.lgaIds.includes(p.lgaId))) {
      const cm = channelOf(communityIdOf(a.id));
      if (cm) out.push(cm);
    }
  if (isControlRoomStaff(p) || isCoordinator(p)) {
    const active = new Set(s.chat.filter((m) => m.channelId !== BROADCAST).map((m) => m.channelId));
    for (const id of active) {
      if (own && id === own.id) continue;
      if (canReadChannel(p, id)) out.push(channelOf(id)!);
    }
  }
  const last = (c: ChatChannel) => messagesIn(s, c.id).slice(-1)[0]?.at ?? 0;
  return [...out.filter((c) => c.kind === 'broadcast'), ...out.filter((c) => c.kind !== 'broadcast').sort((a, b) => (a.id === own?.id ? -1 : b.id === own?.id ? 1 : last(b) - last(a)))];
}

export function unreadIn(s: State, p: Person, id: string) {
  const seen = s.chatRead[p.id]?.[id] ?? 0;
  return messagesIn(s, id).filter((m) => m.at > seen && m.authorId !== p.id).length;
}
export const chatUnread = (s: State, p: Person) => channelsFor(s, p).reduce((n, c) => n + unreadIn(s, p, c.id), 0);

/** Phone-number masking: 0803 123 4521 → 0803 *** **21 (for everyone except the author). */
export const PHONE_RE = /(?:\+?234[\s-]?|\b0)([789][01]\d)[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})\b/g;
export const hasPhone = (text: string) => new RegExp(PHONE_RE.source).test(text);
export const maskPhones = (text: string) => text.replace(PHONE_RE, (_m, a: string, _b: string, _c: string, d: string) => `0${a} *** **${d}`);

let chatSeq = 0;
function systemPost(stationId: string, text: string, at: number) {
  if (!agency(stationId)) return;
  state.chat.push({ id: `c${at}-${chatSeq++}`, channelId: channelIdOf(stationId), at, authorId: 'system', kind: 'system', text, seenBy: [] });
}

const textHash = (t?: string) => (t ? fnv(t).slice(0, 6) : '—');

function post(at: number, me: Person, channelId: string, v: { kind: ChatMessage['kind']; text?: string; photo?: string; caseId?: string; urgent?: boolean; pinned?: boolean }) {
  const c = channelOf(channelId)!;
  const m: ChatMessage = { id: `c${at}-${chatSeq++}`, channelId, at, authorId: me.id, kind: v.kind, text: v.text, photo: v.photo, caseId: v.caseId, urgent: v.urgent, pinned: v.pinned, seenBy: [me.id] };
  state.chat.push(m);
  // Audited without the message text, so the audit log never becomes a way to read chat.
  const ref = v.caseId ? state.incidents.find((i) => i.id === v.caseId)?.ref : undefined;
  audit(at, me, 'Chat message', `${c.name} · ${v.kind}${v.urgent ? ' · urgent' : ''}${ref ? ` · case ${ref}` : ''} · #${textHash(v.text)}`);
  if (v.urgent) {
    const onDutyMembers = c.memberIds.filter((id) => id !== me.id && onDuty(id));
    notify(at, onDutyMembers, 'chat', `URGENT in ${c.name} from ${me.name}: ${maskPhones(v.text ?? v.kind)}`, undefined, undefined, undefined, channelId);
    for (const id of onDutyMembers) send(at, person(id), 'push', `URGENT · ${c.name}\n${me.name}: ${maskPhones(v.text ?? v.kind)}`);
    const cmdr = agency(c.stationId)?.commanderId;
    if (cmdr && cmdr !== me.id) send(at, person(cmdr), 'sms', `OyoEye URGENT in ${c.name} from ${me.name}. Open OyoEye chat.`);
  }
  // @mentions raise the bell; normal messages only show as unread counts.
  if (v.text && v.text.includes('@')) {
    const mentioned = [...c.memberIds, ...c.monitorIds].filter((id) => {
      if (id === me.id) return false;
      const words = (person(id)?.name ?? '').toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !w.endsWith('.'));
      return words.some((w) => v.text!.toLowerCase().includes(`@${w}`));
    });
    notify(at, mentioned, 'chat', `${me.name} mentioned you in ${c.name}: ${maskPhones(v.text)}`, undefined, undefined, undefined, channelId);
  }
  return m;
}

export const chat = {
  send: (channelId: string, v: { kind: ChatMessage['kind']; text?: string; photo?: string; caseId?: string; urgent?: boolean }): string | undefined => {
    const me = persona();
    if (!canPostChannel(me, channelId)) return 'You cannot post in this chat';
    if (channelId === BROADCAST) return 'Use "New broadcast" to alert stations';
    if (isCommunityChannel(channelId) && v.kind === 'case') return 'Case cards are not allowed in the community channel';
    if (isFocal(me) && !['text', 'photo', 'location', 'voice'].includes(v.kind)) return 'Focal persons can post text, photos, location and voice notes';
    if (v.kind === 'text' && !v.text?.trim()) return 'Type a message';
    if (v.caseId) {
      const i = state.incidents.find((x) => x.id === v.caseId);
      if (!i) return 'Case not found';
    }
    post(now(), me, channelId, v);
    commit();
  },
  /** Case page → More → "Discuss in station chat": posts the case card to the holding station's channel. */
  discussCase: (caseId: string): string | undefined => {
    const me = persona();
    const i = state.incidents.find((x) => x.id === caseId);
    if (!i) return 'Case not found';
    const id = channelIdOf(i.agencyId);
    if (!canPostChannel(me, id)) return 'You are not a member of that station chat';
    post(now(), me, id, { kind: 'case', caseId });
    commit();
  },
  pin: (messageId: string): string | undefined => {
    const me = persona();
    const m = state.chat.find((x) => x.id === messageId);
    if (!m || !canPin(me, m.channelId)) return 'Only the commander or deputy can pin';
    m.pinned = !m.pinned;
    audit(now(), me, m.pinned ? 'Chat message pinned' : 'Chat message unpinned', `${channelOf(m.channelId)?.name} · #${textHash(m.text)}`);
    commit();
  },
  remove: (messageId: string): string | undefined => {
    const me = persona();
    const m = state.chat.find((x) => x.id === messageId);
    if (!m) return 'Message not found';
    if (m.authorId !== me.id && !canPin(me, m.channelId)) return 'You can only remove your own messages';
    m.removedBy = me.name;
    m.text = undefined;
    m.photo = undefined;
    m.caseId = undefined;
    m.pinned = false;
    audit(now(), me, 'Chat message removed', `${channelOf(m.channelId)?.name} · message by ${person(m.authorId)?.name ?? 'system'}`);
    commit();
  },
  markRead: (channelId: string) => {
    const me = persona();
    if (!canReadChannel(me, channelId)) return;
    const at = now();
    const msgs = messagesIn(state, channelId);
    const unseen = msgs.filter((m) => !m.seenBy.includes(me.id));
    const last = state.chatRead[me.id]?.[channelId] ?? 0;
    if (!unseen.length && last >= (msgs.slice(-1)[0]?.at ?? 0)) return;
    unseen.forEach((m) => m.seenBy.push(me.id));
    state.chatRead = { ...state.chatRead, [me.id]: { ...(state.chatRead[me.id] ?? {}), [channelId]: at } };
    commit();
  },
  broadcastTargets: (t: { kind: 'all' | 'org' | 'lgas'; orgId?: string; lgaIds?: string[] }) =>
    dep.agencies.filter((a) => {
      if (!isLive(a) || a.kind === 'control_room' || a.kind === 'sensitive_desk') return false;
      if (t.kind === 'all') return true;
      if (t.kind === 'org') return a.organisationId === t.orgId;
      // BOLOs to an area go to the security stations covering it.
      return (a.kind === 'police' || a.kind === 'corps') && a.lgaIds.some((l) => t.lgaIds?.includes(l));
    }),
  broadcast: (text: string, t: { kind: 'all' | 'org' | 'lgas'; orgId?: string; lgaIds?: string[] }): string | undefined => {
    const me = persona();
    if (!canBroadcast(me)) return 'Only the control room and the coordinator can broadcast';
    if (!text.trim()) return 'Write the alert';
    const targets = chat.broadcastTargets(t).map((a) => a.id);
    if (!targets.length) return 'No live stations match that target';
    const at = now();
    const m: ChatMessage = { id: `c${at}-${chatSeq++}`, channelId: BROADCAST, at, authorId: me.id, kind: 'broadcast', text, targets, acks: {}, seenBy: [me.id] };
    state.chat.push(m);
    audit(at, me, 'Broadcast sent', `To ${targets.length} station(s) · #${textHash(text)}`);
    const recipients = targets.flatMap((sid) => activeStaff(sid).map((p) => p.id));
    notify(at, recipients, 'chat', `Control room alert from ${me.name}: ${maskPhones(text)}`, undefined, undefined, undefined, BROADCAST);
    for (const sid of targets) send(at, person(agency(sid)?.commanderId), 'push', `OYOEYE CONTROL ROOM ALERT\n${maskPhones(text)}\nAcknowledge in OyoEye chat.`);
    commit();
  },
  ack: (messageId: string): string | undefined => {
    const me = persona();
    const m = state.chat.find((x) => x.id === messageId);
    if (!m || m.kind !== 'broadcast') return 'Not a broadcast';
    const sid = me.agencyId;
    if (!sid || !m.targets?.includes(sid) || !isActive(me)) return 'This alert was not sent to your station';
    if (m.acks?.[sid]) return 'Already acknowledged';
    const at = now();
    m.acks = { ...(m.acks ?? {}), [sid]: { by: me.name, at } };
    if (!m.seenBy.includes(me.id)) m.seenBy.push(me.id);
    audit(at, me, 'Broadcast acknowledged', `${agency(sid)?.short} · alert #${textHash(m.text)}`);
    commit();
  },
};


// ======================= v2.3: map, community, conduct, officer safety =======================

// ---------- simulated positions (derived, never audited) ----------

const pointOf = (lgaId: string, area?: string) => areaPoint(lgaId, area);
export const stationPoint = (stationId?: string) => {
  const a = agency(stationId);
  if (a?.lat != null && a.lng != null) return { lat: a.lat, lng: a.lng };
  return a?.lgaIds[0] ? pointOf(a.lgaIds[0]) : { lat: 7.398, lng: 3.906 };
};
const jit = (id: string, k: string) => ((parseInt(fnv(id + k), 16) % 1000) / 1000 - 0.5) * 0.004;
export type UnitMode = 'idle' | 'enroute' | 'onscene';

/**
 * Where an active field officer is right now. Idle at the station (small jitter);
 * en route moving in a straight line toward the incident (25 km/h metro, 40 km/h
 * elsewhere, driven by the demo clock); on scene at the incident.
 */
export function officerPosition(personId: string, at = now()): { lat: number; lng: number; mode: UnitMode; caseId?: string } {
  const p = person(personId);
  const base = stationPoint(p?.agencyId);
  const home = { lat: base.lat + jit(personId, 'a'), lng: base.lng + jit(personId, 'b') };
  const sos = state.incidents.find((i) => i.officerSos?.officerId === personId && isOpen(i));
  if (sos) return { lat: sos.lat, lng: sos.lng, mode: 'onscene', caseId: sos.id };
  const c = state.incidents.find((i) => i.officerId === personId && i.status === 'in_progress' && !i.officerSos);
  if (!c) return { ...home, mode: 'idle' };
  if (c.t.onScene) return { lat: c.lat, lng: c.lng, mode: 'onscene', caseId: c.id };
  if (c.t.enRoute ?? c.t.started) {
    const d = km(home.lat, home.lng, c.lat, c.lng);
    const speed = lgaOf(c.lgaId).metro ? 25 : 40;
    const f = d ? Math.min(1, (speed * (at - (c.t.enRoute ?? c.t.started!))) / HOUR / d) : 1;
    return { lat: home.lat + (c.lat - home.lat) * f, lng: home.lng + (c.lng - home.lng) * f, mode: 'enroute', caseId: c.id };
  }
  return { ...home, mode: 'idle' };
}

const nearestLga = (lat: number, lng: number) => dep.lgas.slice().sort((a, b) => km(a.lat, a.lng, lat, lng) - km(b.lat, b.lng, lat, lng))[0];

// ---------- community focal persons (§3.1) ----------

export const FOCAL_GROUPS: Record<FocalGroup, string> = {
  baale_secretary: "Baale's secretary",
  hunters: 'Ode (hunters) group',
  vigilante: 'Vigilante coordinator',
  market: 'Iyaloja / market leader',
  farmers: "Farmers' association",
  herders: "Herders' association",
  youth: 'Youth leader',
};
export const isFocal = (p?: Person) => p?.role === 'focal';
export const isVerifiedFocal = (p?: Person) => !!p && p.role === 'focal' && isActive(p) && !!p.verified;
export const focalPersons = () => dep.people.filter((p) => p.role === 'focal');
export const communityPoint = (p: Person) => pointOf(p.lgaId ?? 'ibn', p.community);
/** A focal person's community: their LGA's area matching their village, plus 2 km around it. */
export function inCommunity(p: Person, i: Incident) {
  if (!p.lgaId) return false;
  if (i.lgaId === p.lgaId && i.area === p.community) return true;
  const c = communityPoint(p);
  return km(c.lat, c.lng, i.lat, i.lng) <= 2;
}
export const communityCases = (s: State, p: Person) => s.incidents.filter((i) => !i.sensitiveOnly && inCommunity(p, i));
const canManageFocal = (me: Person, lgaId: string) =>
  me.role === 'admin' || (me.role === 'chairman' && me.lgaId === lgaId) || (!!me.agencyId && isManagerOf(me, me.agencyId) && !!agency(me.agencyId)?.lgaIds.includes(lgaId));
export const focalManageable = (me: Person) => focalPersons().filter((p) => p.lgaId && canManageFocal(me, p.lgaId));

export interface FocalInput {
  name: string;
  phone: string;
  community: string;
  ward: string;
  lgaId: string;
  focalGroup: FocalGroup;
  sponsor: string;
}

export const community = {
  invite: (v: FocalInput): string | undefined => {
    const me = persona();
    if (!canManageFocal(me, v.lgaId)) return 'Only the commander covering this LGA or its chairman can invite focal persons';
    if (!v.name.trim() || !v.community.trim()) return 'Enter the name and community';
    if (!validPhone(v.phone)) return PHONE_HINT;
    if (dep.people.some((p) => p.role !== 'citizen' && p.staffStatus !== 'deactivated' && digits(p.phone) === digits(v.phone))) return 'Someone on OyoEye already uses that phone number';
    const at = now();
    const p: Person = {
      id: `fp${at}${++staffSeq}`,
      name: v.name.trim(),
      role: 'focal',
      title: `${FOCAL_GROUPS[v.focalGroup]}, ${v.community}`,
      phone: fmtPhone(v.phone),
      lgaId: v.lgaId,
      community: v.community.trim(),
      ward: v.ward.trim(),
      focalGroup: v.focalGroup,
      sponsor: v.sponsor.trim(),
      staffStatus: 'invited',
      invitedBy: me.id,
      inviteCode: code6(),
      staffId: `OY-CFP-${++staffSeq}`,
      history: { reports: 0, confirmed: 0, false: 0 },
    };
    dep.people.push(p);
    audit(at, me, 'Focal person invited', `${p.name} — ${p.title}, ${lgaOf(p.lgaId!).name}`);
    send(at, p, 'sms', `OyoEye: ${me.name} added you as a community focal person for ${p.community}. Activation code ${p.inviteCode}. Open oyoeye.oy.gov.ng or dial *615*9#. Help is free. Never pay.`);
    commit();
  },
  verify: (id: string): string | undefined => {
    const me = persona();
    const p = person(id);
    if (!p || !isFocal(p) || !p.lgaId || !canManageFocal(me, p.lgaId)) return 'Not in your area';
    if (p.staffStatus !== 'active') return p.staffStatus === 'invited' ? 'They must activate their account first' : 'This focal person is suspended';
    p.verified = true;
    audit(now(), me, 'Focal person registered', `${p.name}, ${p.community}`);
    notify(now(), [p.id], 'info', `${me.name} registered you as a community focal person for ${p.community}. You can now join your station's community chat.`);
    commit();
  },
  suspend: (id: string, reason: string): string | undefined => {
    const me = persona();
    const p = person(id);
    if (!p || !isFocal(p) || !p.lgaId || !canManageFocal(me, p.lgaId)) return 'Not in your area';
    if (!reason.trim()) return 'Give a reason';
    p.staffStatus = 'suspended';
    if (state.signedInId === p.id) state.signedInId = undefined;
    audit(now(), me, 'Focal person suspended', `${p.name}: ${reason}`);
    commit();
  },
  reinstate: (id: string): string | undefined => {
    const me = persona();
    const p = person(id);
    if (!p || !isFocal(p) || !p.lgaId || !canManageFocal(me, p.lgaId)) return 'Not in your area';
    p.staffStatus = 'active';
    audit(now(), me, 'Focal person reinstated', p.name);
    commit();
  },
};

export const findFocalByPhone = (phone: string) => focalPersons().find((p) => digits(p.phone) === digits(phone));
export function focalSignIn(phone: string, pin: string): string | undefined {
  const p = findFocalByPhone(phone);
  if (!p) return 'No focal person with this number';
  if (p.staffStatus === 'invited') return 'Activate your account first (Staff tab → First time? Activate my account)';
  if (p.staffStatus !== 'active') return 'This account is suspended. Speak to your commander or chairman.';
  if (p.needsCode) return 'Activate again with the new SMS code';
  if (pin !== (p.pin ?? '1234')) return 'Wrong PIN';
  signIn(p.id);
}

/** Inbox updates for focal persons about cases in their community, in safe words. */
function tellFocalWatchers(at: number, i: Incident, m: Msg) {
  if (i.sensitiveOnly || seeding) return;
  for (const p of focalPersons()) {
    if (!isVerifiedFocal(p) || !inCommunity(p, i) || i.reports.some((r) => r.reporter?.personId === p.id)) continue;
    notify(at, [p.id], 'citizen', i.restricted ? msg('m.focal.sec', { community: p.community ?? '', safe: safeSecurityMsg(i) }) : msg('m.focal.civic', { what: `@cat.${i.category}`, area: i.area, text: m }));
  }
}
/** Security progress in safe words (no unit, officer or place details). */
export function safeSecurityMsg(i: Incident): Msg {
  if (['closed', 'referred'].includes(i.status)) return msg('safe.done');
  if (i.status === 'rejected') return msg('safe.closed');
  if (i.status === 'pending' || i.status === 'verified') return msg('safe.review');
  return msg('safe.responding');
}
export const safeSecurity = (i: Incident, lang: Lang = 'en') => msgText(safeSecurityMsg(i), lang);

// ---------- group-naming guard (§3.4) ----------

const GROUP_WORDS = ['fulani', 'herder', 'herdsmen', 'herdsman', 'hausa', 'yoruba', 'igbo', 'ibo', 'bororo', 'tiv', 'northerner', 'southerner'];
export const namesGroup = (text: string) => GROUP_WORDS.some((w) => new RegExp(`(^|[^a-z])${w}(s|es)?(?![a-z])`, 'i').test(text));
export const GROUP_TIP = 'Describe actions and people, not ethnicity.';
const ARMED_KINDS = ['police', 'corps'];

// ---------- traditional-ruler notices (§3.3) ----------

export const NOTICE_TYPES = ['armed', 'robbery', 'kidnapping', 'violence', 'suspicious', 'threat', 'sos'];
export const leadersFor = (i: Incident) => LEADERS.filter((l) => l.lgaId === i.lgaId && (!l.areas.length || l.areas.includes(i.area)));
const leaderText = (i: Incident) => `OyoEye 615: A security incident has been reported in ${i.area}. Response units have been dispatched. Please keep calm and report anything you see to 615.`;

function sendLeaderNotices(at: number, i: Incident, ids: string[], actor: Person | typeof SYSTEM) {
  for (const id of ids) {
    const l = LEADERS.find((x) => x.id === id);
    if (!l) continue;
    send(at, undefined, 'sms', leaderText(i), i.id, l.phone);
    audit(at, actor, 'Community leader notified', l.title, i.id);
  }
  i.leadersNotified = [...(i.leadersNotified ?? []), ...ids];
}

/** When an operator verifies a High/Critical security case, tell the traditional rulers of that area. */
function maybeNotifyLeaders(at: number, i: Incident, me: Person) {
  if (!i.restricted || i.sensitiveOnly || i.officerSos || !['high', 'critical'].includes(i.severity) || i.leadersNotified?.length) return;
  const rules = state.noticeRules;
  if (!rules.enabled[i.subcategory ?? ''] ) return;
  const leaders = leadersFor(i).map((l) => l.id);
  if (!leaders.length) return;
  if (i.subcategory === 'kidnapping' && rules.kidnapApproval) {
    i.noticeHold = leaders;
    audit(at, me, 'Community notice waiting for approval', `${leaders.length} leader(s) — kidnapping notices need the coordinator`, i.id);
    notify(at, dep.people.filter((p) => p.role === 'agency_head' && p.agencyId === controlRoom().id).map((p) => p.id), 'info', `Approve community notice for ${i.ref} (${i.area})? Kidnapping notices need your approval.`, i);
    return;
  }
  sendLeaderNotices(at, i, leaders, me);
}

export function setNoticeRule(sub: string, on: boolean) {
  state.noticeRules = { ...state.noticeRules, enabled: { ...state.noticeRules.enabled, [sub]: on } };
  audit(now(), persona(), 'Community notice rule changed', `${sub}: ${on ? 'on' : 'off'}`);
  commit();
}
export function setKidnapApproval(on: boolean) {
  state.noticeRules = { ...state.noticeRules, kidnapApproval: on };
  audit(now(), persona(), 'Community notice rule changed', `kidnapping approval: ${on ? 'required' : 'not required'}`);
  commit();
}
export function setLoneMinutes(mins: number) {
  if (!(mins >= 5 && mins <= 120)) return 'Choose between 5 and 120 minutes';
  audit(now(), persona(), 'SLA changed', `Lone-worker check-in: ${state.loneCheckMins} → ${mins} min`);
  state.loneCheckMins = mins;
  commit();
}

// ---------- conduct feedback & complaints (§4) ----------

const MIN_SCORE_N = 5;
const isClosedish = (i: Incident) => i.status === 'closed' || i.status === 'referred';

/** Ask every reporter how they were treated once a case is Closed. */
function askFeedback(at: number, i: Incident) {
  if (i.officerSos) return;
  for (const r of i.reports) {
    if (r.identity === 'anonymous') continue; // anonymous reporters answer on the tracking page
    if (r.reporter?.personId) notify(at, [r.reporter.personId], 'feedback', msg('m.rate', { ref: r.ref }), i);
    if (canText(i, r)) send(at, undefined, 'sms', msgText(msg('m.rate.sms', { ref: r.ref }), reporterLang(r)), i.id, r.reporter!.phone, reporterLang(r));
  }
  audit(at, SYSTEM, 'Conduct feedback requested', `${i.reports.filter((r) => r.identity !== 'anonymous').length} reporter(s) asked "How were you treated?"`, i.id);
}

export const feedbackFor = (s: State, reportRef: string) => s.feedback.find((f) => f.reportRef === reportRef);

function createComplaint(at: number, c: Omit<Complaint, 'id' | 'at' | 'status' | 'log'>) {
  const id = `CC-${String(state.complaints.length + 101).padStart(4, '0')}`;
  const full: Complaint = { ...c, id, at, status: 'new', log: [{ at, by: 'OyoEye', text: 'Complaint received' }] };
  state.complaints.unshift(full);
  // The audit entry is not attached to the case, so the unit's timeline never shows it.
  audit(at, { id: 'protected', name: 'Complainant (protected)' }, 'Conduct complaint received', `${id} · ${c.kind}`);
  notify(at, dep.people.filter((p) => p.role === 'oversight').map((p) => p.id), 'info', `New conduct complaint ${id} (${c.kind === 'money' ? 'asked for money' : c.kind === 'respect' ? 'disrespect' : 'misconduct report'}).`);
  return full;
}

const officersOn = (i: Incident) => {
  const names = new Set(Object.values(i.by).filter(Boolean) as string[]);
  const ids = new Set<string>();
  if (i.officerId) ids.add(i.officerId);
  for (const p of dep.people) if (names.has(p.name) && p.role !== 'citizen' && p.role !== 'dispatcher') ids.add(p.id);
  return [...ids];
};

export const conduct = {
  answer: (caseId: string, reportRef: string, v: { money: boolean; respect: 'yes' | 'somewhat' | 'no'; speed?: number; text?: string }, via: Feedback['via'] = 'track'): string | undefined => {
    const i = state.incidents.find((x) => x.id === caseId);
    if (!i || !isClosedish(i)) return 'You can rate the response once the case is closed';
    const r = i.reports.find((x) => x.ref === reportRef);
    if (!r) return 'Report not found';
    if (feedbackFor(state, reportRef)) return 'Thank you — you already answered';
    const at = now();
    const f: Feedback = { id: `FB-${state.feedback.length + 1}`, at, caseId, agencyId: i.agencyId, reportRef, money: v.money, respect: v.respect, speed: v.speed, text: v.text?.trim() || undefined, via };
    state.feedback.push(f);
    audit(at, { id: 'protected', name: 'Reporter' }, 'Conduct feedback received', `${f.id} via ${via}`);
    if (v.money || v.respect === 'no') {
      createComplaint(at, {
        caseId,
        reportRef,
        agencyId: i.agencyId,
        kind: v.money ? 'money' : 'respect',
        text: [v.money ? 'Reporter says someone asked for money.' : 'Reporter says they were not treated with respect.', f.text].filter(Boolean).join(' '),
        officerIds: officersOn(i),
        complainant: r.identity === 'anonymous' ? {} : { personId: r.reporter?.personId, name: r.reporter?.name, phone: r.reporter?.phone },
      });
    }
    commit();
  },
  /** "Report misconduct": always available, with or without a case reference. */
  report: (v: { ref?: string; text: string; money?: boolean }): string | undefined => {
    if (v.text.trim().length < 8) return 'Tell us what happened (a sentence is enough)';
    const at = now();
    const i = v.ref ? incidentByRef(v.ref) : undefined;
    const me = signedIn() ? persona() : undefined;
    const r = i?.reports.find((x) => x.ref === v.ref?.trim().toUpperCase()) ?? i?.reports[0];
    createComplaint(at, {
      caseId: i?.id,
      reportRef: r?.ref,
      agencyId: i?.agencyId,
      kind: v.money ? 'money' : 'misconduct',
      text: v.text.trim(),
      officerIds: i ? officersOn(i) : [],
      complainant: me ? { personId: me.id, name: me.name, phone: me.phone } : r && r.identity !== 'anonymous' ? { personId: r.reporter?.personId, name: r.reporter?.name, phone: r.reporter?.phone } : {},
    });
    commit();
  },
};

/** Aggregate conduct score for a unit. Hidden below 5 responses so no complaint can be traced. */
export function conductScore(s: State, agencyId?: string, days = 30) {
  const at = now();
  const rows = s.feedback.filter((f) => (!agencyId || f.agencyId === agencyId) && f.at > at - days * DAY);
  const n = rows.length;
  if (n < MIN_SCORE_N) return { n, hidden: true as const };
  return { n, hidden: false as const, respectful: Math.round((rows.filter((f) => f.respect === 'yes').length / n) * 100), money: Math.round((rows.filter((f) => f.money).length / n) * 1000) / 10 };
}

const isOversight = (p: Person) => p.role === 'oversight' && isActive(p);
export const oversight = {
  start: (id: string) => complaintAct(id, (c, at, me) => {
    if (c.status !== 'new') return 'Already under review';
    c.status = 'review';
    c.log.push({ at, by: me.name, text: 'Review started' });
    audit(at, me, 'Complaint review started', c.id);
  }),
  refer: (id: string, to: string) => complaintAct(id, (c, at, me) => {
    if (!to) return 'Choose who to refer it to';
    if (c.status === 'closed') return 'This complaint is closed';
    c.status = 'referred';
    c.referredTo = to;
    c.log.push({ at, by: me.name, text: `Referred to ${to}` });
    audit(at, me, 'Complaint referred', `${c.id} → ${to}`);
    // Referred by secure letter outside the unit's own OyoEye views; no complainant identity.
    send(at, undefined, 'sms', `OyoEye Oversight Panel: complaint ${c.id} has been referred to ${to} for investigation. Details follow by secure letter.`, undefined, `${to} (discipline desk)`);
  }),
  close: (id: string, outcome: NonNullable<Complaint['outcome']>, note = '') => complaintAct(id, (c, at, me) => {
    c.status = 'closed';
    c.outcome = outcome;
    c.log.push({ at, by: me.name, text: `Closed — ${outcome}${note ? `: ${note}` : ''}` });
    audit(at, me, 'Complaint closed', `${c.id}: ${outcome}`);
  }),
  unsealComplainant: (id: string, reason: string) => complaintAct(id, (c, at, me) => {
    if (reason.trim().length < 12) return 'Write a proper reason (it is reviewed)';
    if (!c.complainant.name && !c.complainant.phone) return 'The complainant is anonymous — nothing to unseal';
    state.unseals.push({ incidentId: c.id, personId: me.id, at, until: at + 30 * MIN, reason });
    c.log.push({ at, by: me.name, text: 'Complainant contact unsealed (30 min)' });
    audit(at, me, 'COMPLAINANT UNSEALED', `${c.id}. Break-glass for 30 min. Reason: ${reason}`);
  }),
  review: (seq: number, verdict: 'reviewed' | 'concern', note = ''): string | undefined => {
    const me = persona();
    if (!isOversight(me)) return 'Only the oversight panel can review unseals';
    const at = now();
    state.unsealReviews = { ...state.unsealReviews, [seq]: { verdict, by: me.name, at, note } };
    audit(at, me, verdict === 'reviewed' ? 'Unseal reviewed' : 'Unseal concern raised', `Audit entry #${seq}${note ? `: ${note}` : ''}`);
    if (verdict === 'concern') notify(at, dep.people.filter((p) => p.role === 'agency_head' && p.agencyId === controlRoom().id).map((p) => p.id), 'info', `The oversight panel raised a concern about identity unseal #${seq}.`);
    commit();
  },
};
function complaintAct(id: string, fn: (c: Complaint, at: number, me: Person) => string | void): string | undefined {
  const me = persona();
  if (!isOversight(me)) return 'Only the oversight panel can act on complaints';
  const c = state.complaints.find((x) => x.id === id);
  if (!c) return 'Complaint not found';
  const err = fn(c, now(), me);
  if (err) return err;
  commit();
}
export const complainantUnsealed = (id: string) => state.unseals.some((u) => u.incidentId === id && u.personId === state.signedInId && u.until > now());

// ---------- officer safety (§5) ----------

const SECURITY_RESPONDERS = ['police', 'corps'];
/** Nearest live security stations to a point, by their closest on-duty officer (or the station itself). */
export function nearestUnits(lat: number, lng: number, n = 3, at = now(), excludeId?: string): { agencyId: string; km: number; vehicleId?: string }[] {
  // v2.8: vehicles first (never out of service, never the one the officer in distress is in)
  const pool = state.vehicles.filter((v) => !excludeId || !v.crewIds.includes(excludeId));
  const nv = nearestVehicles(pool, lat, lng, at, state.incidents, 40, (sid) => { const a = agency(sid); return !!a && isLive(a) && SECURITY_RESPONDERS.includes(a.kind); }).top;
  const out: { agencyId: string; km: number; vehicleId?: string }[] = [];
  for (const x of nv) if (!out.some((o) => o.agencyId === x.v.stationId)) out.push({ agencyId: x.v.stationId, km: x.km, vehicleId: x.v.id });
  if (out.length >= n) return out.slice(0, n);
  const foot = nearestUnitsOnFoot(lat, lng, n + out.length, at, excludeId).filter((u) => !out.some((o) => o.agencyId === u.agencyId));
  return [...out, ...foot].sort((a, b) => a.km - b.km).slice(0, n);
}

/** v2.3: units by their nearest officer on foot (or the station itself). */
export function nearestUnitsOnFoot(lat: number, lng: number, n = 3, at = now(), excludeId?: string) {
  return dep.agencies
    .filter((a) => SECURITY_RESPONDERS.includes(a.kind) && isLive(a))
    .map((a) => {
      const pts = [stationPoint(a.id), ...activeStaff(a.id).filter((p) => p.role === 'officer' && p.id !== excludeId && onDuty(p.id)).map((p) => officerPosition(p.id, at))];
      return { agencyId: a.id, km: Math.min(...pts.map((p) => km(p.lat, p.lng, lat, lng))) };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

function raiseOfficerSos(at: number, officer: Person, kind: 'distress' | 'missed', silent: boolean, linkedCaseId?: string) {
  const pos = officerPosition(officer.id, at);
  const linked = state.incidents.find((x) => x.id === linkedCaseId);
  const lga = linked ? lgaOf(linked.lgaId) : nearestLga(pos.lat, pos.lng);
  const area = linked?.area ?? lga.areas.slice().sort((a, b) => km(pointOf(lga.id, a).lat, pointOf(lga.id, a).lng, pos.lat, pos.lng) - km(pointOf(lga.id, b).lat, pointOf(lga.id, b).lng, pos.lat, pos.lng))[0];
  const ref = refFor('SEC', at);
  const text = kind === 'missed' ? `Missed check-in: ${officer.name} did not answer "Are you OK?" — last known position near ${area}` : `Officer in distress: ${officer.name} pressed Officer SOS near ${area}`;
  const i: Incident = {
    id: `i${state.seq}`,
    ref,
    category: 'security',
    subcategory: kind === 'missed' ? 'missed_checkin' : 'officer',
    severity: 'critical',
    title: kind === 'missed' ? `Missed check-in — ${officer.name}` : `Officer needs help — ${officer.name}`,
    lgaId: lga.id,
    area,
    lat: pos.lat,
    lng: pos.lng,
    status: 'verified',
    agencyId: officer.agencyId ?? controlRoom().id,
    escalationLevel: 1,
    restricted: true,
    sensitiveOnly: false,
    unverified: false,
    createdAt: at,
    ackDueAt: 0,
    resolveDueAt: 0,
    t: { verified: at, assigned: at },
    by: { verified: 'Verified officer alert' },
    handoffs: [],
    evidence: [],
    reports: [{ ref, text, channel: 'sos', identity: 'standard', reporter: { personId: officer.id, name: officer.name, phone: officer.phone }, submittedAt: at, lat: pos.lat, lng: pos.lng }],
    updates: [],
    reopenCount: 0,
    ai: { category: 'security', subcategory: 'officer', severity: 'critical', confidence: 1, signals: ['Officer SOS — verified signed-in officer'], language: 'en' },
    officerSos: { officerId: officer.id, kind, silent, linkedCaseId, responses: [] },
  };
  applyDeadlines(i);
  state.incidents.unshift(i);
  audit(at, kind === 'missed' ? SYSTEM : officer, kind === 'missed' ? 'Missed check-in — Officer SOS' : 'Officer SOS raised', `${officer.name}${silent ? ' (silent)' : ''} near ${area}, ${lga.name}${linked ? ` · linked to ${linked.ref}` : ''}. This is an alert, not an allegation: units alerted at once.`, i.id);
  // The officer's own station is always asked (if it is a live security unit), then the nearest
  // others up to 3. Without this, whether colleagues are alerted depended on where patrols were.
  const ranked = nearestUnits(pos.lat, pos.lng, 4, at, officer.id);
  const ownStation = officer.agencyId && agency(officer.agencyId);
  const own = ownStation && isLive(ownStation) && SECURITY_RESPONDERS.includes(ownStation.kind) ? ranked.find((u) => u.agencyId === officer.agencyId) ?? { agencyId: officer.agencyId!, km: km(stationPoint(officer.agencyId!).lat, stationPoint(officer.agencyId!).lng, pos.lat, pos.lng) } : undefined;
  const near = own ? [own, ...ranked.filter((u) => u.agencyId !== own.agencyId)].slice(0, 3) : ranked.slice(0, 3);
  i.officerSos!.responses = near.map((u) => ({ agencyId: u.agencyId, km: Math.round(u.km * 10) / 10, status: 'asked', vehicleId: u.vehicleId }));
  for (const u of near) {
    const who = agencyManagers(dep, u.agencyId, onDuty).map((p) => p.id);
    const call = u.vehicleId ? state.vehicles.find((v) => v.id === u.vehicleId)?.callSign : undefined;
    const msg = `OFFICER NEEDS HELP — ${officer.name}, ${area}, ${u.km.toFixed(1)} km from ${call ? `your vehicle ${call}` : 'you'}. GO?`;
    notify(at, who, 'sos', msg, i, undefined, undefined, undefined, u.agencyId);
    for (const id of who) {
      send(at, person(id), 'sms', `OYOEYE ${msg}`, i.id);
      send(at, person(id), 'push', `OYOEYE ${msg}`, i.id);
    }
  }
  const cmdr = agency(officer.agencyId)?.commanderId;
  const leads = dutyLeads();
  notify(at, [cmdr, ...leads], 'sos', `${kind === 'missed' ? 'MISSED CHECK-IN' : 'OFFICER SOS'}: ${officer.name} near ${area}. Nearest units alerted.`, i);
  for (const id of [cmdr, ...leads]) send(at, person(id), 'sms', `OYOEYE ${kind === 'missed' ? 'MISSED CHECK-IN' : 'OFFICER SOS'}: ${officer.name} near ${area}, ${lga.name}. Case ${ref}.`, i.id);
  if (officer.agencyId) post(at, officer, channelIdOf(officer.agencyId), { kind: 'text', text: `OFFICER SOS — ${officer.name} needs help near ${area}. Nearest units are being sent.`, urgent: true });
  return i;
}

const canCloseSos = (me: Person, i: Incident) => isManagerOf(me, i.agencyId) || (me.role === 'ops_manager' && me.agencyId === controlRoom().id);
export const canCloseOfficerSos = canCloseSos;

export const safety = {
  /** Officer SOS (held 2 s). Silent SOS does the same without changing the officer's screen. */
  sos: (silent = false): string | undefined => {
    const me = persona();
    if (me.role !== 'officer' || !isActive(me)) return 'Officer SOS is for signed-in field officers';
    if (state.incidents.some((i) => i.officerSos?.officerId === me.id && isOpen(i))) return silent ? undefined : 'Your SOS is already active — help is on the way';
    const at = now();
    const linked = state.incidents.find((i) => i.officerId === me.id && isOpen(i) && !i.officerSos);
    raiseOfficerSos(at, me, 'distress', silent, linked?.id);
    commit();
  },
  respond: (caseId: string, agencyId: string, going: boolean, reason = ''): string | undefined => {
    const me = persona();
    const i = state.incidents.find((x) => x.id === caseId);
    const r = i?.officerSos?.responses.find((x) => x.agencyId === agencyId);
    if (!i || !r) return 'This alert was not sent to your unit';
    if (!isManagerOf(me, agencyId)) return 'Only the unit commander can answer for the unit';
    if (r.status !== 'asked') return 'Already answered';
    if (!going && !reason.trim()) return 'Say why you cannot go';
    const at = now();
    r.status = going ? 'going' : 'cant';
    if (going && r.vehicleId) {
      const veh = state.vehicles.find((v) => v.id === r.vehicleId);
      if (veh && canDispatch(veh)) vehicleRespond(now(), veh.id, i, me);
    }
    r.reason = reason || undefined;
    r.at = at;
    r.by = me.name;
    if (going && !i.t.acknowledged) {
      i.t.acknowledged = at;
      i.t.started = at;
      i.t.enRoute = at;
      i.by.accepted = agency(agencyId)?.short;
      i.by.started = agency(agencyId)?.short;
      i.status = 'in_progress';
    }
    audit(at, me, going ? 'Officer SOS — unit going' : 'Officer SOS — unit cannot go', `${agency(agencyId)?.short}${reason ? `: ${reason}` : ''}`, i.id);
    const sos = i.officerSos!;
    notify(at, [agency(i.agencyId)?.commanderId, ...dutyLeads(), going ? sos.officerId : undefined], 'sos', `${agency(agencyId)?.short} ${going ? 'is going to' : 'cannot go to'} ${person(sos.officerId)?.name}${reason ? `: ${reason}` : ''}.`, i);
    commit();
  },
  imSafe: (caseId: string): string | undefined => {
    const me = persona();
    const i = state.incidents.find((x) => x.id === caseId);
    if (!i?.officerSos || i.officerSos.officerId !== me.id) return 'Not your alert';
    const at = now();
    i.officerSos.safeAt = at;
    audit(at, me, 'Officer says safe', `${me.name}: "I'm safe now" (the case stays open until the commander or duty lead closes it)`, i.id);
    const goingUnits = i.officerSos.responses.filter((r) => r.status === 'going').flatMap((r) => agencyManagers(dep, r.agencyId, onDuty).map((p) => p.id));
    notify(at, [agency(i.agencyId)?.commanderId, ...dutyLeads(), ...goingUnits], 'sos', `${me.name} says "I'm safe now". The commander or duty lead must close the alert.`, i);
    commit();
  },
  close: (caseId: string, outcome: 'safe' | 'injured' | 'missing', note: string): string | undefined => {
    const me = persona();
    const i = state.incidents.find((x) => x.id === caseId);
    if (!i?.officerSos) return 'Not an officer SOS';
    if (!canCloseSos(me, i)) return 'Only the commander or the duty lead can close an officer SOS';
    if (!isOpen(i)) return 'Already closed';
    if (outcome === 'safe' && !note.trim()) return 'Write a short debrief note';
    const at = now();
    const label = outcome === 'safe' ? 'Officer safe' : outcome === 'injured' ? 'Officer injured — hospital' : 'Officer missing';
    i.officerSos.closedAs = label;
    i.outcome = label;
    i.evidence.push({ at, by: me.name, kind: 'note', text: note || label });
    if (outcome === 'missing') {
      audit(at, me, 'Officer missing', note || 'Escalated to the security coordinator', i.id);
      i.escalationLevel = Math.max(i.escalationLevel, 3);
      i.escalationLevel += 1;
      raise(i, at, 'officer missing');
    } else {
      i.status = 'closed';
      i.t.resolved = i.t.resolved ?? at;
      i.t.closed = at;
      i.by.resolved = me.name;
      i.by.closed = me.name;
      audit(at, me, label, note, i.id);
      if (outcome === 'injured') notify(at, dep.people.filter((p) => p.role === 'agency_head' && p.agencyId === controlRoom().id).map((p) => p.id), 'sos', `Officer injured — ${person(i.officerSos.officerId)?.name} taken to hospital (${i.ref}).`, i);
    }
    notify(at, [i.officerSos.officerId, agency(i.agencyId)?.commanderId, ...dutyLeads()], 'sos', `${i.ref}: ${label}.`, i);
    commit();
  },
  /** "I'm alone on this job" — starts the lone-officer check-in timer once on scene. */
  setLone: (caseId: string, on: boolean): string | undefined => {
    const me = persona();
    const i = state.incidents.find((x) => x.id === caseId);
    if (!i || i.officerId !== me.id) return 'Only the assigned officer can do this';
    const at = now();
    if (!on) {
      i.lone = undefined;
      audit(at, me, 'Lone working ended', '', i.id);
    } else {
      startLone(at, i, me.id);
      audit(at, me, 'Lone working', `Alone on this job — check-in every ${state.loneCheckMins} min once on scene`, i.id);
    }
    commit();
  },
  checkIn: (caseId: string, ok: boolean): string | undefined => {
    const me = persona();
    const i = state.incidents.find((x) => x.id === caseId);
    if (!i?.lone || i.lone.officerId !== me.id) return 'No check-in due';
    const at = now();
    if (ok) {
      i.lone = { ...i.lone, promptAt: undefined, nextDue: at + state.loneCheckMins * MIN };
      audit(at, me, 'Lone check-in', "I'm OK", i.id);
    } else {
      audit(at, me, 'Lone check-in', 'I need help', i.id);
      i.lone = undefined;
      raiseOfficerSos(at, me, 'distress', false, i.id);
    }
    commit();
  },
  setLoneDuty: (personId: string, on: boolean): string | undefined => {
    const me = persona();
    const p = person(personId);
    if (!p || !p.agencyId || !canManageStation(me, p.agencyId)) return 'Not your officer';
    p.loneDuty = on;
    audit(now(), me, 'Lone duty changed', `${p.name}: ${on ? 'lone duty' : 'normal duty'}`);
    commit();
  },
};

function startLone(at: number, i: Incident, officerId: string) {
  i.lone = { officerId, since: at, nextDue: i.t.onScene ? at + state.loneCheckMins * MIN : 0 };
}

/** Called from tick(): due check-ins prompt the officer; no answer in 3 minutes raises a Missed check-in SOS. */
function runCheckIns(at: number) {
  let changed = false;
  for (const i of [...state.incidents]) {
    const l = i.lone;
    if (!l || i.status !== 'in_progress' || !i.t.onScene || !l.nextDue) continue;
    if (!l.promptAt && at >= l.nextDue) {
      i.lone = { ...l, promptAt: l.nextDue };
      audit(at, SYSTEM, 'Lone check-in due', `Asked ${person(l.officerId)?.name}: "Are you OK?"`, i.id);
      send(at, person(l.officerId), 'push', `OyoEye: Are you OK? Tap I'm OK or I need help (case ${i.ref}).`, i.id);
      changed = true;
    } else if (l.promptAt && at >= l.promptAt + 3 * MIN) {
      i.lone = undefined;
      const officer = person(l.officerId);
      if (officer) raiseOfficerSos(at, officer, 'missed', false, i.id);
      changed = true;
    }
  }
  return changed;
}
export const checkInDue = (s: State, personId: string) => s.incidents.find((i) => i.lone?.officerId === personId && !!i.lone.promptAt && i.status === 'in_progress');

// ---------- map preferences ----------

export function setMapPrefs(v: State['mapPrefs'][string]) {
  const id = state.signedInId ?? 'guest';
  state.mapPrefs = { ...state.mapPrefs, [id]: v };
  commit();
}

export function setStationLocation(stationId: string, lat: number, lng: number): string | undefined {
  const me = persona();
  if (me.role !== 'admin') return 'Only an administrator can move a station';
  const a = agency(stationId);
  if (!a) return 'Station not found';
  a.lat = Math.round(lat * 1e5) / 1e5;
  a.lng = Math.round(lng * 1e5) / 1e5;
  audit(now(), me, 'Station location set', `${a.name}: ${a.lat}, ${a.lng}`);
  commit();
}

/** Operator passing a "names a group" case to an armed unit: the duty lead must confirm. */
function holdArmed(i: Incident, at: number, me: Person, to: Agency, reason: string, note?: string) {
  if (!i.namesGroup || !ARMED_KINDS.includes(to.kind) || me.role !== 'dispatcher') return false;
  i.armedHold = { toAgencyId: to.id, reason, note, byId: me.id, at };
  audit(at, me, 'Armed dispatch held', `Names a group — ${agency(to.id)?.short} needs the duty lead's confirmation`, i.id);
  notify(at, dutyLeads(), 'info', `Confirm armed dispatch: ${i.ref} (names a group) → ${to.short}. Requested by ${me.name}.`, i);
  return true;
}

// ======================= v2.4: Rule Book and reporter standing =======================

/** Reject reasons (§3.5). Only a duty-lead-confirmed "Deliberate false alarm / hoax" counts against standing. */
export const REJECT_REASONS: { id: RejectKind; label: string; penalty: boolean }[] = [
  { id: 'no_trace', label: 'No trace found', penalty: false },
  { id: 'duplicate', label: 'Duplicate', penalty: false },
  { id: 'not_ours', label: 'Not a matter for OyoEye', penalty: false },
  { id: 'mistake', label: 'Genuine mistake', penalty: false },
  { id: 'hoax', label: 'Deliberate false alarm / hoax', penalty: true },
];
export const rejectLabel = (k?: RejectKind) => REJECT_REASONS.find((r) => r.id === k)?.label ?? 'Rejected';
const YEAR = 365 * DAY;
const isSosCase = (i: Incident) => i.reports[0]?.channel === 'sos' || i.subcategory === 'sos' || !!i.officerSos;

export type StandingLevel = 'new' | 'trusted' | 'good' | 'review' | 'restricted';
export const STANDING_LABEL: Record<StandingLevel, string> = { new: 'New', trusted: 'Trusted', good: 'Good', review: 'Under review', restricted: 'Restricted' };
export interface Standing {
  level: StandingLevel;
  label: string;
  hoaxes: Incident[];
  closed: number;
  confirmed: number;
  /** Under review / Restricted last until 12 months after the last hoax. */
  until?: number;
}

/**
 * Reporter standing. Attaches to the account, or to the phone number when there is
 * no account (615 calls, USSD). Anonymous reporters have no standing.
 */
export function standingFor(s: State, key: { personId?: string; phone?: string }): Standing | undefined {
  const phone = key.phone ?? (key.personId ? person(key.personId)?.phone : undefined);
  if (!key.personId && !phone) return undefined;
  const pd = phone ? digits(phone) : undefined;
  const mine = (i: Incident) => i.reports.some((r) => (key.personId && r.reporter?.personId === key.personId) || (!!pd && !!r.reporter?.phone && digits(r.reporter.phone) === pd));
  const at = now();
  const rows = s.incidents.filter((i) => !i.officerSos && mine(i));
  const hoaxes = rows.filter((i) => i.hoax?.confirmedAt && !i.hoax.overturnedAt && i.hoax.confirmedAt > at - YEAR);
  const closedRows = rows.filter((i) => i.status === 'closed' || i.status === 'referred');
  const confirmed = closedRows.filter((i) => i.verification !== 'timeout' && i.verification !== 'no').length;
  let level: StandingLevel;
  if (hoaxes.length >= 2) level = 'restricted';
  else if (hoaxes.length === 1) level = 'review';
  else if (closedRows.length < 2) level = 'new';
  else if (confirmed >= 2) level = 'trusted';
  else level = 'good';
  const last = Math.max(0, ...hoaxes.map((i) => i.hoax!.confirmedAt!));
  return { level, label: STANDING_LABEL[level], hoaxes, closed: closedRows.length, confirmed, until: hoaxes.length ? last + YEAR : undefined };
}
export const standingOfReport = (s: State, i: Incident) => {
  const r = i.reports[0];
  if (!r || r.identity === 'anonymous') return undefined;
  return standingFor(s, { personId: r.reporter?.personId, phone: r.reporter?.personId ? undefined : r.reporter?.phone });
};
/** Restricted reporters' non-SOS reports need an operator call-back before verification. SOS is never blocked. */
export const callbackNeeded = (s: State, i: Incident) => i.status === 'pending' && !isSosCase(i) && standingOfReport(s, i)?.level === 'restricted' && !i.callback;

const isDutyLead = (p: Person) => p.role === 'ops_manager' && p.agencyId === controlRoom().id;

function confirmHoaxAt(at: number, i: Incident, me: Person) {
  i.hoax = { ...i.hoax!, confirmedBy: me.name, confirmedAt: at };
  audit(at, me, 'Hoax confirmed', 'Deliberate false alarm — counts against reporter standing for 12 months', i.id);
  const r = i.reports[0];
  const sd = standingOfReport(state, i);
  if (r?.reporter?.personId && sd) notify(at, [r.reporter.personId], 'info', msg('m.hoax', { level: `@sd.lvl.${sd.level}`, ref: r.ref }), i);
}

export const standing = {
  confirmHoax: (id: string): string | undefined =>
    act(id, (i, at, me) => {
      if (!isDutyLead(me)) return 'Only the duty lead can confirm a hoax';
      if (i.rejectKind !== 'hoax' || !i.hoax) return 'Not marked as a hoax';
      if (i.hoax.confirmedAt) return 'Already confirmed';
      confirmHoaxAt(at, i, me);
    }),
  dismissHoax: (id: string): string | undefined =>
    act(id, (i, at, me) => {
      if (!isDutyLead(me)) return 'Only the duty lead can decide';
      if (i.rejectKind !== 'hoax' || !i.hoax || i.hoax.confirmedAt) return 'Nothing to decide';
      i.rejectKind = 'no_trace';
      i.hoax = { ...i.hoax, dismissedBy: me.name };
      audit(at, me, 'Hoax not confirmed', 'Re-classified as No trace found — no penalty', i.id);
    }),
  callback: (id: string, result: 'reached' | 'unreachable'): string | undefined =>
    act(id, (i, at, me) => {
      if (!isControl(me)) return 'Only the control room calls back reporters';
      i.callback = { by: me.name, at, result };
      audit(at, me, 'Call-back before verifying', result === 'reached' ? 'Reporter reached (Restricted standing)' : "Couldn't reach the reporter (Restricted standing)", i.id);
    }),
  /** A citizen under review / restricted appeals to the oversight panel. */
  appeal: (text: string): string | undefined => {
    const me = persona();
    const sd = standingFor(state, { personId: me.id });
    if (!sd || (sd.level !== 'review' && sd.level !== 'restricted')) return 'There is nothing to appeal';
    if (text.trim().length < 10) return 'Tell the panel why (a sentence is enough)';
    if (state.complaints.some((c) => c.kind === 'appeal' && c.complainant.personId === me.id && c.status !== 'closed')) return 'Your appeal is already with the panel';
    const at = now();
    appealAt(at, me, text, sd.hoaxes.map((i) => i.id));
    commit();
  },
};

function appealAt(at: number, me: Person, text: string, hoaxCaseIds: string[]) {
  const id = `CC-${String(state.complaints.length + 101).padStart(4, '0')}`;
  state.complaints.unshift({ id, at, kind: 'appeal', text: text.trim(), officerIds: [], hoaxCaseIds, complainant: { personId: me.id, name: me.name, phone: me.phone }, status: 'new', log: [{ at, by: 'OyoEye', text: 'Standing appeal received' }] });
  audit(at, { id: 'protected', name: 'Reporter (protected)' }, 'Standing appeal received', `${id} · ${hoaxCaseIds.length} hoax mark(s)`);
  notify(at, dep.people.filter((p) => p.role === 'oversight').map((p) => p.id), 'info', `New standing appeal ${id}.`);
}

export function decideAppeal(id: string, uphold: boolean, note = ''): string | undefined {
  const me = persona();
  if (me.role !== 'oversight' || !isActive(me)) return 'Only the oversight panel decides appeals';
  const c = state.complaints.find((x) => x.id === id);
  if (!c || c.kind !== 'appeal') return 'Not an appeal';
  if (c.status === 'closed') return 'Already decided';
  const at = now();
  c.status = 'closed';
  c.outcome = uphold ? 'Appeal upheld' : 'Appeal rejected';
  c.log.push({ at, by: me.name, text: `${c.outcome}${note ? `: ${note}` : ''}` });
  if (uphold)
    for (const cid of c.hoaxCaseIds ?? []) {
      const i = state.incidents.find((x) => x.id === cid);
      if (!i?.hoax) continue;
      i.hoax = { ...i.hoax, overturnedAt: at, overturnedBy: me.name };
      audit(at, me, 'Hoax mark removed', 'Standing appeal upheld by the oversight panel', i.id);
    }
  audit(at, me, uphold ? 'Appeal upheld' : 'Appeal rejected', c.id);
  const sd = c.complainant.personId ? standingFor(state, { personId: c.complainant.personId }) : undefined;
  notify(at, [c.complainant.personId], 'info', uphold ? msg('m.appeal.up', { level: sd ? `@sd.lvl.${sd.level}` : 'recalculated' }) : msg('m.appeal.down'));
  commit();
}

// ---------- Rule Book ----------

export const needsOnboarding = (p?: Person) => !!p && (p.role === 'citizen' || p.role === 'focal') && !p.rulebookAcceptedVersion;
export const rulebookUpdated = (s: State, p?: Person) => !!p && !!p.rulebookAcceptedVersion && p.rulebookAcceptedVersion < s.rulebookVersion && (p.rulebookSeenVersion ?? 0) < s.rulebookVersion;
export function acceptRulebook() {
  const me = persona();
  if (me.id === GUEST.id) return;
  const at = now();
  me.rulebookAcceptedVersion = state.rulebookVersion;
  me.rulebookAcceptedAt = at;
  me.rulebookSeenVersion = state.rulebookVersion;
  audit(at, me.role === 'citizen' ? { id: me.id, name: 'Citizen' } : me, `Accepted Rule Book v${state.rulebookVersion}`, me.role === 'focal' ? 'Community focal person' : 'Citizen');
  commit();
}
export function seenRulebookUpdate() {
  const me = persona();
  me.rulebookSeenVersion = state.rulebookVersion;
  commit();
}
/** Presenter control: publish a new Rule Book version (citizens see "what's new" once). */
export function publishRulebook() {
  state.rulebookVersion += 1;
  audit(now(), persona(), 'Rule Book updated', `Now v${state.rulebookVersion}`);
  commit();
}

// ---------- sign-in, inbox, duty ----------

export function signIn(id: string) {
  state.signedInId = id;
  const p = person(id);
  if (p && p.role !== 'citizen') audit(now(), p, 'Signed in', p.staffId ?? '');
  commit();
}
export function signOut() {
  state.signedInId = undefined;
  commit();
}
export function staffSignIn(staffId: string, pin: string): string | undefined {
  const p = dep.people.find((x) => x.staffId?.toUpperCase() === staffId.trim().toUpperCase());
  if (!p) return 'Staff ID not recognised';
  if (p.staffStatus === 'invited') return 'This account is not active yet. Use "First time? Activate my account".';
  if (p.staffStatus === 'suspended') return 'This account is suspended. Speak to your commander.';
  if (p.staffStatus === 'deactivated') return 'This account has been deactivated.';
  if (p.needsCode) return 'Your phone was reported lost. Activate again with the new SMS code.';
  if (pin !== (p.pin ?? '1234')) return 'Wrong PIN';
  signIn(p.id);
}
/** v2.6: every phone input and comparison goes through normalisePhone (src/format.ts). */
const digits = (s: string) => normalisePhone(s) ?? s.replace(/\D/g, '');
export { validPhone };
export const citizenByPhone = (phone: string) => [...dep.people, ...state.citizens].find((p) => p.role === 'citizen' && digits(p.phone) === digits(phone));
export function citizenSignIn(phone: string, firstName?: string) {
  let p = citizenByPhone(phone);
  if (!p) {
    const d = digits(phone);
    p = { id: `c${d}`, name: (firstName || 'Citizen').trim(), role: 'citizen', title: 'Resident', phone: `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`, language: state.lang };
    state.citizens.push(p);
  }
  signIn(p.id);
  return p;
}

export const inboxFor = (s: State, id?: string) => (id ? s.inbox.filter((n) => n.to === id) : []);
export function markRead(noticeId: string) {
  const n = state.inbox.find((x) => x.id === noticeId);
  if (n && !n.read) {
    n.read = true;
    commit();
  }
}
/** Opening a case marks all its updates read (v2.6 §4). */
export function markCaseRead(incidentId: string) {
  const me = state.signedInId;
  let n = 0;
  for (const x of state.inbox) if (x.to === me && x.incidentId === incidentId && !x.read) (x.read = true), n++;
  if (n) commit();
}
/** Marks the given notices read ("Mark all read" on the Updates section). */
export function markNoticesRead(ids: string[]) {
  const set = new Set(ids);
  let n = 0;
  for (const x of state.inbox) if (set.has(x.id) && !x.read) (x.read = true), n++;
  if (n) commit();
}
export function markAllRead() {
  const me = state.signedInId;
  state.inbox.forEach((n) => n.to === me && (n.read = true));
  commit();
}

export function setDuty(personId: string, on: boolean, shift?: Shift) {
  const before = state.duty[personId] ?? { on: true, shift: 'morning' };
  state.duty = { ...state.duty, [personId]: { on, shift: shift ?? before.shift } };
  const p = person(personId);
  audit(now(), persona(), 'Duty changed', `${p?.name}: ${on ? 'on duty' : 'off duty'}${shift && shift !== before.shift ? `, shift ${shift}` : ''}`);
  refreshStations(now());
  commit();
}

// ---------- v2.5: language ----------

const LANG_KEY = 'oyoeye:lang';
function deviceLang(): Lang | undefined {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'yo' || v === 'en' ? v : undefined;
  } catch {
    return undefined;
  }
}
/** Citizens and focal persons: their saved choice; guests: the device's; staff screens stay English. */
export function currentLang(s: State = state): Lang {
  const p = person(s.signedInId);
  if (!p) return s.lang;
  if (p.role === 'citizen' || p.role === 'focal') return p.language ?? s.lang;
  return 'en';
}
/** Remember the choice on the person (signed-in citizen / focal person) and on the device. */
export function setLang(lang: Lang) {
  state.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
  const p = person(state.signedInId);
  if (p && (p.role === 'citizen' || p.role === 'focal') && p.language !== lang) p.language = lang;
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

// ======================= v2.5: alerts, simulated location, map views =======================

/** Operators and duty leads share one "opened" flag: one operator opening an alert stops it for all of them. */
export const alertKey = (me: Person, caseId: string) => (isControl(me) ? `control|${caseId}` : `${me.id}|${caseId}`);
export function markAlertOpened(caseId: string) {
  const me = persona();
  const k = alertKey(me, caseId);
  if (me.id === GUEST.id || state.alertOpened[k]) return;
  state.alertOpened = { ...state.alertOpened, [k]: now() };
  commit();
}
export const alertMutedUntil = (s: State, personId?: string) => (personId ? s.alertMute[personId] ?? 0 : 0);
export function muteAlerts(mins = 15) {
  const me = persona();
  const at = now();
  state.alertMute = { ...state.alertMute, [me.id]: at + mins * MIN };
  audit(at, me, `Alert muted ${mins} min`, `Alert sound muted until ${hhmm(at + mins * MIN)}`);
  commit();
}
export function unmuteAlerts() {
  const me = persona();
  state.alertMute = { ...state.alertMute, [me.id]: 0 };
  audit(now(), me, 'Alert unmuted', 'Alert sound on');
  commit();
}

export function setSimLocation(v: State['simLocation']) {
  state.simLocation = v;
  commit();
}

/** The caller of an SOS sent with no location adds their area afterwards (optional). */
export function addSosLocation(ref: string, lgaId: string, area: string, lat?: number, lng?: number): string | undefined {
  const i = incidentByRef(ref);
  if (!i) return 'Report not found';
  if (!i.locationUnknown) return 'This report already has a location';
  const at = now();
  const pt = lat != null && lng != null ? { lat, lng } : coordsFor(lgaId, area, String(state.seq));
  i.lgaId = lgaId;
  i.area = area;
  i.lat = pt.lat;
  i.lng = pt.lng;
  i.locationUnknown = undefined;
  i.reports[0].lat = pt.lat;
  i.reports[0].lng = pt.lng;
  audit(at, { id: 'protected', name: 'Reporter (protected)' }, 'Caller added location', `${area}, ${lgaOf(lgaId).name}`, i.id);
  i.updates.push({ at, text: msgText(msg('m.sosarea', { area }), 'en'), msg: msg('m.sosarea', { area }) });
  notify(at, isOpen(i) ? [...dispatchers(), ...dutyLeads()] : [], 'info', `SOS ${i.ref}: caller added location — ${area}, ${lgaOf(lgaId).name}.`, i);
  commit();
}

export function saveMapView(page: string, v: { lat: number; lng: number; zoom: number }) {
  const k = `${state.signedInId ?? 'guest'}|${page}`;
  const old = state.mapViews[k];
  if (old && Math.abs(old.lat - v.lat) < 1e-5 && Math.abs(old.lng - v.lng) < 1e-5 && old.zoom === v.zoom) return;
  state.mapViews = { ...state.mapViews, [k]: v };
  commit();
}
export function resetMapView(page: string) {
  const k = `${state.signedInId ?? 'guest'}|${page}`;
  if (!state.mapViews[k]) return;
  const next = { ...state.mapViews };
  delete next[k];
  state.mapViews = next;
  commit();
}

// ======================= v2.8: vehicles, checkpoints =======================

export { HOSPITALS, ROUTES };
/** The vehicle an officer crews (not out of service). */
export const crewVehicle = (personId: string) => state.vehicles.find((v) => v.crewIds.includes(personId) && v.status !== 'out_of_service');
export const vehicleById = (id?: string) => state.vehicles.find((v) => v.id === id);

/** A vehicle starts a straight-line response to a case from where it is now. */
function vehicleRespond(at: number, vehicleId: string, i: Incident, by: Person | typeof SYSTEM) {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v || v.status === 'out_of_service') return;
  const p = vehiclePosition(v, at, state.incidents);
  v.status = 'responding';
  v.caseId = i.id;
  v.respondFrom = { lat: p.lat, lng: p.lng, at };
  if (!seeding) audit(at, by, 'Vehicle responding', `${v.callSign} → ${i.ref}`, i.id);
}
/** After a case is resolved its vehicles go back to their route, or to the station. */
function releaseVehicles(caseId: string) {
  for (const v of state.vehicles)
    if (v.caseId === caseId && (v.status === 'responding' || v.status === 'onscene')) {
      v.status = v.routeId ? 'patrolling' : 'available';
      v.caseId = undefined;
      v.respondFrom = undefined;
    }
}
/** An officer's crew follows their transfer: off the old station's vehicles, onto one at the new station. */
function moveCrew(at: number, me: Person, p: Person, toStationId: string) {
  for (const v of state.vehicles) if (v.crewIds.includes(p.id)) v.crewIds = v.crewIds.filter((x) => x !== p.id);
  const target = state.vehicles
    .filter((v) => v.stationId === toStationId && v.status !== 'out_of_service' && v.kind !== 'motorcycle')
    .sort((a, b) => a.crewIds.length - b.crewIds.length || a.callSign.localeCompare(b.callSign))[0];
  if (target) {
    target.crewIds = [...target.crewIds, p.id];
    audit(at, me, 'Crew changed', `${p.name} now crews ${target.callSign} (transfer)`);
  }
}

const OOS_REASONS: OutOfServiceReason[] = ['No fuel', 'Under repair', 'No crew', 'Accident'];
const canRunStation = (me: Person, stationId: string) => canManageStation(me, stationId) && !isAdmin(me);
const isDutyLeadP = (p: Person) => p.role === 'ops_manager' && p.agencyId === controlRoom().id;

/** Commander actions on vehicles and checkpoints (all audited; out-of-service and checkpoints post in station chat). */
export const fleet = {
  outOfService: (vehicleId: string, reason: OutOfServiceReason): string | undefined => {
    const me = persona();
    const v = state.vehicles.find((x) => x.id === vehicleId);
    if (!v) return 'Vehicle not found';
    if (!canRunStation(me, v.stationId)) return "Only the station's commander can change its vehicles";
    if (!OOS_REASONS.includes(reason)) return 'Choose a reason';
    if (v.status === 'responding' || v.status === 'onscene') return `${v.callSign} is on a case — finish it first`;
    const at = now();
    v.status = 'out_of_service';
    v.statusReason = reason;
    audit(at, me, 'Vehicle out of service', `${v.callSign}: ${reason}`);
    systemPost(v.stationId, `${v.callSign} out of service — ${reason.toLowerCase()}.`, at);
    commit();
  },
  backInService: (vehicleId: string): string | undefined => {
    const me = persona();
    const v = state.vehicles.find((x) => x.id === vehicleId);
    if (!v) return 'Vehicle not found';
    if (!canRunStation(me, v.stationId)) return "Only the station's commander can change its vehicles";
    if (v.status !== 'out_of_service') return 'Already in service';
    if (!v.crewIds.length) return 'Give it a crew first';
    const at = now();
    v.status = v.routeId ? 'patrolling' : 'available';
    v.statusReason = undefined;
    audit(at, me, 'Vehicle back in service', v.callSign);
    systemPost(v.stationId, `${v.callSign} back in service.`, at);
    commit();
  },
  setCrew: (vehicleId: string, crewIds: string[]): string | undefined => {
    const me = persona();
    const v = state.vehicles.find((x) => x.id === vehicleId);
    if (!v) return 'Vehicle not found';
    if (!canRunStation(me, v.stationId)) return "Only the station's commander can change its crews";
    if (crewIds.length > 4) return 'At most 4 crew';
    if (crewIds.some((id) => person(id)?.agencyId !== v.stationId)) return 'Crew must be officers of this station';
    for (const o of state.vehicles) if (o.id !== v.id) o.crewIds = o.crewIds.filter((x) => !crewIds.includes(x));
    v.crewIds = [...crewIds];
    audit(now(), me, 'Crew changed', `${v.callSign}: ${crewIds.map((id) => person(id)?.name).join(', ') || 'no crew'}`);
    commit();
  },
  setRoute: (vehicleId: string, routeId?: string): string | undefined => {
    const me = persona();
    const v = state.vehicles.find((x) => x.id === vehicleId);
    if (!v) return 'Vehicle not found';
    if (!canRunStation(me, v.stationId)) return "Only the station's commander can assign routes";
    const r = routeId ? ROUTES.find((x) => x.id === routeId) : undefined;
    if (routeId && (!r || r.stationId !== v.stationId)) return "Choose one of this station's routes";
    v.routeId = routeId;
    if (v.status === 'available' && routeId) v.status = 'patrolling';
    if (v.status === 'patrolling' && !routeId) v.status = 'available';
    audit(now(), me, 'Patrol route assigned', `${v.callSign}: ${r?.name ?? 'no route'}`);
    commit();
  },
  /** Commanders (their station) and the duty lead (any station) add a temporary checkpoint from the map. */
  addCheckpoint: (v: { stationId?: string; name: string; road: string; kind: CheckpointKind; lat: number; lng: number; hours?: number; startAt?: number; staffIds: string[] }): string | undefined => {
    const me = persona();
    const stationId = v.stationId ?? me.agencyId ?? '';
    if (!(isDutyLeadP(me) || canRunStation(me, stationId))) return 'Only a commander or the duty lead can add checkpoints';
    if (!agency(stationId) || !['police', 'corps'].includes(agency(stationId)!.kind)) return 'Choose a police or Amotekun station';
    if (!v.name.trim() || !v.road.trim()) return 'Give it a name and a road';
    if (v.kind === 'community') return 'Community posts are registered by the commander, not added here';
    const at = now();
    const from = v.startAt ?? at;
    const cp: Checkpoint = { id: `cp-${at}-${state.checkpoints.length}`, name: v.name.trim(), stationId, kind: v.kind, lat: v.lat, lng: v.lng, road: v.road.trim(), activeFrom: from, activeTo: v.hours ? from + v.hours * HOUR : undefined, staffIds: v.staffIds, createdBy: me.name, status: from > at ? 'scheduled' : 'active' };
    state.checkpoints.push(cp);
    audit(at, me, 'Checkpoint set up', `${cp.name} (${cp.road}) · ${agency(stationId)?.short} · ${v.hours ? `${v.hours} h` : 'until closed'} · ${v.staffIds.length} on post`);
    systemPost(stationId, `Checkpoint set up: ${cp.name}, ${cp.road}${v.hours ? ` for ${v.hours} h` : ''} (${v.staffIds.map((id) => person(id)?.name).join(', ') || 'staff to be posted'}).`, at);
    commit();
  },
  closeCheckpoint: (id: string): string | undefined => {
    const me = persona();
    const cp = state.checkpoints.find((x) => x.id === id);
    if (!cp) return 'Checkpoint not found';
    if (!(isDutyLeadP(me) || canRunStation(me, cp.stationId))) return 'Only a commander or the duty lead can close checkpoints';
    if (cp.status === 'closed') return 'Already closed';
    const at = now();
    cp.status = 'closed';
    cp.activeTo = at;
    audit(at, me, 'Checkpoint closed', `${cp.name} (${cp.road})`);
    systemPost(cp.stationId, `Checkpoint closed: ${cp.name}.`, at);
    commit();
  },
};
/** Checkpoint states follow the demo clock (scheduled → active → closed when its time is up). */
export function checkpointStatus(cp: Checkpoint, at = now()): Checkpoint['status'] {
  if (cp.status === 'closed') return 'closed';
  if (cp.activeFrom > at) return 'scheduled';
  if (cp.activeTo && cp.activeTo <= at) return 'closed';
  return 'active';
}
/** Oversight only: the nearest checkpoint within 300 m of a place (complaints often come from checkpoints). */
export function checkpointNear(lat: number, lng: number, metres = 300) {
  return state.checkpoints.map((cp) => ({ cp, d: km(cp.lat, cp.lng, lat, lng) * 1000 })).filter((x) => x.d <= metres).sort((a, b) => a.d - b.d)[0]?.cp;
}

// ---------- boot ----------

import { buildSeed, initialDuty, seedCaseCards, seedChat, seedV23 } from './seed';

function fresh(): State {
  return {
    v: 2,
    clockOffset: 0,
    seq: 470,
    incidents: [],
    audit: [],
    outbox: [],
    inbox: [],
    matrix: dep.matrix.map((r) => ({ ...r })),
    sla: JSON.parse(JSON.stringify(dep.sla)),
    signedInId: undefined,
    citizens: [],
    duty: {},
    lang: deviceLang() ?? 'en',
    unseals: [],
    lastViewLog: {},
    agencies: dep.agencies,
    people: dep.people,
    transfers: [],
    chat: [],
    chatRead: {},
    feedback: [],
    complaints: [],
    unsealReviews: {},
    noticeRules: { enabled: Object.fromEntries(NOTICE_TYPES.map((t) => [t, true])), kidnapApproval: true },
    loneCheckMins: 15,
    mapPrefs: {},
    rulebookVersion: 1,
    simLocation: 'agbowo',
    alertsSince: 0,
    alertOpened: {},
    alertMute: {},
    mapViews: {},
    vehicles: [],
    checkpoints: [],
  };
}

function boot() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.v === 2 && s.people && s.agencies) {
        // Saved stations and staff replace the deployment's, so every lookup sees onboarding changes.
        dep.agencies.splice(0, dep.agencies.length, ...s.agencies);
        dep.people.splice(0, dep.people.length, ...s.people);
        s.agencies = dep.agencies;
        s.people = dep.people;
        state = { ...fresh(), ...s, lang: deviceLang() ?? s.lang ?? 'en' };
        return;
      }
    }
  } catch {
    /* fall through to a fresh seed */
  }
  state = fresh();
  const start = Date.now();
  quietBefore = start - 6 * HOUR;
  readBefore = start - 2 * HOUR; // v2.6 §4: a believable starting inbox
  seeding = true;
  state.vehicles = seedVehicles(dep.people);
  state.checkpoints = seedCheckpoints(start, dep.people);
  buildSeed({ start, submitAt: (at, input) => submitAt(at, input).incident, actAt, escalate });
  seedResponses(start);
  state.duty = initialDuty(start);
  const chatApi = { start, post: (at: number, personId: string, stationId: string, v: Parameters<typeof post>[3]) => post(at, person(personId)!, channelIdOf(stationId), v), system: systemPost, broadcast: seedBroadcast, transfer: seedTransfer };
  seedChat(chatApi);
  seedV23({ start, feedback: seedFeedback, sos: seedSos }, state.incidents);
  for (const p of dep.people) if (p.rulebookAcceptedVersion && !p.rulebookAcceptedAt) p.rulebookAcceptedAt = start - 20 * DAY;
  const bose = person('cit-bose');
  if (bose) appealAt(start - 3 * HOUR, bose, 'I reported what my neighbours told me. I did not lie on purpose — please review.', standingFor(state, { personId: bose.id })?.hoaxes.map((i) => i.id) ?? []);
  seedCaseCards(chatApi, state.incidents);
  state.chat.sort((a, b) => a.at - b.at);
  seeding = false;
  quietBefore = 0;
  readBefore = 0;
  tick();
  state.incidents.sort((a, b) => b.createdAt - a.createdAt);
  state.alertsSince = Date.now(); // seeded history never rings
  // v2.8: seeded cases with en-route or on-scene officers put their vehicle on the case.
  for (const i of state.incidents) {
    if (i.status !== 'in_progress' || !i.officerId || !i.t.enRoute) continue;
    const v = crewVehicle(i.officerId);
    if (!v || v.caseId) continue;
    v.status = i.t.onScene ? 'onscene' : 'responding';
    v.caseId = i.id;
  }
  // v2.8: seeded en-route cases show their vehicle on the way now (not already arrived).
  for (const v of state.vehicles)
    if (v.status === 'responding' && v.caseId) {
      const home = stationPoint(v.stationId);
      v.respondFrom = { lat: home.lat, lng: home.lng, at: start - 3 * MIN };
    }
  // v2.6 §4: updates about seeded cases that are already finished have been seen.
  for (const n of state.inbox) {
    const i = n.incidentId ? state.incidents.find((x) => x.id === n.incidentId) : undefined;
    if (i && ['closed', 'rejected', 'referred'].includes(i.status) && n.at < Date.now() - 30 * MIN) n.read = true;
  }
  // …and nobody starts with more than 12 unread case groups: older ones count as seen.
  const byPerson = new Map<string, Map<string, number>>();
  for (const n of state.inbox) {
    if (n.read || !n.incidentId) continue;
    const m = byPerson.get(n.to) ?? new Map<string, number>();
    m.set(n.incidentId, Math.max(m.get(n.incidentId) ?? 0, n.at));
    byPerson.set(n.to, m);
  }
  for (const [pid, m] of byPerson) {
    const old = new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(12).map(([id]) => id));
    if (old.size) for (const n of state.inbox) if (n.to === pid && n.incidentId && old.has(n.incidentId)) n.read = true;
  }
  commit();
}

/** v2.8: two security cases being answered right now, so vehicles are seen responding on first load. */
function seedResponses(start: number) {
  const plan: [string, string, string, string, string, string][] = [
    ['pol-iwo', 'IWO-P1', 'ibne', 'Gbagi', 'Armed robbery reported at Gbagi market, two men on a motorcycle', 'robbery'],
    ['crp-ibd', 'AMO-IB-1', 'ibn', 'Mokola', 'Fight between youths at Mokola roundabout, one person injured', 'violence'],
  ];
  plan.forEach(([stationId, call, lgaId, area, text, subcategory], k) => {
    const at0 = start - (16 - k * 3) * MIN;
    const v = state.vehicles.find((x) => x.callSign === call);
    if (!v || !canDispatch(v)) return;
    const i = submitAt(at0, { text, category: 'security', subcategory, lgaId, area, identity: 'anonymous', channel: 'web' }).incident;
    actAt(at0 + 2 * MIN, 'disp1', i.id, 'verifyAndPass', { subcategory, severity: 'high', toAgencyId: stationId, reason: 'Covers this area', vehicleId: v.id });
    actAt(at0 + 3 * MIN, v.crewIds[0], i.id, 'acceptHandoff');
    actAt(at0 + 4 * MIN, v.crewIds[0], i.id, 'start');
  });
}

/** Seeding helper: run an action as a given person at a given time. */
function actAt(at: number, personId: string, id: string, fn: keyof typeof actions, ...args: unknown[]) {
  const offset = state.clockOffset;
  const who = state.signedInId;
  state.clockOffset = at - Date.now();
  state.signedInId = personId;
  const i = state.incidents.find((x) => x.id === id);
  if (i) escalate(i, at);
  const err = (actions[fn] as (...a: unknown[]) => unknown)(id, ...args);
  state.clockOffset = offset;
  state.signedInId = who;
  return err as string | undefined;
}

function seedFeedback(at: number, i: Incident, money: boolean, respect: 'yes' | 'somewhat' | 'no', speed?: number, text?: string) {
  const r = i.reports[0];
  const offset = state.clockOffset;
  state.clockOffset = at - Date.now();
  conduct.answer(i.id, r.ref, { money, respect, speed, text }, 'sms');
  state.clockOffset = offset;
}
function seedSos(at: number, officerId: string, kind: 'distress' | 'missed', closeAfterMin: number, goingAgency?: string) {
  const officer = person(officerId)!;
  const i = raiseOfficerSos(at, officer, kind, false);
  const resp = i.officerSos!.responses.find((r) => r.agencyId === goingAgency) ?? i.officerSos!.responses[0];
  if (resp) {
    resp.status = 'going';
    resp.at = at + 2 * MIN;
    resp.by = person(agency(resp.agencyId)?.commanderId)?.name;
    i.t.acknowledged = at + 2 * MIN;
    i.t.started = at + 2 * MIN;
    audit(at + 2 * MIN, person(agency(resp.agencyId)?.commanderId) ?? SYSTEM, 'Officer SOS — unit going', agency(resp.agencyId)?.short ?? '', i.id);
  }
  const end = at + closeAfterMin * MIN;
  i.officerSos!.closedAs = 'Officer safe';
  i.outcome = 'Officer safe';
  i.status = 'closed';
  i.t.resolved = end;
  i.t.closed = end;
  i.by.closed = 'Control-room duty lead';
  audit(end, person('duty1')!, 'Officer safe', 'Officer found safe; debrief done', i.id);
  return i;
}

function seedBroadcast(at: number, personId: string, text: string, lgaIds: string[], ackedBy: string[]) {
  const targets = chat.broadcastTargets({ kind: 'lgas', lgaIds }).map((a) => a.id);
  const acks: Record<string, { by: string; at: number }> = {};
  for (const id of ackedBy) {
    const p = person(id);
    if (p?.agencyId && targets.includes(p.agencyId)) acks[p.agencyId] = { by: p.name, at: at + 20 * MIN };
  }
  state.chat.push({ id: `c${at}-${chatSeq++}`, channelId: BROADCAST, at, authorId: personId, kind: 'broadcast', text, targets, acks, seenBy: [personId, ...ackedBy] });
  audit(at, person(personId)!, 'Broadcast sent', `To ${targets.length} station(s) · #${textHash(text)}`);
}
function seedTransfer(at: number, personId: string, toStationId: string, byId: string, reason: string) {
  const p = person(personId)!;
  const t: Transfer = { id: `tr${at}`, personId, fromStationId: p.agencyId!, toStationId, reason, effective: lagosIsoDate(at + DAY), byId, at, status: 'pending' };
  state.transfers.push(t);
  audit(at, person(byId)!, 'Transfer requested', `${p.name}: ${agency(p.agencyId)?.short} → ${agency(toStationId)?.short} (${reason})`);
  notifyTransfer(at, t, person(byId)!);
}

export type SeedApi = {
  start: number;
  submitAt: (at: number, input: ReportInput) => Incident;
  actAt: typeof actAt;
  escalate: typeof escalate;
};

boot();
export { get as getState, DAY };
