// Day 10 — Intercepted Audio
import { el } from '../common.js';
import { answerBox } from '../ui.js';

const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export default function audio(ctx) {
  const url = ctx.day.audioUrl || '';
  const a = new Audio();
  a.preload = 'metadata';
  a.src = url;

  const playBtn = el('button', { class: 'btn', type: 'button', text: '▶ Play' });
  const back = el('button', { class: 'btn btn-small', type: 'button', text: '⟲ 10s', 'aria-label': 'Back 10 seconds' });
  const seek = el('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Position' });
  const time = el('span', { class: 'time', text: '0:00 / 0:00' });
  const status = el('p', { class: 'small', role: 'status' });
  const player = el('div', { class: 'player' },
    el('div', { class: 'label', text: 'Intercept // Reel 10 // Source unknown' }),
    el('div', { class: 'reels', 'aria-hidden': 'true' }, el('div', { class: 'reel' }), el('div', { class: 'reel' })),
    el('div', { class: 'controls' }, playBtn, back, seek, time),
    status);

  const sync = () => {
    time.textContent = `${fmt(a.currentTime)} / ${fmt(a.duration)}`;
    if (a.duration) seek.value = Math.round((a.currentTime / a.duration) * 1000);
  };
  playBtn.addEventListener('click', () => {
    if (a.paused) a.play().catch(() => { status.textContent = 'Playback failed. Try again, or tell HQ the tape is jammed.'; });
    else a.pause();
  });
  back.addEventListener('click', () => { a.currentTime = Math.max(0, a.currentTime - 10); });
  seek.addEventListener('input', () => { if (a.duration) a.currentTime = (seek.value / 1000) * a.duration; });
  a.addEventListener('play', () => { player.classList.add('playing'); playBtn.textContent = '❚❚ Pause'; });
  a.addEventListener('pause', () => { player.classList.remove('playing'); playBtn.textContent = '▶ Play'; });
  a.addEventListener('timeupdate', sync);
  a.addEventListener('loadedmetadata', sync);
  a.addEventListener('error', () => { if (url) status.textContent = 'The tape could not be loaded. Tell HQ.'; });
  if (!url) status.textContent = 'No intercept on file yet.';

  ctx.mount.append(
    ctx.day.prompt ? el('p', { class: 'head', text: ctx.day.prompt }) : null,
    player,
    answerBox(ctx, { label: 'Decoded message:', button: 'Submit' }));
}
