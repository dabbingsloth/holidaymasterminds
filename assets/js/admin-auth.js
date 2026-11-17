// Shared Mastermind login gate. Real enforcement is in firestore.rules.
import { auth, db, configured, currentUser, isAdminUser, signInWithEmailAndPassword, signOut, collection, getDocs } from './fb.js';
import { el, errCode } from './common.js';

export async function requireAdmin(root) {
  if (!configured) {
    root.replaceChildren(el('p', { class: 'notice', text: 'Firebase is not configured yet — paste the web config into assets/js/firebase-config.js.' }));
    return null;
  }
  const user = await currentUser();
  if (isAdminUser(user)) {
    if (await probe()) return user;
    await signOut(auth);
    return loginForm(root, 'That account is not a Mastermind.');
  }
  return loginForm(root);
}

async function probe() {
  try { await getDocs(collection(db, 'households')); return true; }
  catch { return false; }
}

function loginForm(root, error = '') {
  return new Promise((resolve) => {
    const email = el('input', { type: 'email', id: 'em', autocomplete: 'username', required: true });
    const pass = el('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
    const btn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Enter HQ' });
    const msg = el('p', { class: 'feedback denied', role: 'status', text: error });
    const form = el('form', { style: 'max-width:420px;margin:0 auto' },
      el('h1', { class: 'center', text: 'MASTERMIND LOGIN' }),
      el('p', { class: 'center' }, el('span', { class: 'stamp', text: 'Eyes only' })),
      el('label', { for: 'em', text: 'Email:' }), email,
      el('label', { for: 'pw', text: 'Password:' }), pass,
      el('p', {}, btn), msg);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      msg.textContent = '';
      try {
        const cred = await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
        if (await probe()) { resolve(cred.user); return; }
        await signOut(auth);
        msg.textContent = 'ACCESS DENIED. That account is not a Mastermind.';
      } catch (err) {
        const c = errCode(err);
        msg.textContent = c === 'too-many-requests' ? 'Too many attempts. Wait a few minutes.' : 'ACCESS DENIED. Check the email and password.';
      }
      btn.disabled = false;
    });
    root.replaceChildren(form);
  });
}

export async function logout() {
  await signOut(auth);
  location.reload();
}
