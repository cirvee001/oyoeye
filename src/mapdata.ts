import { DAY, HOUR, isOpen, isOverdue, km } from './platform/engine';
import { handoffClock } from './countdown';
import type { Checkpoint, Hospital, Incident, PatrolRoute, Person, Vehicle, VehicleStatus } from './platform/types';
import { HOSPITALS, ROUTES, VEHICLE_STATUSES, VEHICLE_STATUS_COLOR, VEHICLE_STATUS_LABEL, breadcrumb, vehiclePosition } from './fleet';
import { SIDE_STATUSES, STATUS_COLOR, STATUS_ORDER, STATUS_TONE, statusLabel } from './i18n';
import { areaPoint } from './deployments/oyo';
import { roleKind } from './roles';
import { agency, checkpointStatus, controlRoom, dep, getState, holderLabel, isManagerOf, lgaOf, now, officerPosition, onDuty, person, readiness, stationPoint, subLabel, type State } from './store';

// Pure map data, so the privacy rules can be checked without Leaflet or tiles (PRD v2.3 §2, §9).

export type Layer = 'incidents' | 'hotspots' | 'sos' | 'stations' | 'vehicles' | 'units' | 'checkpoints' | 'routes' | 'coverage' | 'hospitals' | 'lganames';
export type BaseMap = 'osm' | 'dark' | 'light';
export type TimeWin = '24h' | '7d' | '30d';
export const TIME_MS: Record<TimeWin, number> = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };
export const LAYERS: { id: Layer; label: string; group: 'Incidents' | 'Resources' | 'Places' }[] = [
  { id: 'incidents', label: 'Cases', group: 'Incidents' },
  { id: 'hotspots', label: 'Hotspots', group: 'Incidents' },
  { id: 'sos', label: 'SOS only', group: 'Incidents' },
  { id: 'stations', label: 'Stations', group: 'Resources' },
  { id: 'vehicles', label: 'Patrol vehicles', group: 'Resources' },
  { id: 'units', label: 'Officers on foot', group: 'Resources' },
  { id: 'checkpoints', label: 'Checkpoints', group: 'Resources' },
  { id: 'routes', label: 'Patrol routes', group: 'Resources' },
  { id: 'coverage', label: 'Station coverage', group: 'Resources' },
  { id: 'hospitals', label: 'Hospitals', group: 'Places' },
  { id: 'lganames', label: 'LGA names', group: 'Places' },
];
// All three bases use keyless OpenStreetMap tiles; Dark and Light are CSS filters on the tile layer
// (CARTO basemaps now need an API key and served "API KEY REQUIRED" tiles).
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/** `flavor` is the Protomaps style used when the bundled Oyo map file is present (see LOCAL_MAP). */
export const BASES: { id: BaseMap; label: string; url: string; attribution: string; flavor: string }[] = [
  { id: 'osm', label: 'Standard', url: OSM_TILES, attribution: '© OpenStreetMap contributors', flavor: 'light' },
  { id: 'dark', label: 'Dark', url: OSM_TILES, attribution: '© OpenStreetMap contributors', flavor: 'dark' },
  { id: 'light', label: 'Light', url: OSM_TILES, attribution: '© OpenStreetMap contributors', flavor: 'grayscale' },
];

/**
 * The bundled Oyo map: a Protomaps (OpenStreetMap data) extract served from the app itself, so the
 * map works without internet. Built with `npm run map:oyo` (see README). If the file is missing,
 * the map falls back to online OSM tiles.
 */
export const LOCAL_MAP = {
  url: 'tiles/oyo.pmtiles',
  attribution: '© OpenStreetMap contributors · Protomaps',
  /** Data goes up to this zoom; closer zooms enlarge it. */
  maxDataZoom: 13,
  /** Oyo State plus a margin: what the extract covers [[south, west], [north, east]]. */
  bounds: [
    [6.6, 2.6],
    [9.6, 5.0],
  ] as [[number, number], [number, number]],
};

let localMapCheck: Promise<boolean> | undefined;
/**
 * Is the bundled Oyo map file served? Reads its first 7 bytes and checks the "PMTiles" signature,
 * so a dev-server fallback page is never mistaken for the map. Checked once per page load.
 */
export function localMapAvailable(): Promise<boolean> {
  localMapCheck ??= (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}${LOCAL_MAP.url}`, { headers: { Range: 'bytes=0-6' } });
      if (!res.ok) return false;
      return new TextDecoder().decode((await res.arrayBuffer()).slice(0, 7)) === 'PMTiles';
    } catch {
      return false;
    }
  })();
  return localMapCheck;
}

/** Never plotted at their exact point for anyone except the restricted desk. */
export const SENSITIVE_SUBS = ['gbv', 'tip', 'kidnapping'];
export const isSensitivePoint = (i: Incident) => i.sensitiveOnly || SENSITIVE_SUBS.includes(i.subcategory ?? '');

const isControlRoomStaff = (p: Person) => p.agencyId === controlRoom().id && ['dispatcher', 'ops_manager', 'agency_head'].includes(p.role);

/** Unit positions: control room and coordinator see all; commanders see their own unit's officers. */
export function unitScope(me: Person): 'all' | 'own' | false {
  if (isControlRoomStaff(me) || me.role === 'command') return 'all';
  if (me.agencyId && isManagerOf(me, me.agencyId) && ['police', 'corps', 'emergency', 'state', 'lga_council'].includes(agency(me.agencyId)?.kind ?? '')) return 'own';
  return false;
}

export function defaultLayers(me: Person): Layer[] {
  // Cases come first: officers on foot (often 100+ figures) are one click away in Layers.
  if (isControlRoomStaff(me)) return ['incidents', 'vehicles', 'stations'];
  if (me.role === 'supervisor' && ['police', 'corps'].includes(agency(me.agencyId)?.kind ?? '')) return ['incidents', 'units', 'stations', 'vehicles'];
  if (me.role === 'officer') return ['incidents', 'vehicles'];
  return ['incidents', 'stations'];
}
/** Dark is the default for the operator, duty lead and coordinator (v2.8 §3.1). */
export const defaultBase = (me: Person): BaseMap => (isControlRoomStaff(me) ? 'dark' : 'osm');

export interface Pin {
  id: string;
  caseId: string;
  lat: number;
  lng: number;
  kind: 'incident' | 'restricted' | 'sos';
  /** v2.5: shapes as well as colours — incident circle, SOS ringed circle, Officer SOS triangle, restricted grey square. */
  shape: Shape;
  color: string;
  r: number;
  pulse: boolean;
  ref: string;
  type: string;
  status: string;
  tone: string;
  holder: string;
  /** Hover card: place (LGA only when restricted), priority, age, report count and the most urgent flag. */
  place: string;
  priority: string;
  createdAt: number;
  reports: number;
  flag?: string;
}

const SIZE = { critical: 9, high: 7, normal: 6, low: 5 };

const PRIORITY_WORD = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low' };

/** The one flag worth a glance on hover, most urgent first. */
function pinFlag(i: Incident, sos: boolean, at: number): string | undefined {
  if (i.officerSos && isOpen(i)) return 'Officer SOS';
  if (sos) return 'SOS';
  const h = handoffClock(i, at);
  if (h) return h.tone === 'red' ? h.overdueText ?? 'Handoff overdue' : `Waiting to be accepted · ${h.short}`;
  if (isOverdue(i, at)) return 'Overdue';
  if (isOpen(i) && i.escalationLevel > 1) return `Escalated · level ${i.escalationLevel}`;
  return undefined;
}

/** Incident pins after the privacy rules. The chairman gets no security points at all. */
export function incidentPins(me: Person, rows: Incident[], at = now()): Pin[] {
  const out: Pin[] = [];
  for (const i of rows) {
    if (me.role === 'chairman' && i.restricted) continue; // counts only (see countBubbles)
    if (i.locationUnknown) continue; // no point to plot until the caller or operator adds one
    const restricted = isSensitivePoint(i) && me.role !== 'sensitive';
    const sos = (i.reports[0]?.channel === 'sos' || !!i.officerSos) && isOpen(i);
    const pt = restricted ? { lat: lgaOf(i.lgaId).lat, lng: lgaOf(i.lgaId).lng } : { lat: i.lat, lng: i.lng };
    out.push({
      id: `p-${i.id}`,
      caseId: i.id,
      ...pt,
      kind: restricted ? 'restricted' : sos ? 'sos' : 'incident',
      shape: restricted ? 'square' : i.officerSos && isOpen(i) ? 'triangle' : sos ? 'ring' : 'circle',
      color: restricted ? '#98A2B3' : sos ? '#D92D20' : STATUS_COLOR[i.status],
      r: SIZE[i.severity],
      pulse: sos,
      ref: i.ref,
      type: restricted ? 'Restricted case' : subLabel(i.category, i.subcategory),
      status: statusLabel(i),
      tone: STATUS_TONE[i.status],
      // Popups never carry reporter information, for anyone.
      holder: restricted ? '—' : holderLabel(i),
      // Restricted cases show only their LGA, never the area.
      place: restricted ? lgaOf(i.lgaId).name : `${i.area}, ${lgaOf(i.lgaId).name}`,
      priority: PRIORITY_WORD[i.severity],
      createdAt: i.createdAt,
      reports: restricted ? 0 : i.reports.length,
      flag: restricted ? undefined : pinFlag(i, sos, at),
    });
  }
  return out;
}

/** LGA chairman: security shown as one count bubble per LGA, never as points. */
export function countBubbles(me: Person, rows: Incident[]) {
  if (me.role !== 'chairman') return [];
  const by = new Map<string, number>();
  for (const i of rows) if (i.restricted) by.set(i.lgaId, (by.get(i.lgaId) ?? 0) + 1);
  return [...by.entries()].map(([lgaId, n]) => ({ id: `b-${lgaId}`, lgaId, lat: lgaOf(lgaId).lat, lng: lgaOf(lgaId).lng, n, label: `${n} security case${n === 1 ? '' : 's'} in ${lgaOf(lgaId).name}` }));
}

/** Hotspots: simple grid clustering of security incidents (no heatmap plugin). */
export function hotspotCircles(me: Person, rows: Incident[]) {
  const cell = 0.0135; // ~1.5 km
  const cells = new Map<string, Incident[]>();
  for (const i of rows) {
    if (i.category !== 'security' || i.sensitiveOnly) continue;
    const pt = isSensitivePoint(i) && me.role !== 'sensitive' ? lgaOf(i.lgaId) : i;
    const k = `${Math.round(pt.lat / cell)}|${Math.round(pt.lng / cell)}`;
    cells.set(k, [...(cells.get(k) ?? []), i]);
  }
  return [...cells.values()]
    .filter((xs) => xs.length >= 3)
    .map((xs) => {
      const lat = xs.reduce((a, i) => a + i.lat, 0) / xs.length;
      const lng = xs.reduce((a, i) => a + i.lng, 0) / xs.length;
      // Label with the most common area in the cell, not whichever case came first.
      const counts = new Map<string, number>();
      for (const i of xs) counts.set(`${i.area}|${i.lgaId}`, (counts.get(`${i.area}|${i.lgaId}`) ?? 0) + 1);
      const [area, lgaId] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0].split("|");
      return { id: `h-${xs[0].id}`, lat, lng, n: xs.length, radius: 500 + Math.min(2500, xs.length * 180), label: `${xs.length} security incidents · ${area}, ${lgaOf(lgaId).name}` };
    })
    .sort((a, b) => b.n - a.n);
}

const STATION_COLOR: Record<string, string> = { police: '#1D4ED8', corps: '#15803D', emergency: '#D92D20' };
export const stationColor = (kind: string) => STATION_COLOR[kind] ?? '#667085';
/** Station pins carry a letter: P Police, A Amotekun, F Fire, G government agency. */
export const stationLetter = (kind: string) => ({ police: 'P', corps: 'A', emergency: 'F' })[kind] ?? 'G';

/** Approximate coverage: translucent circles around each covered LGA centroid (no real boundaries). */
export function coverageShapes() {
  const stations = dep.agencies.filter((a) => a.lgaIds.length && !['control_room', 'sensitive_desk', 'lga_council'].includes(a.kind));
  return {
    circles: stations.flatMap((a) => a.lgaIds.map((l) => ({ id: `c-${a.id}-${l}`, lat: lgaOf(l).lat, lng: lgaOf(l).lng, radius: lgaOf(l).metro ? 4500 : 14000, color: stationColor(a.kind), label: `${a.short} — approximate coverage of ${lgaOf(l).name}` }))),
    stations: dep.agencies
      .filter((a) => !['sensitive_desk'].includes(a.kind) && a.kind !== 'lga_council')
      .map((a) => ({ id: `s-${a.id}`, ...stationPoint(a.id), color: stationColor(a.kind), letter: stationLetter(a.kind), label: `${a.short}${(a.status ?? 'live') === 'live' ? '' : ' (setting up)'}` })),
  };
}

/** Simulated officer positions, filtered by who may see them. */
export function unitMarkers(me: Person, at = now()) {
  const scope = unitScope(me);
  if (!scope) return [];
  return dep.people
    .filter((p) => p.role === 'officer' && (p.staffStatus ?? 'active') === 'active' && (scope === 'all' || p.agencyId === me.agencyId) && !getState().vehicles.some((v) => v.status !== 'out_of_service' && v.crewIds.includes(p.id)))
    .map((p) => {
      const pos = officerPosition(p.id, at);
      const target = pos.mode === 'enroute' && pos.caseId ? getState().incidents.find((x) => x.id === pos.caseId) : undefined;
      return { id: `u-${p.id}`, personId: p.id, lat: pos.lat, lng: pos.lng, mode: pos.mode, heading: target ? bearing(pos, target) : undefined, color: stationColor(agency(p.agencyId)?.kind ?? ''), org: agency(p.agencyId)?.kind ?? '', label: `${p.name} · ${agency(p.agencyId)?.short} · ${pos.mode === 'onscene' ? 'on scene' : pos.mode === 'enroute' ? 'en route' : 'at station'}` };
    });
}

/** Responding units' lines toward an open officer SOS. */
export function sosLines(rows: Incident[]) {
  return rows
    .filter((i) => i.officerSos && isOpen(i))
    .flatMap((i) =>
      i.officerSos!.responses
        .filter((r) => r.status === 'going')
        .map((r) => ({ id: `l-${i.id}-${r.agencyId}`, from: stationPoint(r.agencyId), to: { lat: i.lat, lng: i.lng }, label: `${agency(r.agencyId)?.short} → ${i.ref}` })),
    );
}

/** Case page / field map: the incident, and the holding officer's position with a dashed line when en route. */
export function focusLine(i: Incident, at = now()) {
  if (!i.officerId || i.status !== 'in_progress' || i.t.onScene || !i.t.enRoute) return undefined;
  const pos = officerPosition(i.officerId, at);
  return { officer: pos, to: { lat: i.lat, lng: i.lng }, km: km(pos.lat, pos.lng, i.lat, i.lng) };
}

export const recent = (rows: Incident[], win: TimeWin, at = now()) => rows.filter((i) => i.createdAt > at - TIME_MS[win] || (isOpen(i) && i.createdAt > at - 30 * DAY));
export const minutesAgo = (t: number, at = now()) => Math.round((at - t) / (HOUR / 60));
export type MapPrefs = State['mapPrefs'][string];

// ======================= v2.5: legend, starting view, shapes =======================

export type Shape = 'circle' | 'ring' | 'triangle' | 'square';

/** Compass bearing in degrees from a to b (0 = north), for the en-route arrow. */
export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return Math.round(((Math.atan2(y, x) / r + 360) % 360) * 10) / 10;
}

export interface LegendItem {
  label: string;
  /** Marker drawn in the legend: a shape, a station letter, or an officer mode. */
  mark: Shape | 'letter' | 'dot' | 'arrow' | 'dotring' | 'count' | 'hotspot' | 'coverage' | 'vehicle' | 'checkpoint' | 'checkpoint-out' | 'route' | 'hospital' | 'warn';
  color: string;
  letter?: string;
  /** Vehicle and officer marks draw the same icon as the map: vehicle kind, livery, officer mode. */
  vkind?: string;
  livery?: string;
  mode?: string;
}
export interface LegendSection {
  title: string;
  items: LegendItem[];
}

/** Map legend: only the layers that are on (PRD v2.5 §4). */
export function legendFor(me: Person, layers: Layer[], opts: { focus?: boolean } = {}): LegendSection[] {
  const on = new Set(layers);
  const out: LegendSection[] = [];
  if (on.has('incidents') || opts.focus) {
    out.push({ title: 'Status', items: [...STATUS_ORDER, ...SIDE_STATUSES].map((st) => ({ label: statusLabel({ status: st }), mark: 'circle' as const, color: STATUS_COLOR[st] })) });
    const shapes: LegendItem[] = [
      { label: 'Incident (size = priority)', mark: 'circle', color: '#1D4ED8' },
      { label: 'SOS', mark: 'ring', color: '#D92D20' },
      { label: 'Officer SOS', mark: 'triangle', color: '#D92D20' },
    ];
    if (me.role === 'chairman') shapes.push({ label: 'Security cases (count only, no locations)', mark: 'count', color: '#1D2939' });
    else if (me.role !== 'sensitive') shapes.push({ label: 'Restricted (approximate location)', mark: 'square', color: '#98A2B3' });
    out.push({ title: 'Markers', items: shapes });
  }
  if (on.has('coverage') || on.has('stations'))
    out.push({
      title: 'Stations',
      items: [
        { label: 'Police', mark: 'letter', letter: 'P', color: stationColor('police') },
        { label: 'Amotekun', mark: 'letter', letter: 'A', color: stationColor('corps') },
        { label: 'Fire service', mark: 'letter', letter: 'F', color: stationColor('emergency') },
        { label: 'Government agency', mark: 'letter', letter: 'G', color: stationColor('state') },
        { label: 'No vehicle available (amber) · no officer on duty (red)', mark: 'warn', color: '#D97706' },
        ...(on.has('coverage') ? [{ label: 'Approximate coverage', mark: 'coverage' as const, color: '#1D4ED8' }] : []),
      ],
    });
  if (on.has('vehicles') && vehicleScope(me) !== 'none')
  {
    const counts = vehicleScope(me) === 'counts';
    out.push({ title: counts ? 'Vehicles (counts per station)' : 'Vehicle status (ring colour)', items: VEHICLE_STATUSES.map((st) => ({ label: VEHICLE_STATUS_LABEL[st], mark: 'vehicle' as const, color: VEHICLE_STATUS_COLOR[st], vkind: 'patrol_car', livery: 'police' })) });
    if (!counts)
      out.push({
        title: 'Vehicle types (points the way it is driving)',
        items: [
          { label: 'Police patrol car', mark: 'vehicle', color: 'transparent', vkind: 'patrol_car', livery: 'police' },
          { label: 'Amotekun patrol car', mark: 'vehicle', color: 'transparent', vkind: 'patrol_car', livery: 'corps' },
          { label: 'Motorcycle', mark: 'vehicle', color: 'transparent', vkind: 'motorcycle', livery: 'police' },
          { label: 'Armoured vehicle', mark: 'vehicle', color: 'transparent', vkind: 'armoured', livery: 'police' },
          { label: 'Fire truck', mark: 'vehicle', color: 'transparent', vkind: 'fire_truck', livery: 'emergency' },
          { label: 'Flashing lights = responding to a case', mark: 'vehicle', color: 'transparent', vkind: 'patrol_car', livery: 'police' },
        ],
      });
  }
  if (on.has('checkpoints') && checkpointScope(me) !== 'none')
    out.push({ title: 'Checkpoints', items: [{ label: 'Active', mark: 'checkpoint', color: '#B42318' }, { label: 'Scheduled (outline)', mark: 'checkpoint-out', color: '#B42318' }, { label: 'Joint Police + Amotekun', mark: 'checkpoint', color: '#7E22CE' }] });
  if (on.has('routes') && routeScope(me) !== 'none') out.push({ title: 'Patrol routes', items: [{ label: 'Approximate route (dashed, station colour)', mark: 'route', color: '#1D4ED8' }] });
  if (on.has('hospitals') && !isResident(me)) out.push({ title: 'Places', items: [{ label: 'Hospital', mark: 'hospital', color: '#D92D20' }] });
  if (on.has('units') && unitScope(me))
    out.push({
      title: 'Officers',
      items: [
        { label: 'Police officer on foot', mark: 'dot', color: '#1D2939', livery: 'police', mode: 'idle' },
        { label: 'Amotekun officer on foot', mark: 'dot', color: '#1D2939', livery: 'corps', mode: 'idle' },
        { label: 'En route (arrow points to the incident)', mark: 'arrow', color: '#1D4ED8', livery: 'police', mode: 'enroute' },
        { label: 'On scene (amber ring)', mark: 'dotring', color: '#B45309', livery: 'police', mode: 'onscene' },
      ],
    });
  if (on.has('hotspots')) out.push({ title: 'Hotspots', items: [{ label: 'Hotspot — 3 or more security incidents within about 1.5 km', mark: 'hotspot', color: '#D92D20' }] });
  return out;
}

export type Bounds = [[number, number], [number, number]];
export const STATE_BOUNDS = (): Bounds => [
  [dep.bounds.minLat, dep.bounds.minLng],
  [dep.bounds.maxLat, dep.bounds.maxLng],
];
/** A box of about `radiusKm` around a point. */
export function boxAround(lat: number, lng: number, radiusKm: number): Bounds {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return [
    [lat - dLat, lng - dLng],
    [lat + dLat, lng + dLng],
  ];
}
function union(boxes: Bounds[]): Bounds {
  return [
    [Math.min(...boxes.map((b) => b[0][0])), Math.min(...boxes.map((b) => b[0][1]))],
    [Math.max(...boxes.map((b) => b[1][0])), Math.max(...boxes.map((b) => b[1][1]))],
  ];
}

/** Where each role's map opens (PRD v2.5 §4); a "Whole state" button is always there to zoom out. */
export function defaultView(me: Person, opts: { focus?: { lat: number; lng: number } } = {}, at = now()): { bounds: Bounds; label: string } {
  if (opts.focus) return { bounds: boxAround(opts.focus.lat, opts.focus.lng, 1.5), label: 'The incident' };
  const kind = roleKind(me);
  if ((kind === 'commander' || kind === 'agency') && me.agencyId) {
    const a = agency(me.agencyId);
    if (a?.lgaIds.length) return { bounds: union(a.lgaIds.map((l) => boxAround(lgaOf(l).lat, lgaOf(l).lng, lgaOf(l).metro ? 4.5 : 14))), label: `${a.short} coverage` };
  }
  if (kind === 'officer') {
    const p = officerPosition(me.id, at);
    return { bounds: boxAround(p.lat, p.lng, 3), label: 'Your position' };
  }
  if (kind === 'chair' && me.lgaId) {
    const l = lgaOf(me.lgaId);
    return { bounds: boxAround(l.lat, l.lng, l.metro ? 6 : 15), label: `${l.name} LGA` };
  }
  if (kind === 'focal' && me.lgaId) {
    const p = areaPoint(me.lgaId, me.community);
    return { bounds: boxAround(p.lat, p.lng, 2), label: me.community ?? lgaOf(me.lgaId).name };
  }
  return { bounds: STATE_BOUNDS(), label: 'All of Oyo' };
}

// ======================= v2.8: operational map — who sees what, enforced in the data =======================

const isResident = (me: Person) => me.role === 'citizen' || me.role === 'focal' || me.id === 'guest';
/** Vehicles: control room all · commander own (+ responding to their cases) · officer own (+ to their case) · Governor counts · nobody else. */
export function vehicleScope(me: Person): 'all' | 'station' | 'own' | 'counts' | 'none' {
  if (isControlRoomStaff(me) || me.role === 'command') return 'all';
  if (me.role === 'executive') return 'counts';
  if (me.role === 'officer' && ['police', 'corps', 'emergency'].includes(agency(me.agencyId)?.kind ?? '')) return 'own';
  if (me.agencyId && isManagerOf(me, me.agencyId) && ['police', 'corps', 'emergency'].includes(agency(me.agencyId)?.kind ?? '')) return 'station';
  return 'none';
}
/** Checkpoints: control all · commander own + joint · officer own station · Governor counts per LGA · never residents or the chairman. */
export function checkpointScope(me: Person): 'all' | 'station' | 'own' | 'counts' | 'none' {
  const s = vehicleScope(me);
  return s;
}
export function routeScope(me: Person): 'all' | 'own' | 'none' {
  const s = vehicleScope(me);
  return s === 'all' ? 'all' : s === 'station' || s === 'own' ? 'own' : 'none';
}

export interface VehicleView {
  id: string;
  callSign: string;
  stationId: string;
  station: string;
  kind: Vehicle['kind'];
  status: VehicleStatus;
  statusReason?: string;
  lat: number;
  lng: number;
  heading: number;
  etaMin?: number;
  caseId?: string;
  caseRef?: string;
  routeId?: string;
  route?: string;
  crew: { id: string; name: string; rank?: string }[];
  color: string;
}
export interface StationView {
  id: string;
  name: string;
  short: string;
  kind: string;
  letter: string;
  color: string;
  lat: number;
  lng: number;
  readiness: number;
  commander?: string;
  onDuty: number;
  officers: number;
  vehicles?: { total: number; available: number; chips: { callSign: string; status: VehicleStatus }[] };
  openCases: number;
  /** amber: no vehicle available · red: no officer on duty */
  warning?: 'amber' | 'red';
  live: boolean;
}
export interface CheckpointView extends Checkpoint {
  station: string;
  staff: { id: string; name: string; rank?: string }[];
  casesNearby: number;
  state: Checkpoint['status'];
}

const VEHICLE_KINDS = ['police', 'corps', 'emergency'];
/** Every resource the map may draw for this person — filtered here, so the browser never receives what the role can't see. */
export function mapResources(me: Person, s: State, at = now()) {
  const vs = vehicleScope(me);
  const kind = roleKind(me);
  const cases = s.incidents;
  const caseOf = (id?: string) => (id ? cases.find((i) => i.id === id) : undefined);
  const view = (v: Vehicle): VehicleView => {
    const p = vehiclePosition(v, at, cases);
    const c = caseOf(v.caseId);
    return { id: v.id, callSign: v.callSign, stationId: v.stationId, station: agency(v.stationId)?.short ?? v.stationId, kind: v.kind, status: v.status, statusReason: v.statusReason, lat: p.lat, lng: p.lng, heading: p.heading, etaMin: v.status === 'responding' ? p.etaMin : undefined, caseId: v.caseId, caseRef: c?.ref, routeId: v.routeId, route: ROUTES.find((r) => r.id === v.routeId)?.name, crew: v.crewIds.map((id) => ({ id, name: person(id)?.name ?? id, rank: person(id)?.rank })), color: VEHICLE_STATUS_COLOR[v.status] };
  };
  const visibleVehicle = (v: Vehicle) => {
    if (vs === 'all') return true;
    if (vs === 'station') return v.stationId === me.agencyId || (!!v.caseId && caseOf(v.caseId)?.agencyId === me.agencyId);
    if (vs === 'own') return v.crewIds.includes(me.id) || (!!v.caseId && caseOf(v.caseId)?.officerId === me.id);
    return false;
  };
  const vehicles = vs === 'counts' || vs === 'none' ? [] : s.vehicles.filter(visibleVehicle).map(view);
  const vehicleCounts =
    vs === 'counts'
      ? [...new Set(s.vehicles.map((v) => v.stationId))].map((sid) => {
          const xs = s.vehicles.filter((v) => v.stationId === sid);
          return { stationId: sid, station: agency(sid)?.short ?? sid, total: xs.length, available: xs.filter((v) => v.status === 'available' || v.status === 'patrolling').length, out: xs.filter((v) => v.status === 'out_of_service').length };
        })
      : undefined;
  const near = (cp: Checkpoint) => cases.filter((i) => i.createdAt > at - 7 * DAY && km(i.lat, i.lng, cp.lat, cp.lng) <= 1).length;
  const cpVisible = (cp: Checkpoint) => {
    if (vs === 'all') return true;
    if (vs === 'station') return cp.stationId === me.agencyId || cp.kind === 'joint';
    if (vs === 'own') return cp.stationId === me.agencyId;
    return false;
  };
  const live = s.checkpoints.map((cp) => ({ cp, st: checkpointStatus(cp, at) })).filter((x) => x.st !== 'closed' || vs === 'all' || vs === 'station');
  const checkpoints: CheckpointView[] =
    vs === 'counts' || vs === 'none'
      ? []
      : live
          .filter((x) => cpVisible(x.cp))
          .map(({ cp, st }) => ({ ...cp, state: st, station: agency(cp.stationId)?.short ?? cp.stationId, staff: cp.staffIds.map((id) => ({ id, name: person(id)?.name ?? id, rank: person(id)?.rank })), casesNearby: near(cp) }));
  const checkpointCounts =
    vs === 'counts'
      ? [...new Set(live.filter((x) => x.st === 'active').map((x) => nearestLgaId(x.cp.lat, x.cp.lng)))].map((lgaId) => ({ lgaId, lga: lgaOf(lgaId).name, n: live.filter((x) => x.st === 'active' && nearestLgaId(x.cp.lat, x.cp.lng) === lgaId).length }))
      : undefined;
  const rs = routeScope(me);
  const routes: PatrolRoute[] = rs === 'all' ? ROUTES : rs === 'own' ? ROUTES.filter((r) => r.stationId === me.agencyId) : [];
  // Stations: everyone on staff; the chairman only their own LGA; residents none.
  const stationList = isResident(me)
    ? []
    : dep.agencies.filter((a) => !['sensitive_desk', 'lga_council', 'control_room'].includes(a.kind) && (kind !== 'chair' || a.lgaIds.includes(me.lgaId ?? '')));
  const showVehicleNumbers = vs !== 'none';
  const stations: StationView[] = stationList.map((a) => {
    const staff = dep.people.filter((p) => p.agencyId === a.id && p.role === 'officer' && (p.staffStatus ?? 'active') === 'active');
    const onD = staff.filter((p) => onDuty(p.id)).length;
    const vx = s.vehicles.filter((v) => v.stationId === a.id);
    const avail = vx.filter((v) => v.status === 'available' || v.status === 'patrolling').length;
    const hasFleet = VEHICLE_KINDS.includes(a.kind) && vx.length > 0;
    return {
      id: a.id,
      name: a.name,
      short: a.short,
      kind: a.kind,
      letter: stationLetter(a.kind),
      color: stationColor(a.kind),
      ...stationPoint(a.id),
      readiness: readiness(a.id).score,
      commander: person(a.commanderId)?.name,
      onDuty: onD,
      officers: staff.length,
      vehicles: showVehicleNumbers && hasFleet ? { total: vx.length, available: avail, chips: vs === 'counts' ? [] : vx.map((v) => ({ callSign: v.callSign, status: v.status })) } : undefined,
      openCases: cases.filter((i) => i.agencyId === a.id && isOpen(i)).length,
      warning: staff.length && !onD ? 'red' : showVehicleNumbers && hasFleet && !avail ? 'amber' : undefined,
      live: (a.status ?? 'live') === 'live',
    };
  });
  const hospitals: Hospital[] = isResident(me) ? [] : HOSPITALS;
  return { vehicles, vehicleCounts, checkpoints, checkpointCounts, routes, stations, hospitals };
}
const nearestLgaId = (lat: number, lng: number) => dep.lgas.slice().sort((a, b) => km(a.lat, a.lng, lat, lng) - km(b.lat, b.lng, lat, lng))[0].id;

/** "Vehicles: 14 available · 6 patrolling · …" for the resources panel. */
export function vehicleSummary(vs: { status: VehicleStatus }[]) {
  return VEHICLE_STATUSES.map((st) => ({ status: st, label: VEHICLE_STATUS_LABEL[st], n: vs.filter((v) => v.status === st).length }));
}

/** Grid clustering for incident pins when zoomed out: one bubble per cell, coloured by the worst priority inside. */
export function clusterPins<T extends { lat: number; lng: number; r: number; caseId: string }>(pins: T[], zoom: number) {
  if (zoom >= 11) return { singles: pins, clusters: [] as { id: string; lat: number; lng: number; n: number; worst: number; ids: string[] }[] };
  const cell = zoom <= 7 ? 0.35 : zoom <= 8 ? 0.18 : zoom <= 9 ? 0.09 : 0.045;
  const by = new Map<string, T[]>();
  for (const p of pins) {
    const k = `${Math.floor(p.lat / cell)}|${Math.floor(p.lng / cell)}`;
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  const singles: T[] = [];
  const clusters: { id: string; lat: number; lng: number; n: number; worst: number; ids: string[] }[] = [];
  for (const [k, xs] of by) {
    if (xs.length === 1) singles.push(xs[0]);
    else clusters.push({ id: `k-${k}`, lat: xs.reduce((a, p) => a + p.lat, 0) / xs.length, lng: xs.reduce((a, p) => a + p.lng, 0) / xs.length, n: xs.length, worst: Math.max(...xs.map((p) => p.r)), ids: xs.map((p) => p.caseId) });
  }
  return { singles, clusters };
}
export const CLUSTER_COLOR = (r: number) => (r >= 9 ? '#D92D20' : r >= 7 ? '#DC6803' : r >= 6 ? '#1D4ED8' : '#667085');

/** Breadcrumb for a visible vehicle (only computed when it is selected). */
export function vehicleTrail(me: Person, s: State, vehicleId: string, at = now()) {
  const vv = mapResources(me, s, at).vehicles.find((v) => v.id === vehicleId);
  const v = s.vehicles.find((x) => x.id === vehicleId);
  return vv && v ? breadcrumb(v, at, s.incidents) : [];
}

/** The latest key events for the wall-view ticker ("2:14 pm · SOS · Agbowo · Pending review"). */
export function tickerEvents(s: State, at = now(), n = 5) {
  const KEY = ['Report received', 'Verified', 'Passed', 'Passed back', 'Handoff accepted', 'Escalated', 'Officer SOS raised', 'Missed check-in — Officer SOS', 'On scene', 'Marked resolved', 'Closed', 'Vehicle responding', 'Checkpoint set up', 'Vehicle out of service'];
  return s.audit
    .filter((e) => KEY.includes(e.action) && e.at <= at)
    .slice(-60)
    .reverse()
    .map((e) => {
      const i = e.incidentId ? s.incidents.find((x) => x.id === e.incidentId) : undefined;
      const what = i ? (i.officerSos ? 'Officer SOS' : i.reports[0]?.channel === 'sos' ? 'SOS' : subLabel(i.category, i.subcategory)) : e.action;
      return { seq: e.seq, at: e.at, text: i ? `${what} · ${i.area} · ${e.action === 'Report received' ? statusLabel(i) : e.action}` : `${e.action} · ${e.detail}` };
    })
    .slice(0, n);
}
