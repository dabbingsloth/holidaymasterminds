// Day 11 — Family Map (Leaflet + OpenStreetMap)
import { el } from '../common.js';
import { answerBox } from '../ui.js';

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    document.head.append(el('link', { rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', crossorigin: '' }));
    const s = el('script', { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', crossorigin: '' });
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.append(s);
  });
}

export default async function map(ctx) {
  const pins = Array.isArray(ctx.day.pins) ? ctx.day.pins : [];
  const mapDiv = el('div', { id: 'map', role: 'application', 'aria-label': 'Family map' });
  const trail = el('div', { class: 'trail', 'aria-live': 'polite' });
  const tmsg = el('p', { class: 'trail-msg', role: 'status' });

  ctx.mount.append(
    ctx.day.riddle ? el('p', { class: 'pre head', text: ctx.day.riddle }) : null,
    el('p', { class: 'muted small', text: 'Tap the pins in the right order. Each correct pin reveals a letter.' }),
    mapDiv,
    el('div', {}, el('span', { class: 'head', text: 'Trail: ' }), trail),
    tmsg,
    answerBox(ctx, { label: 'What does the trail spell?', button: 'Submit' }));

  let L;
  try { L = await loadLeaflet(); } catch { tmsg.textContent = 'The map failed to load. Check your connection and reload.'; return; }

  const m = L.map(mapDiv, { scrollWheelZoom: false, tap: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(m);

  let step = 0;
  const markers = pins.map((p, i) => {
    const icon = () => L.divIcon({ className: '', html: `<div class="pin${i < step ? ' found' : ''}"><b>${i < step ? escapeHtml(p.letter || '') : ''}</b></div>`, iconSize: [34, 34] });
    const mk = L.marker([Number(p.lat), Number(p.lng)], { icon: icon(), keyboard: true, title: p.label || '' }).addTo(m);
    mk.refresh = () => mk.setIcon(icon());
    mk.on('click', () => clickPin(i));
    return mk;
  });
  if (pins.length) m.fitBounds(L.latLngBounds(pins.map((p) => [Number(p.lat), Number(p.lng)])), { padding: [40, 40] });
  else m.setView([39.5, -98.35], 3);

  function drawTrail() {
    trail.textContent = pins.map((p, i) => (i < step ? (p.letter || '?') : '_')).join(' ');
    markers.forEach((mk) => mk.refresh());
  }
  function clickPin(i) {
    if (step >= pins.length) return;
    if (i === step) {
      step++;
      tmsg.className = 'trail-msg';
      tmsg.textContent = step === pins.length ? 'Trail complete.' : 'Correct. Keep going…';
    } else if (i < step) {
      return; // already found
    } else {
      step = 0;
      tmsg.className = 'trail-msg denied';
      tmsg.textContent = 'Trail lost.';
    }
    drawTrail();
  }
  drawTrail();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
