import {
  auth, db, configured, currentUser, isAdminUser, signInAnonymously,
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from './fb.js';
import { el } from './common.js';

export class SessionError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

/**
 * Signs the visitor in and figures out who they are.
 * Relatives: silent anonymous sign-in, tied to the household code in the link.
 * Admins (already signed in via Mastermind login): preview mode, nothing recorded.
 */
export async function startSession() {
  if (!configured) throw new SessionError('config', 'HQ has not finished wiring up this site yet.');
  const params = new URLSearchParams(location.search);
  let h = params.get('h') || '';
  try {
    if (h) localStorage.setItem('mm_h', h);
    else h = localStorage.getItem('mm_h') || '';
  } catch { /* storage blocked: fine, the link still works */ }

  let user = await currentUser();
  const admin = isAdminUser(user);

  if (!admin) {
    if (!h) throw new SessionError('nohouse', 'Please open this site using the special link from your briefing packet.');
    if (!user) user = (await signInAnonymously(auth)).user;
    const mref = doc(db, 'members', user.uid);
    let joined = false;
    try {
      const m = await getDoc(mref);
      joined = m.exists() && m.data().h === h;
    } catch { /* not joined yet */ }
    if (!joined) {
      try {
        await setDoc(mref, { h, at: serverTimestamp() });
      } catch {
        throw new SessionError('badlink', "This link isn't recognized. Please double-check it with HQ (Alexis & Mila).");
      }
    }
  }

  const [schedSnap, houseSnap] = await Promise.all([
    getDoc(doc(db, 'config', 'schedule')).catch(() => null),
    h ? getDoc(doc(db, 'households', h)).catch(() => null) : Promise.resolve(null),
  ]);
  const sched = schedSnap && schedSnap.exists() ? schedSnap.data() : null;
  const household = houseSnap && houseSnap.exists() ? houseSnap.data() : null;
  if (admin && !household) h = '';

  const gentleParam = params.get('gentle');
  const gentle = gentleParam != null ? gentleParam === '1' : !!(household && household.gentle);
  if (gentle) document.documentElement.classList.add('gentle');

  if (!admin) updateDoc(doc(db, 'progress', h), { lastActive: serverTimestamp() }).catch(() => {});

  return { user, admin, h, household, sched, gentle };
}

export function unlockMs(S, n) {
  const t = S.sched && S.sched.unlock && S.sched.unlock[String(n)];
  return t ? t.toMillis() : Infinity;
}
export function isEarly(S, n) {
  return !!(S.household && (S.household.early || []).includes(String(n)));
}
export function looksOpen(S, n) {
  return S.admin || isEarly(S, n) || Date.now() >= unlockMs(S, n);
}
/** Query string that keeps the household code (and preview gentle flag) across pages. */
export function linkParams(S, extra = {}) {
  const p = new URLSearchParams();
  if (S.h) p.set('h', S.h);
  const g = new URLSearchParams(location.search).get('gentle');
  if (S.admin && g != null) p.set('gentle', g);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return '?' + p.toString();
}

export function showSessionError(root, e) {
  console.error(e);
  root.replaceChildren(
    el('div', { class: 'notice' },
      el('div', { class: 'stamp big', text: 'Access restricted' }),
      el('p', { text: e instanceof SessionError ? e.message : 'Could not reach HQ. Check your internet connection and reload the page.' }),
    ),
  );
}
