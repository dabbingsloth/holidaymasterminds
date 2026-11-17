// Day 4 — Nothing Here. Five numbered fragments, each hidden a different way.
import { el } from '../common.js';
import { answerBox } from '../ui.js';

const CLIP_SVG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#7a6a4f" stroke-width="1.6" stroke-linecap="round">' +
  '<path d="M8 12.5V6a4 4 0 0 1 8 0v10a2.5 2.5 0 0 1-5 0V7.5"/></svg>');

export default function nothing(ctx) {
  const f = Array.isArray(ctx.day.fragments) ? ctx.day.fragments : [];
  const frag = (i) => `fragment ${i + 1} of 5: ${f[i] ?? '?'}`;

  // 1) the browser tab title
  document.title = frag(0);

  const magnifier = el('button', {
    class: 'magnifier', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Magnifier', text: '🔍',
    onclick: () => {
      const on = document.documentElement.classList.toggle('magnify');
      magnifier.setAttribute('aria-pressed', String(on));
    },
  });

  const voidArea = el('div', { class: 'void' },
    el('p', { class: 'head', text: 'Five fragments of intel have been hidden within this dossier.' }),
    ctx.gentle ? el('p', { class: 'muted', text: 'Try selecting everything.' }) : null,
    // 2) white-on-white text — revealed by Select All
    el('p', { class: 'ghost', text: frag(1) }),
    // 3) alt text of a small off-center image
    el('img', { class: 'clip', src: CLIP_SVG, alt: frag(2), title: frag(2), width: 18, height: 18 }),
    // 4) 2px micro-text (magnifier toggle)
    el('span', { class: 'micro', text: frag(3) }),
    magnifier,
  );
  // 5) an HTML comment, injected from Firestore content
  voidArea.append(document.createComment(` ${frag(4)} `));

  ctx.mount.append(voidArea, answerBox(ctx, { label: 'Assembled intel:', button: 'Submit intel' }));
}
