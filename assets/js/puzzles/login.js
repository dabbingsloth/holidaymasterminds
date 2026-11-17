// Day 2 — Agent Login
import { el, shake } from '../common.js';

export default function login(ctx) {
  const input = el('input', { type: 'text', id: 'pass', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const btn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Authenticate' });
  const msg = el('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
  const form = el('form', { class: 'terminal' },
    el('h2', { text: '> SECURE TERMINAL // AGENT LOGIN' }),
    el('p', { text: ctx.day.prompt || 'Enter your passphrase to continue.' }),
    el('label', { for: 'pass', text: 'Passphrase:' }),
    input,
    el('p', {}, btn),
    msg);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    msg.className = 'feedback';
    msg.textContent = 'Verifying…';
    const r = await ctx.submit(input.value);
    btn.disabled = false;
    if (r.status === 'empty') { msg.textContent = 'Passphrase required.'; return; }
    if (r.status === 'correct') { granted(); return; }
    msg.className = 'feedback denied';
    msg.textContent = r.status === 'wrong' ? 'ACCESS DENIED. Agent flagged.' : (r.message || 'Connection error.');
    if (r.status === 'wrong') { shake(form); input.select(); }
  });

  function granted() {
    form.replaceChildren(
      el('h2', { text: '> SECURE TERMINAL // AGENT LOGIN' }),
      el('p', { class: 'granted', text: 'ACCESS GRANTED. Welcome back, Agent.' }));
  }
  if (ctx.solved) granted();
  ctx.mount.append(form);
}
