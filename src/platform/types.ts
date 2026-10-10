// Platform types. Nothing in this file is specific to one state:
// a deployment (see src/deployments) supplies the LGAs, agencies,
// people, routing matrix and SLAs.

export type CategoryId = 'security' | 'fire' | 'flooding' | 'roads' | 'waste' | 'infrastructure';
export type Severity = 'critical' | 'high' | 'normal' | 'low';
export type Identity = 'standard' | 'confidential' | 'anonymous';
export type Channel = 'web' | 'sos' | 'whatsapp' | 'sms' | 'ussd' | 'call_615';

export type Status =
  | 'triage' // waiting for a human in the control room
  | 'assigned' // dispatched / routed to a responding unit or agency
  | 'accepted' // responder acknowledged
  | 'in_progress' // en route, on scene or working
  | 'awaiting_verification' // civic only: citizen asked to confirm
  | 'investigation' // security: handed over for investigation
  | 'resolved'
  | 'reopened'
  | 'invalid'; // false alarm, spam or unverifiable after triage

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
  | 'admin';

export type EvidenceKind = 'photo' | 'note' | 'gps' | 'work_order';

export interface Subcategory {
  id: string;
  label: string;
  /** Always treated as confidential regardless of what the reporter picked. */
  forceConfidential?: boolean;
  /** Only the sensitive-cases role can open it. */
  sensitiveOnly?: boolean;
}

export interface Category {
  id: CategoryId;
  label: string;
  code: string; // used in reference numbers, e.g. SEC
  subcategories: Subcategory[];
  /** Evidence required before a case can be closed. */
  evidence: EvidenceKind[];
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

export interface Agency {
  id: string;
  name: string;
  short: string;
  kind: AgencyKind;
  /** LGAs this unit or agency covers. Empty = statewide. */
  lgaIds: string[];
}

export interface Person {
  id: string;
  name: string;
  role: RoleId;
  title: string;
  agencyId?: string;
  lgaId?: string;
  phone: string;
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

export interface Report {
  ref: string;
  text: string;
  channel: Channel;
  identity: Identity;
  /** Kept only for standard/confidential. Anonymous reports never store contact. */
  reporter?: { personId?: string; name?: string; phone?: string };
  submittedAt: number;
  lat: number;
  lng: number;
  photo?: string;
  callRef?: string;
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
  /** Responding agency or unit. */
  agencyId: string;
  /** Unit suggested by the routing engine while in triage. */
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
    triaged?: number;
    assigned?: number;
    acknowledged?: number;
    enRoute?: number;
    onScene?: number;
    actionTaken?: number;
    resolved?: number;
  };
  outcome?: string;
  evidence: Evidence[];
  reports: Report[];
  updates: { at: number; text: string }[]; // citizen-facing
  verification?: 'yes' | 'no' | 'partial' | 'timeout';
  reopenCount: number;
  ai: Triage;
  backupRequested?: boolean;
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
  at: number;
  channel: 'whatsapp' | 'sms' | 'push';
  to: string;
  phone: string;
  text: string;
  incidentId?: string;
}
