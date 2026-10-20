import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Incident } from '../platform/types';
import { LAYERS, STATE_BOUNDS, coverageShapes, countBubbles, defaultLayers, defaultView, focusLine, hotspotCircles, incidentPins, legendFor, recent, sosLines, unitMarkers, unitScope, type Bounds, type Layer, type LegendItem, type LegendSection, type TimeWin } from '../mapdata';
import { dep, getState, persona, resetMapView, saveMapView, setMapPrefs, useStore } from '../store';
import { Icon, Sheet, useNow } from '../ui';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
  /** Report flows: a draggable pin; tapping the map moves it too. */
  picker?: { lat?: number; lng?: number; onPick: (lat: number, lng: number) => void; label?: string };
  /** Remembers the last view per user per page (defaults to the current route). */
  page?: string;
}

const routePage = () => (typeof location !== 'undefined' ? location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] : '') || 'home';

// ---- marker HTML: shapes as well as colours (PRD v2.5 §4) ----
const SIZE_PX = (r: number) => Math.round(r * 2.2 + 4);
function pinHtml(shape: string, color: string, px: number) {
  if (shape === 'triangle') return `<svg width="${px + 6}" height="${px + 6}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 23 21H1Z" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5M12 17h.01" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  if (shape === 'square') return `<span class="mk-sq" style="width:${px}px;height:${px}px;background:${color}"></span>`;
  if (shape === 'ring') return `<span class="mk-ring" style="--c:${color};width:${px}px;height:${px}px"></span>`;
  return `<span class="mk-dot" style="width:${px}px;height:${px}px;background:${color}"></span>`;
}
const stationHtml = (letter: string, color: string) => `<span class="mk-station" style="--c:${color}"><b>${letter}</b></span>`;
function unitHtml(mode: string, color: string, heading?: number) {
  if (mode === 'enroute') return `<span class="mk-arrow" style="--c:${color};transform:rotate(${heading ?? 0}deg)"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 21 12 16 4 21Z" fill="${color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></span>`;
  if (mode === 'onscene') return `<span class="mk-dotring" style="--c:${color}"><i></i></span>`;
  return `<span class="mk-unit" style="--c:${color}"></span>`;
}

/**
 * Live map: Leaflet + OpenStreetMap tiles, with a plain offline fallback.
 * Leaflet is loaded lazily in the browser, so the page (and server render) works without it.
 */
export function LiveMap({ rows, context, height = 460, controls = true, focus, selfId, picker, page }: LiveMapProps) {
  const me = persona();
  const at = useNow(5000);
  const prefs = useStore((s) => s.mapPrefs[s.signedInId ?? 'guest']);
  useStore((s) => s.incidents);
  const layers = new Set<Layer>((prefs?.layers as Layer[] | undefined) ?? defaultLayers(me));
  const win: TimeWin = prefs?.time ?? '7d';
  const [offline, setOffline] = useState(false);
  const [legendSheet, setLegendSheet] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: typeof Leaflet; map: Leaflet.Map; group: Leaflet.LayerGroup; labels: Leaflet.LayerGroup; pin?: Leaflet.Marker } | null>(null);
  const pageKey = picker ? undefined : (page ?? routePage()) + (focus ? ':case' : '');
  const programmatic = useRef(false);
  const pickRef = useRef(picker);
  pickRef.current = picker;

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

  const legend = picker ? [] : legendFor(me, focus ? [] : [...layers], { focus: !!focus });
  const home = picker ? (picker.lat != null && picker.lng != null ? undefined : { bounds: STATE_BOUNDS(), label: 'All of Oyo' }) : defaultView(me, { focus: focus ? { lat: focus.lat, lng: focus.lng } : undefined }, at);

  const fit = (b: Bounds) => {
    const m = mapRef.current;
    if (!m) return;
    programmatic.current = true;
    m.map.fitBounds(b);
    setTimeout(() => (programmatic.current = false), 400);
  };
  const resetView = () => {
    if (pageKey) resetMapView(pageKey);
    if (home) fit(home.bounds);
  };

  // Create the map once (browser only).
  useEffect(() => {
    let dead = false;
    let timer = 0;
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
      if (picker) map.on('click', (e: Leaflet.LeafletMouseEvent) => pickRef.current?.onPick(e.latlng.lat, e.latlng.lng));
      if (pageKey)
        map.on('moveend', () => {
          if (programmatic.current) return;
          const c = map.getCenter();
          saveMapView(pageKey, { lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5, zoom: map.getZoom() });
        });
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
    const { L, group } = m;
    group.clearLayers();
    const icon = (html: string, px: number, cls = 'mk') => L.divIcon({ className: cls, html, iconSize: [px, px], iconAnchor: [px / 2, px / 2] });
    for (const c of data.cov.circles) L.circle([c.lat, c.lng], { radius: c.radius, color: c.color, weight: 1, fillOpacity: 0.08, opacity: 0.5 }).bindTooltip(esc(c.label)).addTo(group);
    for (const s of data.cov.stations) L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'mk', html: stationHtml(s.letter, s.color), iconSize: [24, 30], iconAnchor: [12, 30] }), keyboard: false }).bindTooltip(esc(s.label)).addTo(group);
    for (const h of data.hot) L.circle([h.lat, h.lng], { radius: h.radius, color: '#D92D20', weight: 0, fillOpacity: 0.18 }).bindTooltip(esc(h.label)).addTo(group);
    for (const b of data.bubbles) L.marker([b.lat, b.lng], { icon: L.divIcon({ className: 'count-bubble', html: String(b.n), iconSize: [30, 30] }), keyboard: false }).bindTooltip(esc(b.label)).addTo(group);
    for (const u of data.units) L.marker([u.lat, u.lng], { icon: icon(unitHtml(u.mode, u.color, u.heading), 18), keyboard: false }).bindTooltip(esc(u.label)).addTo(group);
    for (const l of data.lines) L.polyline([[l.from.lat, l.from.lng], [l.to.lat, l.to.lng]], { color: '#D92D20', weight: 3, dashArray: '6 6' }).bindTooltip(esc(l.label)).addTo(group);
    if (data.line) {
      L.polyline([[data.line.officer.lat, data.line.officer.lng], [data.line.to.lat, data.line.to.lng]], { color: '#1D4ED8', weight: 3, dashArray: '6 6' }).addTo(group);
      const o = data.line.officer;
      const deg = (Math.atan2((data.line.to.lng - o.lng) * Math.cos((o.lat * Math.PI) / 180), data.line.to.lat - o.lat) * 180) / Math.PI;
      L.marker([o.lat, o.lng], { icon: icon(unitHtml('enroute', '#1D4ED8', deg), 18), keyboard: false }).bindTooltip('Holding officer (en route)').addTo(group);
    }
    if (data.self) L.marker([data.self.lat, data.self.lng], { icon: L.divIcon({ className: 'unit-mk self', html: '', iconSize: [18, 18] }), keyboard: false }).bindTooltip('You').addTo(group);
    for (const p of data.pins) {
      const popup = `<div class="mp"><b class="mono">${esc(p.ref)}</b><div>${esc(p.type)}</div><span class="pill ${p.tone}">${esc(p.status)}</span><div class="mp-holder">With: ${esc(p.holder)}</div><a href="#/case/${p.caseId}">View case</a></div>`;
      const px = SIZE_PX(p.r);
      const extra = p.pulse ? ' mk-pulse' : '';
      L.marker([p.lat, p.lng], { icon: icon(pinHtml(p.shape, p.color, px), px + 6, `mk${extra}`), alt: p.kind === 'restricted' ? 'Restricted case' : `${p.ref} ${p.status}` })
        .bindPopup(popup)
        .bindTooltip(p.kind === 'restricted' ? 'Restricted (approximate location)' : esc(p.ref))
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
  useEffect(draw, [data, picker?.lat, picker?.lng]);

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

  return (
    <div className="livemap">
      {controls && (
        <div className="map-controls">
          <div className="chips" role="group" aria-label="Map layers">
            {LAYERS.filter((l) => l.id !== 'units' || unitScope(me)).map((l) => (
              <button key={l.id} type="button" className={`chip${layers.has(l.id) ? ' on' : ''}`} onClick={() => toggle(l.id)} aria-pressed={layers.has(l.id)} aria-label={`${l.label} layer`}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Time window">
            {(['24h', '7d', '30d'] as TimeWin[]).map((t) => (
              <button key={t} className={win === t ? 'on' : ''} onClick={() => setWin(t)} aria-pressed={win === t}>
                {t === '24h' ? 'Last 24 h' : t === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
        </div>
      )}
      {offline && <div className="map-offline">Map tiles unavailable — showing positions only</div>}
      <div className="map-box">
        <div ref={elRef} className={`map-el${offline ? ' fallback' : ''}`} style={{ height }} role="region" aria-label={picker ? picker.label ?? 'Map — move the pin to the exact place' : 'Live map'} />
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
            <details className="map-legend" open={!focus}>
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
      {legendSheet && (
        <Sheet title="Map legend" onClose={() => setLegendSheet(false)}>
          <Legend sections={legend} />
        </Sheet>
      )}
      <div className="map-foot">
        <span>
          {data.pins.length} on map{data.bubbles.length ? ` · ${data.bubbles.reduce((n, b) => n + b.n, 0)} security (counts only)` : ''}
          {data.units.length ? ` · ${data.units.length} officers` : ''}
          {data.cov.circles.length ? ' · Approximate coverage' : ''}
          {home && !picker ? ` · Opens on: ${home.label}` : ''}
        </span>
        <span>© OpenStreetMap contributors · simulated positions</span>
      </div>
      {/* Text version of what is plotted (screen readers, tests). */}
      <ul className="map-items" hidden>
        {home && !picker && <li data-kind="view" data-bounds={home.bounds.flat().map((x) => x.toFixed(4)).join(',')}>{home.label}</li>}
        {data.pins.map((p) => (
          <li key={p.id} data-kind={p.kind} data-shape={p.shape} data-case={p.caseId} data-lat={p.lat.toFixed(4)} data-lng={p.lng.toFixed(4)}>
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
        {data.cov.stations.map((c) => (
          <li key={c.id} data-kind="station" data-letter={c.letter}>
            {c.label}
          </li>
        ))}
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
