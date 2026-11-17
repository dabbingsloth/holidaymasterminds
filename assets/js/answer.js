// Answer checking.
// The browser normalizes + SHA-256 hashes the guess, then:
//   1) records the guess (always succeeds unless the day is locked / Day 8 lockout) — counts the attempt
//   2) tries to mark the day solved — the security rules only allow this if the recorded
//      guess equals the secret hash in answers/{n}, which browsers can never read.
import { db, doc, getDoc, runTransaction, writeBatch, serverTimestamp } from './fb.js';
import { normalize, sha256Hex, errCode } from './common.js';

export async function loadDayState(S, n) {
  if (S.admin || !S.h) return {};
  try {
    const s = await getDoc(doc(db, 'progress', S.h, 'd', String(n)));
    return s.exists() ? s.data() : {};
  } catch { return {}; }
}

/** Day 8 only: ms timestamp until which the safe is locked (0 = not locked). */
export function lockedUntil(n, st) {
  if (Number(n) !== 8 || !st || st.solvedAt) return 0;
  const t = (st.tries || 0) - (st.cleared || 0);
  if (t > 0 && t % 3 === 0 && st.lastGuessAt) return st.lastGuessAt.toMillis() + 60 * 60 * 1000;
  return 0;
}

export async function getReveal(n) {
  try {
    const r = await getDoc(doc(db, 'reveals', String(n)));
    return r.exists() ? r.data() : {};
  } catch { return {}; }
}

const NET = 'Connection problem — check your internet and try again.';

/** Returns { status: 'correct'|'wrong'|'locked'|'empty'|'error', letter?, message?, state?, preview? } */
export async function submitAnswer(S, n, raw) {
  const norm = normalize(raw);
  if (!norm) return { status: 'empty' };
  const hash = await sha256Hex(norm);

  if (S.admin) { // Mastermind preview: check locally, record nothing.
    try {
      const a = await getDoc(doc(db, 'answers', String(n)));
      if (a.exists() && a.data().hash === hash) return { status: 'correct', preview: true, ...(await getReveal(n)) };
      return { status: 'wrong', preview: true, state: {} };
    } catch { return { status: 'error', message: NET }; }
  }

  const dref = doc(db, 'progress', S.h, 'd', String(n));

  // 1) record the guess
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(dref);
      if (!snap.exists()) tx.set(dref, { tries: 1, cleared: 0, guess: hash, lastGuessAt: serverTimestamp() });
      else tx.update(dref, { tries: (snap.data().tries || 0) + 1, guess: hash, lastGuessAt: serverTimestamp() });
    });
  } catch (e) {
    if (errCode(e) === 'permission-denied') {
      const state = await loadDayState(S, n);
      if (state.solvedAt) return { status: 'correct', ...(await getReveal(n)), state };
      if (lockedUntil(n, state) > Date.now() - 5000) return { status: 'locked', state };
      return { status: 'error', message: 'HQ refused that attempt. Try reloading the page.' };
    }
    return { status: 'error', message: NET };
  }

  // 2) claim the solve
  try {
    const b = writeBatch(db);
    b.update(dref, { solvedAt: serverTimestamp() });
    b.update(doc(db, 'progress', S.h), {
      ['solved.' + n]: serverTimestamp(),
      lastSolved: String(n),
      lastActive: serverTimestamp(),
    });
    await b.commit();
  } catch (e) {
    if (errCode(e) === 'permission-denied') return { status: 'wrong', state: await loadDayState(S, n) };
    return { status: 'error', message: NET };
  }
  return { status: 'correct', ...(await getReveal(n)), state: await loadDayState(S, n) };
}
