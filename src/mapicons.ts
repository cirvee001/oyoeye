// Map marker drawings: top-down vehicles in their organisation's livery and uniformed officer
// figures. Plain SVG strings (no assets, no libraries), shared by the map and its legend.

export type Livery = 'police' | 'corps' | 'emergency' | 'state';

const LIVERY: Record<Livery, { body: string; edge: string; roof: string; stripe: string }> = {
  police: { body: '#2B3A5C', edge: '#141C2E', roof: '#E8EEF8', stripe: '#9DB7E8' },
  corps: { body: '#3B5B32', edge: '#1E3018', roof: '#D9C36A', stripe: '#E0B422' },
  emergency: { body: '#D0342C', edge: '#7A1712', roof: '#F3F4F6', stripe: '#FDE68A' },
  state: { body: '#E4E7EC', edge: '#98A2B3', roof: '#FFFFFF', stripe: '#0B6E4F' },
};

export const liveryFor = (stationKind?: string): Livery =>
  stationKind === 'police' || stationKind === 'corps' || stationKind === 'emergency' ? stationKind : 'state';

/** Gradient across the body (dark edges, light middle) is what makes it read as a 3D roof. */
const bodyGrad = (id: string, c: { body: string; edge: string }) =>
  `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${c.edge}"/><stop offset="0.3" stop-color="${c.body}"/><stop offset="0.5" stop-color="${c.body}" stop-opacity="0.85"/><stop offset="0.7" stop-color="${c.body}"/><stop offset="1" stop-color="${c.edge}"/></linearGradient>`;

const lightBar = (x: number, y: number, w: number) =>
  `<g class="lb"><rect x="${x}" y="${y}" width="${w / 2}" height="3.2" rx="1" fill="#E11D2E"/><rect x="${x + w / 2}" y="${y}" width="${w / 2}" height="3.2" rx="1" fill="#1E5BFF"/></g>`;

const glass = '#16202E';

function car(liv: Livery, opts: { long?: boolean; van?: boolean; cross?: boolean; ladder?: boolean; bar?: boolean } = {}) {
  const c = LIVERY[liv];
  const h = opts.long ? 50 : 42;
  const id = `vb-${liv}${opts.long ? '-l' : ''}`;
  const roofY = opts.van ? 13 : 16;
  const roofH = h - roofY - (opts.van ? 6 : 13);
  return `<svg class="veh-svg" width="24" height="${h}" viewBox="0 0 24 ${h}" aria-hidden="true"><defs>${bodyGrad(id, c)}</defs>
<rect x="0.5" y="8" width="3.5" height="8" rx="1.2" fill="#0B0F17"/><rect x="20" y="8" width="3.5" height="8" rx="1.2" fill="#0B0F17"/>
<rect x="0.5" y="${h - 15}" width="3.5" height="8" rx="1.2" fill="#0B0F17"/><rect x="20" y="${h - 15}" width="3.5" height="8" rx="1.2" fill="#0B0F17"/>
<rect x="2.5" y="1.5" width="19" height="${h - 3}" rx="6" fill="url(#${id})" stroke="${c.edge}" stroke-width="1"/>
<rect x="4" y="2.5" width="3" height="1.6" rx="0.8" fill="#FFF6C2"/><rect x="17" y="2.5" width="3" height="1.6" rx="0.8" fill="#FFF6C2"/>
<path d="M5 ${roofY - 5.5} H19 L17.5 ${roofY} H6.5 Z" fill="${glass}"/><path d="M6.2 ${roofY - 4.8} H10 L9 ${roofY - 1}" fill="#fff" opacity="0.18"/>
<rect x="6.5" y="${roofY}" width="11" height="${roofH}" rx="2" fill="${c.roof}"/>
${opts.ladder ? `<g stroke="#9CA3AF" stroke-width="1.1"><path d="M9 ${roofY + 2} V${roofY + roofH - 2} M15 ${roofY + 2} V${roofY + roofH - 2}"/>${Array.from({ length: 6 }, (_, k) => `<path d="M9 ${roofY + 4 + k * 4.5} H15"/>`).join('')}</g>` : ''}
${opts.cross ? `<path d="M12 ${roofY + 4} v8 M8 ${roofY + 8} h8" stroke="#D92D20" stroke-width="2.6" stroke-linecap="round"/>` : ''}
${!opts.ladder && !opts.cross ? `<rect x="11" y="${roofY + 1}" width="2" height="${roofH - 2}" fill="${c.stripe}" opacity="0.9"/>` : ''}
${opts.bar !== false ? lightBar(6.5, roofY + 1.5, 11) : ''}
${opts.van ? '' : `<path d="M6.5 ${roofY + roofH} H17.5 L18.5 ${roofY + roofH + 4} H5.5 Z" fill="${glass}"/>`}
<rect x="4" y="${h - 3.6}" width="3" height="1.4" rx="0.7" fill="#F04438"/><rect x="17" y="${h - 3.6}" width="3" height="1.4" rx="0.7" fill="#F04438"/>
</svg>`;
}

function motorcycle(liv: Livery) {
  const c = LIVERY[liv];
  return `<svg class="veh-svg" width="14" height="34" viewBox="0 0 14 34" aria-hidden="true">
<rect x="5" y="0.5" width="4" height="9" rx="2" fill="#0B0F17"/><rect x="5" y="24.5" width="4" height="9" rx="2" fill="#0B0F17"/>
<path d="M1 8 H13" stroke="#475467" stroke-width="1.6" stroke-linecap="round"/>
<rect x="4" y="7" width="6" height="19" rx="3" fill="${c.body}" stroke="${c.edge}" stroke-width="0.8"/>
<ellipse cx="7" cy="17" rx="5.6" ry="4.4" fill="${c.body}" stroke="${c.edge}" stroke-width="0.8"/>
<circle cx="7" cy="14.5" r="3.1" fill="#F2F4F7" stroke="${c.edge}" stroke-width="0.8"/><path d="M4.6 13.6 H9.4" stroke="${glass}" stroke-width="1.2"/>
<g class="lb"><circle cx="5" cy="25" r="1.2" fill="#E11D2E"/><circle cx="9" cy="25" r="1.2" fill="#1E5BFF"/></g>
</svg>`;
}

function armoured() {
  const c = { body: '#5B6136', edge: '#2E3219' };
  return `<svg class="veh-svg" width="28" height="48" viewBox="0 0 28 48" aria-hidden="true"><defs>${bodyGrad('vb-apc', c)}</defs>
${[7, 21, 35].map((y) => `<rect x="0.5" y="${y}" width="4" height="7" rx="1.5" fill="#0B0F17"/><rect x="23.5" y="${y}" width="4" height="7" rx="1.5" fill="#0B0F17"/>`).join('')}
<path d="M5 6 L9 1.5 H19 L23 6 V45 H5 Z" fill="url(#vb-apc)" stroke="${c.edge}" stroke-width="1"/>
<rect x="8" y="4" width="12" height="3" fill="${glass}"/>
<circle cx="14" cy="24" r="6.5" fill="#6B7243" stroke="${c.edge}" stroke-width="1"/><rect x="13" y="7" width="2" height="12" rx="1" fill="#2E3219"/>
${lightBar(8, 38, 12)}
</svg>`;
}

const VEHICLE_DRAW: Record<string, (liv: Livery) => string> = {
  patrol_car: (liv) => car(liv),
  motorcycle,
  armoured: () => armoured(),
  fire_truck: () => car('emergency', { long: true, van: true, ladder: true }),
  ambulance: () => car('state', { van: true, cross: true }),
  utility: (liv) => car(liv, { van: true, bar: false }),
};

/**
 * A vehicle marker: status halo (not rotated), the vehicle rotated to its heading, and its call
 * sign. `flash` makes the light bar flash (responding).
 */
export function vehicleMarkerHtml(o: { call: string; kind: string; livery: Livery; statusColor: string; heading: number; flash: boolean; esc: (s: string) => string }) {
  const draw = VEHICLE_DRAW[o.kind] ?? VEHICLE_DRAW.patrol_car;
  return `<span class="mk-car${o.flash ? ' flash' : ''}" style="--c:${o.statusColor}"><span class="mk-car-halo"></span><span class="mk-car-rot" style="transform:rotate(${Math.round(o.heading)}deg)">${draw(o.livery)}</span><span class="mk-veh-tag">${o.esc(o.call)}</span></span>`;
}

const UNIFORM: Record<Livery, { shirt: string; dark: string; cap: string }> = {
  police: { shirt: '#2B3A5C', dark: '#141C2E', cap: '#141C2E' },
  corps: { shirt: '#4E6B3A', dark: '#26371C', cap: '#26371C' },
  emergency: { shirt: '#C8261D', dark: '#7A1712', cap: '#F2C94C' },
  state: { shirt: '#0B6E4F', dark: '#064432', cap: '#064432' },
};

/**
 * An officer on foot: a uniformed figure with a ground shadow. On scene adds an amber ring at the
 * feet; en route adds a small arrow toward the incident.
 */
export function officerMarkerHtml(o: { livery: Livery; mode: string; heading?: number }) {
  const u = UNIFORM[o.livery];
  const fig = `<svg class="off-svg" width="18" height="28" viewBox="0 0 18 28" aria-hidden="true"><defs><linearGradient id="of-${o.livery}" x1="0" x2="1"><stop offset="0" stop-color="${u.dark}"/><stop offset="0.45" stop-color="${u.shirt}"/><stop offset="1" stop-color="${u.dark}"/></linearGradient></defs>
<ellipse cx="9" cy="26" rx="6" ry="1.8" fill="#000" opacity="0.35"/>
<path d="M6.2 17 L5.6 25.5 H8.4 L9 19 L9.6 25.5 H12.4 L11.8 17 Z" fill="${u.dark}"/>
<path d="M3.2 10.5 Q3.4 8 6 7.6 H12 Q14.6 8 14.8 10.5 L15.4 16.5 Q15.5 17.6 14.4 17.6 H13.2 L12.8 12.5 L12.4 18 H5.6 L5.2 12.5 L4.8 17.6 H3.6 Q2.5 17.6 2.6 16.5 Z" fill="url(#of-${o.livery})" stroke="${u.dark}" stroke-width="0.6"/>
<rect x="8.3" y="8" width="1.4" height="10" fill="${u.dark}" opacity="0.45"/>
<circle cx="9" cy="5" r="2.9" fill="#7A4A2B"/><path d="M5.8 4.3 Q9 0.6 12.2 4.3 Z" fill="${u.cap}"/><rect x="5.6" y="3.9" width="6.8" height="1.1" rx="0.5" fill="${u.cap}"/>
</svg>`;
  const ring = o.mode === 'onscene' ? '<span class="off-ring"></span>' : '';
  const arrow = o.mode === 'enroute' ? `<span class="off-dir" style="transform:rotate(${Math.round(o.heading ?? 0)}deg)"><i></i></span>` : '';
  return `<span class="mk-off mode-${o.mode}">${ring}${arrow}${fig}</span>`;
}
