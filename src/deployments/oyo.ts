import type { Agency, Category, CommunityLeader, Deployment, LGA, Organisation, Person, RoutingRule, SlaTable } from '../platform/types';

// Oyo State deployment. Every name of a person here is fictional.
// Agency names are descriptions set by the state at onboarding.

const lga = (id: string, name: string, lat: number, lng: number, areas: string[], metro = false): LGA => ({ id, name, lat, lng, areas, metro });

const LGAS: LGA[] = [
  lga('ibn', 'Ibadan North', 7.415, 3.913, ['Bodija', 'Agodi', 'Mokola', 'Sango', 'Agbowo', 'Samonda', 'UI'], true),
  lga('ibne', 'Ibadan North-East', 7.4, 3.94, ['Iwo Road', 'Gbagi', 'Oje', 'Idi-Ape', 'Beere'], true),
  lga('ibnw', 'Ibadan North-West', 7.39, 3.878, ['Dugbe', 'Onireke', 'Eleyele', 'Adamasingba'], true),
  lga('ibse', 'Ibadan South-East', 7.36, 3.92, ['Mapo', 'Oja Oba', 'Felele', 'Challenge'], true),
  lga('ibsw', 'Ibadan South-West', 7.365, 3.868, ['Ring Road', 'Oke-Ado', 'Oluyole Estate', 'Molete', 'Apata'], true),
  lga('aki', 'Akinyele', 7.53, 3.92, ['Moniya', 'Ojoo', 'Ijaye', 'Iroko'], true),
  lga('egb', 'Egbeda', 7.39, 4.0, ['Olodo', 'Egbeda', 'Adegbayi', 'Alakia'], true),
  lga('lag', 'Lagelu', 7.46, 4.03, ['Iyana Offa', 'Lalupon', 'Ejioku'], true),
  lga('ido', 'Ido', 7.43, 3.76, ['Apete', 'Omi-Adio', 'Ido', 'Akufo'], true),
  lga('olu', 'Oluyole', 7.28, 3.85, ['Idi-Ayunre', 'Olomi', 'Odo-Ona'], true),
  lga('ona', 'Ona Ara', 7.31, 4.0, ['Akanran', 'Olunloyo', 'Ajia'], true),
  lga('afi', 'Afijio', 7.72, 3.93, ['Jobele', 'Fiditi', 'Ilora']),
  lga('ati', 'Atiba', 7.88, 3.98, ['Ofa Meta', 'Ajagba']),
  lga('ats', 'Atisbo', 8.55, 3.45, ['Tede', 'Ago-Are']),
  lga('ibc', 'Ibarapa Central', 7.43, 3.29, ['Igbo-Ora', 'Idere']),
  lga('ibe', 'Ibarapa East', 7.54, 3.42, ['Eruwa', 'Lanlate']),
  lga('ibno', 'Ibarapa North', 7.63, 3.23, ['Ayete', 'Tapa', 'Igangan']),
  lga('ire', 'Irepo', 9.08, 3.85, ['Kishi']),
  lga('ise', 'Iseyin', 7.97, 3.6, ['Iseyin', 'Ado-Awaye']),
  lga('ite', 'Itesiwaju', 8.17, 3.63, ['Otu', 'Komu']),
  lga('iwa', 'Iwajowa', 8.03, 3.13, ['Iwereile', 'Iganna']),
  lga('kaj', 'Kajola', 8.04, 3.35, ['Okeho', 'Ilero']),
  lga('ogn', 'Ogbomosho North', 8.14, 4.25, ['Takie', 'Sabo', 'Oja Igbo', 'Aroje']),
  lga('ogs', 'Ogbomosho South', 8.1, 4.24, ['Arowomole', 'Oke-Ado Ogbomoso', 'Ilaji']),
  lga('ogo', 'Ogo Oluwa', 7.97, 4.4, ['Ajaawa', 'Idewure']),
  lga('olo', 'Olorunsogo', 8.75, 4.13, ['Igbeti']),
  lga('oor', 'Oorelope', 8.83, 3.76, ['Igboho']),
  lga('ori', 'Ori Ire', 8.2, 4.1, ['Ikoyi-Ile', 'Ogbomoso outskirts']),
  lga('oye', 'Oyo East', 7.86, 3.96, ['Oyo town', 'Owode']),
  lga('oyw', 'Oyo West', 7.83, 3.91, ['Ojongbodu', 'Isokun']),
  lga('ske', 'Saki East', 8.6, 3.9, ['Ago-Amodu', 'Sepeteri']),
  lga('skw', 'Saki West', 8.67, 3.39, ['Saki', 'Okere']),
  lga('sur', 'Surulere', 8.09, 4.38, ['Iresa-Adu', 'Ilajue']),
];

const ids = (...xs: string[]) => xs;
const IBADAN = ids('ibn', 'ibne', 'ibnw', 'ibse', 'ibsw', 'aki', 'egb', 'lag', 'ido', 'olu', 'ona');

const SECURITY_AGENCIES: Agency[] = [
  { id: 'cr615', name: '615 Security & Emergency Control Room', short: '615 Control Room', kind: 'control_room', lgaIds: [] },
  { id: 'sgbv', name: 'SGBV & Child Protection Response Desk', short: 'SGBV Desk', kind: 'sensitive_desk', lgaIds: [] },
  { id: 'intel', name: 'Security Intelligence Desk', short: 'Intel Desk', kind: 'sensitive_desk', lgaIds: [] },
  // Police divisions (federal) — linked by agreement; names are location-based.
  { id: 'pol-bdj', name: 'Police Division — Bodija', short: 'Police Bodija', kind: 'police', lgaIds: ['ibn', 'aki'] },
  { id: 'pol-iyg', name: 'Police Division — Iyaganku', short: 'Police Iyaganku', kind: 'police', lgaIds: ['ibsw', 'ibnw', 'ido'] },
  { id: 'pol-iwo', name: 'Police Division — Iwo Road', short: 'Police Iwo Rd', kind: 'police', lgaIds: ['ibne', 'egb', 'lag'] },
  { id: 'pol-map', name: 'Police Division — Mapo', short: 'Police Mapo', kind: 'police', lgaIds: ['ibse', 'ona', 'olu'] },
  { id: 'pol-ogb', name: 'Police Area Command — Ogbomoso', short: 'Police Ogbomoso', kind: 'police', lgaIds: ['ogn', 'ogs', 'sur', 'ogo', 'ori'] },
  { id: 'pol-oyo', name: 'Police Area Command — Oyo', short: 'Police Oyo', kind: 'police', lgaIds: ['oye', 'oyw', 'afi', 'ati'] },
  { id: 'pol-okg', name: 'Police Area Command — Oke-Ogun', short: 'Police Oke-Ogun', kind: 'police', lgaIds: ['ise', 'ite', 'iwa', 'kaj', 'ats', 'skw', 'ske', 'oor', 'olo', 'ire'] },
  { id: 'pol-ibp', name: 'Police Area Command — Ibarapa', short: 'Police Ibarapa', kind: 'police', lgaIds: ['ibc', 'ibe', 'ibno'] },
  // Western Nigeria Security Network (Amotekun Corps), Oyo State command zones.
  { id: 'crp-ibd', name: 'Amotekun Corps — Ibadan Zone', short: 'Amotekun Ibadan', kind: 'corps', lgaIds: IBADAN },
  { id: 'crp-ogb', name: 'Amotekun Corps — Ogbomoso Zone', short: 'Amotekun Ogbomoso', kind: 'corps', lgaIds: ['ogn', 'ogs', 'sur', 'ogo', 'ori'] },
  { id: 'crp-oyo', name: 'Amotekun Corps — Oyo Zone', short: 'Amotekun Oyo', kind: 'corps', lgaIds: ['oye', 'oyw', 'afi', 'ati'] },
  { id: 'crp-okg', name: 'Amotekun Corps — Oke-Ogun Zone', short: 'Amotekun Oke-Ogun', kind: 'corps', lgaIds: ['ise', 'ite', 'iwa', 'kaj', 'ats', 'skw', 'ske', 'oor', 'olo', 'ire'] },
  { id: 'crp-ibp', name: 'Amotekun Corps — Ibarapa Zone', short: 'Amotekun Ibarapa', kind: 'corps', lgaIds: ['ibc', 'ibe', 'ibno'] },
];

const CIVIC_AGENCIES: Agency[] = [
  { id: 'fire', name: 'State Fire & Rescue Service', short: 'Fire Service', kind: 'emergency', lgaIds: [] },
  { id: 'drain', name: 'Ministry of Environment — Drainage & Flood Unit', short: 'Drainage Unit', kind: 'state', lgaIds: [] },
  { id: 'waste', name: 'State Waste Management Authority', short: 'Waste Authority', kind: 'state', lgaIds: [] },
  { id: 'rma', name: 'State Road Maintenance Agency', short: 'Road Maintenance', kind: 'state', lgaIds: [] },
  { id: 'works', name: 'Ministry of Works & Infrastructure', short: 'Works Ministry', kind: 'state', lgaIds: [] },
  { id: 'power', name: 'Electricity Hazard Desk (DisCo liaison)', short: 'Power Hazard Desk', kind: 'state', lgaIds: [] },
  ...LGAS.map<Agency>((l) => ({ id: `lga-${l.id}`, name: `${l.name} Local Government — Works & Sanitation`, short: `${l.name} LG`, kind: 'lga_council', lgaIds: [l.id] })),
];

const CATEGORIES: Category[] = [
  {
    id: 'security',
    label: 'Security',
    code: 'SEC',
    restricted: true,
    citizenVerification: false,
    evidence: ['note'],
    subcategories: [
      { id: 'sos', label: 'SOS — emergency now' },
      { id: 'officer', label: 'Officer in distress' },
      { id: 'missed_checkin', label: 'Missed check-in' },
      { id: 'armed', label: 'Armed persons / shooting' },
      { id: 'kidnapping', label: 'Kidnapping / abduction', forceConfidential: true, quiet: true },
      { id: 'robbery', label: 'Robbery / break-in' },
      { id: 'violence', label: 'Violence, cult or communal clash' },
      { id: 'suspicious', label: 'Suspicious activity' },
      { id: 'threat', label: 'Threat / intimidation / extortion' },
      { id: 'gbv', label: 'Domestic or sexual violence', forceConfidential: true, sensitiveOnly: true, quiet: true },
      { id: 'tip', label: 'Confidential information (non-urgent)', forceConfidential: true, sensitiveOnly: true, quiet: true },
    ],
    outcomes: [
      'Situation contained on arrival',
      'Persons dispersed — area patrolled',
      'Suspects handed to police',
      'Victim rescued / assisted',
      'Referred to investigation',
      'No trace found on arrival',
      'False alarm',
    ],
  },
  {
    id: 'fire',
    label: 'Fire',
    code: 'FIR',
    restricted: false,
    citizenVerification: false,
    evidence: ['note'],
    subcategories: [
      { id: 'building', label: 'Building / market fire' },
      { id: 'vehicle', label: 'Vehicle / tanker fire' },
      { id: 'electrical', label: 'Transformer / electrical fire' },
      { id: 'bush', label: 'Bush fire' },
    ],
  },
  {
    id: 'flooding',
    label: 'Flooding',
    code: 'FLD',
    restricted: false,
    citizenVerification: true,
    evidence: ['photo', 'note'],
    subcategories: [
      { id: 'flood', label: 'Flooding' },
      { id: 'drainage', label: 'Blocked / overflowing drainage' },
    ],
  },
  {
    id: 'roads',
    label: 'Roads',
    code: 'RD',
    restricted: false,
    citizenVerification: true,
    evidence: ['photo', 'note'],
    subcategories: [
      { id: 'state_road', label: 'State road / highway' },
      { id: 'local_road', label: 'Local street' },
      { id: 'bridge', label: 'Bridge / culvert' },
    ],
  },
  {
    id: 'waste',
    label: 'Waste',
    code: 'WST',
    restricted: false,
    citizenVerification: true,
    evidence: ['photo', 'note'],
    subcategories: [
      { id: 'refuse', label: 'Uncollected refuse' },
      { id: 'dumping', label: 'Illegal dumping' },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Public infrastructure',
    code: 'INF',
    restricted: false,
    citizenVerification: true,
    evidence: ['photo', 'note'],
    subcategories: [
      { id: 'electrical', label: 'Fallen pole / live wire' },
      { id: 'streetlight', label: 'Streetlight' },
      { id: 'water', label: 'Burst pipe / public water' },
      { id: 'facility', label: 'Damaged public facility' },
    ],
  },
  {
    // A4: reports with no clear category wait here for a person to classify them.
    id: 'other',
    label: 'Not sure / other',
    code: 'GEN',
    restricted: false,
    citizenVerification: true,
    evidence: ['note'],
    subcategories: [{ id: 'unclassified', label: 'Unclassified — needs review' }],
  },
];

const MATRIX: RoutingRule[] = [
  { id: 'r1', category: 'security', target: '@corps', note: 'Default responder: state security corps zone' },
  { id: 'r2', category: 'security', subcategory: 'armed', target: '@police', note: 'Firearms → police division' },
  { id: 'r3', category: 'security', subcategory: 'robbery', target: '@police' },
  { id: 'r4', category: 'security', subcategory: 'kidnapping', target: '@police', note: 'Control room also alerts the coordinator' },
  { id: 'r5', category: 'security', subcategory: 'gbv', target: 'sgbv', note: 'Survivor-centred desk, restricted' },
  { id: 'r6', category: 'security', subcategory: 'tip', target: 'intel', note: 'Never dispatched directly' },
  { id: 'r7', category: 'fire', target: 'fire' },
  { id: 'r8', category: 'flooding', target: 'drain' },
  { id: 'r9', category: 'flooding', subcategory: 'drainage', lgaIds: ['ogn', 'ogs'], target: '@lga', note: 'Ogbomoso councils own minor drains' },
  { id: 'r10', category: 'waste', target: 'waste' },
  { id: 'r11', category: 'roads', target: '@lga', note: 'Local streets → LGA' },
  { id: 'r12', category: 'roads', subcategory: 'state_road', target: 'rma' },
  { id: 'r13', category: 'roads', subcategory: 'bridge', target: 'works' },
  { id: 'r14', category: 'infrastructure', target: 'works' },
  { id: 'r15', category: 'infrastructure', subcategory: 'electrical', target: 'power' },
  { id: 'r16', category: 'infrastructure', subcategory: 'streetlight', target: '@lga' },
];

const w = (ack: number, resolve: number, arrive?: number) => ({ ack, resolve, arrive });
const SLA: SlaTable = {
  security: { critical: w(3, 240, 20), high: w(10, 720, 45), normal: w(30, 2880, 240), low: w(60, 4320) },
  fire: { critical: w(2, 180, 15), high: w(5, 360, 25), normal: w(15, 720, 60), low: w(60, 1440) },
  flooding: { critical: w(15, 360, 60), high: w(30, 1440), normal: w(120, 2880), low: w(240, 4320) },
  roads: { critical: w(30, 1440), high: w(120, 4320), normal: w(480, 10080), low: w(1440, 20160) },
  waste: { critical: w(60, 720), high: w(120, 1440), normal: w(240, 2880), low: w(480, 4320) },
  infrastructure: { critical: w(15, 360, 60), high: w(60, 1440), normal: w(240, 4320), low: w(480, 10080) },
  other: { critical: w(10, 720), high: w(30, 1440), normal: w(60, 2880), low: w(120, 4320) },
};

// ---------- People (fictional) ----------

const FIRST = ['Adebayo', 'Folake', 'Tunde', 'Kemi', 'Segun', 'Bisi', 'Ibrahim', 'Ngozi', 'Femi', 'Yetunde', 'Musa', 'Funmi', 'Kunle', 'Aisha', 'Dayo', 'Ronke', 'Gbenga', 'Titi', 'Sola', 'Wale', 'Bukola', 'Lanre', 'Nike', 'Tope', 'Kayode', 'Shade', 'Rotimi', 'Bola', 'Chinedu', 'Ifeoma', 'Jide', 'Lola', 'Muyiwa', 'Omolara', 'Taiwo', 'Kehinde'];
const LAST = ['Adeyemi', 'Ogunleye', 'Afolabi', 'Oladipo', 'Salami', 'Ajayi', 'Oyelaran', 'Alabi', 'Bakare', 'Okafor', 'Bello', 'Ogundipe', 'Adewale', 'Olaniyan', 'Akinola', 'Fashola', 'Oyewole', 'Lawal', 'Adegoke', 'Ojo', 'Ayinde', 'Odukoya', 'Balogun', 'Ishola', 'Olatunji', 'Adebisi', 'Oke', 'Akande'];

let n = 0;
const nextName = () => {
  const k = n++;
  return `${FIRST[(k * 7) % FIRST.length]} ${LAST[(k * 11 + 3) % LAST.length]}`;
};
const phone = (k: number) => `0${[803, 806, 813, 816, 703, 706, 810, 905][k % 8]} ${String(100 + ((k * 37) % 900)).padStart(3, '0')} ${String(1000 + ((k * 7919) % 9000))}`;

const people: Person[] = [];
const add = (p: Omit<Person, 'id' | 'phone'> & { id?: string; phone?: string }) => {
  const person: Person = { ...p, id: p.id ?? `p${people.length + 1}`, phone: p.phone ?? phone(people.length + 11) };
  people.push(person);
  return person;
};

// Staff ID prefix by agency kind, e.g. OY-POL-214.
const STAFF_PREFIX: Record<string, string> = { control_room: '615', police: 'POL', corps: 'AMO', sensitive_desk: 'SGB', emergency: 'FIR', state: 'AGY', lga_council: 'LGC' };
const staffCounter: Record<string, number> = {};
const staffId = (agencyKind: string) => {
  const pre = STAFF_PREFIX[agencyKind] ?? 'STF';
  staffCounter[pre] = (staffCounter[pre] ?? 200) + 1;
  return `OY-${pre}-${String(staffCounter[pre]).padStart(3, '0')}`;
};

// Demo personas first (shown on the sign-in screen, in this order).
add({ id: 'cit1', name: 'Adewale Ogunleye', role: 'citizen', title: 'Resident, Bodija', phone: '0803 000 0001', demo: true, history: { reports: 6, confirmed: 5, false: 0 } });
add({ id: 'disp1', name: 'Yetunde Bakare', role: 'dispatcher', title: '615 control-room operator', agencyId: 'cr615', staffId: 'OY-615-001', demo: true });
add({ id: 'duty1', name: 'Olumide Akande', role: 'ops_manager', title: 'Control-room duty lead', agencyId: 'cr615', staffId: 'OY-615-002', demo: true });
add({ id: 'cmdr1', name: 'CSP Rasheed Lawal', role: 'supervisor', title: 'Divisional commander, Bodija', agencyId: 'pol-bdj', staffId: 'OY-POL-014', demo: true });
add({ id: 'crp1', name: 'Comdr. Idowu Adegoke', role: 'supervisor', title: 'Amotekun zone commander, Ibadan', agencyId: 'crp-ibd', staffId: 'OY-AMO-007', demo: true });
add({ id: 'pat1', name: 'Insp. Grace Olatunji', role: 'officer', title: 'Patrol lead, Bodija', agencyId: 'pol-bdj', staffId: 'OY-POL-102', demo: true });
add({ id: 'wst-head', name: 'Dr. Morenike Alabi', role: 'agency_head', title: 'Head, Waste Authority', agencyId: 'waste', staffId: 'OY-WST-001', demo: true });
add({ id: 'wst-off1', name: 'Tunde Afolabi', role: 'officer', title: 'Field officer, Zone 3', agencyId: 'waste', staffId: 'OY-WST-031', demo: true });
add({ id: 'sens1', name: 'Aisha Bello', role: 'sensitive', title: 'Restricted-cases officer', agencyId: 'sgbv', staffId: 'OY-SGB-003', demo: true });
add({ id: 'coord1', name: 'Col. (rtd) Babatunde Oke', role: 'agency_head', title: 'State security coordinator', agencyId: 'cr615', staffId: 'OY-SEC-001', demo: true });
add({ id: 'exec1', name: "Governor's Office", role: 'executive', title: 'Executive view (statewide)', staffId: 'OY-GOV-001', demo: true });
add({ id: 'chr1', name: 'Hon. Folasade Adebisi', role: 'chairman', title: 'Chairman, Ibadan North LGA', lgaId: 'ibn', staffId: 'OY-LGA-011', demo: true });
add({ id: 'adm1', name: 'Chidi Okafor', role: 'admin', title: 'Platform administrator', staffId: 'OY-ADM-001', demo: true });
add({ id: 'cmd1', name: 'Kayode Ishola', role: 'command', title: 'Central command lead', staffId: 'OY-CMD-001' });

// Everyone else, generated per agency.
for (const a of [...SECURITY_AGENCIES, ...CIVIC_AGENCIES]) {
  const sid = () => staffId(a.kind);
  const has = (role: Person['role']) => people.some((p) => p.agencyId === a.id && p.role === role);
  if (a.kind === 'control_room') {
    add({ name: nextName(), role: 'dispatcher', title: '615 control-room operator', agencyId: a.id, staffId: sid() });
    continue;
  }
  if (a.kind === 'sensitive_desk') {
    if (!people.some((p) => p.agencyId === a.id)) add({ name: nextName(), role: 'sensitive', title: 'Restricted-cases officer', agencyId: a.id, staffId: sid() });
    continue;
  }
  const unit = a.kind === 'police' || a.kind === 'corps';
  if (!has('supervisor')) add({ name: nextName(), role: 'supervisor', title: unit ? 'Unit commander' : 'Area supervisor', agencyId: a.id, staffId: sid() });
  if (a.kind === 'lga_council') {
    for (let k = 0; k < 3; k++) add({ name: nextName(), role: 'officer', title: 'Works & sanitation officer', agencyId: a.id, staffId: sid() });
    continue;
  }
  if (!unit && !has('ops_manager')) add({ name: nextName(), role: 'ops_manager', title: 'Operations manager', agencyId: a.id, staffId: sid() });
  if (!unit && !has('agency_head')) add({ name: nextName(), role: 'agency_head', title: 'Agency head', agencyId: a.id, staffId: sid() });
  const officers = a.id === 'waste' || a.id === 'drain' || a.id === 'fire' ? 4 : 3;
  const already = people.filter((p) => p.agencyId === a.id && p.role === 'officer').length;
  for (let k = already; k < officers; k++) add({ name: nextName(), role: 'officer', title: unit ? 'Patrol lead' : 'Field officer', agencyId: a.id, staffId: sid() });
}

// Other chairmen.
for (const l of LGAS) if (l.id !== 'ibn') add({ name: `Hon. ${nextName()}`, role: 'chairman', title: `Chairman, ${l.name} LGA`, lgaId: l.id, staffId: `OY-LGA-${String(100 + LGAS.indexOf(l)).padStart(3, '0')}` });

// Independent oversight panel (v2.3 §4.3).
add({ id: 'ovs1', name: 'Barr. Funmilayo Adeyemi', role: 'oversight', title: 'Member, Oyo Security Oversight Panel', staffId: 'OY-OVS-001', demo: true });

// Community focal persons (v2.3 §3.1). Fictional people.
add({ id: 'f-lasisi', name: 'Baba Lasisi Akanbi', role: 'focal', title: 'Ode (hunters) group leader, Igangan', phone: '0803 000 0201', lgaId: 'ibno', community: 'Igangan', ward: 'Igangan Ward 2', focalGroup: 'hunters', sponsor: 'Nominated by the Baale of Igangan', verified: true, staffStatus: 'active', pin: '1234', staffId: 'OY-CFP-001', demo: true, history: { reports: 10, confirmed: 9, false: 0 } });
add({ id: 'f-alake', name: 'Mrs. Alake Ojo', role: 'focal', title: 'Iyaloja, Bodija market', phone: '0803 000 0202', lgaId: 'ibn', community: 'Bodija', ward: 'Bodija Ward 1', focalGroup: 'market', sponsor: 'Nominated by the market association', verified: true, staffStatus: 'active', pin: '1234', staffId: 'OY-CFP-002', demo: true, history: { reports: 6, confirmed: 6, false: 0 } });
add({ id: 'f-rasaki', name: 'Mr. Rasaki Oyedeji', role: 'focal', title: "Farmers' association chair, Moniya", phone: '0803 000 0203', lgaId: 'aki', community: 'Moniya', ward: 'Moniya Ward 3', focalGroup: 'farmers', sponsor: 'Nominated by the Baale of Moniya', verified: true, staffStatus: 'active', pin: '1234', staffId: 'OY-CFP-003', history: { reports: 5, confirmed: 4, false: 0 } });
add({ id: 'f-usman', name: 'Alhaji Usman Bello', role: 'focal', title: "Herders' association representative, Iseyin", phone: '0803 000 0204', lgaId: 'ise', community: 'Iseyin', ward: 'Iseyin Ward 5', focalGroup: 'herders', sponsor: "Nominated by the herders' association", verified: true, staffStatus: 'active', pin: '1234', staffId: 'OY-CFP-004', history: { reports: 4, confirmed: 4, false: 0 } });
add({ id: 'f-tunji', name: 'Mr. Tunji Alade', role: 'focal', title: 'Youth leader, Takie', phone: '0803 000 0205', lgaId: 'ogn', community: 'Takie', ward: 'Takie Ward 1', focalGroup: 'youth', sponsor: 'Nominated by the community development association', staffStatus: 'invited', inviteCode: '735102', staffId: 'OY-CFP-005' });

/** Traditional rulers as contacts, not users. Fictional names only — never a real reigning ruler. */
export const LEADERS: CommunityLeader[] = [
  { id: 'tl-igangan', title: 'Baale of Igangan', name: 'Chief Adisa Olaniyan', phone: '0806 400 1101', lgaId: 'ibno', areas: ['Igangan'] },
  { id: 'tl-ayete', title: 'Baale of Ayete', name: 'Chief Moses Akinlade', phone: '0806 400 1102', lgaId: 'ibno', areas: ['Ayete', 'Tapa'] },
  { id: 'tl-moniya', title: 'Baale of Moniya', name: 'Chief Ganiyu Adepoju', phone: '0806 400 1103', lgaId: 'aki', areas: ['Moniya'] },
  { id: 'tl-ojoo', title: 'Baale of Ojoo', name: 'Chief Rafiu Ayoola', phone: '0806 400 1104', lgaId: 'aki', areas: ['Ojoo', 'Iroko'] },
  { id: 'tl-bodija', title: 'Community head, Bodija', name: 'Chief Kolawole Adigun', phone: '0806 400 1105', lgaId: 'ibn', areas: ['Bodija', 'Agbowo', 'Samonda', 'UI'] },
  { id: 'tl-iseyin', title: 'Community head, Iseyin', name: 'Chief Lamidi Oyebanji', phone: '0806 400 1106', lgaId: 'ise', areas: ['Iseyin', 'Ado-Awaye'] },
  { id: 'tl-saki', title: 'Community head, Okere quarter, Saki', name: 'Chief Sule Adeyanju', phone: '0806 400 1107', lgaId: 'skw', areas: ['Saki', 'Okere'] },
  { id: 'tl-akufo', title: 'Baale of Akufo', name: 'Chief Femi Agboola', phone: '0806 400 1108', lgaId: 'ido', areas: ['Akufo', 'Apete'] },
];

// Citizen pool for seeded reports.
for (let k = 0; k < 80; k++) {
  const reports = 1 + ((k * 13) % 9);
  const falseN = k % 17 === 0 ? 3 : k % 9 === 0 ? 1 : 0;
  add({ name: nextName(), role: 'citizen', title: 'Resident', history: { reports, confirmed: Math.max(0, reports - falseN - (k % 3)), false: falseN } });
}

// ---------- Organisations → Stations → Staff (PRD v2.2) ----------

const POLICE_RANKS = ['Constable', 'Corporal', 'Sergeant', 'Inspector', 'ASP', 'DSP', 'SP', 'CSP'];
const AMOTEKUN_RANKS = ['Corps Member', 'Squad Leader', 'Unit Commander'];
const CIVIL_RANKS = ['Officer', 'Senior Officer', 'Supervisor', 'Head'];

export const ORGANISATIONS: Organisation[] = [
  { id: 'org-npf', name: 'Nigeria Police Force – Oyo Command', short: 'Police', kind: 'police', ranks: POLICE_RANKS },
  { id: 'org-amo', name: 'Amotekun Corps – Oyo State', short: 'Amotekun', kind: 'amotekun', ranks: AMOTEKUN_RANKS },
  { id: 'org-fire', name: 'State Fire & Rescue Service', short: 'Fire Service', kind: 'fire', ranks: ['Fireman', 'Leading Fireman', 'Sub-Officer', 'Station Officer', 'Divisional Officer'] },
  { id: 'org-waste', name: 'State Waste Management Authority', short: 'Waste Authority', kind: 'agency', ranks: CIVIL_RANKS },
  { id: 'org-drain', name: 'Ministry of Environment — Drainage & Flood Unit', short: 'Drainage Unit', kind: 'agency', ranks: CIVIL_RANKS },
  { id: 'org-rma', name: 'State Road Maintenance Agency', short: 'Road Maintenance', kind: 'agency', ranks: CIVIL_RANKS },
  { id: 'org-works', name: 'Ministry of Works & Infrastructure', short: 'Works Ministry', kind: 'agency', ranks: CIVIL_RANKS },
  { id: 'org-power', name: 'Electricity Hazard Desk (DisCo liaison)', short: 'Power Hazard Desk', kind: 'agency', ranks: CIVIL_RANKS },
  { id: 'org-lga', name: 'Local Government Councils', short: 'LG councils', kind: 'lga', ranks: CIVIL_RANKS },
  { id: 'org-615', name: '615 Security & Emergency Control Room', short: '615 Control Room', kind: 'control_room', ranks: ['Operator', 'Duty Lead', 'Coordinator'] },
  { id: 'org-restricted', name: 'Restricted desks (SGBV & Intelligence)', short: 'Restricted desks', kind: 'sensitive', ranks: ['Officer', 'Senior Officer'] },
];

const ORG_OF: Record<string, string> = { police: 'org-npf', corps: 'org-amo', control_room: 'org-615', sensitive_desk: 'org-restricted', lga_council: 'org-lga', emergency: 'org-fire' };
const STATE_ORG: Record<string, string> = { waste: 'org-waste', drain: 'org-drain', rma: 'org-rma', works: 'org-works', power: 'org-power', fire: 'org-fire' };

// A station that is still being set up: commander named, nobody else yet (readiness 1/4).
const MONIYA: Agency = { id: 'pol-mny', name: 'Police Division — Moniya', short: 'Police Moniya', kind: 'police', lgaIds: ['aki'], status: 'setting_up', address: 'Oyo Road, Moniya', landmark: 'Moniya motor park', phone: '0803 555 0140' };
add({ id: 'mny-cmdr', name: 'SP Kehinde Oladele', role: 'supervisor', title: 'Divisional commander, Moniya', agencyId: 'pol-mny', staffId: 'OY-POL-160', rank: 'SP', serviceNumber: 'AP/104271' });

// Invited, not yet activated (demo step 13).
add({
  id: 'bayo',
  name: 'Cpl. Bayo Adeleke',
  role: 'officer',
  title: 'Patrol officer, Bodija',
  agencyId: 'pol-bdj',
  staffId: 'OY-POL-131',
  rank: 'Corporal',
  serviceNumber: 'AP/417733',
  phone: '0803 000 0099',
  staffStatus: 'invited',
  stationRole: 'field',
  invitedBy: 'cmdr1',
  inviteCode: '482913',
});

const AGENCIES = [...SECURITY_AGENCIES, ...CIVIC_AGENCIES, MONIYA];

const rankFor = (p: Person, kind: string | undefined) => {
  const prefix: [RegExp, string][] = [
    [/^Insp\./, 'Inspector'],
    [/^CSP /, 'CSP'],
    [/^SP /, 'SP'],
    [/^Cpl\./, 'Corporal'],
    [/^Comdr\./, 'Unit Commander'],
  ];
  for (const [re, r] of prefix) if (re.test(p.name)) return r;
  if (kind === 'police') return p.role === 'supervisor' ? 'SP' : 'Inspector';
  if (kind === 'corps') return p.role === 'supervisor' ? 'Unit Commander' : 'Squad Leader';
  return p.role === 'officer' ? 'Officer' : p.role === 'agency_head' ? 'Head' : 'Supervisor';
};

// Fill in the station and staff fields for everything seeded above.
/** Base point of an area: the same layout the store uses for incidents, without jitter. */
export function areaPoint(lgaId: string, area?: string) {
  const l = LGAS.find((x) => x.id === lgaId)!;
  const idx = Math.max(0, area ? l.areas.indexOf(area) : -1);
  if (!area || !l.areas.includes(area)) return { lat: l.lat, lng: l.lng };
  const spread = l.metro ? 0.035 : 0.09;
  const ang = (idx / Math.max(1, l.areas.length)) * Math.PI * 2;
  return { lat: l.lat + Math.sin(ang) * spread * 0.6, lng: l.lng + Math.cos(ang) * spread * 0.6 };
}

// Station buildings near a known area (v2.3 §2.2).
const STATION_AT: Record<string, [string, string]> = {
  'pol-bdj': ['ibn', 'Bodija'],
  'crp-ibd': ['ibn', 'Agodi'],
  'pol-iyg': ['ibsw', 'Oke-Ado'],
  'pol-iwo': ['ibne', 'Iwo Road'],
  'pol-map': ['ibse', 'Mapo'],
  'pol-ogb': ['ogn', 'Takie'],
  'pol-oyo': ['oye', 'Oyo town'],
  'pol-okg': ['ise', 'Iseyin'],
  'pol-ibp': ['ibc', 'Igbo-Ora'],
  'pol-mny': ['aki', 'Moniya'],
  'crp-ogb': ['ogs', 'Arowomole'],
  'crp-oyo': ['oyw', 'Isokun'],
  'crp-okg': ['skw', 'Saki'],
  'crp-ibp': ['ibno', 'Igangan'],
};

AGENCIES.forEach((a, k) => {
  const at = STATION_AT[a.id];
  const pt = at ? areaPoint(at[0], at[1]) : a.lgaIds.length ? areaPoint(a.lgaIds[0]) : { lat: 7.398 + (k % 5) * 0.003, lng: 3.906 + (k % 7) * 0.003 }; // statewide offices near the Secretariat, Agodi
  a.lat = a.lat ?? Math.round((pt.lat + (at ? 0.002 : 0.004)) * 1e5) / 1e5;
  a.lng = a.lng ?? Math.round((pt.lng - (at ? 0.002 : 0.003)) * 1e5) / 1e5;
  a.organisationId = STATE_ORG[a.id] ?? ORG_OF[a.kind] ?? 'org-works';
  a.status = a.status ?? 'live';
  a.testDone = a.status === 'live';
  const l = LGAS.find((x) => x.id === a.lgaIds[0]);
  a.address = a.address ?? (l ? `${l.areas[0]}, ${l.name}` : 'Secretariat, Agodi, Ibadan');
  a.phone = a.phone ?? phone(k + 300);
  a.commanderId = people.find((p) => p.agencyId === a.id && (p.role === 'supervisor' || p.role === 'agency_head' || p.role === 'ops_manager' || p.role === 'sensitive'))?.id;
});
people.forEach((p, k) => {
  if (p.role === 'citizen' || !p.agencyId) return;
  const a = AGENCIES.find((x) => x.id === p.agencyId);
  p.rank = p.rank ?? rankFor(p, a?.kind);
  p.serviceNumber = p.serviceNumber ?? (a?.kind === 'police' ? `AP/${300000 + k * 37}` : a?.kind === 'corps' ? `AMO/${2000 + k}` : `OY/${a?.kind === 'control_room' ? '615' : 'CS'}/${1000 + k}`);
  p.staffStatus = p.staffStatus ?? 'active';
  p.postings = p.staffStatus === 'invited' ? [] : [{ stationId: p.agencyId, from: 0 }];
});
// v2.4: a citizen whose standing is Restricted (2 confirmed hoaxes) — her appeal waits in oversight.
add({ id: 'cit-bose', name: 'Bose Akinwale', role: 'citizen', title: 'Resident, Agodi', phone: '0803 000 0111', demo: true, history: { reports: 4, confirmed: 1, false: 2 } });
// v2.8: patrol crews. Pilot stations get enough officers to crew 2–4 vehicles and keep some on foot.
// Added last, so every earlier seeded name stays the same.
export const PILOT_STATIONS = ['pol-bdj', 'pol-iyg', 'pol-iwo', 'pol-map', 'pol-ibp', 'pol-okg', 'crp-ibd', 'crp-ibp', 'crp-okg', 'fire'];
for (const id of PILOT_STATIONS) {
  const a = AGENCIES.find((x) => x.id === id)!;
  const want = a.kind === 'emergency' ? 6 : 7;
  const have = people.filter((p) => p.agencyId === id && p.role === 'officer' && (p.staffStatus ?? 'active') === 'active').length;
  for (let k = have; k < want; k++) {
    const p = add({ name: nextName(), role: 'officer', title: a.kind === 'emergency' ? 'Fire crew' : 'Patrol crew', agencyId: id, staffId: staffId(a.kind) });
    p.rank = a.kind === 'police' ? (k % 2 ? 'Sergeant' : 'Corporal') : a.kind === 'corps' ? 'Corps Member' : 'Officer';
    p.serviceNumber = a.kind === 'police' ? `AP/${310000 + people.length * 37}` : a.kind === 'corps' ? `AMO/${2600 + people.length}` : `OY/CS/${1600 + people.length}`;
    p.staffStatus = 'active';
    p.postings = [{ stationId: id, from: 0 }];
  }
}
// Seeded citizens and active focal persons have already accepted Rule Book v1.
for (const p of people) if ((p.role === 'citizen' || p.role === 'focal') && p.staffStatus !== 'invited') p.rulebookAcceptedVersion = 1;
const tunji = people.find((p) => p.id === 'f-tunji');
if (tunji) tunji.invitedBy = people.find((p) => p.role === 'chairman' && p.lgaId === 'ogn')?.id;

export const OYO: Deployment = {
  organisations: ORGANISATIONS,
  id: 'oyo',
  product: 'Tell Seyi',
  state: 'Oyo',
  prefix: 'OY',
  emergencyLine: '615',
  lgas: LGAS,
  agencies: AGENCIES,
  people,
  categories: CATEGORIES,
  matrix: MATRIX,
  sla: SLA,
  bounds: { minLat: 6.95, maxLat: 9.2, minLng: 2.95, maxLng: 4.65 },
  metroBounds: { minLat: 7.22, maxLat: 7.6, minLng: 3.68, maxLng: 4.1 },
};
