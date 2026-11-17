// Shared helpers. No puzzle content lives here.

export const TYPES = {
  1: 'physical', 2: 'login', 3: 'physical', 4: 'nothing', 5: 'physical', 6: 'vigenere',
  7: 'physical', 8: 'safe', 9: 'physical', 10: 'audio', 11: 'map', 12: 'physical',
};
export const isPhysical = (n) => TYPES[n] === 'physical';

/** Uppercase, strip accents, keep only A–Z and 0–9. */
export function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const pad2 = (n) => String(n).padStart(2, '0');

export function errCode(e) {
  return (e && e.code ? String(e.code) : '').replace(/^(firestore|auth)\//, '');
}

/** Tiny element builder. Text is always set as text (never HTML). */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : String(c));
  }
  return node;
}

export function fmtCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hh = pad2(Math.floor((s % 86400) / 3600));
  const mm = pad2(Math.floor((s % 3600) / 60));
  const ss = pad2(s % 60);
  return (d ? `${d}d ` : '') + `${hh}:${mm}:${ss}`;
}

const TZ = 'America/Los_Angeles';
export function fmtPT(ms, opts = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) {
  if (!isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts }).format(new Date(ms));
}

/** UTC milliseconds of midnight America/Los_Angeles on the given calendar date. */
export function laMidnight(y, m, d) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23', day: 'numeric' });
  for (const off of [8, 7]) {
    const t = Date.UTC(y, m - 1, d, off);
    const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    if (Number(parts.hour) === 0 && Number(parts.day) === d) return t;
  }
  throw new Error('Could not compute Pacific midnight');
}

/** Unlock times (ms) for days 1..12 from a "YYYY-MM-DD" start date. */
export function unlockTimes(startISO) {
  const [y, m, d] = startISO.split('-').map(Number);
  const out = {};
  for (let n = 1; n <= 12; n++) {
    const dt = new Date(Date.UTC(y, m - 1, d + n - 1));
    out[n] = laMidnight(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return out;
}

/** Today's date in Pacific time as YYYY-MM-DD (optionally shifted by whole days). */
export function todayPT(shiftDays = 0) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + shiftDays));
  return dt.toISOString().slice(0, 10);
}

export function relTime(ms) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

export function shake(node) {
  node.classList.remove('shake');
  void node.offsetWidth;
  node.classList.add('shake');
}
