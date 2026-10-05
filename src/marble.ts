// Every marble is the same white glass; size alone carries the meaning.
export const NEUTRAL = 0;

/** Sprites are drawn with this much room around the marble for its contact shadow. */
export const PAD = 1.3;

// The app is dark-only.
export const isDark = () => true;
export const onSchemeChange = (_fn: () => void) => {};

export const colorIndex = (_name: string) => 0;

export const cssColor = (_ci: number) => '#fff';

/**
 * Paints one marble of radius r centred on (cx, cy). Deliberately graphic rather than
 * rendered: a pale disc with just enough tone, top to bottom, to suggest a sphere.
 */
export function paintMarble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  _ci = 0,
  _shadow = true,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  let g: CanvasGradient = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#f1f0ec');
  g.addColorStop(1, '#bfbeba');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // the faintest turn at the edge, so neighbours don't merge into one shape
  g = ctx.createRadialGradient(cx, cy - r * 0.1, r * 0.7, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

// Mip chain: a marble is drawn from the smallest sprite at least as big as it is on screen.
const SIZES = [12, 24, 48, 96, 192, 384];
const cache = new Map<string, HTMLCanvasElement>();
let shadow: HTMLCanvasElement | null = null;

export function clearSprites() {
  cache.clear();
}

export function sprite(ci: number, deviceRadius: number) {
  let R = SIZES[SIZES.length - 1];
  for (const s of SIZES) {
    if (s >= deviceRadius) {
      R = s;
      break;
    }
  }
  const key = ci * 1000 + R;
  let c = cache.get(String(key));
  if (!c) {
    c = document.createElement('canvas');
    const half = Math.ceil(R * PAD);
    c.width = c.height = half * 2;
    paintMarble(c.getContext('2d')!, half, half, R, ci);
    cache.set(String(key), c);
  }
  return c;
}

/** The deeper shadow under a lifted marble. Drawn at 3r × 3r. */
export function shadowSprite() {
  if (!shadow) {
    shadow = document.createElement('canvas');
    shadow.width = shadow.height = 192;
    const ctx = shadow.getContext('2d')!;
    const g = ctx.createRadialGradient(96, 96, 28, 96, 96, 96);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 192, 192);
  }
  return shadow;
}
