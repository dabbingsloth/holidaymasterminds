import { db, doc, getDoc } from './fb.js';
import { el, pad2, fmtCountdown, fmtPT, errCode, TYPES } from './common.js';
import { startSession, showSessionError, unlockMs, linkParams } from './session.js';
import { submitAnswer, loadDayState, getReveal } from './answer.js';
import { revealCard } from './ui.js';

const root = document.getElementById('app');
const n = parseInt(new URLSearchParams(location.search).get('d'), 10);

function header(S, title) {
  return [
    el('div', { class: 'classified-bar' },
      el('a', { href: './' + linkParams(S), text: '← Case file' }),
      el('span', { text: `Mission ${pad2(n)} of 12` })),
    S.admin ? el('div', { class: 'banner' },
      'MASTERMIND PREVIEW — answers are checked but not recorded. ',
      el('a', { href: location.pathname + linkParams(S, { d: n, gentle: S.gentle ? '0' : '1' }), text: S.gentle ? '[normal view]' : '[Grandma & Grandpa view]' })) : null,
    el('h1', {}, `DAY ${pad2(n)}`, title ? el('br') : null, title ? el('span', { class: 'head', text: title }) : null),
  ];
}

function showLocked(S) {
  const ms = unlockMs(S, n);
  const cd = el('div', { class: 'countdown', role: 'timer' });
  root.replaceChildren(...header(S, ''),
    el('div', { class: 'notice' },
      el('p', {}, el('span', { class: 'stamp big', text: 'Sealed' })),
      el('p', { text: 'This file unseals in:' }),
      cd,
      el('p', { class: 'muted', text: isFinite(ms) ? fmtPT(ms) + ' (Pacific)' : 'HQ has not set the date yet.' })));
  if (!isFinite(ms)) { cd.textContent = '—'; return; }
  const alreadyDue = Date.now() >= ms;
  const t = setInterval(() => {
    const left = ms - Date.now();
    cd.textContent = left > 0 ? fmtCountdown(left) : 'Unsealing…';
    if (left <= 0) {
      clearInterval(t);
      // HQ's clock decides. If it is not quite time yet, try again shortly.
      setTimeout(() => location.reload(), alreadyDue ? 20000 : 1500);
    }
  }, 1000);
  cd.textContent = fmtCountdown(ms - Date.now());
}

async function main() {
  if (!(n >= 1 && n <= 12)) { root.replaceChildren(el('p', { text: 'Unknown mission.' })); return; }
  let S;
  try { S = await startSession(); } catch (e) { showSessionError(root, e); return; }

  let snap;
  try {
    snap = await getDoc(doc(db, 'days', String(n)));
  } catch (e) {
    if (errCode(e) === 'permission-denied') { showLocked(S); return; }
    showSessionError(root, e); return;
  }
  if (!snap.exists()) {
    root.replaceChildren(...header(S, ''), el('p', { class: 'notice', text: 'This file is still being prepared by HQ. Check back soon.' }));
    return;
  }

  const day = snap.data();
  const type = day.type || TYPES[n];
  document.title = `Day ${n}${day.title ? ' — ' + day.title : ''} · The Masterminds`;

  const state = await loadDayState(S, n);
  const ctx = {
    S, n, day, type, state,
    solved: !!state.solvedAt,
    gentle: S.gentle,
    mount: el('section', { class: 'puzzle' }),
    onSolved: [],
    async submit(raw) {
      const r = await submitAnswer(S, n, raw);
      if (r.state) ctx.state = r.state;
      if (r.status === 'correct') {
        ctx.solved = true;
        revealSlot.replaceChildren(revealCard(n, r, !!r.preview));
        revealSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ctx.onSolved.forEach((fn) => fn(r));
      }
      return r;
    },
  };
  const revealSlot = el('div');

  const hintText = S.gentle ? (day.gentleHint || day.hint) : day.hint;
  root.replaceChildren(
    ...header(S, day.title || ''),
    type !== 'nothing' && day.brief ? el('p', { class: 'pre', text: day.brief }) : null,
    ctx.mount,
    revealSlot,
    hintText ? el('details', { class: 'hint' }, el('summary', { text: 'Request field support (hint)' }), el('p', { class: 'pre', text: hintText })) : null,
  );

  if (ctx.solved) revealSlot.replaceChildren(revealCard(n, await getReveal(n)));

  const mod = await import(`./puzzles/${type}.js`);
  await mod.default(ctx);
}
main();
