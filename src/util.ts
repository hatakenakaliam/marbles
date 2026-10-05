export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const rm = matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => rm.matches;

export const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

export function fmtDur(minutes: number) {
  const m = Math.round(minutes);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return hh ? (mm ? `${hh}h ${mm}m` : `${hh}h`) : `${mm}m`;
}

/** "Tue, Oct 6 · 9:10 am" — the year is appended only when it isn't this one. */
export function fmtWhen(t: number) {
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const day = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return `${day} · ${time}`;
}

export interface Spr {
  v: number;
  vel: number;
  to: number;
}

/** Advances a damped spring by dt seconds. Returns false once it has come to rest. */
export function spring(s: Spr, k: number, c: number, dt: number, eps = 0.001) {
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const step = dt / n;
  for (let i = 0; i < n; i++) {
    s.vel += (-k * (s.v - s.to) - c * s.vel) * step;
    s.v += s.vel * step;
  }
  if (Math.abs(s.v - s.to) < eps && Math.abs(s.vel) < eps * 20) {
    s.v = s.to;
    s.vel = 0;
    return false;
  }
  return true;
}

/** Velocity (units/ms) over the last ~100ms of pointer samples. */
export function velocity(samples: { t: number; v: number }[], now: number) {
  const recent = samples.filter((s) => now - s.t < 100);
  if (recent.length < 2) return 0;
  const a = recent[0];
  const b = recent[recent.length - 1];
  return b.t > a.t ? (b.v - a.v) / (b.t - a.t) : 0;
}

/** Safe-area insets in px, measured through a probe because env() isn't readable from JS. */
export function safeArea() {
  const p = h('div');
  p.style.cssText =
    'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.append(p);
  const cs = getComputedStyle(p);
  const out = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  p.remove();
  return out;
}

/** Swaps an element's content with a crossfade. */
export function xfade(el: HTMLElement, html: string) {
  if (el.dataset.v === html) return;
  el.dataset.v = html;
  const old = el.lastElementChild as HTMLElement | null;
  const next = h('span', 'xf');
  next.innerHTML = html;
  el.append(next);
  if (!old) return;
  old.classList.add('xf-out');
  old.animate({ opacity: [1, 0] }, { duration: 200, easing: EASE }).onfinish = () => old.remove();
  next.animate({ opacity: [0, 1] }, { duration: 200, easing: EASE });
}
