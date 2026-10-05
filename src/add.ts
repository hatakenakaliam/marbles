import { NEUTRAL, colorIndex, cssColor, onSchemeChange, paintMarble } from './marble';
import { Sheet } from './sheet';
import { clamp, fmtDur, fmtWhen, h, reduced, spring, velocity, type Spr } from './util';
import { radiusFor } from './world';

const STEP = 10; // px per 5 minutes
const COUNT = 72; // 5m … 6h
const PREVIEW = 1.25; // the preview is a touch larger than life
const PW = 150;
const PH = 128;

export interface Draft {
  name: string;
  minutes: number;
  startedAt: number | null;
}

export function createAdd(opts: {
  recent: () => string[];
  onConfirm: (d: Draft, from: { x: number; y: number; r: number }) => void;
}) {
  const sheet = new Sheet({ modal: true, onClose: () => name.blur() });
  const root = h('div', 'add');
  root.innerHTML = `
    <input class="name" type="text" placeholder="What did you work on?" maxlength="40"
      enterkeyhint="done" autocomplete="off" autocapitalize="sentences" spellcheck="false" />
    <div class="chips" data-nodrag></div>
    <canvas class="preview"></canvas>
    <div class="readout"></div>
    <div class="scrub" data-nodrag><div class="strip"></div><i class="needle"></i></div>
    <div class="row">
      <label class="when press"><span></span><input type="datetime-local" aria-label="Started at" /></label>
      <button class="primary press">Add</button>
    </div>`;
  sheet.el.append(root);

  const name = root.querySelector<HTMLInputElement>('.name')!;
  const chips = root.querySelector<HTMLElement>('.chips')!;
  const canvas = root.querySelector<HTMLCanvasElement>('.preview')!;
  const readout = root.querySelector<HTMLElement>('.readout')!;
  const scrub = root.querySelector<HTMLElement>('.scrub')!;
  const strip = root.querySelector<HTMLElement>('.strip')!;
  const whenLabel = root.querySelector<HTMLElement>('.when span')!;
  const when = root.querySelector<HTMLInputElement>('.when input')!;
  const confirm = root.querySelector<HTMLButtonElement>('.primary')!;

  // ── live preview marble ──
  const dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.width = PW * dpr;
  canvas.height = PH * dpr;
  const ctx = canvas.getContext('2d')!;
  const size: Spr = { v: radiusFor(60) * PREVIEW, vel: 0, to: radiusFor(60) * PREVIEW };
  let ci = NEUTRAL;
  let prevCi = NEUTRAL;
  let blend = 1;
  let praf = 0;
  let plast = 0;

  function paint(now: number) {
    praf = 0;
    const dt = plast ? Math.min(now - plast, 50) : 16;
    plast = now;
    let active = spring(size, 260, 17, dt / 1000, 0.01);
    if (blend < 1) {
      blend = Math.min(1, blend + dt / 160);
      active = true;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PW, PH);
    const r = Math.max(size.v, 1);
    const cy = PH / 2 - 4;
    if (blend < 1) {
      paintMarble(ctx, PW / 2, cy, r, prevCi);
      ctx.globalAlpha = blend;
      paintMarble(ctx, PW / 2, cy, r, ci, false);
      ctx.globalAlpha = 1;
    } else paintMarble(ctx, PW / 2, cy, r, ci);
    if (active) praf = requestAnimationFrame(paint);
    else plast = 0;
  }
  const kick = () => {
    if (reduced()) size.v = size.to;
    if (!praf) praf = requestAnimationFrame(paint);
  };
  onSchemeChange(kick);

  // ── duration scrubber ──
  const ticks: HTMLElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const m = (i + 1) * 5;
    const t = h('i', m % 60 === 0 ? 'tick hour' : m % 30 === 0 ? 'tick half' : 'tick');
    t.style.left = `${i * STEP}px`;
    if (m % 60 === 0) t.dataset.label = `${m / 60}h`;
    strip.append(t);
    ticks.push(t);
  }
  const pos: Spr = { v: 11, vel: 0, to: 11 }; // index into the 5-minute steps; 11 = 1h
  let index = -1;
  let sraf = 0;
  let slast = 0;
  const minutes = () => (index + 1) * 5;

  function layout() {
    strip.style.transform = `translate3d(${-pos.v * STEP}px,0,0)`;
    // ticks brighten as they pass under the needle
    const lo = Math.max(0, Math.floor(pos.v - 9));
    const hi = Math.min(COUNT - 1, Math.ceil(pos.v + 9));
    for (let i = lo; i <= hi; i++) {
      const d = Math.abs(i - pos.v) * STEP;
      ticks[i].style.opacity = (0.22 + 0.78 * Math.max(0, 1 - d / 64) ** 2).toFixed(3);
    }
    const next = clamp(Math.round(pos.v), 0, COUNT - 1);
    if (next === index) return;
    index = next;
    readout.textContent = fmtDur(minutes());
    size.to = radiusFor(minutes()) * PREVIEW;
    kick();
  }

  function glide(now: number) {
    sraf = 0;
    const dt = slast ? Math.min(now - slast, 50) : 16;
    slast = now;
    const active = spring(pos, 240, 28, dt / 1000, 0.002);
    layout();
    if (active) sraf = requestAnimationFrame(glide);
    else slast = 0;
  }
  function snapTo(i: number, v = 0) {
    pos.to = clamp(Math.round(i), 0, COUNT - 1);
    pos.vel = v;
    if (reduced()) {
      pos.v = pos.to;
      pos.vel = 0;
    }
    if (!sraf) sraf = requestAnimationFrame(glide);
  }

  let grab: { id: number; x: number; at: number; moved: boolean } | null = null;
  const samples: { t: number; v: number }[] = [];
  scrub.addEventListener('pointerdown', (e) => {
    scrub.setPointerCapture(e.pointerId);
    cancelAnimationFrame(sraf);
    sraf = slast = 0;
    grab = { id: e.pointerId, x: e.clientX, at: pos.v, moved: false };
    samples.length = 0;
  });
  scrub.addEventListener('pointermove', (e) => {
    if (!grab || e.pointerId !== grab.id) return;
    const dx = e.clientX - grab.x;
    if (Math.abs(dx) > 4) grab.moved = true;
    let p = grab.at - dx / STEP;
    if (p < 0) p *= 0.3; // resist past either end
    if (p > COUNT - 1) p = COUNT - 1 + (p - COUNT + 1) * 0.3;
    pos.v = p;
    samples.push({ t: performance.now(), v: p });
    if (samples.length > 12) samples.shift();
    layout();
  });
  const drop = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.id) return;
    const g = grab;
    grab = null;
    if (!g.moved) {
      // a tap jumps to the tick under the finger
      const r = scrub.getBoundingClientRect();
      return snapTo(pos.v + (e.clientX - (r.left + r.width / 2)) / STEP);
    }
    const v = velocity(samples, performance.now()); // steps per ms
    snapTo(pos.v + v * 160, v * 1000);
  };
  scrub.addEventListener('pointerup', drop);
  scrub.addEventListener('pointercancel', drop);

  // ── name, chips, when ──
  function onName() {
    const next = colorIndex(name.value);
    if (next !== ci) {
      prevCi = ci;
      ci = next;
      blend = 0;
      kick();
    }
    confirm.classList.toggle('off', !name.value.trim());
  }
  name.addEventListener('input', onName);
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') name.blur();
  });

  function setWhen() {
    const t = when.value ? new Date(when.value).getTime() : NaN;
    whenLabel.textContent = Number.isFinite(t) ? fmtWhen(Math.min(t, Date.now())) : 'Just now';
  }
  when.addEventListener('input', setWhen);
  when.addEventListener('change', setWhen);

  confirm.addEventListener('click', () => {
    const nm = name.value.trim();
    if (!nm) return name.focus();
    const t = when.value ? new Date(when.value).getTime() : NaN;
    const r = canvas.getBoundingClientRect();
    canvas.style.visibility = 'hidden'; // the flying marble takes over from exactly here
    sheet.close();
    opts.onConfirm(
      { name: nm, minutes: minutes(), startedAt: Number.isFinite(t) ? Math.min(t, Date.now()) : null },
      { x: r.left + r.width / 2, y: r.top + PH / 2 - 4, r: size.v },
    );
  });

  layout();

  return {
    open() {
      name.value = '';
      when.value = '';
      const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
      when.max = d.toISOString().slice(0, 16);
      setWhen();
      onName();
      canvas.style.visibility = '';
      chips.replaceChildren(
        ...opts.recent().map((n) => {
          const b = h('button', 'chip press');
          const dot = h('i', 'dot');
          dot.style.background = cssColor(colorIndex(n));
          b.append(dot, n);
          b.addEventListener('click', () => {
            name.value = n;
            onName();
            name.blur();
          });
          return b;
        }),
      );
      chips.scrollLeft = 0;
      kick();
      sheet.open();
      name.focus({ preventScroll: true }); // inside the tap, so iOS raises the keyboard
    },
  };
}
