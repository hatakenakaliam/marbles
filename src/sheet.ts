import { clamp, h, velocity } from './util';

const stage = document.getElementById('stage')!;

/** How far the app recedes behind a modal sheet: 0 flat … 1 fully back. */
function setStage(p: number, animate: boolean) {
  stage.style.transition = animate ? '' : 'none';
  stage.style.setProperty('--p', String(p));
  if (p > 0) stage.classList.add('behind');
}
stage.addEventListener('transitionend', (e) => {
  if (e.target === stage && stage.style.getPropertyValue('--p') === '0') stage.classList.remove('behind');
});

interface Options {
  modal: boolean;
  /** With the keyboard up, the sheet rises only until this element clears it. */
  keyboardAnchor?: HTMLElement;
  full?: boolean;
  onClose?: () => void;
}

const sheets: Sheet[] = [];

/** A bottom sheet that tracks the finger 1:1 and dismisses on a flick or a 25% drag. */
export class Sheet {
  readonly wrap = h('div', 'sheet-wrap');
  readonly el = h('div', 'sheet');
  private backdrop = h('div', 'backdrop');
  readonly kb = h('div', 'kb');
  isOpen = false;

  constructor(readonly opts: Options) {
    const kb = this.kb;
    sheets.push(this);
    this.el.append(h('div', 'grab'));
    kb.append(this.el);
    if (opts.modal) {
      this.wrap.classList.add('modal');
      this.wrap.append(this.backdrop);
      this.backdrop.addEventListener('click', () => this.close());
    }
    if (opts.full) this.el.classList.add('full');
    this.wrap.append(kb);
    document.body.append(this.wrap);
    this.bindDrag();
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.wrap.classList.add('open');
    if (this.opts.modal) setStage(1, true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.settle();
    this.wrap.classList.remove('open');
    if (this.opts.modal) setStage(0, true);
    this.kb.style.transform = '';
    this.opts.onClose?.();
  }

  /** Hands control back to the CSS transition, from wherever the finger left things. */
  private settle() {
    this.el.style.transition = this.el.style.transform = '';
    this.backdrop.style.transition = this.backdrop.style.opacity = '';
  }

  private bindDrag() {
    const el = this.el;
    let start: { id: number; x: number; y: number; base: number } | null = null;
    let dragging = false;
    let y = 0;
    const samples: { t: number; v: number }[] = [];

    el.addEventListener('pointerdown', (e) => {
      if (!this.isOpen || (e.target as Element).closest('[data-nodrag]')) return;
      // pick up mid-animation from the sheet's actual position
      const base = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, base };
      dragging = false;
      samples.length = 0;
    });

    el.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(e.clientX - start.x)) return;
        dragging = true;
        el.setPointerCapture(e.pointerId);
        el.style.transition = this.backdrop.style.transition = 'none';
        start.y = e.clientY;
      }
      y = start.base + (e.clientY - start.y);
      if (y < 0) y = -10 * Math.log1p(-y / 10); // damp the pull past fully open
      const p = clamp(1 - y / el.offsetHeight, 0, 1);
      el.style.transform = `translateY(${y}px)`;
      this.backdrop.style.opacity = String(p);
      if (this.opts.modal) setStage(p, false);
      samples.push({ t: performance.now(), v: e.clientY });
      if (samples.length > 12) samples.shift();
    });

    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (!dragging) return;
      dragging = false;
      const v = velocity(samples, performance.now());
      if (y > 0 && (v > 0.4 || y > el.offsetHeight * 0.25) && v > -0.2) this.close();
      else {
        this.settle();
        if (this.opts.modal) setStage(1, true);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}

// The iOS keyboard covers the page without resizing it. Rather than hoisting the whole
// sheet above the keyboard, lift it only until its anchor (the part needed while typing)
// clears the keys; the rest waits underneath until the keyboard goes away.
const vv = window.visualViewport;
function syncKeyboard() {
  if (!vv) return;
  const body = document.body.getBoundingClientRect();
  const visibleBottom = vv.offsetTop + vv.height;
  const keyboardUp = body.bottom - visibleBottom > 120;
  for (const s of sheets) {
    let lift = 0;
    if (keyboardUp && s.isOpen) {
      const anchor = s.opts.keyboardAnchor ?? s.el;
      const below = s.el.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom;
      lift = Math.max(0, body.bottom - below - visibleBottom + 14);
    }
    s.kb.style.transform = lift ? `translateY(${-Math.round(lift)}px)` : '';
  }
}
if (vv) {
  vv.addEventListener('resize', syncKeyboard);
  vv.addEventListener('scroll', () => {
    if (vv.offsetTop > 0) scrollTo(0, 0); // don't let iOS shove the whole app up as well
    syncKeyboard();
  });
}
