import { forceCollide, forceSimulation, forceX, forceY } from 'd3-force';
import type { Session } from './db';
import { PAD, clearSprites, colorIndex, onSchemeChange, paintMarble, shadowSprite, sprite } from './marble';
import { clamp, reduced, safeArea, spring, velocity, type Spr } from './util';

const MIN_Z = 0.3;
const MAX_Z = 4;
const GAP = 1.5;
const TICK = 1000 / 60;
const LIFT = 0.08;
const BG = { light: '#F3F1EC', dark: '#0E0E0D' };

/** Radius ∝ √minutes so area tracks time, floored at 10px so short sessions stay tappable. */
export const radiusFor = (minutes: number) => Math.max(10, 2.2 * Math.sqrt(minutes));

interface Node {
  s: Session;
  r: number;
  ci: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  /** appear/disappear scale, spring-driven */
  k: number;
  kv: number;
  kt: number;
  /** 0 resting … 1 lifted, spring-driven */
  lift: number;
  lv: number;
  lt: number;
  fade: number;
  dying: boolean;
}

interface Flight {
  el: HTMLCanvasElement;
  n: Node;
  t0: number;
  from: { x: number; y: number; r: number };
  R: number;
  half: number;
}

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let onSelect: (s: Session | null) => void = () => {};
let dark = false;
let W = 0;
let H = 0;
let dpr = 1;
let insetTop = 60;
let insetBottom = 100;
let sheetInset = 0;

let nodes: Node[] = [];
let selected: Node | null = null;
const animating = new Set<Node>();
const ghosts = new Map<string, { x: number; y: number }>();
const flights: Flight[] = [];

const colR = (n: Node) =>
  n.r * n.k * (1 + LIFT * n.lift) + GAP + (reduced() ? 0 : 3 * n.lift);
const collide = forceCollide<Node>(colR).strength(0.8).iterations(2);
// alpha 1 → alphaMin in 90 ticks: the cluster settles in ~1.5s
const sim = forceSimulation<Node>([])
  .alphaDecay(1 - Math.pow(0.001, 1 / 90))
  .velocityDecay(0.35)
  .force('collide', collide)
  .force('x', forceX<Node>(0).strength(0.04))
  .force('y', forceY<Node>(0).strength(0.04))
  .stop()
  .alpha(0);

const heat = (a: number) => {
  if (sim.alpha() < a) sim.alpha(a);
  invalidate();
};
const settleNow = (a: number) => {
  sim.alpha(a);
  while (sim.alpha() >= sim.alphaMin()) sim.tick();
};

function mkNode(s: Session, x: number, y: number): Node {
  return {
    s, x, y, vx: 0, vy: 0,
    r: radiusFor(s.minutes),
    ci: colorIndex(s.name),
    k: 1, kv: 0, kt: 1,
    lift: 0, lv: 0, lt: 0,
    fade: 1,
    dying: false,
  };
}

// ── camera ────────────────────────────────────────────────────────────────
// cam.x/y is the world point at the centre of the viewport.
const cam = { x: 0, y: 0, z: 1 };
const gx: Spr = { v: 0, vel: 0, to: 0 };
const gy: Spr = { v: 0, vel: 0, to: 0 };
const gz: Spr = { v: 0, vel: 0, to: 0 };
const vel = { x: 0, y: 0 };
let gliding = false;
let coasting = false;

const project = (x: number, y: number) => ({
  x: (x - cam.x) * cam.z + W / 2,
  y: (y - cam.y) * cam.z + H / 2,
});
const unproject = (x: number, y: number) => ({
  x: (x - W / 2) / cam.z + cam.x,
  y: (y - H / 2) / cam.z + cam.y,
});
/** Vertical offset of the visible area's centre when a sheet covers the bottom. */
const focusDy = () => -sheetInset / 2;

function bounds() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    if (n.dying) continue;
    if (n.x - n.r < x0) x0 = n.x - n.r;
    if (n.x + n.r > x1) x1 = n.x + n.r;
    if (n.y - n.r < y0) y0 = n.y - n.r;
    if (n.y + n.r > y1) y1 = n.y + n.r;
  }
  return x0 === Infinity ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0, y0, x1, y1 };
}

/**
 * The point under the centre of the visible area has to stay inside the cluster's
 * bounding circle. `soften` maps the distance past that edge (identity inside it).
 */
function constrain(x: number, y: number, z: number, soften: (over: number) => number = () => 0) {
  const b = bounds();
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2 - focusDy() / z;
  let R = 0;
  for (const n of nodes) {
    if (!n.dying) R = Math.max(R, Math.hypot(n.x - cx, n.y - (b.y0 + b.y1) / 2) + n.r);
  }
  const d = Math.hypot(x - cx, y - cy);
  if (d <= R) return { x, y };
  const k = (R + soften(d - R)) / d;
  return { x: cx + (x - cx) * k, y: cy + (y - cy) * k };
}
const clampCam = (x: number, y: number, z: number) => constrain(x, y, z);

function glideTo(x: number, y: number, z: number) {
  if (!gliding) gx.vel = gy.vel = gz.vel = 0;
  gx.v = cam.x; gx.to = x;
  gy.v = cam.y; gy.to = y;
  gz.v = Math.log(cam.z); gz.to = Math.log(z);
  gliding = true;
  coasting = false;
  if (reduced()) {
    gx.v = x; gy.v = y; gz.v = gz.to;
    gx.vel = gy.vel = gz.vel = 0;
  }
  invalidate();
}

function fitTarget() {
  const b = bounds();
  const availH = H - insetTop - insetBottom;
  const z = clamp(
    Math.min((W - 40) / Math.max(b.x1 - b.x0, 1), availH / Math.max(b.y1 - b.y0, 1)),
    MIN_Z,
    1.6,
  );
  return {
    x: (b.x0 + b.x1) / 2,
    y: (b.y0 + b.y1) / 2 - (insetTop + availH / 2 - H / 2) / z,
    z,
  };
}

function fit(animate: boolean) {
  const t = fitTarget();
  if (animate) return glideTo(t.x, t.y, t.z);
  gliding = coasting = false;
  Object.assign(cam, t);
  invalidate();
}

/** Brings the camera back inside its limits if something left it outside them. */
function settleCam() {
  const z = clamp(cam.z, MIN_Z, MAX_Z);
  const c = clampCam(cam.x, cam.y, z);
  if (c.x !== cam.x || c.y !== cam.y || z !== cam.z) glideTo(c.x, c.y, z);
}

function stepCamera(dt: number) {
  if (pts.size) return false;
  if (gliding) {
    const s = dt / 1000;
    let a = spring(gx, 180, 27, s, 0.02);
    a = spring(gy, 180, 27, s, 0.02) || a;
    a = spring(gz, 180, 27, s, 0.0005) || a;
    cam.x = gx.v;
    cam.y = gy.v;
    cam.z = Math.exp(gz.v);
    gliding = a;
    return true;
  }
  if (coasting) {
    cam.x += vel.x * dt;
    cam.y += vel.y * dt;
    const f = Math.exp(-dt / 400);
    vel.x *= f;
    vel.y *= f;
    const c = clampCam(cam.x, cam.y, cam.z);
    if (c.x !== cam.x || c.y !== cam.y) {
      // ran past the edge: hand the remaining speed to a spring that pulls it back
      glideTo(c.x, c.y, cam.z);
      gx.vel = vel.x * 1000;
      gy.vel = vel.y * 1000;
    } else if (Math.hypot(vel.x, vel.y) * cam.z < 0.01) coasting = false;
    return true;
  }
  return false;
}

// ── gestures ──────────────────────────────────────────────────────────────
const pts = new Map<number, { x: number; y: number }>();
const raw = { x: 0, y: 0, z: 1 };
const anchor = { x: 0, y: 0 };
const sx: { t: number; v: number }[] = [];
const sy: { t: number; v: number }[] = [];
let rawZ0 = 1;
let pinchD0 = 1;
let lastM = { x: 0, y: 0 };
let down = { x: 0, y: 0, t: 0 };
let moved = false;
let multi = false;
let lastTap = { x: 0, y: 0, t: 0 };

const RB = 0.55;
const rb = (d: number, dim: number) => (1 - 1 / ((d * RB) / dim + 1)) * dim;
const unrb = (f: number, dim: number) => (dim / RB) * (f / Math.max(dim - f, 1e-6));
const rubberZ = (z: number) =>
  z > MAX_Z ? MAX_Z * Math.pow(z / MAX_Z, 0.3) : z < MIN_Z ? MIN_Z * Math.pow(z / MIN_Z, 0.3) : z;
const unrubberZ = (z: number) =>
  z > MAX_Z ? MAX_Z * Math.pow(z / MAX_Z, 1 / 0.3) : z < MIN_Z ? MIN_Z * Math.pow(z / MIN_Z, 1 / 0.3) : z;

function centroid() {
  let x = 0, y = 0;
  for (const p of pts.values()) { x += p.x; y += p.y; }
  return { x: x / pts.size, y: y / pts.size };
}
function pinchDist() {
  const [a, b] = [...pts.values()];
  return Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
}

/** Re-anchors the gesture to the current fingers so adding/removing one never jumps. */
function rebase() {
  const m = centroid();
  const zd = rubberZ(raw.z);
  anchor.x = raw.x + (m.x - W / 2) / zd;
  anchor.y = raw.y + (m.y - H / 2) / zd;
  rawZ0 = raw.z;
  if (pts.size >= 2) pinchD0 = pinchDist();
  sx.length = sy.length = 0;
  lastM = m;
}

function applyGesture() {
  const m = centroid();
  raw.z = pts.size >= 2 ? (rawZ0 * pinchDist()) / pinchD0 : rawZ0;
  const z = rubberZ(raw.z);
  raw.x = anchor.x - (m.x - W / 2) / z;
  raw.y = anchor.y - (m.y - H / 2) / z;
  const dim = W / z;
  Object.assign(cam, constrain(raw.x, raw.y, z, (over) => rb(over, dim)), { z });
  lastM = m;
}

function onDown(e: PointerEvent) {
  canvas.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 1) {
    // grabbing interrupts whatever the camera was doing, from wherever it is
    gliding = coasting = false;
    const dim = W / cam.z;
    Object.assign(raw, constrain(cam.x, cam.y, cam.z, (over) => unrb(over, dim)), { z: unrubberZ(cam.z) });
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    moved = multi = false;
  } else multi = true;
  rebase();
}

function onMove(e: PointerEvent) {
  const p = pts.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (!moved && Math.hypot(p.x - down.x, p.y - down.y) < 8 && !multi) return;
  if (!moved) {
    moved = true;
    rebase(); // start from here so the slop isn't swallowed as a jump
  }
  applyGesture();
  const now = performance.now();
  sx.push({ t: now, v: lastM.x });
  sy.push({ t: now, v: lastM.y });
  if (sx.length > 12) { sx.shift(); sy.shift(); }
  invalidate();
}

function onUp(e: PointerEvent) {
  if (!pts.delete(e.pointerId)) return;
  if (pts.size) return rebase();
  const now = performance.now();
  const zc = clamp(cam.z, MIN_Z, MAX_Z);
  if (zc !== cam.z) {
    // spring the zoom back around the last pinch midpoint
    const w = unproject(lastM.x, lastM.y);
    const c = clampCam(w.x - (lastM.x - W / 2) / zc, w.y - (lastM.y - H / 2) / zc, zc);
    glideTo(c.x, c.y, zc);
  } else {
    const c = clampCam(cam.x, cam.y, cam.z);
    if (c.x !== cam.x || c.y !== cam.y) glideTo(c.x, c.y, cam.z);
    else if (moved) {
      const vx = velocity(sx, now);
      const vy = velocity(sy, now);
      if (Math.hypot(vx, vy) > 0.05) {
        vel.x = -vx / cam.z;
        vel.y = -vy / cam.z;
        coasting = true;
      }
    }
  }
  if (!moved && !multi && e.type === 'pointerup' && now - down.t < 350) tap(e.clientX, e.clientY);
  invalidate();
}

function hit(px: number, py: number) {
  let best: Node | null = null;
  let score = Infinity;
  for (const n of nodes) {
    if (n.dying) continue;
    const p = project(n.x, n.y);
    const d = Math.hypot(p.x - px, p.y - py);
    const rr = n.r * cam.z;
    if (d > Math.max(rr, 22)) continue; // 44px minimum target
    const s = d <= rr ? d - 1e6 : d; // a direct hit always beats a near miss
    if (s < score) { score = s; best = n; }
  }
  return best;
}

function tap(x: number, y: number) {
  const now = performance.now();
  if (now - lastTap.t < 300 && Math.hypot(x - lastTap.x, y - lastTap.y) < 32) {
    lastTap.t = 0;
    return doubleTap(x, y);
  }
  lastTap = { x, y, t: now };
  const n = hit(x, y);
  if (n) select(n);
  else if (selected) {
    release(selected);
    selected = null;
    onSelect(null);
  }
}

function doubleTap(x: number, y: number) {
  if (cam.z >= MAX_Z * 0.95) return fit(true); // nowhere further in to go: back out
  const z = Math.min(MAX_Z, cam.z * 2);
  if (selected) return glideTo(selected.x, selected.y - focusDy() / z, z);
  const w = unproject(x, y);
  const c = clampCam(w.x - (x - W / 2) / z, w.y - (y - H / 2) / z, z);
  glideTo(c.x, c.y, z);
}

// ── selection ─────────────────────────────────────────────────────────────
function select(n: Node) {
  if (selected && selected !== n) release(selected);
  selected = n;
  n.lt = 1;
  n.fx = n.x;
  n.fy = n.y;
  animating.add(n);
  onSelect(n.s); // opens the sheet, which sets sheetInset
  glideTo(n.x, n.y - focusDy() / cam.z, cam.z);
}

function release(n: Node) {
  n.lt = 0;
  n.fx = n.fy = null;
  animating.add(n);
  invalidate();
}

// ── adding ────────────────────────────────────────────────────────────────
/** The nearest-in spot on the rim where a marble of radius r fits. */
function edgeSpot(r: number) {
  let best = { x: 0, y: 0 };
  let bestExt = Infinity;
  if (!nodes.some((n) => !n.dying)) return best;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + 0.3;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    let ext = 0;
    for (const n of nodes) {
      if (n.dying) continue;
      const R = n.r + r + GAP * 2;
      const along = n.x * ux + n.y * uy;
      const across = n.y * ux - n.x * uy;
      if (Math.abs(across) >= R) continue;
      const e = along + Math.sqrt(R * R - across * across);
      if (e > ext) ext = e;
    }
    if (ext < bestExt) {
      bestExt = ext;
      best = { x: ux * ext, y: uy * ext };
    }
  }
  return best;
}

function insert(n: Node) {
  nodes.push(n);
  sim.nodes(nodes);
  animating.add(n);
}

function launch(s: Session, from: { x: number; y: number; r: number }) {
  const n = mkNode(s, 0, 0);
  const spot = edgeSpot(n.r);
  n.x = spot.x;
  n.y = spot.y;

  // Move the camera only as far as needed to watch the landing comfortably.
  const z = clamp(cam.z, MIN_Z, MAX_Z);
  const lx = clamp((n.x - cam.x) * z + W / 2, W * 0.22, W * 0.78);
  const ly = clamp((n.y - cam.y) * z + H / 2, H * 0.2, H * 0.55);
  glideTo(n.x - (lx - W / 2) / z, n.y - (ly - H / 2) / z, z);

  if (reduced()) {
    n.fade = 0;
    insert(n);
    settleNow(0.3);
    return invalidate();
  }

  const R = Math.max(from.r, n.r * z) * 1.12;
  const half = Math.ceil(R * PAD);
  const el = document.createElement('canvas');
  el.className = 'flight';
  el.width = el.height = half * 2 * dpr;
  el.style.width = el.style.height = half * 2 + 'px';
  const c = el.getContext('2d')!;
  c.scale(dpr, dpr);
  paintMarble(c, half, half, R, n.ci);
  document.body.append(el);
  const f: Flight = { el, n, t0: performance.now(), from, R, half };
  flights.push(f);
  placeFlight(f, 0);
  invalidate();
}

const FLIGHT_MS = 540;

function placeFlight(f: Flight, t: number) {
  const to = project(f.n.x, f.n.y);
  const dy = to.y - f.from.y;
  const lob = Math.max(0, -dy) + 200; // always high enough to come down onto the spot
  const x = f.from.x + (to.x - f.from.x) * t;
  const y = f.from.y + dy * t - lob * t * (1 - t);
  const e = 1 - Math.pow(1 - t, 3);
  const r = (f.from.r + (f.n.r * cam.z * (1 + LIFT * 0.6) - f.from.r) * e) * (1 + 0.1 * Math.sin(Math.PI * t));
  f.el.style.transform = `translate3d(${x - f.half}px,${y - f.half}px,0) scale(${r / f.R})`;
}

function stepFlights(now: number) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    const t = clamp((now - f.t0) / FLIGHT_MS, 0, 1);
    if (t < 1) {
      placeFlight(f, t);
      continue;
    }
    // touchdown: it arrives slightly lifted, carrying speed into its neighbours
    f.el.remove();
    flights.splice(i, 1);
    const n = f.n;
    const d = Math.hypot(n.x, n.y) || 1;
    n.vx = (-n.x / d) * 3;
    n.vy = (-n.y / d) * 3;
    n.lift = 0.6;
    insert(n);
    heat(0.3);
  }
  return flights.length > 0;
}

// ── removing ──────────────────────────────────────────────────────────────
function remove(id: string) {
  const n = nodes.find((m) => m.s.id === id);
  if (!n) return;
  if (selected === n) {
    release(n);
    selected = null;
  }
  ghosts.set(id, { x: n.x, y: n.y });
  n.dying = true;
  n.kt = 0;
  animating.add(n);
  heat(0.3);
}

function restore(s: Session) {
  const dying = nodes.find((m) => m.s.id === s.id);
  if (dying) {
    dying.dying = false;
    dying.kt = 1;
    animating.add(dying);
  } else {
    const n = mkNode(s, 0, 0);
    Object.assign(n, ghosts.get(s.id) ?? edgeSpot(n.r));
    n.k = 0;
    insert(n);
  }
  heat(0.3);
}

// ── frame loop: runs only while something is moving ───────────────────────
let raf = 0;
let last = 0;
let acc = 0;
const tmp: Spr = { v: 0, vel: 0, to: 0 };

function invalidate() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function stepNodes(dt: number) {
  if (!animating.size) return false;
  const s = dt / 1000;
  let removed = false;
  for (const n of animating) {
    tmp.v = n.k; tmp.vel = n.kv; tmp.to = n.kt;
    let a = n.dying ? spring(tmp, 260, 34, s, 0.004) : spring(tmp, 300, 20, s, 0.002);
    n.k = Math.max(0, tmp.v);
    n.kv = tmp.vel;
    if (n.dying && n.k < 0.03) {
      nodes.splice(nodes.indexOf(n), 1);
      animating.delete(n);
      removed = true;
      continue;
    }
    tmp.v = n.lift; tmp.vel = n.lv; tmp.to = n.lt;
    a = spring(tmp, 320, 22, s, 0.002) || a;
    n.lift = tmp.v;
    n.lv = tmp.vel;
    if (n.fade < 1) {
      n.fade = Math.min(1, n.fade + dt / 220);
      a = true;
    }
    if (!a) animating.delete(n);
  }
  if (removed) sim.nodes(nodes);
  else collide.radius(colR); // radii changed: neighbours make room or close in
  heat(0.06);
  return true;
}

function stepSim(dt: number) {
  if (sim.alpha() < sim.alphaMin()) {
    acc = 0;
    return false;
  }
  if (reduced()) {
    settleNow(sim.alpha()); // no jostle: jump straight to rest
    return false;
  }
  acc += dt;
  let n = 0;
  for (; acc >= TICK && n < 3; n++, acc -= TICK) sim.tick();
  if (n === 3) acc = 0;
  return true;
}

function frame(now: number) {
  raf = 0;
  const dt = last ? Math.min(now - last, 50) : TICK;
  last = now;
  let active = stepCamera(dt);
  active = stepNodes(dt) || active;
  active = stepSim(dt) || active;
  active = stepFlights(now) || active;
  render();
  if (active) invalidate();
  else last = 0;
}

function drawNode(n: Node, ox: number, oy: number, z: number) {
  const rr = n.r * n.k * z * (1 + LIFT * n.lift);
  if (rr < 0.3) return;
  const x = n.x * z + ox;
  const y = n.y * z + oy;
  const ext = rr * 1.9;
  if (x + ext < 0 || x - ext > W || y + ext < 0 || y - ext > H) return;
  if (n.lift > 0.001) {
    ctx.globalAlpha = Math.min(1, 0.55 * n.lift);
    ctx.drawImage(shadowSprite(), x - rr * 1.5 + rr * 0.1 * n.lift, y - rr * 1.5 + rr * 0.34 * n.lift, rr * 3, rr * 3);
  }
  ctx.globalAlpha = n.fade;
  ctx.drawImage(sprite(n.ci, rr * dpr), x - rr * PAD, y - rr * PAD, rr * PAD * 2, rr * PAD * 2);
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = dark ? BG.dark : BG.light;
  ctx.fillRect(0, 0, W, H);
  const z = cam.z;
  const ox = W / 2 - cam.x * z;
  const oy = H / 2 - cam.y * z;
  for (const n of nodes) if (n.lift <= 0.001) drawNode(n, ox, oy, z);
  for (const f of flights) {
    // the shadow gathers under the spot it's about to land on
    const t = clamp((performance.now() - f.t0) / FLIGHT_MS, 0, 1);
    const rr = f.n.r * z * (1.7 - 0.6 * t);
    ctx.globalAlpha = 0.4 * t * t;
    ctx.drawImage(shadowSprite(), f.n.x * z + ox - rr * 1.5, f.n.y * z + oy - rr * 1.5 + rr * 0.2, rr * 3, rr * 3);
    ctx.globalAlpha = 1;
  }
  for (const n of nodes) if (n.lift > 0.001) drawNode(n, ox, oy, z);
}

function resize() {
  W = innerWidth;
  H = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const safe = safeArea();
  insetTop = safe.top + 60;
  insetBottom = safe.bottom + 100;
  invalidate();
}

export const world = {
  init(el: HTMLCanvasElement, select: (s: Session | null) => void) {
    canvas = el;
    ctx = el.getContext('2d', { alpha: false })!;
    onSelect = select;
    dark = matchMedia('(prefers-color-scheme: dark)').matches;
    onSchemeChange(() => {
      dark = !dark;
      clearSprites();
      invalidate();
    });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    addEventListener('resize', resize);
    resize();
  },

  /** Seeds the cluster on a spiral in creation order — oldest at the core — and fits it. */
  setSessions(list: Session[]) {
    let area = 0;
    nodes = [...list]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s, i) => {
        const r = radiusFor(s.minutes);
        const rho = Math.sqrt(area / Math.PI / 0.8);
        area += Math.PI * (r + GAP) ** 2;
        const a = i * 2.399963;
        return mkNode(s, rho * Math.cos(a), rho * Math.sin(a));
      });
    selected = null;
    animating.clear();
    sim.nodes(nodes);
    settleNow(1);
    fit(false);
  },

  launch,
  remove,
  restore,
  deselect() {
    if (selected) release(selected);
    selected = null;
    settleCam();
  },
  setSheetInset(px: number) {
    sheetInset = px;
  },
};
