import type { Session } from './db';
import { Sheet } from './sheet';
import { fmtDur, h, reduced, xfade } from './util';

export type Range = 'all' | '90' | 'year';
const RANGES: [Range, string][] = [
  ['all', 'All time'],
  ['90', '90 days'],
  ['year', 'This year'],
];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
};

export function compute(sessions: Session[], range: Range, now = Date.now()) {
  const today = startOfDay(now);
  let from = -Infinity;
  if (range === '90') {
    const d = new Date(today);
    d.setDate(d.getDate() - 89);
    from = d.getTime();
  } else if (range === 'year') from = new Date(today.getFullYear(), 0, 1).getTime();

  const inRange = sessions.filter((s) => s.startedAt >= from);
  const total = inRange.reduce((a, s) => a + s.minutes, 0);

  // Weekday average = minutes on that weekday ÷ how many of that weekday there have been
  // since the first session (or the start of the range), empty days included.
  const sums = Array(7).fill(0);
  const days = Array(7).fill(0);
  const mon0 = (d: Date) => (d.getDay() + 6) % 7;
  for (const s of inRange) sums[mon0(new Date(s.startedAt))] += s.minutes;
  const first = sessions.reduce((a, s) => Math.min(a, s.startedAt), Infinity);
  if (Number.isFinite(first)) {
    for (const d = startOfDay(Math.max(first, from)); d <= today; d.setDate(d.getDate() + 1)) days[mon0(d)]++;
  }
  return {
    total,
    count: inRange.length,
    average: inRange.length ? total / inRange.length : 0,
    weekdays: sums.map((m, i) => (days[i] ? m / days[i] : 0)),
    today: mon0(today),
  };
}

const big = (minutes: number) => {
  const m = Math.round(minutes);
  const hh = Math.floor(m / 60);
  const hours = hh ? `${hh.toLocaleString('en-US')}<small>h</small>` : '';
  const mins = m % 60 || !hh ? `${m % 60}<small>m</small>` : '';
  return [hours, mins].filter(Boolean).join(' ');
};

export function createStats(getSessions: () => Session[]) {
  const sheet = new Sheet({ modal: true, full: true });
  const root = h('div', 'stats');
  root.innerHTML = `
    <div class="eyebrow">Deep work</div>
    <div class="total"></div>
    <div class="sub"></div>
    <div class="eyebrow chart-title">Average per weekday</div>
    <div class="bars">${DAYS.map(
      (d) =>
        `<div class="col"><div class="plot"><div class="val"></div><div class="track"><div class="bar"></div></div></div><div class="wd">${d}</div></div>`,
    ).join('')}</div>
    <div class="seg" data-nodrag><i class="thumb"></i>${RANGES.map(
      ([k, label]) => `<button data-range="${k}">${label}</button>`,
    ).join('')}</div>`;
  sheet.el.append(root);

  const total = root.querySelector<HTMLElement>('.total')!;
  const sub = root.querySelector<HTMLElement>('.sub')!;
  const cols = [...root.querySelectorAll<HTMLElement>('.col')];
  const thumb = root.querySelector<HTMLElement>('.thumb')!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.seg button')];
  let range: Range = 'all';

  function draw(fromZero: boolean) {
    const s = compute(getSessions(), range);
    xfade(total, big(s.total));
    xfade(
      sub,
      `${s.count.toLocaleString('en-US')} ${s.count === 1 ? 'session' : 'sessions'} · ${fmtDur(s.average)} average`,
    );
    const max = Math.max(...s.weekdays, 1);
    const plot = root.querySelector<HTMLElement>('.track')!.offsetHeight;
    cols.forEach((col, i) => {
      const bar = col.querySelector<HTMLElement>('.bar')!;
      const val = col.querySelector<HTMLElement>('.val')!;
      const f = s.weekdays[i] / max;
      col.classList.toggle('today', i === s.today);
      col.classList.toggle('zero', s.weekdays[i] < 0.5);
      if (fromZero) {
        bar.style.transition = val.style.transition = 'none';
        bar.style.transform = 'translateY(calc(100% - 2px))';
        val.style.transform = 'translateY(-8px)';
        val.style.opacity = '0';
        void bar.offsetHeight;
      }
      const delay = reduced() ? 0 : i * 30;
      bar.style.transition = val.style.transition = '';
      bar.style.transitionDelay = val.style.transitionDelay = `${delay}ms`;
      bar.style.transform = `translateY(calc(${(1 - f) * 100}% - ${2 * (1 - f)}px))`;
      val.style.transform = `translateY(${-(f * (plot - 2) + 8)}px)`;
      val.style.opacity = '1';
      xfade(val, fmtDur(s.weekdays[i]));
    });
    const idx = RANGES.findIndex(([k]) => k === range);
    thumb.style.transform = `translateX(${idx * 100}%)`;
    buttons.forEach((b, i) => b.classList.toggle('on', i === idx));
  }

  for (const b of buttons)
    b.addEventListener('click', () => {
      range = b.dataset.range as Range;
      draw(false);
    });

  return {
    open() {
      draw(true);
      sheet.open();
    },
  };
}
