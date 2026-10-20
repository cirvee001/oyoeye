import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Incident } from '../platform/types';
import { LAYERS, coverageShapes, countBubbles, defaultLayers, focusLine, hotspotCircles, incidentPins, recent, sosLines, unitMarkers, unitScope, type Layer, type TimeWin } from '../mapdata';
import { dep, persona, setMapPrefs, useStore } from '../store';
import { useNow } from '../ui';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const OYO_BOUNDS: [[number, number], [number, number]] = [
  [dep.bounds.minLat, dep.bounds.minLng],
  [dep.bounds.maxLat, dep.bounds.maxLng],
];

export interface LiveMapProps {
  /** Incidents to plot (already filtered by the page: tab, filter, search). */
  rows: Incident[];
  /** Incidents used for the Hotspots layer (defaults to rows). */
  context?: Incident[];
  height?: number | string;
  /** Show layer and time chips. */
  controls?: boolean;
  /** Case page / field map: one incident and its holding officer. */
  focus?: Incident;
  /** Field map: the signed-in officer's own position. */
  selfId?: string;
  picker?: { lat?: number; lng?: number; onPick: (lat: number, lng: number) => void };
}

/**
 * Live map: Leaflet + OpenStreetMap tiles, with a plain offline fallback.
 * Leaflet is loaded lazily in the browser, so the page (and server render) works without it.
 */
export function LiveMap({ rows, context, height = 460, controls = true, focus, selfId, picker }: LiveMapProps) {
  const me = persona();
  const at = useNow(5000);
  const prefs = useStore((s) => s.mapPrefs[s.signedInId ?? 'guest']);
  useStore((s) => s.incidents);
  const layers = new Set<Layer>((prefs?.layers as Layer[] | undefined) ?? defaultLayers(me));
  const win: TimeWin = prefs?.time ?? '7d';
  const [offline, setOffline] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: typeof Leaflet; map: Leaflet.Map; group: Leaflet.LayerGroup; labels: Leaflet.LayerGroup } | null>(null);

  const toggle = (l: Layer) => {
    const next = new Set(layers);
    if (next.has(l)) next.delete(l);
    else next.add(l);
    setMapPrefs({ layers: [...next], time: win });
  };
  const setWin = (t: TimeWin) => setMapPrefs({ layers: [...layers], time: t });

  const shown = focus ? [focus] : recent(rows, win, at);
  const data = useMemo(() => {
    const ctx = focus ? [] : recent(context ?? rows, win, at);
    return {
      pins: layers.has('incidents') || focus ? incidentPins(me, shown) : [],
      bubbles: layers.has('incidents') && !focus ? countBubbles(me, shown) : [],
      hot: layers.has('hotspots') && !focus ? hotspotCircles(me, ctx) : [],
      cov: layers.has('coverage') && !focus ? coverageShapes() : { circles: [], stations: [] },
      units: layers.has('units') && !focus ? unitMarkers(me, at) : [],
      lines: sosLines(focus ? [focus] : shown),
      line: focus ? focusLine(focus, at) : undefined,
      self: selfId ? unitMarkers({ ...me, role: 'ops_manager', agencyId: dep.agencies.find((a) => a.kind === 'control_room')!.id }, at).find((u) => u.personId === selfId) : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((i) => i.id + i.status).join(), [...layers].join(), win, Math.floor(at / 15000), focus?.id, selfId, me.id]);

  // Create the map once (browser only).
  useEffect(() => {
    let dead = false;
    let timer = 0;
    let resize: ResizeObserver | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !elRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true, attributionControl: true, maxBounds: [[5.5, 1.5], [10.5, 6]] });
      map.fitBounds(OYO_BOUNDS);
      let loaded = false;
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' });
      tiles.on('tileload', () => (loaded = true));
      tiles.addTo(map);
      const goOffline = () => {
        if (dead) return;
        map.removeLayer(tiles);
        setOffline(true);
      };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) goOffline();
      // If no tile arrives within 4 s, fall back to a plain base with LGA labels.
      timer = window.setTimeout(() => !loaded && goOffline(), 4000);
      const labels = L.layerGroup().addTo(map);
      const group = L.layerGroup().addTo(map);
      if (picker) map.on('click', (e: Leaflet.LeafletMouseEvent) => picker.onPick(e.latlng.lat, e.latlng.lng));
      mapRef.current = { L, map, group, labels };
      draw();
      // Leaflet measures its box once; re-measure when a modal or tab gives it its real size.
      resize = new ResizeObserver(() => map.invalidateSize());
      resize.observe(elRef.current);
    })();
    return () => {
      dead = true;
      resize?.disconnect();
      clearTimeout(timer);
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LGA labels at their centroids in the offline fallback.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.labels.clearLayers();
    if (!offline) return;
    for (const l of dep.lgas) m.L.marker([l.lat, l.lng], { interactive: false, icon: m.L.divIcon({ className: 'lga-tag', html: esc(l.name), iconSize: [110, 16], iconAnchor: [55, 8] }) }).addTo(m.labels);
  }, [offline]);

  const draw = () => {
    const m = mapRef.current;
    if (!m) return;
    const { L, group, map } = m;
    group.clearLayers();
    for (const c of data.cov.circles) L.circle([c.lat, c.lng], { radius: c.radius, color: c.color, weight: 1, fillOpacity: 0.08, opacity: 0.5 }).bindTooltip(esc(c.label)).addTo(group);
    for (const s of data.cov.stations) L.circleMarker([s.lat, s.lng], { radius: 6, color: '#fff', weight: 2, fillColor: s.color, fillOpacity: 1 }).bindTooltip(esc(s.label)).addTo(group);
    for (const h of data.hot) L.circle([h.lat, h.lng], { radius: h.radius, color: '#D92D20', weight: 0, fillOpacity: 0.18 }).bindTooltip(esc(h.label)).addTo(group);
    for (const b of data.bubbles) L.marker([b.lat, b.lng], { icon: L.divIcon({ className: 'count-bubble', html: String(b.n), iconSize: [30, 30] }) }).bindTooltip(esc(b.label)).addTo(group);
    for (const u of data.units) L.marker([u.lat, u.lng], { icon: L.divIcon({ className: `unit-mk ${u.mode}`, html: '', iconSize: [16, 16] }) }).bindTooltip(esc(u.label)).addTo(group);
    for (const l of data.lines) L.polyline([[l.from.lat, l.from.lng], [l.to.lat, l.to.lng]], { color: '#D92D20', weight: 3, dashArray: '6 6' }).bindTooltip(esc(l.label)).addTo(group);
    if (data.line) {
      L.polyline([[data.line.officer.lat, data.line.officer.lng], [data.line.to.lat, data.line.to.lng]], { color: '#1D4ED8', weight: 3, dashArray: '6 6' }).addTo(group);
      L.marker([data.line.officer.lat, data.line.officer.lng], { icon: L.divIcon({ className: 'unit-mk enroute', html: '', iconSize: [16, 16] }) }).bindTooltip('Holding officer (en route)').addTo(group);
    }
    if (data.self) L.marker([data.self.lat, data.self.lng], { icon: L.divIcon({ className: 'unit-mk self', html: '', iconSize: [18, 18] }) }).bindTooltip('You').addTo(group);
    for (const p of data.pins) {
      const popup = `<div class="mp"><b class="mono">${esc(p.ref)}</b><div>${esc(p.type)}</div><span class="pill ${p.tone}">${esc(p.status)}</span><div class="mp-holder">With: ${esc(p.holder)}</div><a href="#/case/${p.caseId}">View case</a></div>`;
      if (p.pulse) L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'sos-mk', html: '<span></span>', iconSize: [22, 22] }) }).bindPopup(popup).addTo(group);
      else L.circleMarker([p.lat, p.lng], { radius: p.r, color: '#fff', weight: 1.5, fillColor: p.color, fillOpacity: 0.95 }).bindPopup(popup).bindTooltip(p.kind === 'restricted' ? 'Restricted' : esc(p.ref)).addTo(group);
    }
    if (picker?.lat != null && picker.lng != null) L.marker([picker.lat, picker.lng], { icon: L.divIcon({ className: 'unit-mk self', html: '', iconSize: [18, 18] }) }).addTo(group);
    // Frame the focus case (and its officer) when there is one.
    if (focus) {
      const pts: [number, number][] = data.pins.map((p) => [p.lat, p.lng]);
      if (data.line) pts.push([data.line.officer.lat, data.line.officer.lng]);
      if (data.self) pts.push([data.self.lat, data.self.lng]);
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.6), { maxZoom: 15 });
    }
  };
  useEffect(draw, [data, picker?.lat, picker?.lng]);

  return (
    <div className="livemap">
      {controls && (
        <div className="map-controls">
          <div className="chips">
            {LAYERS.filter((l) => l.id !== 'units' || unitScope(me)).map((l) => (
              <button key={l.id} type="button" className={`chip${layers.has(l.id) ? ' on' : ''}`} onClick={() => toggle(l.id)} aria-pressed={layers.has(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="seg">
            {(['24h', '7d', '30d'] as TimeWin[]).map((t) => (
              <button key={t} className={win === t ? 'on' : ''} onClick={() => setWin(t)}>
                {t === '24h' ? 'Last 24 h' : t === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
        </div>
      )}
      {offline && <div className="map-offline">Map tiles unavailable — showing positions only</div>}
      <div ref={elRef} className={`map-el${offline ? ' fallback' : ''}`} style={{ height }} role="region" aria-label="Live map" />
      <div className="map-foot">
        <span>
          {data.pins.length} on map{data.bubbles.length ? ` · ${data.bubbles.reduce((n, b) => n + b.n, 0)} security (counts only)` : ''}
          {data.units.length ? ` · ${data.units.length} officers` : ''}
          {data.cov.circles.length ? ' · Approximate coverage' : ''}
        </span>
        <span>© OpenStreetMap contributors · simulated positions</span>
      </div>
      {/* Text version of what is plotted (screen readers, tests). */}
      <ul className="map-items" hidden>
        {data.pins.map((p) => (
          <li key={p.id} data-kind={p.kind} data-case={p.caseId} data-lat={p.lat.toFixed(4)} data-lng={p.lng.toFixed(4)}>
            {p.kind === 'restricted' ? 'Restricted' : `${p.ref} ${p.type}`}
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
        {data.units.map((u) => (
          <li key={u.id} data-kind={`unit-${u.mode}`} data-lat={u.lat.toFixed(4)} data-lng={u.lng.toFixed(4)}>
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
