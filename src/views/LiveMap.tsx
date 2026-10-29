import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { CheckpointKind, Incident, OutOfServiceReason, VehicleStatus } from '../platform/types';
import {
  BASES,
  CLUSTER_COLOR,
  LAYERS,
  STATE_BOUNDS,
  clusterPins,
  countBubbles,
  coverageShapes,
  defaultBase,
  defaultLayers,
  defaultView,
  focusLine,
  hotspotCircles,
  incidentPins,
  legendFor,
  mapResources,
  recent,
  sosLines,
  tickerEvents,
  unitMarkers,
  unitScope,
  vehicleScope,
  vehicleSummary,
  vehicleTrail,
  type BaseMap,
  type Bounds,
  type Layer,
  type LegendItem,
  type LegendSection,
  type TimeWin,
} from '../mapdata';
import { VEHICLE_KIND_LABEL, VEHICLE_STATUS_COLOR, VEHICLE_STATUS_LABEL, canDispatch } from '../fleet';
import { fmtTimeWat } from '../format';
import { roleKind } from '../roles';
import { agency, controlRoom, dep, fleet, getState, isControl, isManagerOf, lgaOf, now, persona, resetMapView, saveMapView, setMapPrefs, useStore } from '../store';
import { Icon, Sheet, run, useNow } from '../ui';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface LiveMapProps {
  /** Incidents to plot (already filtered by the page: tab, filter, search). */
  rows: Incident[];
  /** Incidents used for the Hotspots layer (defaults to rows). */
  context?: Incident[];
  height?: number | string;
  /** Show the layer panel and time chips. */
  controls?: boolean;
  /** Case page / field map: one incident and its holding officer. */
  focus?: Incident;
  /** Field map: the signed-in officer's own position. */
  selfId?: string;
  /** Report flows: a draggable pin; tapping the map moves it too. */
  picker?: { lat?: number; lng?: number; onPick: (lat: number, lng: number) => void; label?: string };
  /** Remembers the last view per user per page (defaults to the current route). */
  page?: string;
  /** Full map view: the resources side panel (Cases → Map, Overview map cards). */
  panel?: boolean;
  /** Control-room wall view (full screen, dark, live ticker). */
  wall?: boolean;
}

type Sel = { kind: 'vehicle' | 'case' | 'station' | 'checkpoint'; id: string } | null;

const routePage = () => (typeof location !== 'undefined' ? location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] : '') || 'home';

// ---- marker HTML: shapes as well as colours ----
const SIZE_PX = (r: number) => Math.round(r * 2.2 + 4);
function pinHtml(shape: string, color: string, px: number) {
  if (shape === 'triangle') return `<svg width="${px + 6}" height="${px + 6}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 23 21H1Z" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5M12 17h.01" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  if (shape === 'square') return `<span class="mk-sq" style="width:${px}px;height:${px}px;background:${color}"></span>`;
  if (shape === 'ring') return `<span class="mk-ring" style="--c:${color};width:${px}px;height:${px}px"></span>`;
  return `<span class="mk-dot" style="width:${px}px;height:${px}px;background:${color}"></span>`;
}
const stationHtml = (letter: string, color: string, warning?: string) =>
  `<span class="mk-bldg" style="--c:${color}"><svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M3 11 13 4l10 7v11H3Z" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg><b>${letter}</b>${warning ? `<i class="mk-warn ${warning}">!</i>` : ''}</span>`;
function unitHtml(mode: string, color: string, heading?: number) {
  if (mode === 'enroute') return `<span class="mk-arrow" style="--c:${color};transform:rotate(${heading ?? 0}deg)"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 21 12 16 4 21Z" fill="${color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></span>`;
  if (mode === 'onscene') return `<span class="mk-dotring" style="--c:${color}"><i></i></span>`;
  return `<span class="mk-unit" style="--c:${color}"></span>`;
}
const VEH_GLYPH: Record<string, string> = { patrol_car: 'P', motorcycle: 'M', armoured: 'A', fire_truck: 'F', ambulance: '+', utility: 'U' };
const vehicleHtml = (call: string, kind: string, color: string, heading: number, moving: boolean) =>
  `<span class="mk-veh" style="--c:${color}"><span class="mk-veh-body">${VEH_GLYPH[kind] ?? 'V'}</span>${moving ? `<span class="mk-veh-dir" style="transform:rotate(${heading}deg)"></span>` : ''}<span class="mk-veh-tag">${esc(call)}</span></span>`;
const checkpointHtml = (kind: string, state: string) => `<span class="mk-cp k-${kind} s-${state}"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12Z" fill="${state === 'active' ? (kind === 'joint' ? '#7E22CE' : kind === 'community' ? '#B45309' : '#B42318') : '#fff'}" stroke="${kind === 'joint' ? '#7E22CE' : '#B42318'}" stroke-width="2.4"/></svg></span>`;
const hospitalHtml = `<span class="mk-hosp"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="#fff" stroke="#D92D20" stroke-width="2"/><path d="M12 6v12M6 12h12" stroke="#D92D20" stroke-width="3.2" stroke-linecap="round"/></svg></span>`;

/**
 * Live map: Leaflet + OpenStreetMap / CARTO tiles, with a plain offline fallback.
 * Leaflet is loaded lazily in the browser, so the page (and server render) works without it.
 */
export function LiveMap({ rows, context, height = 460, controls = true, focus, selfId, picker, page, panel, wall }: LiveMapProps) {
  const me = persona();
  const at = useNow(5000);
  const prefs = useStore((s) => s.mapPrefs[s.signedInId ?? 'guest']);
  const s = useStore((x) => x);
  const kind = roleKind(me);
  const layers = new Set<Layer>((prefs?.layers as Layer[] | undefined) ?? defaultLayers(me));
  if (wall) for (const l of ['incidents', 'stations', 'vehicles', 'checkpoints'] as Layer[]) layers.add(l);
  const win: TimeWin = prefs?.time ?? '7d';
  const base: BaseMap = wall ? 'dark' : (prefs?.base ?? defaultBase(me));
  const [offline, setOffline] = useState(false);
  const [legendSheet, setLegendSheet] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [zoom, setZoom] = useState(8);
  const [vfilter, setVfilter] = useState<VehicleStatus | ''>('');
  const [search, setSearch] = useState('');
  const [wallOpen, setWallOpen] = useState(false);
  const [cpAt, setCpAt] = useState<{ lat: number; lng: number }>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: typeof Leaflet; map: Leaflet.Map; group: Leaflet.LayerGroup; labels: Leaflet.LayerGroup; tiles?: Leaflet.TileLayer; pin?: Leaflet.Marker } | null>(null);
  const pageKey = picker ? undefined : wall ? 'wall' : (page ?? routePage()) + (focus ? ':case' : '');
  const programmatic = useRef(false);
  const pickRef = useRef(picker);
  pickRef.current = picker;
  const control = isControl(me) || kind === 'coord';
  const canAddCheckpoint = (me.role === 'supervisor' && ['police', 'corps'].includes(agency(me.agencyId)?.kind ?? '')) || (me.role === 'ops_manager' && me.agencyId === controlRoom().id);

  const savePrefs = (patch: Partial<{ layers: string[]; time: TimeWin; base: BaseMap }>) => setMapPrefs({ layers: [...layers], time: win, base: prefs?.base, ...patch });
  const toggle = (l: Layer) => {
    const next = new Set(layers);
    if (next.has(l)) next.delete(l);
    else next.add(l);
    savePrefs({ layers: [...next] });
  };
  const setWin = (t: TimeWin) => savePrefs({ time: t });

  const shown = focus ? [focus] : recent(rows, win, at);
  const res = useMemo(() => (picker ? undefined : mapResources(me, s, at)), [picker, me.id, s, Math.floor(at / 5000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useMemo(() => {
    const ctx = focus ? [] : recent(context ?? rows, win, at);
    const sosOnly = layers.has('sos') && !focus;
    const pins = layers.has('incidents') || focus || sosOnly ? incidentPins(me, sosOnly ? shown.filter((i) => i.reports[0]?.channel === 'sos' || !!i.officerSos) : shown) : [];
    const vehicles = !res ? [] : focus ? res.vehicles.filter((v) => v.caseId === focus.id) : layers.has('vehicles') ? res.vehicles.filter((v) => !vfilter || v.status === vfilter) : [];
    return {
      pins,
      bubbles: layers.has('incidents') && !focus ? countBubbles(me, shown) : [],
      hot: layers.has('hotspots') && !focus ? hotspotCircles(me, ctx) : [],
      cov: (layers.has('coverage') || sel?.kind === 'station') && !focus ? coverageShapes() : { circles: [], stations: [] },
      units: layers.has('units') && !focus ? unitMarkers(me, at) : [],
      lines: sosLines(focus ? [focus] : shown),
      line: focus ? focusLine(focus, at) : undefined,
      self: selfId ? unitMarkers({ ...me, role: 'ops_manager', agencyId: dep.agencies.find((a) => a.kind === 'control_room')!.id }, at).find((u) => u.personId === selfId) : undefined,
      vehicles,
      checkpoints: res && !focus && layers.has('checkpoints') ? res.checkpoints.filter((c) => c.state !== 'closed') : [],
      routes: res && !focus ? (layers.has('routes') ? res.routes : sel ? res.routes.filter((r) => (sel.kind === 'station' && r.stationId === sel.id) || (sel.kind === 'vehicle' && res.vehicles.find((v) => v.id === sel.id)?.routeId === r.id)) : []) : [],
      stations: res && !focus && layers.has('stations') ? res.stations : [],
      hospitals: res && !focus && layers.has('hospitals') ? res.hospitals : [],
      vehicleCounts: res && layers.has('vehicles') ? res.vehicleCounts : undefined,
      checkpointCounts: res && layers.has('checkpoints') ? res.checkpointCounts : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((i) => i.id + i.status).join(), [...layers].join(), win, Math.floor(at / 5000), focus?.id, selfId, me.id, res, vfilter, sel?.kind, sel?.id]);
  const clustered = clusterPins(data.pins, focus ? 18 : zoom);
  const trail = sel?.kind === 'vehicle' ? vehicleTrail(me, s, sel.id, at) : [];

  // What the selection relates to (everything else dims).
  const related = useMemo(() => {
    if (!sel) return undefined;
    const r = new Set<string>([`${sel.kind}:${sel.id}`]);
    const all = res?.vehicles ?? [];
    if (sel.kind === 'vehicle') {
      const v = all.find((x) => x.id === sel.id);
      if (v?.caseId) r.add(`case:${v.caseId}`);
      if (v?.routeId) r.add(`route:${v.routeId}`);
      if (v) r.add(`station:${v.stationId}`);
    } else if (sel.kind === 'case') {
      for (const v of all) if (v.caseId === sel.id) r.add(`vehicle:${v.id}`);
    } else if (sel.kind === 'station') {
      for (const v of all) if (v.stationId === sel.id) r.add(`vehicle:${v.id}`);
      for (const c of res?.checkpoints ?? []) if (c.stationId === sel.id) r.add(`checkpoint:${c.id}`);
      for (const rt of res?.routes ?? []) if (rt.stationId === sel.id) r.add(`route:${rt.id}`);
    }
    return r;
  }, [sel, res]);
  const dim = (k: string) => (related && !related.has(k) ? ' dim' : '');

  const legend = picker ? [] : legendFor(me, focus ? [] : [...layers], { focus: !!focus });
  const home = picker ? (picker.lat != null && picker.lng != null ? undefined : { bounds: STATE_BOUNDS(), label: 'All of Oyo' }) : defaultView(me, { focus: focus ? { lat: focus.lat, lng: focus.lng } : undefined }, at);

  const fit = (b: Bounds) => {
    const m = mapRef.current;
    if (!m) return;
    programmatic.current = true;
    m.map.fitBounds(b);
    setTimeout(() => (programmatic.current = false), 400);
  };
  const flyTo = (lat: number, lng: number, z = 14) => {
    const m = mapRef.current;
    if (!m) return;
    programmatic.current = true;
    m.map.flyTo([lat, lng], Math.max(z, m.map.getZoom()), { duration: 0.6 });
    setTimeout(() => (programmatic.current = false), 900);
  };
  const resetView = () => {
    if (pageKey) resetMapView(pageKey);
    if (home) fit(home.bounds);
  };

  // Esc clears the selection and leaves the wall view.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSel(null);
      setWallOpen(false);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  // Create the map once (browser only).
  useEffect(() => {
    let dead = false;
    let resize: ResizeObserver | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !elRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true, attributionControl: true, maxBounds: [[5.5, 1.5], [10.5, 6]] });
      // Start: the last view this user left on this page, else the role's default view.
      const saved = pageKey ? getState().mapViews[`${getState().signedInId ?? 'guest'}|${pageKey}`] : undefined;
      programmatic.current = true;
      if (saved) map.setView([saved.lat, saved.lng], saved.zoom);
      else if (picker?.lat != null && picker.lng != null) map.setView([picker.lat, picker.lng], 16);
      else map.fitBounds(home?.bounds ?? STATE_BOUNDS());
      setTimeout(() => (programmatic.current = false), 400);
      L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
      const labels = L.layerGroup().addTo(map);
      const group = L.layerGroup().addTo(map);
      if (picker) map.on('click', (e: Leaflet.LeafletMouseEvent) => pickRef.current?.onPick(e.latlng.lat, e.latlng.lng));
      else map.on('click', () => setSel(null));
      // Right-click (desktop) or long-press (phones) → "Add checkpoint here".
      if (!picker) map.on('contextmenu', (e: Leaflet.LeafletMouseEvent) => canAddCheckpoint && setCpAt({ lat: e.latlng.lat, lng: e.latlng.lng }));
      map.on('zoomend', () => setZoom(map.getZoom()));
      if (pageKey)
        map.on('moveend', () => {
          if (programmatic.current) return;
          const c = map.getCenter();
          saveMapView(pageKey, { lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5, zoom: map.getZoom() });
        });
      // Buttons inside popups (vehicle status, close checkpoint).
      map.on('popupopen', (e: Leaflet.PopupEvent) => {
        const root = e.popup.getElement();
        root?.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) =>
          b.addEventListener('click', () => {
            const { act, id, reason } = b.dataset;
            if (act === 'oos') run(fleet.outOfService(id!, reason as OutOfServiceReason), `Marked out of service — ${reason}.`);
            if (act === 'back') run(fleet.backInService(id!), 'Back in service.');
            if (act === 'cpclose') run(fleet.closeCheckpoint(id!), 'Checkpoint closed.');
            map.closePopup();
          }),
        );
      });
      mapRef.current = { L, map, group, labels };
      setZoom(map.getZoom());
      setTiles();
      draw();
      // Leaflet measures its box once; re-measure when a modal or tab gives it its real size.
      resize = new ResizeObserver(() => map.invalidateSize());
      resize.observe(elRef.current);
    })();
    return () => {
      dead = true;
      resize?.disconnect();
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base map: Standard (OSM), Dark or Light (CARTO). If no tile arrives within 4 s, fall back to positions only.
  const tileTimer = useRef(0);
  const setTiles = () => {
    const m = mapRef.current;
    if (!m) return;
    const b = BASES.find((x) => x.id === base) ?? BASES[0];
    if (m.tiles) m.map.removeLayer(m.tiles);
    let loaded = false;
    const tiles = m.L.tileLayer(b.url, { maxZoom: 18, attribution: b.attribution, subdomains: 'abcd' });
    tiles.on('tileload', () => {
      loaded = true;
      setOffline(false);
    });
    tiles.addTo(m.map);
    tiles.bringToBack();
    m.tiles = tiles;
    clearTimeout(tileTimer.current);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setOffline(true);
    tileTimer.current = window.setTimeout(() => {
      if (!loaded && mapRef.current) {
        mapRef.current.map.removeLayer(tiles);
        setOffline(true);
      }
    }, 4000);
  };
  useEffect(() => {
    setTiles();
    return () => clearTimeout(tileTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // LGA labels: the offline fallback, or the "LGA names" layer.
  const showLgaNames = offline || layers.has('lganames');
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.labels.clearLayers();
    if (!showLgaNames) return;
    for (const l of dep.lgas) m.L.marker([l.lat, l.lng], { interactive: false, icon: m.L.divIcon({ className: 'lga-tag', html: esc(l.name), iconSize: [110, 16], iconAnchor: [55, 8] }) }).addTo(m.labels);
  }, [showLgaNames]);

  const draw = () => {
    const m = mapRef.current;
    if (!m) return;
    const { L, group, map } = m;
    group.clearLayers();
    const icon = (html: string, px: number, cls = 'mk') => L.divIcon({ className: cls, html, iconSize: [px, px], iconAnchor: [px / 2, px / 2] });
    for (const c of data.cov.circles) {
      const sid = c.id.split('-').slice(1, -1).join('-');
      if (sel?.kind === 'station' && !layers.has('coverage') && sid !== sel.id) continue;
      L.circle([c.lat, c.lng], { radius: c.radius, color: c.color, weight: 1, fillOpacity: 0.08, opacity: related && !related.has(`station:${sid}`) ? 0.15 : 0.5 }).bindTooltip(esc(c.label)).addTo(group);
    }
    for (const r of data.routes) {
      const color = agency(r.stationId)?.kind === 'corps' ? '#15803D' : '#1D4ED8';
      L.polyline(r.points, { color, weight: 3, dashArray: '8 6', opacity: related && !related.has(`route:${r.id}`) ? 0.2 : 0.85 }).bindTooltip(`${esc(r.name)} · approximate route`).addTo(group);
    }
    for (const h of data.hot) L.circle([h.lat, h.lng], { radius: h.radius, color: '#D92D20', weight: 0, fillOpacity: 0.18 }).bindTooltip(esc(h.label)).addTo(group);
    for (const b of data.bubbles) L.marker([b.lat, b.lng], { icon: L.divIcon({ className: 'count-bubble', html: String(b.n), iconSize: [30, 30] }), keyboard: false }).bindTooltip(esc(b.label)).addTo(group);
    for (const h of data.hospitals) L.marker([h.lat, h.lng], { icon: icon(hospitalHtml, 18, 'mk mk-place'), keyboard: false, title: h.name }).bindPopup(`<div class="mp"><b>${esc(h.name)}</b><div class="tiny">Reference point · ${esc(lgaOf(h.lgaId).name)}</div></div>`).addTo(group);
    for (const st of data.stations) {
      const vchips = st.vehicles?.chips.map((c) => `<span class="vchip" style="--c:${VEHICLE_STATUS_COLOR[c.status]}" title="${VEHICLE_STATUS_LABEL[c.status]}">${esc(c.callSign)}</span>`).join('') ?? '';
      const link = me.role === 'admin' || kind === 'coord' ? `<a href="#/admin/station/${st.id}">View station</a>` : me.agencyId === st.id && isManagerOf(me, st.id) ? `<a href="#/officers?tab=vehicles">My officers</a>` : '';
      const popup = `<div class="mp mp-station"><b>${esc(st.name)}</b>${st.live ? '' : ' <span class="tiny">(setting up)</span>'}<div class="tiny">Readiness ${st.readiness}/4 · Commander: ${esc(st.commander ?? '—')}</div><div>Officers on duty: <b>${st.onDuty}/${st.officers}</b></div>${st.vehicles ? `<div>Vehicles available: <b>${st.vehicles.available}/${st.vehicles.total}</b></div><div class="vchips">${vchips}</div>` : ''}<div>Open cases: ${st.openCases}</div>${link}</div>`;
      L.marker([st.lat, st.lng], { icon: L.divIcon({ className: `mk${dim(`station:${st.id}`)}`, html: stationHtml(st.letter, st.color, st.warning), iconSize: [26, 30], iconAnchor: [13, 26] }), keyboard: false, title: st.short })
        .bindPopup(popup)
        .on('click', () => setSel({ kind: 'station', id: st.id }))
        .addTo(group);
    }
    for (const cp of data.checkpoints) {
      const mayClose = (canAddCheckpoint && (me.agencyId === cp.stationId || me.role === 'ops_manager')) && cp.state !== 'closed';
      const popup = `<div class="mp mp-cp"><b>${esc(cp.name)}</b><div class="tiny">${esc(cp.road)} · ${cp.kind} · ${esc(cp.station)}</div><div>${cp.state === 'scheduled' ? 'Starts' : 'Active since'} ${fmtTimeWat(cp.activeFrom)}${cp.activeTo ? ` · until ${fmtTimeWat(cp.activeTo)}` : ''}</div><div>On post: ${cp.staff.length ? cp.staff.map((p) => `${esc(p.rank ?? '')} ${esc(p.name)}`).join(', ') : '—'}</div><div>Cases within 1 km in the last 7 days: <b>${cp.casesNearby}</b></div>${mayClose ? `<button class="btn sm" data-act="cpclose" data-id="${cp.id}">Close checkpoint</button>` : ''}</div>`;
      L.marker([cp.lat, cp.lng], { icon: icon(checkpointHtml(cp.kind, cp.state), 18, `mk mk-cpwrap${dim(`checkpoint:${cp.id}`)}`), keyboard: false, title: cp.name })
        .bindPopup(popup)
        .on('click', () => setSel({ kind: 'checkpoint', id: cp.id }))
        .addTo(group);
    }
    for (const u of data.units) L.marker([u.lat, u.lng], { icon: icon(unitHtml(u.mode, u.color, u.heading), 18, `mk${related ? ' dim' : ''}`), keyboard: false }).bindTooltip(esc(u.label)).addTo(group);
    for (const l of data.lines) L.polyline([[l.from.lat, l.from.lng], [l.to.lat, l.to.lng]], { color: '#D92D20', weight: 3, dashArray: '6 6' }).bindTooltip(esc(l.label)).addTo(group);
    if (data.line) {
      L.polyline([[data.line.officer.lat, data.line.officer.lng], [data.line.to.lat, data.line.to.lng]], { color: '#1D4ED8', weight: 3, dashArray: '6 6' }).addTo(group);
      const o = data.line.officer;
      const deg = (Math.atan2((data.line.to.lng - o.lng) * Math.cos((o.lat * Math.PI) / 180), data.line.to.lat - o.lat) * 180) / Math.PI;
      L.marker([o.lat, o.lng], { icon: icon(unitHtml('enroute', '#1D4ED8', deg), 18), keyboard: false }).bindTooltip('Holding officer (en route)').addTo(group);
    }
    if (data.self) L.marker([data.self.lat, data.self.lng], { icon: L.divIcon({ className: 'unit-mk self', html: '', iconSize: [18, 18] }), keyboard: false }).bindTooltip('You').addTo(group);
    // breadcrumb of the selected vehicle
    if (trail.length > 1) L.polyline(trail.map((p) => [p.lat, p.lng] as [number, number]), { color: '#F79009', weight: 3, dashArray: '2 6', opacity: 0.85, className: 'trail' }).addTo(group);
    for (const p of clustered.singles) {
      const popup = `<div class="mp"><b class="mono">${esc(p.ref)}</b><div>${esc(p.type)}</div><span class="pill ${p.tone}">${esc(p.status)}</span><div class="mp-holder">With: ${esc(p.holder)}</div><a href="#/case/${p.caseId}">View case</a></div>`;
      const px = SIZE_PX(p.r);
      const extra = p.pulse ? ' mk-pulse' : '';
      L.marker([p.lat, p.lng], { icon: icon(pinHtml(p.shape, p.color, px), px + 6, `mk${extra}${dim(`case:${p.caseId}`)}`), alt: p.kind === 'restricted' ? 'Restricted case' : `${p.ref} ${p.status}` })
        .bindPopup(popup)
        .bindTooltip(p.kind === 'restricted' ? 'Restricted (approximate location)' : esc(p.ref))
        .on('click', () => setSel({ kind: 'case', id: p.caseId }))
        .addTo(group);
    }
    for (const c of clustered.clusters)
      L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'cluster-mk', html: `<span style="--c:${CLUSTER_COLOR(c.worst)}">${c.n}</span>`, iconSize: [34, 34] }), keyboard: false, title: `${c.n} cases — click to zoom in` })
        .on('click', () => map.setView([c.lat, c.lng], Math.min(map.getZoom() + 2, 13)))
        .addTo(group);
    // Vehicles last, on top. Lines to their case when it is selected or they are selected.
    const selCase = sel?.kind === 'case' ? sel.id : undefined;
    for (const v of data.vehicles) {
      const target = v.caseId ? getState().incidents.find((i) => i.id === v.caseId) : undefined;
      if (target && (sel?.id === v.id || selCase === v.caseId || focus)) L.polyline([[v.lat, v.lng], [target.lat, target.lng]], { color: v.color, weight: 3, dashArray: '4 6' }).addTo(group);
      const moving = v.status === 'patrolling' || v.status === 'responding';
      const passLink = selCase && control && canDispatch({ status: v.status, crewIds: v.crew.map((c) => c.id) } as never) ? `<a class="btn sm primary" href="#/case/${selCase}?pass=${v.id}">Pass this case to ${esc(v.callSign)}</a>` : '';
      const mine = me.role === 'supervisor' && me.agencyId === v.stationId;
      const actions = mine
        ? v.status === 'out_of_service'
          ? `<button class="btn sm" data-act="back" data-id="${v.id}">Back in service</button>`
          : v.status === 'available' || v.status === 'patrolling'
            ? `<div class="tiny">Out of service:</div><div class="row">${['No fuel', 'Under repair', 'No crew', 'Accident'].map((r) => `<button class="btn sm" data-act="oos" data-id="${v.id}" data-reason="${r}">${r}</button>`).join('')}</div>`
            : ''
        : '';
      const popup = `<div class="mp mp-veh"><b>${esc(v.callSign)}</b> <span class="tiny">${VEHICLE_KIND_LABEL[v.kind]} · ${esc(v.station)}</span><div><span class="vstatus" style="--c:${v.color}">${VEHICLE_STATUS_LABEL[v.status]}${v.statusReason ? ` — ${esc(v.statusReason)}` : ''}</span></div>${v.caseRef ? `<div>Case <a href="#/case/${v.caseId}">${esc(v.caseRef)}</a>${v.etaMin != null ? ` · ETA ${v.etaMin} min` : ''}</div>` : ''}${v.route ? `<div class="tiny">Route: ${esc(v.route)} (approximate)</div>` : ''}<div class="tiny">Crew: ${v.crew.length ? v.crew.map((c) => `${esc(c.rank ?? '')} ${esc(c.name)}`).join(', ') : 'none'}</div>${passLink}${actions}</div>`;
      L.marker([v.lat, v.lng], { icon: icon(vehicleHtml(v.callSign, v.kind, v.color, v.heading, moving), 26, `mk mk-vwrap${v.status === 'out_of_service' ? ' oos' : ''}${dim(`vehicle:${v.id}`)}${sel?.id === v.id ? ' selected' : ''}`), keyboard: false, title: `${v.callSign} — ${VEHICLE_STATUS_LABEL[v.status]}`, zIndexOffset: 500 })
        .bindPopup(popup)
        .on('click', () => setSel({ kind: 'vehicle', id: v.id }))
        .addTo(group);
    }
    // Report flows: one draggable pin.
    if (picker?.lat != null && picker.lng != null) {
      const pin = L.marker([picker.lat, picker.lng], { draggable: true, autoPan: true, icon: L.divIcon({ className: 'pick-pin', html: '<span></span>', iconSize: [30, 42], iconAnchor: [15, 40] }), alt: picker.label ?? 'Report location — drag to move', title: picker.label ?? 'Drag to move' }).addTo(group);
      pin.on('dragend', () => {
        const ll = pin.getLatLng();
        pickRef.current?.onPick(ll.lat, ll.lng);
      });
      m.pin = pin;
    }
  };
  useEffect(draw, [data, picker?.lat, picker?.lng, zoom, sel, trail.length, related]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new location from "Use my location" re-centres the map on the pin.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || picker?.lat == null || picker.lng == null) return;
    if (!m.map.getBounds().pad(-0.2).contains([picker.lat, picker.lng])) {
      programmatic.current = true;
      m.map.setView([picker.lat, picker.lng], Math.max(m.map.getZoom(), 15));
      setTimeout(() => (programmatic.current = false), 400);
    }
  }, [picker?.lat, picker?.lng]);

  const groups = (['Incidents', 'Resources', 'Places'] as const).map((g) => ({
    g,
    items: LAYERS.filter((l) => l.group === g).filter((l) => (l.id !== 'units' || unitScope(me)) && (!['vehicles', 'checkpoints'].includes(l.id) || vehicleScope(me) !== 'none') && (l.id !== 'routes' || ['all', 'station', 'own'].includes(vehicleScope(me))) && (l.id !== 'hospitals' || !!res?.hospitals.length)),
  }));
  const count = (l: Layer) =>
    l === 'incidents' ? data.pins.length || incidentPins(me, shown).length : l === 'stations' ? res?.stations.length : l === 'vehicles' ? (res?.vehicleCounts ? res.vehicleCounts.reduce((n, x) => n + x.total, 0) : res?.vehicles.length) : l === 'checkpoints' ? (res?.checkpointCounts ? res.checkpointCounts.reduce((n, x) => n + x.n, 0) : res?.checkpoints.filter((c) => c.state === 'active').length) : l === 'units' ? unitMarkers(me, at).length : undefined;
  const showPanel = !!(panel || wall) && !!res && !picker;
  const q = search.trim().toLowerCase();
  const vlist = (res?.vehicles ?? []).filter((v) => (!vfilter || v.status === vfilter) && (!q || `${v.callSign} ${v.station}`.toLowerCase().includes(q)));
  const clist = (res?.checkpoints ?? []).filter((c) => c.state === 'active' && (!q || `${c.name} ${c.station} ${c.road}`.toLowerCase().includes(q)));
  const slist = q ? (res?.stations ?? []).filter((x) => `${x.short} ${x.name}`.toLowerCase().includes(q)) : [];
  const summary = vehicleSummary(res?.vehicles ?? []);

  const resources = showPanel && (
    <div className={`res-panel${sheetOpen ? ' open' : ''}`} aria-label="Resources">
      <div className="rp-head row between">
        <b>Resources</b>
        <button type="button" className="btn ghost sm rp-close" onClick={() => setSheetOpen(false)} aria-label="Close resources">
          ✕
        </button>
      </div>
      <label className="searchbox rp-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const v = vlist[0];
            const c = clist[0];
            const st = slist[0];
            if (v) (setSel({ kind: 'vehicle', id: v.id }), flyTo(v.lat, v.lng));
            else if (c) (setSel({ kind: 'checkpoint', id: c.id }), flyTo(c.lat, c.lng));
            else if (st) (setSel({ kind: 'station', id: st.id }), flyTo(st.lat, st.lng, 12));
          }}
          placeholder="Find call sign, checkpoint or station"
          aria-label="Find call sign, checkpoint or station"
        />
      </label>
      {res?.vehicleCounts ? (
        <div className="rp-sec">
          <div className="rp-title">Vehicles by station (counts only)</div>
          <ul className="rp-list">
            {res.vehicleCounts.map((c) => (
              <li key={c.stationId} data-kind="vehicle-count">
                {`${c.station}: ${c.available} of ${c.total} available${c.out ? ` · ${c.out} out of service` : ''}`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="rp-summary" data-kind="vehicle-summary">
            {'Vehicles: '}
            {summary.map((x, k) => (
              <span key={x.status}>
                {k > 0 && ' · '}
                <button type="button" className={`link-btn${vfilter === x.status ? ' on' : ''}`} onClick={() => setVfilter(vfilter === x.status ? '' : x.status)} aria-pressed={vfilter === x.status}>
                  {`${x.n} ${x.label.toLowerCase()}`}
                </button>
              </span>
            ))}
          </div>
          <div className="rp-sec">
            <div className="rp-title">{`Vehicles (${vlist.length})`}</div>
            <ul className="rp-list">
              {vlist.map((v) => (
                <li key={v.id}>
                  <button type="button" className={`rp-row${sel?.id === v.id ? ' on' : ''}`} onClick={() => (setSel({ kind: 'vehicle', id: v.id }), flyTo(v.lat, v.lng), setSheetOpen(false))}>
                    <b className="mono">{v.callSign}</b>
                    <span className="tiny muted">{v.station}</span>
                    <span className="vstatus" style={{ ['--c' as string]: v.color }}>
                      {VEHICLE_STATUS_LABEL[v.status]}
                    </span>
                    <span className="tiny">{v.caseRef ? `${v.caseRef}${v.etaMin != null ? ` · ETA ${v.etaMin} min` : ''}` : v.statusReason ?? v.route ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {res?.checkpointCounts ? (
        <div className="rp-sec">
          <div className="rp-title">Active checkpoints by LGA (counts only)</div>
          <ul className="rp-list">
            {res.checkpointCounts.map((c) => (
              <li key={c.lgaId} data-kind="checkpoint-count">{`${c.lga}: ${c.n}`}</li>
            ))}
          </ul>
        </div>
      ) : (
        !!clist.length && (
          <div className="rp-sec">
            <div className="rp-title">{`Checkpoints active (${clist.length})`}</div>
            <ul className="rp-list">
              {clist.map((c) => (
                <li key={c.id}>
                  <button type="button" className="rp-row" onClick={() => (setSel({ kind: 'checkpoint', id: c.id }), flyTo(c.lat, c.lng))}>
                    <b>{c.name}</b>
                    <span className="tiny muted">{`${c.station} · ${c.staff.length} on post`}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
      {!!slist.length && (
        <div className="rp-sec">
          <div className="rp-title">Stations</div>
          <ul className="rp-list">
            {slist.map((x) => (
              <li key={x.id}>
                <button type="button" className="rp-row" onClick={() => (setSel({ kind: 'station', id: x.id }), flyTo(x.lat, x.lng, 12))}>
                  <b>{x.short}</b>
                  <span className="tiny muted">{x.vehicles ? `${x.vehicles.available}/${x.vehicles.total} vehicles available` : `${x.onDuty}/${x.officers} on duty`}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className={`livemap${wall ? ' is-wall' : ''}${base === 'dark' ? ' base-dark' : ''}`}>
      {controls && !wall && (
        <div className="map-controls">
          <div className="seg" role="group" aria-label="Time window">
            {(['24h', '7d', '30d'] as TimeWin[]).map((t) => (
              <button key={t} className={win === t ? 'on' : ''} onClick={() => setWin(t)} aria-pressed={win === t}>
                {t === '24h' ? 'Last 24 h' : t === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
          {showPanel && control && (
            <button type="button" className="btn sm" onClick={() => setWallOpen(true)} aria-label="Open the wall view (full screen)">
              <Icon name="expand" size={15} /> Wall view
            </button>
          )}
          {showPanel && (
            <button type="button" className="btn sm res-btn" onClick={() => setSheetOpen(true)} aria-label="Open the resources panel">
              <Icon name="list" size={15} /> Resources
            </button>
          )}
        </div>
      )}
      {offline && <div className="map-offline">Map tiles unavailable — showing positions only</div>}
      <div className={`map-box${showPanel ? ' with-panel' : ''}`}>
        {resources}
        <div className="map-main">
          <div ref={elRef} className={`map-el${offline ? ' fallback' : ''}${zoom < 9 ? ' z-small' : ''}`} style={{ height }} role="region" aria-label={picker ? picker.label ?? 'Map — move the pin to the exact place' : 'Live map'} />
          {controls && !picker && (
            <div className={`layer-panel${layerOpen ? ' open' : ''}`}>
              <button type="button" className="btn sm lp-toggle" onClick={() => setLayerOpen(!layerOpen)} aria-expanded={layerOpen} aria-label="Map layers">
                <Icon name="layers" size={15} /> Layers
              </button>
              <div className="lp-body" role="group" aria-label="Map layers">
                {groups
                  .filter((g) => g.items.length)
                  .map(({ g, items }) => (
                    <div key={g} className="lp-group">
                      <div className="lp-title">{g}</div>
                      {items.map((l) => (
                        <label key={l.id} className="lp-item">
                          <input type="checkbox" checked={layers.has(l.id)} onChange={() => toggle(l.id)} aria-label={`${l.id === 'incidents' ? 'Incidents' : l.label} layer`} />
                          <span>{l.label}</span>
                          {count(l.id) != null && <span className="lp-n">{count(l.id)}</span>}
                        </label>
                      ))}
                    </div>
                  ))}
                <div className="lp-group">
                  <div className="lp-title">Base map</div>
                  <div className="seg lp-base" role="group" aria-label="Base map">
                    {BASES.map((b) => (
                      <button key={b.id} type="button" className={base === b.id ? 'on' : ''} aria-pressed={base === b.id} onClick={() => savePrefs({ base: b.id })} disabled={wall}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {!picker && (
            <div className="map-view-btns">
              <button type="button" className="btn sm" onClick={() => fit(STATE_BOUNDS())} aria-label="Zoom out to the whole state" title="Whole state">
                <Icon name="expand" size={16} /> Whole state
              </button>
              <button type="button" className="btn sm" onClick={resetView} aria-label={`Reset view to ${home?.label ?? 'the default'}`} title={`Reset view — ${home?.label ?? ''}`}>
                <Icon name="locate" size={16} /> Reset view
              </button>
            </div>
          )}
          {legend.length > 0 && (
            <>
              <details className="map-legend" open={!focus && !wall}>
                <summary aria-label="Map legend">
                  <Icon name="layers" size={14} /> Legend
                </summary>
                <Legend sections={legend} />
              </details>
              <button type="button" className="btn sm legend-btn" onClick={() => setLegendSheet(true)} aria-label="Open the map legend">
                <Icon name="layers" size={16} /> Legend
              </button>
            </>
          )}
        </div>
      </div>
      {wall && <Ticker />}
      {legendSheet && (
        <Sheet title="Map legend" onClose={() => setLegendSheet(false)}>
          <Legend sections={legend} />
        </Sheet>
      )}
      {cpAt && <CheckpointSheet at={cpAt} onClose={() => setCpAt(undefined)} />}
      {wallOpen && (
        <div className="wall-view" role="dialog" aria-modal aria-label="Wall view">
          <button type="button" className="btn sm wall-exit" onClick={() => setWallOpen(false)} aria-label="Exit the wall view (Esc)">
            ✕ Exit wall view (Esc)
          </button>
          <LiveMap rows={rows} context={context} wall height="calc(100vh - 44px)" page="wall" />
        </div>
      )}
      <div className="map-foot">
        <span>
          {data.pins.length} on map{data.bubbles.length ? ` · ${data.bubbles.reduce((n, b) => n + b.n, 0)} security (counts only)` : ''}
          {data.units.length ? ` · ${data.units.length} officers` : ''}
          {data.vehicles.length ? ` · ${data.vehicles.length} vehicles` : ''}
          {data.cov.circles.length ? ' · Approximate coverage' : ''}
          {home && !picker ? ` · Opens on: ${home.label}` : ''}
        </span>
        <span className="map-updated">{`Last updated ${fmtTimeWat(at)}`}</span>
        <span>{`${(BASES.find((b) => b.id === base) ?? BASES[0]).attribution} · simulated positions`}</span>
      </div>
      {/* Text version of what is plotted (screen readers, tests). */}
      <ul className="map-items" hidden>
        {home && !picker && <li data-kind="view" data-bounds={home.bounds.flat().map((x) => x.toFixed(4)).join(',')}>{home.label}</li>}
        <li data-kind="base" data-base={base}>
          {base}
        </li>
        {data.pins.map((p) => (
          <li key={p.id} data-kind={p.kind} data-shape={p.shape} data-case={p.caseId} data-lat={p.lat.toFixed(4)} data-lng={p.lng.toFixed(4)}>
            {p.kind === 'restricted' ? 'Restricted' : `${p.ref} ${p.type}`}
          </li>
        ))}
        {clustered.clusters.map((c) => (
          <li key={c.id} data-kind="cluster" data-n={c.n}>
            {`${c.n} cases`}
          </li>
        ))}
        {data.bubbles.map((b) => (
          <li key={b.id} data-kind="count">
            {b.label}
          </li>
        ))}
        {data.hot.map((h) => (
          <li key={h.id} data-kind="hotspot">
            {h.label}
          </li>
        ))}
        {data.cov.circles.map((c) => (
          <li key={c.id} data-kind="coverage">
            {c.label}
          </li>
        ))}
        {data.stations.map((c) => (
          <li key={c.id} data-kind="station" data-letter={c.letter} data-warning={c.warning ?? ''}>
            {`${c.short}${c.vehicles ? ` · ${c.vehicles.available}/${c.vehicles.total} vehicles available` : ''} · ${c.onDuty}/${c.officers} on duty`}
          </li>
        ))}
        {data.vehicles.map((v) => (
          <li key={v.id} data-kind="vehicle" data-call={v.callSign} data-status={v.status} data-lat={v.lat.toFixed(4)} data-lng={v.lng.toFixed(4)}>
            {`${v.callSign} ${VEHICLE_STATUS_LABEL[v.status]}${v.etaMin != null ? ` ETA ${v.etaMin} min` : ''}`}
          </li>
        ))}
        {(data.vehicleCounts ?? []).map((c) => (
          <li key={c.stationId} data-kind="vehicle-count">{`${c.station}: ${c.available}/${c.total}`}</li>
        ))}
        {data.checkpoints.map((c) => (
          <li key={c.id} data-kind="checkpoint" data-cp-kind={c.kind} data-state={c.state}>
            {c.name}
          </li>
        ))}
        {(data.checkpointCounts ?? []).map((c) => (
          <li key={c.lgaId} data-kind="checkpoint-count">{`${c.lga}: ${c.n}`}</li>
        ))}
        {data.routes.map((r) => (
          <li key={r.id} data-kind="route">
            {r.name}
          </li>
        ))}
        {data.hospitals.map((h) => (
          <li key={h.id} data-kind="hospital">
            {h.name}
          </li>
        ))}
        {trail.length > 0 && <li data-kind="trail" data-n={trail.length}>breadcrumb</li>}
        {data.units.map((u) => (
          <li key={u.id} data-kind={`unit-${u.mode}`} data-lat={u.lat.toFixed(4)} data-lng={u.lng.toFixed(4)} data-heading={u.heading ?? ''}>
            {u.label}
          </li>
        ))}
        {data.lines.map((l) => (
          <li key={l.id} data-kind="sos-line">
            {l.label}
          </li>
        ))}
        {data.line && <li data-kind="officer-line">Holding officer {data.line.km.toFixed(1)} km away</li>}
      </ul>
    </div>
  );
}

/** Wall view ticker: the latest 5 key events, following the demo clock. */
function Ticker() {
  const s = useStore((x) => x);
  const at = useNow(5000);
  const ev = tickerEvents(s, at, 5);
  return (
    <div className="ticker" aria-live="polite" aria-label="Latest events">
      {ev.map((e) => (
        <span key={e.seq} className="tk-item">
          {`${fmtTimeWat(e.at).replace(' WAT', '')} · ${e.text}`}
        </span>
      ))}
    </div>
  );
}

const DURATIONS: [string, number | undefined][] = [
  ['2 h', 2],
  ['4 h', 4],
  ['8 h', 8],
  ['Until closed', undefined],
];
/** "Add checkpoint here" from the map (commanders: their station; the duty lead: any police or Amotekun station). */
function CheckpointSheet({ at, onClose }: { at: { lat: number; lng: number }; onClose: () => void }) {
  const me = persona();
  const lead = me.role === 'ops_manager';
  const stations = dep.agencies.filter((a) => ['police', 'corps'].includes(a.kind) && (lead || a.id === me.agencyId));
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [name, setName] = useState('Stop-and-search');
  const [road, setRoad] = useState('');
  const [kind, setKind] = useState<CheckpointKind>('temporary');
  const [hours, setHours] = useState<number | undefined>(4);
  const [startIn, setStartIn] = useState(0);
  const [staff, setStaff] = useState<string[]>([]);
  const officers = dep.people.filter((p) => p.agencyId === stationId && p.role === 'officer' && (p.staffStatus ?? 'active') === 'active');
  return (
    <Sheet title="Add checkpoint here" onClose={onClose}>
      <div className="stack lg">
        <p className="small muted">{`${at.lat.toFixed(4)}, ${at.lng.toFixed(4)} · audited and posted in the station chat`}</p>
        {stations.length > 1 && (
          <label className="field">
            <span>Station</span>
            <select className="input" value={stationId} onChange={(e) => (setStationId(e.target.value), setStaff([]))}>
              {stations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.short}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid g2">
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Road</span>
            <input className="input" value={road} onChange={(e) => setRoad(e.target.value)} placeholder="e.g. Bodija–Sango road" />
          </label>
          <label className="field">
            <span>Kind</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as CheckpointKind)}>
              <option value="temporary">Temporary (stop-and-search)</option>
              <option value="joint">Joint Police + Amotekun</option>
              <option value="permanent">Permanent</option>
            </select>
          </label>
          <label className="field">
            <span>Starts</span>
            <select className="input" value={startIn} onChange={(e) => setStartIn(Number(e.target.value))}>
              <option value={0}>Now</option>
              <option value={30}>In 30 min</option>
              <option value={60}>In 1 h</option>
            </select>
          </label>
        </div>
        <div className="field">
          <span>Duration</span>
          <div className="seg" role="group" aria-label="Duration">
            {DURATIONS.map(([l, h]) => (
              <button key={l} type="button" className={hours === h ? 'on' : ''} aria-pressed={hours === h} onClick={() => setHours(h)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <fieldset className="field">
          <legend>Staff on post</legend>
          <div className="opts">
            {officers.map((p) => (
              <label key={p.id} className={`pick${staff.includes(p.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={staff.includes(p.id)} onChange={(e) => setStaff(e.target.checked ? [...staff, p.id] : staff.filter((x) => x !== p.id))} /> {`${p.rank ?? ''} ${p.name}`}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn primary lg block" disabled={!name.trim() || !road.trim()} onClick={() => run(fleet.addCheckpoint({ stationId, name, road, kind, lat: at.lat, lng: at.lng, hours, startAt: startIn ? now() + startIn * 60_000 : undefined, staffIds: staff }), 'Checkpoint set up. Posted in the station chat.') && onClose()}>
          Set up checkpoint
        </button>
      </div>
    </Sheet>
  );
}

function Mark({ it }: { it: LegendItem }) {
  if (it.mark === 'letter')
    return (
      <span className="lg-mark lg-station" style={{ ['--c' as string]: it.color }}>
        <b>{it.letter}</b>
      </span>
    );
  return <span className={`lg-mark lg-${it.mark}`} style={{ ['--c' as string]: it.color }} aria-hidden />;
}

export function Legend({ sections }: { sections: LegendSection[] }) {
  return (
    <div className="legend-body">
      {sections.map((sec) => (
        <div key={sec.title} className="lg-sec">
          <div className="lg-title">{sec.title}</div>
          <ul>
            {sec.items.map((it) => (
              <li key={it.label}>
                <Mark it={it} />
                <span>{it.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
