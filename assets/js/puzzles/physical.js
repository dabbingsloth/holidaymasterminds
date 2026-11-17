import { db, doc, getDoc, onSnapshot } from '../fb.js';
import { el, pad2, errCode } from '../common.js';
import { answerBox } from '../ui.js';

export default function physical(ctx) {
  const { n, S } = ctx;
  ctx.mount.append(
    el('div', { class: 'notice' },
      el('p', {}, el('span', { class: 'stamp big', text: `Box #${n}` })),
      el('p', { class: 'head', text: `Physical mission — open box #${n}.` }),
      el('p', { class: 'muted', text: 'Complete the mission inside the box. It will give you a code-piece letter.' })),
    answerBox(ctx, {
      label: `Code-piece letter from box #${n}:`,
      button: 'Confirm',
      maxlength: 12,
      denied: `That doesn't match. Check box #${n} again, Agent.`,
    }),
  );
  if (n === 12) vault(ctx);
}

function vault(ctx) {
  const { S } = ctx;
  const box = el('section', { class: 'vault' });
  ctx.mount.append(box);
  const meetup = (S.sched && S.sched.meetup) || 'the appointed day';

  if (!S.h) {
    box.append(el('h2', { text: 'THE VAULT' }), el('p', { class: 'muted', text: 'Preview: open this page from a household (dashboard → Preview) to see its final word.' }));
    return;
  }

  let shown = false;
  async function update(solved) {
    if (shown) return;
    const need = Array.from({ length: 11 }, (_, i) => String(i + 1));
    const done = need.filter((k) => k in solved).length;
    if (done < 11) {
      box.replaceChildren(
        el('h2', { text: 'THE VAULT' }),
        el('p', {}, el('span', { class: 'stamp', text: 'Sealed' })),
        el('p', { text: `${done} of 11 missions complete. Solve Days 1–11 to open the vault.` }));
      return;
    }
    try {
      const f = await getDoc(doc(db, 'finals', S.h));
      const word = f.exists() ? f.data().word : '';
      shown = true;
      box.replaceChildren(
        el('h2', { text: 'THE VAULT IS OPEN' }),
        el('p', { text: 'Your household\'s word:' }),
        el('div', { class: 'word', text: word || '(HQ has not set it yet)' }),
        el('p', { class: 'head', text: `Three households. Three words. One password. Bring this to HQ on ${meetup}.` }),
        el('p', {}, el('span', { class: 'stamp big thump', text: 'Mastermind' })));
    } catch (e) {
      box.replaceChildren(el('h2', { text: 'THE VAULT' }), el('p', { text: errCode(e) === 'permission-denied' ? 'The vault is still sealed.' : 'Could not reach HQ. Reload to try again.' }));
    }
  }

  onSnapshot(doc(db, 'progress', S.h), (snap) => update((snap.exists() && snap.data().solved) || {}), () => {});
}
