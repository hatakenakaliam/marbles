import type { Session } from './db';

// Deterministic, so the demo cluster looks the same on every device.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RECURRING: [string, number][] = [
  ['Writing', 0.26],
  ['Prototype', 0.22],
  ['Research', 0.18],
  ['Thesis', 0.14],
  ['Reading', 0.12],
  ['Papers', 0.08],
];
const ONE_OFFS = ['Talk prep', 'Taxes', 'Hiring loop'];

/** ~`count` sessions spread over the last six months, mostly on weekdays. */
export function demoSessions(count = 150, now = Date.now()): Session[] {
  const rnd = mulberry32(7);
  const DAYS = 182;
  const perWeekday = count / (DAYS * (5 / 7) * 0.88 + DAYS * (2 / 7) * 0.12);
  const out: Session[] = [];
  for (let back = DAYS; back >= 0; back--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - back);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const expected = perWeekday * (weekend ? 0.12 : 1);
    let n = Math.floor(expected);
    if (rnd() < expected - n) n++;
    if (!weekend && rnd() < 0.12) n = 0; // days off
    let hour = 8 + rnd() * 2;
    for (let i = 0; i < n; i++) {
      // 25m–4h, skewed toward 60–100m
      const skew = (rnd() + rnd() + rnd()) / 3;
      const minutes = Math.round((25 + Math.pow(skew, 2.3) * 271) / 5) * 5;
      const startedAt = day.getTime() + hour * 3600000;
      const end = startedAt + Math.min(minutes, 240) * 60000;
      if (end > now) break;
      let name = ONE_OFFS[Math.floor(rnd() * ONE_OFFS.length)];
      if (rnd() > 0.06) {
        let pick = rnd();
        for (const [nm, w] of RECURRING) {
          name = nm;
          if ((pick -= w) < 0) break;
        }
      }
      out.push({
        id: `demo-${out.length}`,
        name,
        minutes: Math.min(Math.max(minutes, 25), 240),
        startedAt: Math.round(startedAt / 60000) * 60000,
        createdAt: end,
      });
      hour += minutes / 60 + 0.5 + rnd() * 2;
    }
  }
  return out;
}
