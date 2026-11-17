import { db, doc, getDoc, onSnapshot } from './fb.js';
import { el, pad2, fmtCountdown, fmtPT, isPhysical } from './common.js';
import { startSession, showSessionError, unlockMs, looksOpen, linkParams } from './session.js';

const root = document.getElementById('app');
const letters = {};          // n -> letter (fetched once each day is solved)
let solved = {};             // n -> Timestamp
let S;

async function fetchLetter(n) {
  if (letters[n] !== undefined) return;
  letters[n] = '';
  try {
    const r = await getDoc(doc(db, 'reveals', String(n)));
    letters[n] = r.exists() ? (r.data().letter || '') : '';
  } catch { letters[n] = ''; }
  render();
}

function tile(n) {
  const physical = isPhysical(n);
  const kind = physical ? `Physical mission — open box #${n}.` : 'Digital mission';
  const isSolved = !!solved[n];
  const open = looksOpen(S, n);
  const head = [
    el('div', { class: 'day', text: `DAY ${pad2(n)}` }),
    el('div', { class: 'kind', text: n === 12 ? `${kind} The Vault.` : kind }),
  ];
  if (isSolved) {
    return el('a', { class: 'tile solved', href: './day.html' + linkParams(S, { d: n }) }, ...head,
      el('span', { class: 'stamp', text: 'Solved' }),
      el('div', { class: 'status' }, 'Code piece: ', el('span', { class: 'count', text: letters[n] || '…' })));
  }
  if (open) {
    return el('a', { class: 'tile', href: './day.html' + linkParams(S, { d: n }) }, ...head,
      el('div', { class: 'status open-cta', text: S.admin && Date.now() < unlockMs(S, n) ? 'Preview file →' : 'Open file →' }));
  }
  const ms = unlockMs(S, n);
  return el('div', { class: 'tile locked', 'aria-disabled': 'true' }, ...head,
    el('div', { class: 'status', text: 'Sealed' }),
    isFinite(ms)
      ? [el('div', { class: 'count', 'data-until': ms, text: fmtCountdown(ms - Date.now()) }),
         el('div', { class: 'small muted', text: 'Opens ' + fmtPT(ms, { weekday: 'short', month: 'short', day: 'numeric' }) })]
      : el('div', { class: 'small muted', text: 'Date not set yet' }));
}

function render() {
  const name = S.household ? S.household.name : (S.admin ? 'Mastermind view' : '');
  const strip = el('div', { class: 'codestrip', 'aria-label': 'Code pieces collected' });
  let count = 0;
  for (let n = 1; n <= 12; n++) {
    const got = solved[n] && letters[n];
    if (solved[n]) count++;
    strip.append(el('span', { class: got ? 'got' : '' }, got || '·', el('small', { text: pad2(n) })));
  }
  root.replaceChildren(
    S.admin ? el('div', { class: 'banner', text: 'MASTERMIND PREVIEW — every file is viewable. Answers are not recorded.' }) : null,
    el('h1', { text: 'CASE FILE' }),
    el('p', { class: 'head', text: `Assigned agents: ${name}` }),
    el('p', { text: 'Twelve missions. One a day. Each solved mission yields a code piece — write it on your ornament tag.' }),
    el('h2', { text: `Code pieces · ${count} of 12` }),
    strip,
    el('div', { class: 'tiles' }, Array.from({ length: 12 }, (_, i) => tile(i + 1))),
  );
}

function tick() {
  let crossed = false;
  document.querySelectorAll('[data-until]').forEach((node) => {
    const left = Number(node.dataset.until) - Date.now();
    node.textContent = fmtCountdown(left);
    if (left <= 0) crossed = true;
  });
  if (crossed) render();
}

async function main() {
  try { S = await startSession(); } catch (e) { showSessionError(root, e); return; }
  render();
  if (S.h) {
    onSnapshot(doc(db, 'progress', S.h), (snap) => {
      solved = (snap.exists() && snap.data().solved) || {};
      Object.keys(solved).forEach((n) => fetchLetter(n));
      render();
    }, () => {});
  }
  setInterval(tick, 1000);
}
main();
