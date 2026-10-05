// Every marble is the same white glass; size alone carries the meaning.
export const PALETTE = ['#E6E4DE'];
export const NEUTRAL = 0;

/** Sprites are drawn with this much room around the marble for its contact shadow. */
export const PAD = 1.3;

// The app is dark-only.
export const isDark = () => true;
export const onSchemeChange = (_fn: () => void) => {};

export const colorIndex = (_name: string) => 0;

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (c: RGB, to: number, t: number): RGB => c.map((v) => v + (to - v) * t) as RGB;
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function cssColor(ci: number) {
  const c = rgb(PALETTE[ci]);
  return css(c);
}

/** Paints one glass marble of radius r centred on (cx, cy). */
export function paintMarble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ci: number,
  shadow = true,
) {
  const dark = isDark();
  const base = rgb(PALETTE[ci]);
  let g: CanvasGradient;

  if (shadow) {
    // faint contact shadow, pooled under the bottom-right
    g = ctx.createRadialGradient(cx + r * 0.05, cy + r * 0.16, r * 0.6, cx + r * 0.05, cy + r * 0.16, r * 1.12);
    g.addColorStop(0, `rgba(0,0,0,${dark ? 0.5 : 0.26})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r * PAD, cy - r * PAD, r * PAD * 2, r * PAD * 2);
  }

  // body: lit from the top-left, falling off to a darker far edge
  g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.34, r * 0.04, cx, cy, r);
  g.addColorStop(0, css(mix(base, 255, 0.7)));
  g.addColorStop(0.4, css(mix(base, 0, 0.1)));
  g.addColorStop(1, css(mix(base, 0, 0.62)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.clip();

  // light gathered inside the glass, opposite the source
  g = ctx.createRadialGradient(cx + r * 0.32, cy + r * 0.36, 0, cx + r * 0.32, cy + r * 0.36, r * 0.62);
  g.addColorStop(0, css(mix(base, 255, 0.34), 0.42));
  g.addColorStop(1, css(mix(base, 255, 0.34), 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // soft rim light along the bottom-right edge
  g = ctx.createRadialGradient(cx - r * 0.11, cy - r * 0.11, r * 0.9, cx - r * 0.11, cy - r * 0.11, r * 1.11);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(255,255,255,${dark ? 0.36 : 0.42})`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // bloom around the highlight
  const hx = cx - r * 0.37;
  const hy = cy - r * 0.41;
  g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.36);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // crisp specular
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.19, r * 0.105, -0.72, 0, Math.PI * 2);
  ctx.fill();
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
