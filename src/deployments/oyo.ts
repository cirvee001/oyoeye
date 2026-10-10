import type { Agency, Category, Deployment, LGA, Person, RoutingRule, SlaTable } from '../platform/types';

// Oyo State deployment. Every name of a person here is fictional.
// Agency names are generic descriptions, set by the state at onboarding.

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
  // State security corps zones.
  { id: 'crp-ibd', name: 'State Security Corps — Ibadan Zone', short: 'Corps Ibadan', kind: 'corps', lgaIds: IBADAN },
  { id: 'crp-ogb', name: 'State Security Corps — Ogbomoso Zone', short: 'Corps Ogbomoso', kind: 'corps', lgaIds: ['ogn', 'ogs', 'sur', 'ogo', 'ori'] },
  { id: 'crp-oyo', name: 'State Security Corps — Oyo Zone', short: 'Corps Oyo', kind: 'corps', lgaIds: ['oye', 'oyw', 'afi', 'ati'] },
  { id: 'crp-okg', name: 'State Security Corps — Oke-Ogun Zone', short: 'Corps Oke-Ogun', kind: 'corps', lgaIds: ['ise', 'ite', 'iwa', 'kaj', 'ats', 'skw', 'ske', 'oor', 'olo', 'ire'] },
  { id: 'crp-ibp', name: 'State Security Corps — Ibarapa Zone', short: 'Corps Ibarapa', kind: 'corps', lgaIds: ['ibc', 'ibe', 'ibno'] },
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
      { id: 'armed', label: 'Armed persons / shooting' },
      { id: 'kidnapping', label: 'Kidnapping / abduction', forceConfidential: true },
      { id: 'robbery', label: 'Robbery / break-in' },
      { id: 'violence', label: 'Violence, cult or communal clash' },
      { id: 'suspicious', label: 'Suspicious activity' },
      { id: 'threat', label: 'Threat / intimidation / extortion' },
      { id: 'gbv', label: 'Domestic or sexual violence', forceConfidential: true, sensitiveOnly: true },
      { id: 'tip', label: 'Confidential information (non-urgent)', forceConfidential: true, sensitiveOnly: true },
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
const add = (p: Omit<Person, 'id' | 'phone'> & { id?: string }) => {
  const person: Person = { ...p, id: p.id ?? `p${people.length + 1}`, phone: phone(people.length + 11) };
  people.push(person);
  return person;
};

// Demo personas first (shown in the persona switcher).
add({ id: 'cit1', name: 'Adewale Ogunleye', role: 'citizen', title: 'Resident, Bodija', demo: true, history: { reports: 6, confirmed: 5, false: 0 } });
add({ id: 'disp1', name: 'Yetunde Bakare', role: 'dispatcher', title: '615 control-room operator', agencyId: 'cr615', demo: true });
add({ id: 'duty1', name: 'Olumide Akande', role: 'ops_manager', title: 'Control-room duty lead', agencyId: 'cr615', demo: true });
add({ id: 'coord1', name: 'Col. (rtd) Babatunde Oke', role: 'agency_head', title: 'State security coordinator', agencyId: 'cr615', demo: true });
add({ id: 'cmdr1', name: 'CSP Rasheed Lawal', role: 'supervisor', title: 'Divisional commander, Bodija', agencyId: 'pol-bdj', demo: true });
add({ id: 'pat1', name: 'Insp. Grace Olatunji', role: 'officer', title: 'Patrol lead, Bodija', agencyId: 'pol-bdj', demo: true });
add({ id: 'crp1', name: 'Comdr. Idowu Adegoke', role: 'supervisor', title: 'Corps zone commander, Ibadan', agencyId: 'crp-ibd', demo: true });
add({ id: 'sens1', name: 'Aisha Bello', role: 'sensitive', title: 'Restricted-cases officer', agencyId: 'sgbv', demo: true });
add({ id: 'exec1', name: "Governor's Office", role: 'executive', title: 'Executive view (statewide)', demo: true });
add({ id: 'cmd1', name: 'Kayode Ishola', role: 'command', title: 'Central command lead', demo: true });
add({ id: 'chr1', name: 'Hon. Folasade Adebisi', role: 'chairman', title: 'Chairman, Ibadan North LGA', lgaId: 'ibn', demo: true });
add({ id: 'wst-head', name: 'Dr. Morenike Alabi', role: 'agency_head', title: 'Head, Waste Authority', agencyId: 'waste', demo: true });
add({ id: 'wst-off1', name: 'Tunde Afolabi', role: 'officer', title: 'Field officer, Zone 3', agencyId: 'waste', demo: true });
add({ id: 'adm1', name: 'Chidi Okafor', role: 'admin', title: 'Platform administrator', demo: true });

// Everyone else, generated per agency.
for (const a of [...SECURITY_AGENCIES, ...CIVIC_AGENCIES]) {
  const has = (role: Person['role']) => people.some((p) => p.agencyId === a.id && p.role === role);
  if (a.kind === 'control_room') {
    add({ name: nextName(), role: 'dispatcher', title: '615 control-room operator', agencyId: a.id });
    continue;
  }
  if (a.kind === 'sensitive_desk') {
    if (!people.some((p) => p.agencyId === a.id)) add({ name: nextName(), role: 'sensitive', title: 'Restricted-cases officer', agencyId: a.id });
    continue;
  }
  const unit = a.kind === 'police' || a.kind === 'corps';
  if (!has('supervisor')) add({ name: nextName(), role: 'supervisor', title: unit ? 'Unit commander' : 'Area supervisor', agencyId: a.id });
  if (a.kind === 'lga_council') {
    add({ name: nextName(), role: 'officer', title: 'Works & sanitation officer', agencyId: a.id });
    continue;
  }
  if (!unit && !has('ops_manager')) add({ name: nextName(), role: 'ops_manager', title: 'Operations manager', agencyId: a.id });
  if (!unit && !has('agency_head')) add({ name: nextName(), role: 'agency_head', title: 'Agency head', agencyId: a.id });
  const officers = a.id === 'waste' || a.id === 'drain' || a.id === 'fire' ? 4 : unit ? 3 : 2;
  const already = people.filter((p) => p.agencyId === a.id && p.role === 'officer').length;
  for (let k = already; k < officers; k++) add({ name: nextName(), role: 'officer', title: unit ? 'Patrol lead' : 'Field officer', agencyId: a.id });
}

// Other chairmen.
for (const l of LGAS) if (l.id !== 'ibn') add({ name: `Hon. ${nextName()}`, role: 'chairman', title: `Chairman, ${l.name} LGA`, lgaId: l.id });

// Citizen pool for seeded reports.
for (let k = 0; k < 80; k++) {
  const reports = 1 + ((k * 13) % 9);
  const falseN = k % 17 === 0 ? 3 : k % 9 === 0 ? 1 : 0;
  add({ name: nextName(), role: 'citizen', title: 'Resident', history: { reports, confirmed: Math.max(0, reports - falseN - (k % 3)), false: falseN } });
}

export const OYO: Deployment = {
  id: 'oyo',
  product: 'OyoEye',
  state: 'Oyo',
  prefix: 'OY',
  emergencyLine: '615',
  lgas: LGAS,
  agencies: [...SECURITY_AGENCIES, ...CIVIC_AGENCIES],
  people,
  categories: CATEGORIES,
  matrix: MATRIX,
  sla: SLA,
  bounds: { minLat: 6.95, maxLat: 9.2, minLng: 2.95, maxLng: 4.65 },
  metroBounds: { minLat: 7.22, maxLat: 7.6, minLng: 3.68, maxLng: 4.1 },
};
