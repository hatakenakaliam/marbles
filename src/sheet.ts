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
  full?: boolean;
  onClose?: () => void;
}

/** A bottom sheet that tracks the finger 1:1 and dismisses on a flick or a 25% drag. */
export class Sheet {
  readonly wrap = h('div', 'sheet-wrap');
  readonly el = h('div', 'sheet');
  private backdrop = h('div', 'backdrop');
  isOpen = false;

  constructor(private opts: Options) {
    const kb = h('div', 'kb');
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

// Keep sheets above the iOS keyboard: the layout viewport doesn't shrink there, only the visual one.
const vv = window.visualViewport;
if (vv) {
  const sync = () => {
    const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
}
