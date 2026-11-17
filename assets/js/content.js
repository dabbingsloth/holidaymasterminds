// Mastermind content loader: schedule, households, puzzle content, JSON backup/import.
// Everything is written straight to Firestore — nothing here ends up in the repo.
import { db, doc, collection, getDoc, getDocs, setDoc, writeBatch, Timestamp, serverTimestamp } from './fb.js';
import { el, pad2, fmtPT, normalize, sha256Hex, unlockTimes, todayPT, TYPES } from './common.js';
import { requireAdmin } from './admin-auth.js';

const root = document.getElementById('app');

const TYPE_LABEL = {
  physical: 'Physical box', login: 'Agent Login', nothing: 'Nothing Here', vigenere: 'Decryption Bay',
  safe: 'The Safe', audio: 'Intercepted Audio', map: 'Family Map',
};
const COMMON = [
  { k: 'title', label: 'Mission title', kind: 'text' },
  { k: 'brief', label: 'Briefing (shown at the top of the page)', kind: 'textarea' },
  { k: 'hint', label: 'Hint — normal households', kind: 'textarea' },
  { k: 'gentleHint', label: 'Hint — Grandma & Grandpa (gentler)', kind: 'textarea' },
];
const EXTRA = {
  physical: [],
  login: [{ k: 'prompt', label: 'Text on the login terminal', kind: 'text' }],
  nothing: [{ k: 'fragments', label: 'The 5 fragments, in order (one per box)', kind: 'five' }],
  vigenere: [{ k: 'ciphertext', label: 'Intercepted ciphertext', kind: 'textarea' }],
  safe: [],
  audio: [
    { k: 'audioUrl', label: 'Direct link to the .mp3', kind: 'text' },
    { k: 'prompt', label: 'Line shown above the player (optional)', kind: 'text' },
  ],
  map: [
    { k: 'riddle', label: 'Riddle', kind: 'textarea' },
    { k: 'pins', label: 'Pins in the CORRECT order — one per line:  label | latitude | longitude | letter', kind: 'pins', help: 'Example:  Grandma\'s house | 34.0522 | -118.2437 | R    (label is optional and shows on hover — leave it blank to keep places secret)' },
  ],
};
const ANSWER_HELP = {
  login: 'The passphrase.',
  nothing: 'The word the five fragments make.',
  vigenere: 'The full DECODED phrase (spaces/punctuation are ignored).',
  safe: 'The 6-digit code.',
  audio: 'What they should type after listening.',
  map: 'The word the trail spells.',
};

let store = { days: {}, reveals: {}, answers: {}, households: {}, finals: {}, schedule: null };

async function loadAll() {
  const [d, r, a, h, f, s] = await Promise.all([
    getDocs(collection(db, 'days')), getDocs(collection(db, 'reveals')), getDocs(collection(db, 'answers')),
    getDocs(collection(db, 'households')), getDocs(collection(db, 'finals')), getDoc(doc(db, 'config', 'schedule')),
  ]);
  const toMap = (qs) => { const m = {}; qs.forEach((x) => { m[x.id] = x.data(); }); return m; };
  store = { days: toMap(d), reveals: toMap(r), answers: toMap(a), households: toMap(h), finals: toMap(f), schedule: s.exists() ? s.data() : null };
}

function randomCode() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}
const playLink = (code) => new URL(`../play/?h=${code}`, location.href).href;
const flash = (node, text, ok = true) => { node.className = 'feedback ' + (ok ? 'ok' : 'denied'); node.textContent = text; };

// ---------------- schedule ----------------
async function saveSchedule(start, meetup) {
  const times = unlockTimes(start);
  const unlock = {};
  for (let n = 1; n <= 12; n++) unlock[String(n)] = Timestamp.fromMillis(times[n]);
  await setDoc(doc(db, 'config', 'schedule'), { start, meetup, unlock });
  store.schedule = { start, meetup, unlock };
}

function scheduleSection() {
  const s = store.schedule || {};
  const start = el('input', { type: 'date', id: 'start', value: s.start || '' });
  const meetup = el('input', { type: 'text', id: 'meetup', value: s.meetup || '' });
  const list = el('ol', { class: 'small' });
  const msg = el('p', { class: 'feedback' });
  const drawList = () => {
    list.replaceChildren();
    if (!start.value) return;
    const t = unlockTimes(start.value);
    for (let n = 1; n <= 12; n++) list.append(el('li', { text: `Day ${n}: ${fmtPT(t[n])} PT` }));
  };
  start.addEventListener('input', drawList);
  drawList();
  const save = async (startVal) => {
    if (!startVal) { flash(msg, 'Pick a start date.', false); return; }
    try { await saveSchedule(startVal, meetup.value.trim()); start.value = startVal; drawList(); flash(msg, 'Schedule saved.'); }
    catch (e) { flash(msg, 'Save failed: ' + e.message, false); }
  };
  return el('section', {},
    el('h2', { text: '1 · Schedule' }),
    el('div', { class: 'grid2' },
      el('div', {}, el('label', { for: 'start', text: 'Day 1 date (unlocks at midnight Pacific):' }), start),
      el('div', {}, el('label', { for: 'meetup', text: 'Meetup date (shown in the vault, e.g. "Christmas Day, Dec 25"):' }), meetup)),
    el('div', { class: 'toolbar' },
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Save schedule', onclick: () => save(start.value) }),
      el('button', { class: 'btn btn-small', type: 'button', text: 'TEST: start today', onclick: () => save(todayPT(0)) }),
      el('button', { class: 'btn btn-small', type: 'button', text: 'TEST: open all 12 days', onclick: () => save(todayPT(-11)) })),
    msg, list);
}

// ---------------- households ----------------
const DEFAULT_HOUSEHOLDS = [
  { name: 'Mom & Dad', gentle: false },
  { name: 'Grandma & Grandpa', gentle: true },
  { name: 'Uncle James & Phuong', gentle: false },
];

async function createHousehold(name, gentle, word = '', code = randomCode()) {
  const b = writeBatch(db);
  b.set(doc(db, 'households', code), { name, gentle: !!gentle, early: [], createdAt: serverTimestamp() });
  b.set(doc(db, 'progress', code), { solved: {}, lastSolved: '', lastActive: null });
  b.set(doc(db, 'finals', code), { word: normalize(word) });
  await b.commit();
  store.households[code] = { name, gentle: !!gentle, early: [], createdAt: Timestamp.now() };
  store.finals[code] = { word: normalize(word) };
  return code;
}

function householdsSection() {
  const wrap = el('section', {});
  const draw = () => {
    const codes = Object.keys(store.households).sort((a, b) => (store.households[a].createdAt?.toMillis?.() || 0) - (store.households[b].createdAt?.toMillis?.() || 0));
    const rows = codes.map((code) => {
      const hh = store.households[code];
      const name = el('input', { type: 'text', value: hh.name || '' });
      const gentle = el('input', { type: 'checkbox', checked: hh.gentle ? true : null, style: 'width:24px;height:24px' });
      const word = el('input', { type: 'text', value: (store.finals[code] || {}).word || '' });
      const msg = el('p', { class: 'feedback' });
      const save = async () => {
        try {
          const b = writeBatch(db);
          b.set(doc(db, 'households', code), { name: name.value.trim(), gentle: gentle.checked }, { merge: true });
          b.set(doc(db, 'finals', code), { word: normalize(word.value) });
          await b.commit();
          Object.assign(hh, { name: name.value.trim(), gentle: gentle.checked });
          store.finals[code] = { word: normalize(word.value) };
          word.value = normalize(word.value);
          flash(msg, 'Saved.');
        } catch (e) { flash(msg, 'Save failed: ' + e.message, false); }
      };
      return el('div', { class: 'hh-card', style: 'margin:12px 0' },
        el('div', { class: 'grid2' },
          el('div', {}, el('label', { text: 'Household name:' }), name),
          el('div', {}, el('label', { text: 'Final word (shown in their vault):' }), word)),
        el('label', { style: 'display:flex;gap:10px;align-items:center' }, gentle, 'Gentle mode (larger text, gentler hints)'),
        el('p', { class: 'small', text: 'Their link:' }),
        el('div', { class: 'linkbox', text: playLink(code) }),
        el('div', { class: 'toolbar' },
          el('button', { class: 'btn btn-small btn-primary', type: 'button', text: 'Save', onclick: save }),
          el('button', { class: 'btn btn-small', type: 'button', text: 'Copy link', onclick: () => navigator.clipboard.writeText(playLink(code)).then(() => flash(msg, 'Link copied.')) })),
        msg);
    });

    const newName = el('input', { type: 'text', id: 'newname' });
    const newGentle = el('input', { type: 'checkbox', style: 'width:24px;height:24px' });
    const msg = el('p', { class: 'feedback' });
    wrap.replaceChildren(
      el('h2', { text: '2 · Households' }),
      el('p', { class: 'help', text: 'Each household gets a secret random link. Anyone with the link joins that household — share each link only with that household.' }),
      codes.length === 0 ? el('div', { class: 'toolbar' },
        el('button', {
          class: 'btn btn-primary', type: 'button', text: 'Create the 3 households',
          onclick: async () => {
            try { for (const d of DEFAULT_HOUSEHOLDS) await createHousehold(d.name, d.gentle); draw(); }
            catch (e) { flash(msg, 'Failed: ' + e.message, false); }
          },
        })) : null,
      ...rows,
      el('details', {}, el('summary', { class: 'head', text: '+ Add another household' }),
        el('label', { for: 'newname', text: 'Name:' }), newName,
        el('label', { style: 'display:flex;gap:10px;align-items:center' }, newGentle, 'Gentle mode'),
        el('button', {
          class: 'btn btn-small', type: 'button', text: 'Create', onclick: async () => {
            if (!newName.value.trim()) return;
            try { await createHousehold(newName.value.trim(), newGentle.checked); draw(); } catch (e) { flash(msg, 'Failed: ' + e.message, false); }
          },
        })),
      msg);
  };
  draw();
  return wrap;
}

// ---------------- day forms ----------------
function field(spec, value) {
  const id = 'f-' + Math.random().toString(36).slice(2);
  let input;
  let get;
  if (spec.kind === 'textarea') {
    input = el('textarea', { id });
    input.value = value || '';
    get = () => input.value.trim();
  } else if (spec.kind === 'five') {
    const arr = Array.isArray(value) ? value : [];
    const boxes = Array.from({ length: 5 }, (_, i) => el('input', { type: 'text', 'aria-label': `Fragment ${i + 1}`, value: arr[i] || '', style: 'width:5em;min-width:0;flex:1' }));
    input = el('div', { class: 'toolbar' }, boxes.map((b, i) => el('span', { style: 'display:flex;align-items:center;gap:4px;flex:1' }, `${i + 1}:`, b)));
    get = () => boxes.map((b) => b.value.trim());
  } else if (spec.kind === 'pins') {
    input = el('textarea', { id, style: 'min-height:140px' });
    input.value = (Array.isArray(value) ? value : []).map((p) => [p.label || '', p.lat, p.lng, p.letter || ''].join(' | ')).join('\n');
    get = () => input.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [label, lat, lng, letter] = l.split('|').map((x) => x.trim());
      if (!isFinite(Number(lat)) || !isFinite(Number(lng)) || lat === '' || lng === '') throw new Error(`Bad pin line: "${l}"`);
      return { label: label || '', lat: Number(lat), lng: Number(lng), letter: (letter || '').toUpperCase() };
    });
  } else {
    input = el('input', { type: 'text', id, value: value || '' });
    get = () => input.value.trim();
  }
  return { node: el('div', {}, el('label', { for: id, text: spec.label }), input, spec.help ? el('p', { class: 'help', text: spec.help }) : null), get };
}

async function saveDay(n, data, { letter, message, answer, answerHash }) {
  const type = TYPES[n];
  const b = writeBatch(db);
  b.set(doc(db, 'days', String(n)), { ...data, type });
  b.set(doc(db, 'reveals', String(n)), { letter: normalize(letter), message: message || '' });
  let hash = answerHash || '';
  if (type === 'physical') hash = normalize(letter) ? await sha256Hex(normalize(letter)) : '';
  else if (answer && normalize(answer)) hash = await sha256Hex(normalize(answer));
  if (hash) b.set(doc(db, 'answers', String(n)), { hash });
  await b.commit();
  store.days[n] = { ...data, type };
  store.reveals[n] = { letter: normalize(letter), message: message || '' };
  if (hash) store.answers[n] = { hash };
}

function dayForm(n) {
  const type = TYPES[n];
  const d = store.days[n] || {};
  const r = store.reveals[n] || {};
  const hasHash = !!(store.answers[n] && store.answers[n].hash);
  const fields = [...COMMON, ...EXTRA[type]].map((spec) => ({ spec, ...field(spec, d[spec.k]) }));
  const letter = el('input', { type: 'text', value: r.letter || '', maxlength: 12, style: 'text-transform:uppercase' });
  const message = type === 'safe' ? el('input', { type: 'text', value: r.message ?? 'NORTH is the edge with the notch.' }) : null;
  const answer = type !== 'physical' ? el('input', { type: 'text', autocomplete: 'off' }) : null;
  const msg = el('p', { class: 'feedback' });
  const status = el('span', { class: 'small' });
  const drawStatus = () => {
    const ok = !!(store.days[n] && (store.answers[n] || {}).hash && (store.reveals[n] || {}).letter);
    status.className = 'small ' + (ok ? 'ok' : 'bad');
    status.textContent = ok ? '✔ ready' : '✗ incomplete';
  };
  drawStatus();

  const save = async () => {
    try {
      const data = {};
      for (const f of fields) data[f.spec.k] = f.get();
      if (!normalize(letter.value)) throw new Error('Code-piece letter is required.');
      if (type === 'nothing' && data.fragments.some((x) => !x)) throw new Error('All 5 fragments are required.');
      if (type === 'safe' && answer.value && !/^\d{6}$/.test(answer.value.trim())) throw new Error('Safe code must be exactly 6 digits.');
      await saveDay(n, data, { letter: letter.value, message: message ? message.value : '', answer: answer ? answer.value : '' });
      if (answer) answer.value = '';
      drawStatus();
      flash(msg, `Day ${n} saved.` + (type !== 'physical' && !(store.answers[n] || {}).hash ? ' (No answer set yet!)' : ''));
    } catch (e) { flash(msg, 'Not saved: ' + e.message, false); }
  };

  return el('details', { class: 'dayform' },
    el('summary', {}, `Day ${pad2(n)} · ${TYPE_LABEL[type]}`, d.title ? el('span', { class: 'muted small', text: `— ${d.title}` }) : null, status),
    ...fields.map((f) => f.node),
    el('div', { class: 'grid2' },
      el('div', {}, el('label', { text: type === 'physical' ? `Code-piece letter (also the answer they type for box #${n}):` : 'Code-piece letter revealed on solve:' }), letter),
      answer ? el('div', {},
        el('label', { text: 'Answer (plain text — hashed before saving):' }), answer,
        el('p', { class: 'help', text: `${ANSWER_HELP[type]} ${hasHash ? 'An answer is already set; leave blank to keep it.' : 'No answer set yet.'}` })) : null),
    message ? el('div', {}, el('label', { text: 'Message shown when the safe opens:' }), message) : null,
    el('div', { class: 'toolbar' },
      el('button', { class: 'btn btn-primary', type: 'button', text: `Save Day ${n}`, onclick: save }),
      el('a', { class: 'btn btn-small', href: `../play/day.html?d=${n}`, target: '_blank', text: 'Preview' })),
    msg);
}

// ---------------- JSON backup / import ----------------
function exportJSON() {
  const out = {
    schedule: store.schedule ? { start: store.schedule.start, meetup: store.schedule.meetup } : null,
    days: {},
    households: Object.entries(store.households).map(([code, h]) => ({ code, name: h.name, gentle: !!h.gentle, finalWord: (store.finals[code] || {}).word || '' })),
  };
  for (let n = 1; n <= 12; n++) {
    if (!store.days[n] && !store.reveals[n]) continue;
    const { type, ...rest } = store.days[n] || {};
    out.days[n] = { ...rest, letter: (store.reveals[n] || {}).letter || '', message: (store.reveals[n] || {}).message || '', answerHash: (store.answers[n] || {}).hash || '' };
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `masterminds-content-${todayPT()}.json` });
  document.body.append(a); a.click(); a.remove();
}

async function importJSON(text, msg) {
  const data = JSON.parse(text);
  if (data.schedule && data.schedule.start) await saveSchedule(data.schedule.start, data.schedule.meetup || '');
  for (const [k, v] of Object.entries(data.days || {})) {
    const n = Number(k);
    if (!(n >= 1 && n <= 12)) continue;
    const { letter, message, answer, answerHash, type, ...fields } = v;
    await saveDay(n, fields, { letter: letter || '', message, answer, answerHash });
  }
  for (const h of data.households || []) {
    if (h.code && store.households[h.code]) {
      const b = writeBatch(db);
      b.set(doc(db, 'households', h.code), { name: h.name, gentle: !!h.gentle }, { merge: true });
      b.set(doc(db, 'finals', h.code), { word: normalize(h.finalWord || '') });
      await b.commit();
    } else {
      await createHousehold(h.name, h.gentle, h.finalWord || '', h.code || randomCode());
    }
  }
  flash(msg, 'Import complete. Reloading…');
  setTimeout(() => location.reload(), 1200);
}

function backupSection() {
  const ta = el('textarea', { style: 'min-height:160px', 'aria-label': 'JSON to import' });
  const file = el('input', { type: 'file', accept: '.json,application/json' });
  file.addEventListener('change', async () => { if (file.files[0]) ta.value = await file.files[0].text(); });
  const msg = el('p', { class: 'feedback' });
  return el('section', {},
    el('h2', { text: '4 · Backup & import' }),
    el('p', { class: 'help', text: 'Export saves everything (answers as hashes) to a file on your computer. Keep it OUT of the repo. For import, any day may include "answer": "plain text" instead of "answerHash" — it is hashed on import. Households with no "code" get a new random link.' }),
    el('div', { class: 'toolbar' }, el('button', { class: 'btn', type: 'button', text: 'Export JSON', onclick: exportJSON })),
    el('label', { text: 'Import JSON (paste or choose a file):' }), file, ta,
    el('div', { class: 'toolbar' }, el('button', {
      class: 'btn btn-primary', type: 'button', text: 'Import', onclick: async () => {
        if (!confirm('Import will overwrite matching days, schedule and households. Continue?')) return;
        try { await importJSON(ta.value, msg); } catch (e) { flash(msg, 'Import failed: ' + e.message, false); }
      },
    })),
    msg);
}

async function main() {
  const user = await requireAdmin(root);
  if (!user) return;
  await loadAll();
  root.replaceChildren(
    el('h1', { text: 'LOAD CONTENT' }),
    el('p', { class: 'help', text: 'Everything you enter here is stored in Firestore only. Answers are normalized (UPPERCASE, no spaces or punctuation) and hashed before saving.' }),
    scheduleSection(),
    householdsSection(),
    el('section', {}, el('h2', { text: '3 · The 12 days' }), Array.from({ length: 12 }, (_, i) => dayForm(i + 1))),
    backupSection());
}
main();
