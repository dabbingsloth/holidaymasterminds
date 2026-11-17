import { el, pad2, shake } from './common.js';

export function revealCard(n, r = {}, preview = false) {
  return el('section', { class: 'reveal', 'aria-live': 'polite' },
    el('div', { class: 'stamp big thump', text: 'Declassified' }),
    r.message ? el('p', { class: 'reveal-msg', text: r.message }) : null,
    el('p', { class: 'codepiece' },
      `CODE PIECE No. ${pad2(n)}: `,
      el('span', { class: 'letter', text: r.letter || '?' })),
    el('p', { class: 'tag-note', text: 'Write this on your ornament tag.' }),
    preview ? el('p', { class: 'preview-note', text: 'Mastermind preview — not recorded.' }) : null,
  );
}

/**
 * Standard answer form. opts: { label, button, denied, maxlength, inputmode }
 * Calls ctx.submit(); on success day.js shows the reveal card.
 */
export function answerBox(ctx, opts = {}) {
  const id = 'answer-' + ctx.n;
  const input = el('input', {
    type: 'text', id, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    maxlength: opts.maxlength, inputmode: opts.inputmode,
  });
  const btn = el('button', { class: 'btn btn-primary', type: 'submit', text: opts.button || 'Submit' });
  const msg = el('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
  const form = el('form', { class: 'answer-box' },
    el('label', { for: id, text: opts.label || 'Your answer:' }),
    el('div', { class: 'row' }, input, btn),
    msg);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    msg.className = 'feedback';
    msg.textContent = 'Transmitting to HQ…';
    const r = await ctx.submit(input.value);
    btn.disabled = false;
    if (r.status === 'empty') { msg.textContent = 'Type an answer first.'; return; }
    if (r.status === 'correct') { markSolved(); return; }
    if (r.status === 'wrong') {
      msg.className = 'feedback denied';
      msg.textContent = opts.denied || 'ACCESS DENIED. That is not it, Agent.';
      shake(form);
      input.select();
      return;
    }
    msg.className = 'feedback denied';
    msg.textContent = r.message || 'Something went wrong. Try again.';
  });

  function markSolved() {
    form.replaceChildren(el('p', { class: 'center' }, el('span', { class: 'stamp green', text: 'Mission complete' })));
  }
  if (ctx.solved) markSolved();
  return form;
}
