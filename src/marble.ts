// Every marble is the same white glass; size alone carries the meaning.
export const NEUTRAL = 0;

/** Sprites are drawn with this much room around the marble for its contact shadow. */
export const PAD = 1.3;

// The app is dark-only.
export const isDark = () => true;
export const onSchemeChange = (_fn: () => void) => {};

export const colorIndex = (_name: string) => 0;

export const cssColor = (_ci: number) => '#fff';

/** Paints one clear glass marble of radius r centred on (cx, cy). */
export function paintMarble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  _ci = 0,
  shadow = true,
) {
  const w = (a: number) => `rgba(255,255,255,${a})`;
  let g: CanvasGradient;

  if (shadow) {
    // light the glass throws onto the surface beneath it, bottom-right
    g = ctx.createRadialGradient(cx + r * 0.1, cy + r * 0.14, r * 0.7, cx + r * 0.1, cy + r * 0.14, r * 1.14);
    g.addColorStop(0, w(0.1));
    g.addColorStop(1, w(0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r * PAD, cy - r * PAD, r * PAD * 2, r * PAD * 2);
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();

  // the glass itself: nearly clear, a shade off the background
  ctx.fillStyle = '#17181a';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // fresnel: transparent face-on, brightening sharply toward the silhouette
  g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  g.addColorStop(0, w(0));
  g.addColorStop(0.72, w(0.05));
  g.addColorStop(0.9, w(0.16));
  g.addColorStop(0.975, w(0.42));
  g.addColorStop(1, w(0.7));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // inner shade under the top-left edge gives the ball its depth
  g = ctx.createRadialGradient(cx + r * 0.22, cy + r * 0.26, r * 0.55, cx + r * 0.22, cy + r * 0.26, r * 1.3);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // light focused through the sphere pools opposite the source
  g = ctx.createRadialGradient(cx + r * 0.36, cy + r * 0.42, 0, cx + r * 0.36, cy + r * 0.42, r * 0.58);
  g.addColorStop(0, w(0.5));
  g.addColorStop(0.45, w(0.16));
  g.addColorStop(1, w(0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // bright rim along the bottom-right
  g = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.1, r * 0.92, cx - r * 0.1, cy - r * 0.1, r * 1.1);
  g.addColorStop(0, w(0));
  g.addColorStop(1, w(0.95));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // broad soft reflection across the upper-left
  const hx = cx - r * 0.36;
  const hy = cy - r * 0.4;
  g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.5);
  g.addColorStop(0, w(0.26));
  g.addColorStop(1, w(0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // crisp specular, with a pinpoint beside it
  ctx.fillStyle = w(0.96);
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.2, r * 0.1, -0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = w(0.7);
  ctx.beginPath();
  ctx.arc(cx - r * 0.1, cy - r * 0.6, r * 0.035, 0, Math.PI * 2);
  ctx.fill();

  // hairline edge keeps small marbles defined
  ctx.strokeStyle = w(0.22);
  ctx.lineWidth = Math.max(r * 0.012, 0.5);
  ctx.beginPath();
  ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
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
