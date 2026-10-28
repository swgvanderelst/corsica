// Maps: the SVG island overview (legacy look) and a lazy Leaflet map (OSM tiles) for the activities near a stop.
import { escapeHtml } from './logic.js';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const SRI = {
  css: 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==',
  js: 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==',
};
export const LEAFLET_FILES = [LEAFLET + 'leaflet.min.css', LEAFLET + 'leaflet.min.js'];

let leafletP = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; css.integrity = SRI.css; css.crossOrigin = '';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = LEAFLET + 'leaflet.min.js'; js.integrity = SRI.js; js.crossOrigin = '';
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletP = null; reject(new Error('leaflet')); };
    document.head.appendChild(js);
  });
  return leafletP;
}

// Leaflet map with the stay (teal) and the activities (yellow numbered pins). Returns {map, remove}.
export async function mountMap(el, { center, stay, acts, onPick }) {
  const L = await loadLeaflet();
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(center, 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers',
  }).addTo(map);
  const pts = [center];
  L.marker(center, { icon: L.divIcon({ className: '', html: '<span class="pin stay">&#8962;</span>', iconSize: [30, 30], iconAnchor: [15, 15] }), title: stay, keyboard: false }).addTo(map);
  acts.forEach((a, i) => {
    const m = L.marker([Number(a.item.lat), Number(a.item.lon)], { icon: L.divIcon({ className: '', html: `<span class="pin" data-act="${escapeHtml(a.item.id)}">${i + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }), title: a.item.name, keyboard: true });
    m.bindPopup(`<b>${escapeHtml(a.item.name)}</b><br>${Math.round(a.km)} km`);
    m.on('click', () => onPick && onPick(a.item.id));
    m.addTo(map);
    pts.push([Number(a.item.lat), Number(a.item.lon)]);
  });
  if (pts.length > 1) map.fitBounds(pts, { padding: [26, 26], maxZoom: 12 });
  setTimeout(() => map.invalidateSize(), 60);
  return { map, remove: () => map.remove() };
}

// ---- SVG island overview, like the legacy app ----
const X = lon => ((lon - 8.45) * 300).toFixed(1), Y = lat => ((43.05 - lat) * 400).toFixed(1);
const pathOf = (P, keys) => keys.filter(k => P[k]).map((k, i) => (i ? 'L' : 'M') + X(P[k][0]) + ' ' + Y(P[k][1])).join(' ');
const LEGLET = 'ABCDEFG';
export function routeSvg(places, route) {
  const { places: P, names: PLACE = {}, outline } = places;
  const col = `var(--route-${escapeHtml(route.id)}, var(--accent))`;
  let svg = '<svg viewBox="0 0 350 700" role="img" aria-label="Routekaart van Corsica" xmlns="http://www.w3.org/2000/svg">';
  svg += `<path d="M${outline.map(p => X(p[0]) + ' ' + Y(p[1])).join(' L')} Z" fill="var(--rock)" stroke="var(--line)" stroke-width="1.5" stroke-linejoin="round"/>`;
  svg += `<ellipse cx="${X(9.05)}" cy="${Y(42.20)}" rx="38" ry="105" fill="var(--maquis)" opacity=".18" transform="rotate(-8 ${X(9.05)} ${Y(42.20)})"/>`;
  svg += `<text x="${X(9.03)}" y="${Y(42.20)}" font-size="10" text-anchor="middle" fill="var(--muted)" font-style="italic">bergen</text>`;
  const roundTrip = route.stops[0] === route.stops[route.stops.length - 1];
  route.legs.forEach((l, i) => { svg += `<path d="${pathOf(P, l.via)}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"${i === route.legs.length - 1 && roundTrip ? ' stroke-dasharray="7 5"' : ''}/>`; });
  const shown = [];
  route.stops.forEach(k => {
    const c = P[k]; if (!c) return;
    const first = !shown.includes(k); shown.push(k);
    const isStay = route.stays.includes(k);
    svg += `<circle cx="${X(c[0])}" cy="${Y(c[1])}" r="${isStay ? 8 : 6}" fill="${isStay ? col : 'var(--surface)'}" stroke="${col}" stroke-width="2.4"/>`;
    if (isStay && first) svg += `<text x="${X(c[0])}" y="${(+Y(c[1]) + 3.8).toFixed(1)}" font-size="10.5" font-weight="700" text-anchor="middle" fill="var(--surface)">${route.stays.indexOf(k) + 1}</text>`;
  });
  const label = (k, bold) => {
    const c = P[k], n = PLACE[k]; if (!c || !n) return '';
    const dx = n.side === 'l' ? -13 : 13;
    return `<text x="${(+X(c[0]) + dx).toFixed(1)}" y="${(+Y(c[1]) + 4).toFixed(1)}" font-size="${bold ? 12.5 : 10.5}" font-weight="${bold ? 700 : 500}" text-anchor="${n.side === 'l' ? 'end' : 'start'}" fill="${bold ? 'var(--fg)' : 'var(--muted)'}" stroke="var(--rock)" stroke-width="3" paint-order="stroke">${escapeHtml(n.name)}</text>`;
  };
  const done = new Set();
  route.legs.forEach(l => l.via.forEach(k => { if (P[k] && !route.stops.includes(k) && PLACE[k] && !done.has(k)) { done.add(k); svg += `<circle cx="${X(P[k][0])}" cy="${Y(P[k][1])}" r="2.8" fill="var(--muted)"/>` + label(k, false); } }));
  [...new Set(route.stops)].forEach(k => { svg += label(k, true); });
  route.legs.forEach((l, i) => {
    const via = l.via.filter(k => P[k]);
    const m = via[Math.floor((via.length - 1) / 2)], n = via[Math.floor((via.length - 1) / 2) + 1] || m;
    if (!m) return;
    const x = ((+X(P[m][0]) + +X(P[n][0])) / 2 + (i % 2 ? 12 : -12)).toFixed(1), y = ((+Y(P[m][1]) + +Y(P[n][1])) / 2).toFixed(1);
    svg += `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="4" fill="var(--surface)" stroke="${col}" stroke-width="1.5"/><text x="${x}" y="${(+y + 3.8).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="var(--fg)">${LEGLET[i] || ''}</text>`;
  });
  return svg + '</svg>';
}
