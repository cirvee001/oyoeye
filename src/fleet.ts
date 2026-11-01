import { HOUR, MIN, km } from './platform/engine';
import type { Agency, Checkpoint, Hospital, Incident, PatrolRoute, Person, Vehicle, VehicleKind, VehicleStatus } from './platform/types';
import { OYO, PILOT_STATIONS, areaPoint } from './deployments/oyo';

// Operational map data (PRD v2.8): patrol vehicles, checkpoints, patrol routes and hospitals.
// Pure — positions are simulated from the demo clock, so nothing is stored or audited per tick.

const dep = OYO;
const station = (id: string) => dep.agencies.find((a) => a.id === id);
const stationPt = (id: string) => {
  const a = station(id);
  return a?.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : areaPoint(a?.lgaIds[0] ?? 'ibn');
};
const pt = (lgaId: string, area?: string, dLat = 0, dLng = 0): [number, number] => {
  const p = areaPoint(lgaId, area);
  return [Math.round((p.lat + dLat) * 1e5) / 1e5, Math.round((p.lng + dLng) * 1e5) / 1e5];
};

// ---------- reference data ----------

export const VEHICLE_KIND_LABEL: Record<VehicleKind, string> = { patrol_car: 'Patrol car', motorcycle: 'Motorcycle', armoured: 'Armoured (APC)', fire_truck: 'Fire truck', ambulance: 'Ambulance', utility: 'Utility van' };
export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = { available: 'Available', patrolling: 'Patrolling', responding: 'Responding', onscene: 'On scene', out_of_service: 'Out of service' };
export const VEHICLE_STATUS_COLOR: Record<VehicleStatus, string> = { available: '#15803D', patrolling: '#1D4ED8', responding: '#D97706', onscene: '#7E22CE', out_of_service: '#98A2B3' };
export const VEHICLE_STATUSES: VehicleStatus[] = ['available', 'patrolling', 'responding', 'onscene', 'out_of_service'];

/** Patrol routes / beats: approximate, along main roads (labelled "Approximate route" on the map). */
export const ROUTES: PatrolRoute[] = [
  { id: 'r-bdj-1', stationId: 'pol-bdj', name: 'Bodija – Sango – UI loop', points: [pt('ibn', 'Bodija'), pt('ibn', 'Sango'), pt('ibn', 'Samonda'), pt('ibn', 'UI'), pt('ibn', 'Agbowo'), pt('ibn', 'Bodija', 0.004)] },
  { id: 'r-bdj-2', stationId: 'pol-bdj', name: 'Ojoo – Moniya highway', points: [pt('ibn', 'Agbowo'), pt('aki', 'Ojoo'), pt('aki', 'Iroko'), pt('aki', 'Moniya'), pt('aki', 'Ijaye')] },
  { id: 'r-iyg-1', stationId: 'pol-iyg', name: 'Iyaganku – Ring Road – Molete', points: [pt('ibsw', 'Oke-Ado'), pt('ibsw', 'Ring Road'), pt('ibsw', 'Molete'), pt('ibsw', 'Oluyole Estate'), pt('ibsw', 'Apata')] },
  { id: 'r-iyg-2', stationId: 'pol-iyg', name: 'Dugbe – Eleyele – Apete', points: [pt('ibnw', 'Dugbe'), pt('ibnw', 'Onireke'), pt('ibnw', 'Eleyele'), pt('ido', 'Apete'), pt('ido', 'Omi-Adio')] },
  { id: 'r-iwo-1', stationId: 'pol-iwo', name: 'Iwo Road – Olodo – Lalupon', points: [pt('ibne', 'Iwo Road'), pt('ibne', 'Idi-Ape'), pt('egb', 'Olodo'), pt('egb', 'Egbeda'), pt('lag', 'Iyana Offa'), pt('lag', 'Lalupon')] },
  { id: 'r-map-1', stationId: 'pol-map', name: 'Mapo – Oja Oba – Challenge', points: [pt('ibse', 'Mapo'), pt('ibse', 'Oja Oba'), pt('ibse', 'Felele'), pt('ibse', 'Challenge'), pt('olu', 'Odo-Ona')] },
  { id: 'r-ibp-1', stationId: 'pol-ibp', name: 'Igbo-Ora – Idere – Eruwa', points: [pt('ibc', 'Igbo-Ora'), pt('ibc', 'Idere'), pt('ibe', 'Lanlate'), pt('ibe', 'Eruwa')] },
  { id: 'r-ibp-2', stationId: 'pol-ibp', name: 'Igangan – Tapa road', points: [pt('ibno', 'Igangan'), pt('ibno', 'Tapa'), pt('ibno', 'Ayete')] },
  { id: 'r-okg-1', stationId: 'pol-okg', name: 'Iseyin – Okeho road', points: [pt('ise', 'Iseyin'), pt('ise', 'Ado-Awaye'), pt('kaj', 'Ilero'), pt('kaj', 'Okeho')] },
  { id: 'r-okg-2', stationId: 'pol-okg', name: 'Iseyin – Otu – Komu', points: [pt('ise', 'Iseyin'), pt('ite', 'Otu'), pt('ite', 'Komu')] },
  { id: 'r-amo-ib-1', stationId: 'crp-ibd', name: 'Agodi – Iwo Road – Gbagi', points: [pt('ibn', 'Agodi'), pt('ibne', 'Iwo Road'), pt('ibne', 'Gbagi'), pt('ibne', 'Oje'), pt('ibn', 'Mokola')] },
  { id: 'r-amo-ib-2', stationId: 'crp-ibd', name: 'Ibadan–Oyo road (Ojoo – Fiditi)', points: [pt('aki', 'Ojoo'), pt('aki', 'Moniya'), pt('afi', 'Fiditi'), pt('afi', 'Jobele')] },
  { id: 'r-amo-ibp-1', stationId: 'crp-ibp', name: 'Igangan – Ayete farm settlements', points: [pt('ibno', 'Igangan'), pt('ibno', 'Ayete', 0.01), pt('ibno', 'Tapa', -0.01), pt('ibno', 'Igangan', 0.01, 0.01)] },
  { id: 'r-amo-ok-1', stationId: 'crp-okg', name: 'Saki – Okere – Ago-Are', points: [pt('skw', 'Saki'), pt('skw', 'Okere'), pt('ats', 'Ago-Are'), pt('ats', 'Tede')] },
];

/** About 8 hospitals: generic names by area only (reference points). */
export const HOSPITALS: Hospital[] = [
  ['h-uch', 'Teaching hospital, Ibadan', 'ibn', 'UI'],
  ['h-adeoyo', 'State hospital, Ibadan (Ring Road)', 'ibsw', 'Ring Road'],
  ['h-jericho', 'Specialist hospital, Ibadan North-West', 'ibnw', 'Onireke'],
  ['h-oyo', 'State hospital, Oyo', 'oye', 'Oyo town'],
  ['h-saki', 'State hospital, Saki', 'skw', 'Saki'],
  ['h-iseyin', 'General hospital, Iseyin', 'ise', 'Iseyin'],
  ['h-igboora', 'General hospital, Igbo-Ora', 'ibc', 'Igbo-Ora'],
  ['h-ogb', 'Teaching hospital, Ogbomoso', 'ogn', 'Sabo'],
].map(([id, name, lgaId, area]) => {
  const [lat, lng] = pt(lgaId, area, -0.004, 0.003);
  return { id, name, lgaId, lat, lng };
});

// ---------- seed ----------

const VEHICLE_SEED: [string, string, VehicleKind, VehicleStatus, string?, string?][] = [
  // callSign, station, kind, status, reason, route
  ['BDJ-P1', 'pol-bdj', 'patrol_car', 'patrolling', undefined, 'r-bdj-1'],
  ['BDJ-P2', 'pol-bdj', 'patrol_car', 'available'],
  ['BDJ-M1', 'pol-bdj', 'motorcycle', 'patrolling', undefined, 'r-bdj-2'],
  ['IYG-P1', 'pol-iyg', 'patrol_car', 'patrolling', undefined, 'r-iyg-1'],
  ['IYG-A1', 'pol-iyg', 'armoured', 'available'],
  ['IYG-M1', 'pol-iyg', 'motorcycle', 'patrolling', undefined, 'r-iyg-2'],
  ['IWO-P1', 'pol-iwo', 'patrol_car', 'patrolling', undefined, 'r-iwo-1'],
  ['IWO-P2', 'pol-iwo', 'patrol_car', 'available'],
  ['IWO-M1', 'pol-iwo', 'motorcycle', 'available'],
  ['MAP-P1', 'pol-map', 'patrol_car', 'patrolling', undefined, 'r-map-1'],
  ['MAP-P2', 'pol-map', 'patrol_car', 'out_of_service', 'No crew'],
  ['MAP-M1', 'pol-map', 'motorcycle', 'available'],
  ['IBP-P1', 'pol-ibp', 'patrol_car', 'out_of_service', 'No fuel'],
  ['IBP-P2', 'pol-ibp', 'patrol_car', 'out_of_service', 'Under repair'],
  ['IBP-M1', 'pol-ibp', 'motorcycle', 'patrolling', undefined, 'r-ibp-2'],
  ['OKG-P1', 'pol-okg', 'patrol_car', 'patrolling', undefined, 'r-okg-1'],
  ['OKG-P2', 'pol-okg', 'patrol_car', 'out_of_service', 'No fuel'],
  ['OKG-M1', 'pol-okg', 'motorcycle', 'available'],
  ['AMO-IB-1', 'crp-ibd', 'patrol_car', 'patrolling', undefined, 'r-amo-ib-1'],
  ['AMO-IB-2', 'crp-ibd', 'patrol_car', 'available', undefined, 'r-amo-ib-2'],
  ['AMO-IB-M1', 'crp-ibd', 'motorcycle', 'available'],
  ['AMO-IBP-1', 'crp-ibp', 'patrol_car', 'patrolling', undefined, 'r-amo-ibp-1'],
  ['AMO-IBP-M1', 'crp-ibp', 'motorcycle', 'available'],
  ['AMO-OK-1', 'crp-okg', 'patrol_car', 'patrolling', undefined, 'r-amo-ok-1'],
  ['AMO-OK-2', 'crp-okg', 'patrol_car', 'out_of_service', 'Under repair'],
  ['AMO-OK-M1', 'crp-okg', 'motorcycle', 'available'],
  ['FIRE-IB-1', 'fire', 'fire_truck', 'available'],
  ['FIRE-IB-2', 'fire', 'fire_truck', 'available'],
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** About 28 vehicles at the pilot stations, crews of 2–3 from each station (Grace crews BDJ-P1). */
export function seedVehicles(people: Person[]): Vehicle[] {
  const used = new Set<string>();
  const out: Vehicle[] = [];
  for (const [callSign, stationId, kind, status, reason, routeId] of VEHICLE_SEED) {
    const officers = people.filter((p) => p.agencyId === stationId && p.role === 'officer' && (p.staffStatus ?? 'active') === 'active' && !used.has(p.id));
    // Grace leads BDJ-P1; AMO-IB-2 starts with one crew member (the step-16 transfer adds Grace).
    const lead = callSign === 'BDJ-P1' ? people.find((p) => p.id === 'pat1') : undefined;
    const first = !out.some((v) => v.stationId === stationId);
    const size = callSign === 'AMO-IB-2' ? 1 : status === 'out_of_service' && reason === 'No crew' ? 0 : first || kind === 'fire_truck' ? 3 : 2;
    const crew = [...(lead ? [lead] : []), ...officers.filter((p) => p.id !== lead?.id)].slice(0, size).map((p) => p.id);
    crew.forEach((id) => used.add(id));
    out.push({ id: `v-${callSign.toLowerCase()}`, callSign, stationId, kind, plate: `OY ${100 + out.length * 7} ${['KSB', 'IBD', 'AKN', 'OYO'][out.length % 4]}`, crewIds: crew, status, statusReason: reason as Vehicle['statusReason'], routeId, phase: (hash(callSign) % 1000) / 1000, history: [] });
  }
  return out;
}

/** About 10 permanent and joint checkpoints on main roads, plus 2 temporary ones active now. */
export function seedCheckpoints(start: number, people: Person[]): Checkpoint[] {
  const staffOf = (stationId: string, n: number, skip = 0) =>
    people
      .filter((p) => p.agencyId === stationId && p.role === 'officer')
      .slice(skip, skip + n)
      .map((p) => p.id);
  const cp = (id: string, name: string, stationId: string, kind: Checkpoint['kind'], at: [number, number], road: string, from: number, to?: number, staff: string[] = []): Checkpoint => ({ id, name, stationId, kind, lat: at[0], lng: at[1], road, activeFrom: from, activeTo: to, staffIds: staff, createdBy: 'Seeded', status: from > start ? 'scheduled' : 'active' });
  const longAgo = start - 120 * 24 * HOUR;
  return [
    cp('cp-ojoo', 'Ojoo–Moniya road', 'pol-bdj', 'permanent', pt('aki', 'Ojoo', 0.006), 'Ibadan–Oyo road', longAgo, undefined, staffOf('pol-bdj', 2, 5)),
    cp('cp-iwo', 'Iwo Road interchange', 'pol-iwo', 'joint', pt('ibne', 'Iwo Road', 0.003, 0.004), 'Lagos–Ibadan expressway', longAgo, undefined, staffOf('pol-iwo', 2, 4)),
    cp('cp-fiditi', 'Ibadan–Oyo road, Fiditi', 'crp-ibd', 'joint', pt('afi', 'Fiditi', -0.01), 'Ibadan–Oyo road', longAgo, undefined, staffOf('crp-ibd', 2, 4)),
    cp('cp-igangan', 'Igangan junction', 'crp-ibp', 'joint', pt('ibno', 'Igangan', 0.006, 0.006), 'Igangan–Tapa road', longAgo, undefined, staffOf('crp-ibp', 2, 3)),
    cp('cp-saki', 'Saki entry', 'crp-okg', 'permanent', pt('skw', 'Saki', -0.012), 'Saki–Iseyin road', longAgo, undefined, staffOf('crp-okg', 2, 4)),
    cp('cp-okeho', 'Iseyin–Okeho road', 'pol-okg', 'permanent', pt('kaj', 'Okeho', -0.01), 'Iseyin–Okeho road', longAgo, undefined, staffOf('pol-okg', 2, 5)),
    cp('cp-eruwa', 'Eruwa–Lanlate road', 'pol-ibp', 'permanent', pt('ibe', 'Eruwa', 0.008), 'Eruwa–Lanlate road', longAgo, undefined, staffOf('pol-ibp', 1, 5)),
    cp('cp-apata', 'Apata–Abeokuta road', 'pol-iyg', 'permanent', pt('ibsw', 'Apata', -0.004, -0.006), 'Ibadan–Abeokuta road', longAgo, undefined, staffOf('pol-iyg', 2, 5)),
    cp('cp-challenge', 'Challenge–Felele road', 'pol-map', 'joint', pt('ibse', 'Challenge', -0.003), 'Ring Road', longAgo, undefined, staffOf('pol-map', 2, 4)),
    cp('cp-tapa-hunters', 'Tapa hunters’ post', 'crp-ibp', 'community', pt('ibno', 'Tapa', 0.004), 'Igangan–Tapa road', longAgo, undefined, []),
    cp('cp-tmp-sango', 'Stop-and-search, Sango', 'pol-bdj', 'temporary', pt('ibn', 'Sango', 0.002, 0.002), 'Sango–Eleyele road', start - 90 * MIN, start + 150 * MIN, staffOf('pol-bdj', 2, 3)),
    cp('cp-tmp-olodo', 'Stop-and-search, Olodo', 'pol-iwo', 'temporary', pt('egb', 'Olodo', 0.003), 'Ibadan–Ife road', start - 40 * MIN, start + 200 * MIN, staffOf('pol-iwo', 2, 6)),
  ];
}

// ---------- simulated movement ----------

export const metroStation = (stationId: string) => !!dep.lgas.find((l) => l.id === station(stationId)?.lgaIds[0])?.metro || stationId === 'fire';
export const patrolSpeed = (v: Vehicle) => (metroStation(v.stationId) ? 30 : 45);
export const respondSpeed = (v: Vehicle) => (metroStation(v.stationId) ? 40 : 60);

export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return Math.round(((Math.atan2(y, x) / r + 360) % 360) * 10) / 10;
}

/** Position along a closed loop of waypoints, `dist` km from the start. */
function alongLoop(points: [number, number][], dist: number) {
  const loop = [...points, points[0]];
  const segs = loop.slice(1).map((p, k) => km(loop[k][0], loop[k][1], p[0], p[1]));
  const total = segs.reduce((a, b) => a + b, 0) || 1;
  let d = ((dist % total) + total) % total;
  for (let k = 0; k < segs.length; k++) {
    if (d <= segs[k] || k === segs.length - 1) {
      const f = segs[k] ? Math.min(1, d / segs[k]) : 0;
      const a = loop[k];
      const b = loop[k + 1];
      return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, heading: bearing({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) };
    }
    d -= segs[k];
  }
  return { lat: points[0][0], lng: points[0][1], heading: 0 };
}
export const routeLength = (r: PatrolRoute) => {
  const loop = [...r.points, r.points[0]];
  return loop.slice(1).reduce((n, p, k) => n + km(loop[k][0], loop[k][1], p[0], p[1]), 0);
};

export interface VehiclePos {
  lat: number;
  lng: number;
  heading: number;
  /** minutes to the case while responding */
  etaMin?: number;
  arrived?: boolean;
}

/** Where a vehicle is at a moment of the demo clock. */
export function vehiclePosition(v: Vehicle, at: number, cases: Incident[], routes: PatrolRoute[] = ROUTES): VehiclePos {
  const home = stationPt(v.stationId);
  const parked = { lat: home.lat + ((hash(v.id) % 7) - 3) * 0.0004, lng: home.lng + ((hash(v.id + 'x') % 7) - 3) * 0.0004, heading: 0 };
  const c = v.caseId ? cases.find((i) => i.id === v.caseId) : undefined;
  if (v.status === 'onscene' && c) return { lat: c.lat, lng: c.lng, heading: 0, arrived: true };
  if (v.status === 'responding' && c) {
    const from = v.respondFrom ?? { lat: parked.lat, lng: parked.lng, at };
    const d = km(from.lat, from.lng, c.lat, c.lng);
    const done = (respondSpeed(v) * Math.max(0, at - from.at)) / HOUR;
    const f = d ? Math.min(1, done / d) : 1;
    return { lat: from.lat + (c.lat - from.lat) * f, lng: from.lng + (c.lng - from.lng) * f, heading: bearing(from, c), etaMin: Math.max(0, Math.ceil(((d - Math.min(d, done)) / respondSpeed(v)) * 60)), arrived: f >= 1 };
  }
  const r = v.routeId ? routes.find((x) => x.id === v.routeId) : undefined;
  if (v.status === 'patrolling' && r && r.points.length > 1) {
    const L = routeLength(r);
    return alongLoop(r.points, (patrolSpeed(v) * at) / HOUR + v.phase * L);
  }
  return parked;
}

/** Breadcrumb: positions over the last 15 minutes, every 30 s (shown when the vehicle is selected). */
export function breadcrumb(v: Vehicle, at: number, cases: Incident[], routes: PatrolRoute[] = ROUTES) {
  const out: { lat: number; lng: number; at: number }[] = [];
  if (v.status !== 'patrolling' && v.status !== 'responding') return out;
  // A responding vehicle's trail starts where the response started.
  const from = v.status === 'responding' && v.respondFrom ? Math.max(at - 15 * MIN, v.respondFrom.at) : at - 15 * MIN;
  if (v.status === 'responding' && v.respondFrom && v.respondFrom.at >= at - 15 * MIN) out.push({ lat: v.respondFrom.lat, lng: v.respondFrom.lng, at: v.respondFrom.at });
  for (let t = from; t < at; t += MIN / 2) {
    const p = vehiclePosition(v, t, cases, routes);
    out.push({ lat: p.lat, lng: p.lng, at: t });
  }
  const now = vehiclePosition(v, at, cases, routes);
  out.push({ lat: now.lat, lng: now.lng, at });
  return out;
}

/** Vehicles that can be sent: crewed and not busy or out of service. */
export const canDispatch = (v: Vehicle) => (v.status === 'available' || v.status === 'patrolling') && v.crewIds.length > 0;

export interface NearVehicle {
  v: Vehicle;
  km: number;
  etaMin: number;
}
/**
 * Nearest available vehicles to a point (straight line). Out-of-service vehicles are never suggested;
 * `outNearer` counts those that would have been nearer — the funding gap.
 */
export function nearestVehicles(vehicles: Vehicle[], lat: number, lng: number, at: number, cases: Incident[], n = 3, isLive: (stationId: string) => boolean = () => true) {
  const withDist = vehicles
    .filter((v) => isLive(v.stationId) && !['fire_truck', 'ambulance', 'utility'].includes(v.kind))
    .map((v) => {
      const p = vehiclePosition(v, at, cases);
      const d = km(p.lat, p.lng, lat, lng);
      return { v, km: Math.round(d * 10) / 10, etaMin: Math.max(1, Math.round((d / respondSpeed(v)) * 60)) };
    })
    .sort((a, b) => a.km - b.km);
  const top = withDist.filter((x) => canDispatch(x.v)).slice(0, n);
  const limit = top.length ? top[top.length - 1].km : Infinity;
  const outNearer = withDist.filter((x) => x.v.status === 'out_of_service' && x.km <= limit).length;
  return { top, outNearer };
}

export const isPilot = (stationId: string) => PILOT_STATIONS.includes(stationId);
export const stationOf = (id: string): Agency | undefined => station(id);
