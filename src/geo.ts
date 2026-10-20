import { km } from './platform/engine';
import { areaPoint } from './deployments/oyo';
import { dep, lgaOf, type State } from './store';

// Location for report flows (PRD v2.5 §2). Pure apart from getLocation(), so it can be tested.

export type SimId = State['simLocation'];
export const SIM_LOCATIONS: { id: SimId; label: string; lgaId?: string; area?: string }[] = [
  { id: 'off', label: 'Off — use the real location' },
  { id: 'agbowo', label: 'Agbowo, Ibadan North', lgaId: 'ibn', area: 'Agbowo' },
  { id: 'igangan', label: 'Igangan, Ibarapa North', lgaId: 'ibno', area: 'Igangan' },
  { id: 'moniya', label: 'Moniya, Akinyele', lgaId: 'aki', area: 'Moniya' },
  { id: 'ogbomoso', label: 'Ogbomoso', lgaId: 'ogn', area: 'Takie' },
];

/** The simulated point: a little off the area centre, so moving the pin is worth showing. */
export function simPoint(id: SimId) {
  const s = SIM_LOCATIONS.find((x) => x.id === id);
  if (!s?.lgaId) return undefined;
  const p = areaPoint(s.lgaId, s.area);
  return { lat: p.lat + 0.0011, lng: p.lng - 0.0008 };
}

export const inOyo = (lat: number, lng: number) => {
  const b = dep.bounds;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
};

/** Nearest known area (deployment centroids) to a point. */
export function nearestArea(lat: number, lng: number) {
  let best = { lgaId: dep.lgas[0].id, area: dep.lgas[0].areas[0], km: Infinity };
  for (const l of dep.lgas)
    for (const a of l.areas) {
      const p = areaPoint(l.id, a);
      const d = km(p.lat, p.lng, lat, lng);
      if (d < best.km) best = { lgaId: l.id, area: a, km: d };
    }
  return best;
}

export type Located = { status: 'ok'; lat: number; lng: number; lgaId: string; area: string } | { status: 'outside'; lat: number; lng: number } | { status: 'denied' } | { status: 'unavailable' };

/** Never silently file a case outside Oyo: outside points come back as "outside". */
export function resolvePoint(lat: number, lng: number): Located {
  if (!inOyo(lat, lng)) return { status: 'outside', lat, lng };
  const n = nearestArea(lat, lng);
  return { status: 'ok', lat, lng, lgaId: n.lgaId, area: n.area };
}

export const placeLabel = (lgaId: string, area: string) => `${area} · ${lgaOf(lgaId).name}`;

/** "Use my location": the simulated point after a 1 s fake delay when the demo control is on, else the browser's. */
export function getLocation(sim: SimId, delay = 1000): Promise<Located> {
  if (sim !== 'off') {
    const p = simPoint(sim)!;
    return new Promise((res) => setTimeout(() => res(resolvePoint(p.lat, p.lng)), delay));
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({ status: 'unavailable' });
  return new Promise((res) =>
    navigator.geolocation.getCurrentPosition(
      (p) => res(resolvePoint(p.coords.latitude, p.coords.longitude)),
      (e) => res({ status: e.code === 1 ? 'denied' : 'unavailable' }),
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 60_000 },
    ),
  );
}
