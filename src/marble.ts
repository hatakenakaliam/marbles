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
 * Paints one marble of radius r centred on (cx, cy): smoked glass under a single soft
 * light from above. Nothing here is brighter than it needs to be to read as a sphere.
 */
export function paintMarble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  _ci = 0,
  _shadow = true,
) {
  const w = (a: number) => `rgba(255,255,255,${a})`;
  let g: CanvasGradient;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // body: lit from above, falling away evenly to the base
  g = ctx.createLinearGradient(cx - r * 0.25, cy - r, cx + r * 0.25, cy + r);
  g.addColorStop(0, '#8a8a8e');
  g.addColorStop(0.45, '#4a4a4e');
  g.addColorStop(1, '#2a2a2d');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // curvature: the face stays open, the sides turn away into shade
  g = ctx.createRadialGradient(cx - r * 0.12, cy - r * 0.2, r * 0.3, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.78, 'rgba(0,0,0,0.1)');
  g.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // one diffuse highlight, no hard edge
  const hx = cx - r * 0.2;
  const hy = cy - r * 0.46;
  g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.62);
  g.addColorStop(0, w(0.46));
  g.addColorStop(0.3, w(0.2));
  g.addColorStop(1, w(0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // a breath of light returning through the base
  g = ctx.createRadialGradient(cx + r * 0.1, cy + r * 0.82, 0, cx + r * 0.1, cy + r * 0.82, r * 0.75);
  g.addColorStop(0, w(0.2));
  g.addColorStop(1, w(0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // hairline edge, catching the light at the top and fading out below
  g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, w(0.6));
  g.addColorStop(0.55, w(0.16));
  g.addColorStop(1, w(0.1));
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(r * 0.014, 0.5);
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
