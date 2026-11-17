// Day 6 — Decryption Bay (Vigenère)
import { el, shake } from '../common.js';

export function vigenereDecode(text, key) {
  const k = String(key || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) return text;
  let j = 0;
  return String(text).replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    const shift = k.charCodeAt(j++ % k.length) - 65;
    return String.fromCharCode(((ch.charCodeAt(0) - base - shift + 26) % 26) + base);
  });
}

export default function vigenere(ctx) {
  const cipher = ctx.day.ciphertext || '';
  const keyIn = el('input', { type: 'text', id: 'vkey', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const plain = el('div', { class: 'plain', 'aria-live': 'polite', text: cipher });
  const btn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Transmit decryption' });
  const msg = el('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });

  keyIn.addEventListener('input', () => { plain.textContent = vigenereDecode(cipher, keyIn.value); });

  const form = el('form', { class: 'bay answer-box' },
    el('label', { text: 'Intercepted ciphertext:' }),
    el('div', { class: 'cipher', text: cipher }),
    el('label', { for: 'vkey', text: 'Enter decryption key:' }),
    keyIn,
    el('label', { text: 'Decrypted output:' }),
    plain,
    el('div', {}, btn),
    msg);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!keyIn.value.trim()) { msg.className = 'feedback'; msg.textContent = 'Enter a key first.'; return; }
    btn.disabled = true;
    msg.className = 'feedback';
    msg.textContent = 'Transmitting to HQ…';
    const r = await ctx.submit(vigenereDecode(cipher, keyIn.value));
    btn.disabled = false;
    if (r.status === 'correct') { msg.textContent = ''; btn.remove(); return; }
    msg.className = 'feedback denied';
    msg.textContent = r.status === 'wrong' ? 'DECRYPTION REJECTED. That key does not unlock the message.' : (r.message || 'Connection error.');
    if (r.status === 'wrong') shake(form);
  });

  if (ctx.solved) btn.remove();
  ctx.mount.append(form);
}
