import { DAY, HOUR, isOpen, km } from './platform/engine';
import type { Incident, Person } from './platform/types';
import { SIDE_STATUSES, STATUS_COLOR, STATUS_ORDER, STATUS_TONE, statusLabel } from './i18n';
import { areaPoint } from './deployments/oyo';
import { roleKind } from './roles';
import { agency, controlRoom, dep, getState, holderLabel, isManagerOf, lgaOf, now, officerPosition, stationPoint, subLabel, type State } from './store';

// Pure map data, so the privacy rules can be checked without Leaflet or tiles (PRD v2.3 §2, §9).

export type Layer = 'incidents' | 'hotspots' | 'coverage' | 'units';
export type TimeWin = '24h' | '7d' | '30d';
export const TIME_MS: Record<TimeWin, number> = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };
export const LAYERS: { id: Layer; label: string }[] = [
  { id: 'incidents', label: 'Incidents' },
  { id: 'hotspots', label: 'Hotspots' },
  { id: 'coverage', label: 'Station coverage' },
  { id: 'units', label: 'Units' },
];

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
  const units = isControlRoomStaff(me) || (me.role === 'supervisor' && ['police', 'corps'].includes(agency(me.agencyId)?.kind ?? ''));
  return units ? ['incidents', 'units'] : ['incidents'];
}

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
}

const SIZE = { critical: 9, high: 7, normal: 6, low: 5 };

/** Incident pins after the privacy rules. The chairman gets no security points at all. */
export function incidentPins(me: Person, rows: Incident[]): Pin[] {
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
    .filter((p) => p.role === 'officer' && (p.staffStatus ?? 'active') === 'active' && (scope === 'all' || p.agencyId === me.agencyId))
    .map((p) => {
      const pos = officerPosition(p.id, at);
      const target = pos.mode === 'enroute' && pos.caseId ? getState().incidents.find((x) => x.id === pos.caseId) : undefined;
      return { id: `u-${p.id}`, personId: p.id, lat: pos.lat, lng: pos.lng, mode: pos.mode, heading: target ? bearing(pos, target) : undefined, color: stationColor(agency(p.agencyId)?.kind ?? ''), label: `${p.name} · ${agency(p.agencyId)?.short} · ${pos.mode === 'onscene' ? 'on scene' : pos.mode === 'enroute' ? 'en route' : 'at station'}` };
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
  mark: Shape | 'letter' | 'dot' | 'arrow' | 'dotring' | 'count' | 'hotspot' | 'coverage';
  color: string;
  letter?: string;
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
  if (on.has('coverage'))
    out.push({
      title: 'Stations',
      items: [
        { label: 'Police', mark: 'letter', letter: 'P', color: stationColor('police') },
        { label: 'Amotekun', mark: 'letter', letter: 'A', color: stationColor('corps') },
        { label: 'Fire service', mark: 'letter', letter: 'F', color: stationColor('emergency') },
        { label: 'Government agency', mark: 'letter', letter: 'G', color: stationColor('state') },
        { label: 'Approximate coverage', mark: 'coverage', color: '#1D4ED8' },
      ],
    });
  if (on.has('units') && unitScope(me))
    out.push({
      title: 'Officers',
      items: [
        { label: 'On duty', mark: 'dot', color: '#1D2939' },
        { label: 'En route (arrow points to the incident)', mark: 'arrow', color: '#1D4ED8' },
        { label: 'On scene', mark: 'dotring', color: '#B45309' },
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
