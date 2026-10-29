import type { Msg } from '../strings';
// Platform types. Nothing in this file is specific to one state:
// a deployment (see src/deployments) supplies the LGAs, agencies,
// people, routing matrix and SLAs.

export type CategoryId = 'security' | 'fire' | 'flooding' | 'roads' | 'waste' | 'infrastructure' | 'other';
export type Severity = 'critical' | 'high' | 'normal' | 'low';
export type Identity = 'standard' | 'confidential' | 'anonymous';
export type Channel = 'web' | 'sos' | 'whatsapp' | 'sms' | 'ussd' | 'call_615';

/**
 * The seven statuses every user sees (in order), plus three side states.
 * Labels live in src/status.ts so the same words are used everywhere.
 */
export type Status =
  | 'pending' // 1 Pending review — waiting for the 615 control room / central review
  | 'verified' // 2 Verified — an operator confirmed it is real
  | 'assigned' // 3 Assigned — passed to a unit, agency or officer; waiting for them to accept
  | 'accepted' // 4 Accepted — the receiver took ownership
  | 'in_progress' // 5 In progress — en route / on scene / working
  | 'resolved' // 6 Resolved — responder says done; waiting for citizen or supervisor
  | 'closed' // 7 Closed — final
  | 'reopened' // side: citizen said not fixed, or commander rejected the resolution
  | 'rejected' // side: invalid / hoax / duplicate / cancelled. Final
  | 'referred'; // side: handed to investigation (CID). Final for the platform

export type RoleId =
  | 'citizen'
  | 'officer' // field officer / patrol lead
  | 'supervisor' // supervisor / unit commander
  | 'ops_manager' // operations manager / control-room duty lead
  | 'agency_head'
  | 'chairman'
  | 'dispatcher' // 615 control-room operator
  | 'command' // central command (cross-agency)
  | 'executive'
  | 'sensitive' // restricted-cases officer (SGBV, intelligence)
  | 'admin'
  | 'focal' // community focal person (v2.3)
  | 'oversight'; // independent oversight panel (v2.3)

export type EvidenceKind = 'photo' | 'note' | 'gps' | 'work_order';
export type Shift = 'morning' | 'afternoon' | 'night';

export interface Subcategory {
  id: string;
  label: string;
  /** Always treated as confidential regardless of what the reporter picked. */
  forceConfidential?: boolean;
  /** Only the sensitive-cases role can open it. */
  sensitiveOnly?: boolean;
  /** Never message the reporter by SMS/WhatsApp unless they opted in. */
  quiet?: boolean;
}

export interface Category {
  id: CategoryId;
  label: string;
  code: string; // used in reference numbers, e.g. SEC
  subcategories: Subcategory[];
  /** Evidence required before a case can be marked resolved. */
  evidence: EvidenceKind[];
  /** Closed when the citizen confirms (otherwise a supervisor signs off). */
  citizenVerification: boolean;
  /** Security-style handling: human triage, restricted detail, no public detail. */
  restricted: boolean;
  outcomes?: string[];
}

export interface LGA {
  id: string;
  name: string;
  lat: number;
  lng: number;
  areas: string[];
  metro?: boolean;
}

export type AgencyKind = 'control_room' | 'police' | 'corps' | 'sensitive_desk' | 'emergency' | 'state' | 'lga_council';

export type OrgKind = 'police' | 'amotekun' | 'fire' | 'agency' | 'lga' | 'control_room' | 'sensitive';

/** Organisation → Station → Staff (PRD v2.2 §3). */
export interface Organisation {
  id: string;
  name: string;
  short: string;
  kind: OrgKind;
  ranks: string[];
}

export type StationStatus = 'setting_up' | 'live' | 'suspended';

/** A station: any responding unit (police division, Amotekun command, fire station, agency zone office). */
export interface Agency {
  id: string;
  name: string;
  short: string;
  kind: AgencyKind;
  /** LGAs this unit or agency covers. Empty = statewide. */
  lgaIds: string[];
  organisationId?: string;
  address?: string;
  landmark?: string;
  phone?: string;
  commanderId?: string;
  createdAt?: number;
  /** Routing skips stations that are not live. Missing = live (seeded stations). */
  status?: StationStatus;
  /** Readiness item 4: a test case has been run end to end. */
  testDone?: boolean;
  /** Map position of the station building (v2.3). */
  lat?: number;
  lng?: number;
}
export type Station = Agency;

export type StaffStatus = 'invited' | 'active' | 'suspended' | 'deactivated';
export type StationRole = 'field' | 'desk' | 'deputy';

export interface Posting {
  stationId: string;
  from: number;
  to?: number;
}

export interface Person {
  id: string;
  name: string;
  role: RoleId;
  title: string;
  agencyId?: string;
  lgaId?: string;
  phone: string;
  /** Staff sign-in id, e.g. OY-615-001. */
  staffId?: string;
  serviceNumber?: string;
  rank?: string;
  /** Missing = active (seeded staff). */
  staffStatus?: StaffStatus;
  stationRole?: StationRole;
  invitedBy?: string;
  /** Demo only: the SMS activation code. */
  inviteCode?: string;
  activatedAt?: number;
  /** PIN set at activation (seeded demo staff use 1234). */
  pin?: string;
  /** After a lost phone report, the next sign-in needs a new SMS code. */
  needsCode?: boolean;
  postings?: Posting[];
  /** Community focal persons (v2.3). */
  community?: string;
  ward?: string;
  focalGroup?: FocalGroup;
  sponsor?: string;
  /** Focal persons: the commander confirms them after activation. */
  verified?: boolean;
  /** Commander set "Lone duty": every job counts as alone. */
  loneDuty?: boolean;
  /** v2.4: OyoEye Rule Book. */
  rulebookAcceptedVersion?: number;
  rulebookAcceptedAt?: number;
  /** Last Rule Book version whose "what's new" notice was shown. */
  rulebookSeenVersion?: number;
  /** v2.5: citizen / focal person language choice (staff screens stay English). */
  language?: 'en' | 'yo';
  demo?: boolean;
  /** Seeded track record, used as a credibility signal only. */
  history?: { reports: number; confirmed: number; false: number };
}

/** target: an agency id, or '@police' / '@corps' / '@lga' resolved by coverage. */
export interface RoutingRule {
  id: string;
  category: CategoryId;
  subcategory?: string;
  lgaIds?: string[];
  target: string;
  note?: string;
}

export interface SlaWindow {
  ack: number; // minutes
  arrive?: number; // minutes, emergency categories
  resolve: number; // minutes
}
export type SlaTable = Record<CategoryId, Record<Severity, SlaWindow>>;

export interface Deployment {
  organisations: Organisation[];
  id: string;
  product: string; // OyoEye
  state: string; // Oyo
  prefix: string; // OY
  emergencyLine: string; // 615
  lgas: LGA[];
  agencies: Agency[];
  people: Person[];
  categories: Category[];
  matrix: RoutingRule[];
  sla: SlaTable;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  metroBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export type FocalGroup = 'baale_secretary' | 'hunters' | 'vigilante' | 'market' | 'farmers' | 'herders' | 'youth';

/** Traditional rulers are contacts, not users (v2.3 §3.3). Names are fictional. */
export interface CommunityLeader {
  id: string;
  title: string;
  name: string;
  phone: string;
  lgaId: string;
  areas: string[];
}

export interface Feedback {
  id: string;
  at: number;
  caseId: string;
  /** The unit that closed the case: scores are aggregated per unit. */
  agencyId: string;
  reportRef: string;
  money: boolean;
  respect: 'yes' | 'somewhat' | 'no';
  speed?: number;
  text?: string;
  via: 'app' | 'sms' | 'ussd' | 'track';
}

export type RejectKind = 'no_trace' | 'duplicate' | 'not_ours' | 'mistake' | 'hoax';

export type ComplaintStatus = 'new' | 'review' | 'referred' | 'closed';
/** A conduct complaint. Only the oversight panel ever sees these. */
export interface Complaint {
  id: string;
  at: number;
  caseId?: string;
  reportRef?: string;
  agencyId?: string;
  kind: 'money' | 'respect' | 'misconduct' | 'appeal';
  /** Standing appeals: the hoax-rejected cases being appealed. */
  hoaxCaseIds?: string[];
  text: string;
  officerIds: string[];
  complainant: { personId?: string; name?: string; phone?: string };
  status: ComplaintStatus;
  referredTo?: string;
  outcome?: 'Substantiated' | 'Not substantiated' | 'Withdrawn' | 'Appeal upheld' | 'Appeal rejected';
  log: { at: number; by: string; text: string }[];
}

export interface SosResponse {
  agencyId: string;
  km: number;
  status: 'asked' | 'going' | 'cant';
  reason?: string;
  at?: number;
  by?: string;
  /** v2.8: the nearest vehicle of that unit, when the unit has one. */
  vehicleId?: string;
}

export interface Report {
  ref: string;
  text: string;
  channel: Channel;
  identity: Identity;
  /** Kept only for standard/confidential. Anonymous reports never store contact. */
  reporter?: { personId?: string; name?: string; phone?: string; optInUpdates?: boolean };
  submittedAt: number;
  lat: number;
  lng: number;
  photo?: string;
  voice?: string; // simulated voice-note label
  callRef?: string;
  /** Report made by a community focal person (v2.3 §3.1). */
  focal?: { how: 'saw' | 'told' | 'at_scene'; atRisk?: number; canAssist?: boolean };
  /** v2.5: the reporter's language when they reported (SMS replies use it). */
  lang?: 'en' | 'yo';
}

export interface Evidence {
  at: number;
  by: string;
  kind: EvidenceKind;
  text: string;
  photo?: string;
}

export interface Triage {
  category: CategoryId;
  subcategory?: string;
  severity: Severity;
  confidence: number;
  signals: string[];
  language: 'en' | 'yo' | 'pcm' | 'mixed';
}

export type HandoffKind = 'unit' | 'officer' | 'handback' | 'control' | 'desk';

/** "Pass case": a first-class event the receiver must accept or decline. */
export interface Handoff {
  id: string;
  at: number;
  kind: HandoffKind;
  fromId: string;
  fromName: string;
  fromAgencyId?: string;
  toAgencyId: string;
  toPersonId?: string;
  reason: string;
  note?: string;
  status: 'pending' | 'accepted' | 'declined' | 'superseded';
  decidedAt?: number;
  decidedBy?: string;
  declineReason?: string;
  /** Where the case goes back to if declined. */
  prev: { agencyId: string; officerId?: string; status: Status; acknowledged?: number };
  /** v2.8: dispatched from the map — this vehicle turns Responding once the pass is accepted. */
  vehicleId?: string;
}

export interface Incident {
  id: string;
  ref: string;
  category: CategoryId;
  subcategory?: string;
  severity: Severity;
  title: string;
  lgaId: string;
  area: string;
  lat: number;
  lng: number;
  landmark?: string;
  status: Status;
  /** Unit or agency holding the case (or the one it has been passed to). */
  agencyId: string;
  /** Unit suggested by the routing engine while pending review. */
  suggestedAgencyId?: string;
  officerId?: string;
  escalationLevel: number;
  restricted: boolean;
  sensitiveOnly: boolean;
  unverified: boolean; // allegation not yet corroborated
  createdAt: number;
  ackDueAt: number;
  arriveDueAt?: number;
  resolveDueAt: number;
  t: {
    verified?: number;
    assigned?: number;
    acknowledged?: number;
    enRoute?: number;
    onScene?: number;
    started?: number;
    resolved?: number;
    closed?: number;
    reopened?: number;
  };
  /** Who did each step (names shown on the stepper). */
  by: Partial<Record<'verified' | 'assigned' | 'accepted' | 'started' | 'resolved' | 'closed', string>>;
  /** Last side state, for the stepper marker. */
  side?: { kind: 'reopened' | 'rejected' | 'referred'; at: number; step: number; by: string; reason?: string };
  handoffs: Handoff[];
  outcome?: string;
  evidence: Evidence[];
  reports: Report[];
  updates: { at: number; text: string; msg?: Msg }[]; // citizen-facing, plain language (msg renders in the reader's language)
  /** v2.5: SOS sent before any location arrived — the operator calls back. */
  locationUnknown?: boolean;
  verification?: 'yes' | 'no' | 'partial' | 'timeout';
  reopenCount: number;
  ai: Triage;
  backupRequested?: boolean;
  backupSent?: string;
  /** Distinct reporters reached the bump threshold. */
  bumped?: boolean;
  /** v2.3 §3.4: the text names an ethnic or occupational group. */
  namesGroup?: boolean;
  /** Operator asked to pass a "names a group" case to an armed unit; the duty lead must confirm. */
  armedHold?: { toAgencyId: string; reason: string; note?: string; byId: string; at: number };
  /** Kidnapping notices to traditional rulers waiting for coordinator approval. */
  noticeHold?: string[];
  leadersNotified?: string[];
  /** Officer SOS (v2.3 §5.1). */
  officerSos?: { officerId: string; kind: 'distress' | 'missed'; silent?: boolean; linkedCaseId?: string; responses: SosResponse[]; safeAt?: number; closedAs?: string };
  /** v2.4 §3.5: why a report was rejected. Only a duty-lead-confirmed hoax counts against standing. */
  rejectKind?: RejectKind;
  hoax?: { reason: string; by: string; at: number; confirmedBy?: string; confirmedAt?: number; dismissedBy?: string; overturnedAt?: number; overturnedBy?: string };
  /** Restricted reporter: the operator must call back before verifying. */
  callback?: { by: string; at: number; result: 'reached' | 'unreachable' };
  /** Lone-officer check-in timer (v2.3 §5.2). */
  lone?: { officerId: string; since: number; nextDue: number; promptAt?: number };
}

export interface AuditEntry {
  seq: number;
  at: number;
  incidentId?: string;
  actorId: string;
  actor: string;
  action: string;
  detail: string;
  prev: string;
  hash: string;
}

export interface OutboundMessage {
  id: string;
  /** v2.5: language the text was rendered in. */
  lang?: 'en' | 'yo';
  at: number;
  channel: 'whatsapp' | 'sms' | 'push';
  to: string;
  phone: string;
  text: string;
  incidentId?: string;
}

export type NoticeKind = 'handoff' | 'escalation' | 'backup' | 'resolved' | 'declined' | 'accepted' | 'citizen' | 'info' | 'reopened' | 'transfer' | 'chat' | 'sos' | 'feedback';

/** A per-user inbox item (the bell). */
export interface Notice {
  id: string;
  at: number;
  to: string; // person id
  kind: NoticeKind;
  text: string;
  incidentId?: string;
  ref?: string;
  handoffId?: string;
  transferId?: string;
  sosCaseId?: string;
  sosAgencyId?: string;
  channelId?: string;
  read: boolean;
  /** v2.5: template key + values, so citizens read it in their language. */
  msg?: Msg;
}

/** An officer moving from one station to another; the receiving commander accepts (like a case handoff). */
export interface Transfer {
  id: string;
  personId: string;
  fromStationId: string;
  toStationId: string;
  reason: string;
  effective: string; // yyyy-mm-dd
  byId: string;
  at: number;
  status: 'pending' | 'accepted' | 'declined';
  decidedAt?: number;
  decidedBy?: string;
  declineReason?: string;
}

export type ChatKind = 'text' | 'photo' | 'voice' | 'location' | 'case' | 'system' | 'broadcast';

export interface ChatMessage {
  id: string;
  channelId: string;
  at: number;
  authorId: string;
  kind: ChatKind;
  text?: string;
  photo?: string;
  caseId?: string;
  urgent?: boolean;
  pinned?: boolean;
  removedBy?: string;
  seenBy: string[];
  /** Broadcasts: target stations and their acknowledgements. */
  targets?: string[];
  acks?: Record<string, { by: string; at: number }>;
}

/** Membership is derived from postings, never edited by hand. */
export interface ChatChannel {
  id: string;
  kind: 'station' | 'broadcast';
  stationId?: string;
  name: string;
  memberIds: string[];
  /** Monitors / read-only members (control room, coordinator). */
  monitorIds: string[];
  readOnlyIds: string[];
  /** v2.3: the station's community channel (focal persons; no case cards). */
  community?: boolean;
}

// ======================= v2.8: operational map =======================

export type VehicleKind = 'patrol_car' | 'motorcycle' | 'armoured' | 'fire_truck' | 'ambulance' | 'utility';
export type VehicleStatus = 'available' | 'patrolling' | 'responding' | 'onscene' | 'out_of_service';
export type OutOfServiceReason = 'No fuel' | 'Under repair' | 'No crew' | 'Accident';

/** A patrol vehicle. Positions are simulated from the demo clock (never stored per tick). */
export interface Vehicle {
  id: string;
  callSign: string;
  stationId: string;
  kind: VehicleKind;
  plate?: string;
  crewIds: string[];
  status: VehicleStatus;
  statusReason?: OutOfServiceReason;
  routeId?: string;
  caseId?: string;
  /** Where and when the current response started (straight line to the case). */
  respondFrom?: { lat: number; lng: number; at: number };
  /** Spreads vehicles on the same route. */
  phase: number;
  lastPosition?: { lat: number; lng: number };
  heading?: number;
  history: { lat: number; lng: number; at: number }[];
}

export type CheckpointKind = 'permanent' | 'temporary' | 'joint' | 'community';
export type CheckpointStatus = 'active' | 'scheduled' | 'closed';
export interface Checkpoint {
  id: string;
  name: string;
  stationId: string;
  kind: CheckpointKind;
  lat: number;
  lng: number;
  road: string;
  activeFrom: number;
  activeTo?: number;
  staffIds: string[];
  createdBy: string;
  status: CheckpointStatus;
}

export interface PatrolRoute {
  id: string;
  stationId: string;
  name: string;
  points: [number, number][];
}

/** Reference places (fictional / generic names). */
export interface Hospital {
  id: string;
  name: string;
  lgaId: string;
  lat: number;
  lng: number;
}
