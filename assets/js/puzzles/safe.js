// Day 8 — The Safe. 3 wrong tries → alarm + 60-minute lockout (enforced by the security rules).
import { el, shake, fmtCountdown } from '../common.js';
import { lockedUntil } from '../answer.js';

export default function safe(ctx) {
  let code = '';
  let timer = null;
  const slots = Array.from({ length: 6 }, () => el('span', { text: '–' }));
  const msg = el('div', { class: 'safe-msg', role: 'status', 'aria-live': 'polite' });
  const keys = el('div', { class: 'keys' });
  const box = el('div', { class: 'safe', role: 'group', 'aria-label': 'Safe keypad' },
    el('div', { class: 'display' }, slots), keys, msg);

  const press = (d) => { if (code.length < 6) { code += d; draw(); } };
  for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) keys.append(el('button', { type: 'button', text: d, onclick: () => press(d) }));
  keys.append(
    el('button', { type: 'button', class: 'k-clr', text: 'CLEAR', onclick: () => { code = ''; draw(); } }),
    el('button', { type: 'button', text: '0', onclick: () => press('0') }),
    el('button', { type: 'button', class: 'k-enter', text: 'OPEN', onclick: () => enter() }));

  document.addEventListener('keydown', (e) => {
    if (ctx.solved || e.target.closest('input,textarea')) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') { code = code.slice(0, -1); draw(); }
    else if (e.key === 'Enter') enter();
  });

  function draw() { slots.forEach((s, i) => { s.textContent = code[i] || '–'; }); }
  function setDisabled(v) { keys.querySelectorAll('button').forEach((b) => { b.disabled = v; }); }
  const triesLeft = () => {
    const t = (ctx.state.tries || 0) - (ctx.state.cleared || 0);
    return 3 - (t % 3);
  };

  async function enter() {
    if (ctx.solved || keys.querySelector('button').disabled) return;
    if (code.length !== 6) { msg.className = 'safe-msg'; msg.textContent = 'Enter all 6 digits.'; return; }
    setDisabled(true);
    msg.className = 'safe-msg';
    msg.textContent = 'Turning tumblers…';
    const r = await ctx.submit(code);
    code = ''; draw();
    if (r.status === 'correct') { opened(); return; }
    setDisabled(false);
    if (r.status === 'wrong' || r.status === 'locked') {
      shake(box);
      if (checkLock(true)) return;
      msg.className = 'safe-msg denied';
      msg.textContent = r.preview ? 'INCORRECT. (Preview — no lockout for HQ.)' : `INCORRECT. ${triesLeft()} attempt${triesLeft() === 1 ? '' : 's'} remain before the alarm.`;
      return;
    }
    msg.className = 'safe-msg denied';
    msg.textContent = r.message || 'Connection error.';
  }

  function checkLock(justTripped) {
    const until = lockedUntil(8, ctx.state);
    if (!until || until <= Date.now()) { document.documentElement.classList.remove('alarm'); return false; }
    setDisabled(true);
    if (justTripped) document.documentElement.classList.add('alarm');
    const tEl = el('div', { class: 'lock-timer' });
    msg.className = 'safe-msg denied';
    msg.replaceChildren(el('div', { text: 'ALARM TRIPPED. Safe locked down.' }), tEl, el('div', { class: 'small', text: 'Try again when the timer runs out.' }));
    clearInterval(timer);
    const step = () => {
      const left = until - Date.now();
      tEl.textContent = fmtCountdown(left);
      if (left <= 0) {
        clearInterval(timer);
        document.documentElement.classList.remove('alarm');
        setDisabled(false);
        msg.className = 'safe-msg';
        msg.textContent = 'Lockdown lifted. 3 attempts available.';
      }
    };
    step();
    timer = setInterval(step, 1000);
    // stop the flashing after 20 seconds; the lockout itself continues
    if (justTripped) setTimeout(() => document.documentElement.classList.remove('alarm'), 20000);
    return true;
  }

  function opened() {
    clearInterval(timer);
    document.documentElement.classList.remove('alarm');
    setDisabled(true);
    slots.forEach((s) => { s.textContent = '✓'; });
    msg.className = 'safe-msg';
    msg.textContent = 'CLICK. The safe swings open.';
  }

  ctx.mount.append(box);
  if (ctx.solved) opened();
  else checkLock(false);
}
