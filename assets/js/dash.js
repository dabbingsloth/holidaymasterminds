// Mastermind dashboard: live progress for all households + per-household overrides.
import {
  db, doc, collection, onSnapshot, updateDoc, writeBatch,
  serverTimestamp, deleteField, arrayUnion, arrayRemove,
} from './fb.js';
import { el, pad2, fmtPT, relTime, TYPES } from './common.js';
import { lockedUntil } from './answer.js';
import { requireAdmin, logout } from './admin-auth.js';

const root = document.getElementById('app');
const households = {};   // code -> data
const progress = {};     // code -> summary doc
const dayDocs = {};      // code -> { n -> attempt doc }
const letters = {};      // n -> letter
const subs = {};
let sched = null;
let user;
let raf = 0;

const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
const unlockAt = (n) => (sched && sched.unlock && sched.unlock[String(n)] ? sched.unlock[String(n)].toMillis() : Infinity);
const playLink = (code) => new URL(`../play/?h=${code}`, location.href).href;
const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);

function watchHousehold(code) {
  if (subs[code]) return;
  subs[code] = [
    onSnapshot(doc(db, 'progress', code), (s) => { progress[code] = s.exists() ? s.data() : {}; schedule(); }),
    onSnapshot(collection(db, 'progress', code, 'd'), (qs) => {
      const m = {};
      qs.forEach((d) => { m[d.id] = d.data(); });
      dayDocs[code] = m;
      schedule();
    }),
  ];
}

async function act(code, n, action) {
  const key = String(n);
  const dref = doc(db, 'progress', code, 'd', key);
  const pref = doc(db, 'progress', code);
  const hname = households[code].name;
  try {
    if (action === 'preview') {
      window.open(new URL(`../play/day.html?h=${code}&d=${n}`, location.href).href, '_blank');
    } else if (action === 'unlock') {
      await updateDoc(doc(db, 'households', code), { early: arrayUnion(key) });
    } else if (action === 'relock') {
      await updateDoc(doc(db, 'households', code), { early: arrayRemove(key) });
    } else if (action === 'solve') {
      if (!confirm(`Mark Day ${n} solved for ${hname}?`)) return;
      const b = writeBatch(db);
      b.set(dref, { solvedAt: serverTimestamp(), byAdmin: true }, { merge: true });
      b.update(pref, { ['solved.' + key]: serverTimestamp() });
      await b.commit();
    } else if (action === 'reset') {
      if (!confirm(`Reset Day ${n} for ${hname}? This erases their solve and attempt count for that day.`)) return;
      const b = writeBatch(db);
      b.delete(dref);
      b.update(pref, { ['solved.' + key]: deleteField() });
      await b.commit();
    } else if (action === 'clearlock') {
      const st = (dayDocs[code] || {})[key] || {};
      await updateDoc(dref, { cleared: st.tries || 0 });
    }
  } catch (e) {
    alert('That override failed: ' + (e.message || e));
  }
}

function dayRow(code, n) {
  const key = String(n);
  const st = (dayDocs[code] || {})[key] || {};
  const p = progress[code] || {};
  const early = (households[code].early || []).includes(key);
  const solvedTs = (p.solved || {})[key];
  const solved = !!solvedTs;
  const lock = lockedUntil(n, st);
  const open = early || Date.now() >= unlockAt(n);
  const wrong = Math.max(0, (st.tries || 0) - (st.solvedAt && !st.byAdmin ? 1 : 0));

  let status;
  if (solved) status = el('span', { class: 'ok', text: '✔ ' + fmtPT(ms(solvedTs), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (st.byAdmin ? ' (HQ)' : '') });
  else if (lock > Date.now()) status = el('span', { class: 'bad', text: 'LOCKED OUT til ' + fmtPT(lock, { hour: 'numeric', minute: '2-digit' }) });
  else if (open) status = el('span', { text: early && Date.now() < unlockAt(n) ? 'open ★early' : 'open' });
  else status = el('span', { class: 'muted', text: 'sealed' });

  const sel = el('select', { 'aria-label': `Action for day ${n}` },
    el('option', { value: '', text: '⋯' }),
    el('option', { value: 'preview', text: 'Preview' }),
    early ? el('option', { value: 'relock', text: 'Undo early unlock' }) : el('option', { value: 'unlock', text: 'Unlock early' }),
    !solved ? el('option', { value: 'solve', text: 'Mark solved' }) : null,
    (solved || st.tries) ? el('option', { value: 'reset', text: 'Reset day' }) : null,
    n === 8 && ((st.tries || 0) - (st.cleared || 0)) > 0 ? el('option', { value: 'clearlock', text: 'Clear lockout' }) : null);
  sel.addEventListener('change', () => { const a = sel.value; sel.value = ''; if (a) act(code, n, a); });

  return el('tr', {},
    el('td', { text: pad2(n) + (TYPES[n] === 'physical' ? ' ◻' : '') }),
    el('td', {}, status),
    el('td', { text: String(wrong) }),
    el('td', { class: 'head', text: solved ? (letters[n] || '?') : '' }),
    el('td', {}, sel));
}

function card(code) {
  const hh = households[code];
  const p = progress[code] || {};
  const count = Object.keys(p.solved || {}).length;
  const pieces = Array.from({ length: 12 }, (_, i) => ((p.solved || {})[String(i + 1)] ? (letters[i + 1] || '?') : '·')).join(' ');
  const copy = el('button', { class: 'btn btn-small', type: 'button', text: 'Copy link' });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(playLink(code)); copy.textContent = 'Copied!'; } catch { prompt('Copy this link:', playLink(code)); }
    setTimeout(() => { copy.textContent = 'Copy link'; }, 1500);
  });
  return el('article', { class: 'hh-card' },
    el('h2', {}, hh.name || code, hh.gentle ? el('span', { class: 'tag', text: 'gentle' }) : null),
    el('p', { class: 'small' }, `Solved ${count}/12 · Last active ${relTime(ms(p.lastActive))}`),
    el('p', { class: 'head', text: 'Code: ' + pieces }),
    el('div', { class: 'toolbar' }, copy,
      el('a', { class: 'btn btn-small', href: playLink(code), target: '_blank', text: 'Open as them' })),
    el('table', {},
      el('thead', {}, el('tr', {}, ['Day', 'Status', 'Wrong', 'Ltr', ''].map((t) => el('th', { text: t })))),
      el('tbody', {}, Array.from({ length: 12 }, (_, i) => dayRow(code, i + 1)))));
}

function render() {
  const codes = Object.keys(households).sort((a, b) => ms(households[a].createdAt) - ms(households[b].createdAt));
  const firstUnlock = unlockAt(1);
  root.replaceChildren(
    el('div', { class: 'toolbar' },
      el('h1', { style: 'margin:0;flex:1', text: 'MASTERMIND MODE' }),
      el('a', { class: 'btn btn-small', href: './content.html', text: 'Load content' }),
      el('a', { class: 'btn btn-small', href: '../play/', target: '_blank', text: 'Preview all' }),
      el('a', { class: 'btn btn-small', href: '../tools/hash.html', target: '_blank', text: 'Hash tool' }),
      el('button', { class: 'btn btn-small', type: 'button', text: 'Sign out', onclick: logout })),
    el('p', { class: 'small muted' },
      `Signed in as ${user.email}. `,
      isFinite(firstUnlock) ? `Day 1 unlocks ${fmtPT(firstUnlock)} PT. Meetup: ${(sched && sched.meetup) || '—'}.` : 'Schedule not set — go to Load content.'),
    codes.length
      ? el('div', { class: 'hh-grid' }, codes.map(card))
      : el('p', { class: 'notice', text: 'No households yet. Go to "Load content" to create them.' }),
    el('p', { class: 'small muted', text: '◻ = physical day. "Wrong" = wrong attempts. Overrides are in the ⋯ menu on each row.' }));
}

async function main() {
  user = await requireAdmin(root);
  if (!user) return;
  onSnapshot(doc(db, 'config', 'schedule'), (s) => { sched = s.exists() ? s.data() : null; schedule(); });
  onSnapshot(collection(db, 'reveals'), (qs) => { qs.forEach((d) => { letters[d.id] = d.data().letter || ''; }); schedule(); });
  onSnapshot(collection(db, 'households'), (qs) => {
    qs.forEach((d) => { households[d.id] = d.data(); watchHousehold(d.id); });
    schedule();
  });
  setInterval(schedule, 30000);
  render();
}
main();
