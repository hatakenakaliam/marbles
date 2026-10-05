import { createAdd } from './add';
import { allSessions, deleteSession, openDB, parseImport, putSession, putSessions, type Session } from './db';
import { demoSessions } from './demo';
import { colorIndex, cssColor } from './marble';
import { Sheet } from './sheet';
import { createStats } from './stats';
import { EASE, fmtDur, fmtWhen, h } from './util';
import { world } from './world';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

// ?demo=1 lives in its own database, so trying it never touches the real log.
const demoParam = new URLSearchParams(location.search).get('demo');
const demoCount = demoParam ? (Number(demoParam) > 1 ? Number(demoParam) : 150) : 0;
openDB(demoCount ? `marbles-demo-${demoCount}` : 'marbles');

let sessions = await allSessions();
if (demoCount && !sessions.length) {
  sessions = demoSessions(demoCount);
  await putSessions(sessions);
}
const persisted = (await navigator.storage?.persist?.().catch(() => false)) ?? false;

const empty = $('#empty');
const syncEmpty = () => (empty.hidden = sessions.length > 0);

// ── detail sheet ──
const detail = new Sheet({
  modal: false,
  onClose: () => {
    world.setSheetInset(0);
    world.deselect();
  },
});
const detailBody = h('div', 'detail');
detailBody.innerHTML = `
  <div class="d-info">
    <div class="d-name"><i class="dot"></i><span></span></div>
    <div class="d-dur"></div>
    <div class="d-when"></div>
  </div>
  <button class="danger press">Delete</button>`;
detail.el.append(detailBody);
let shown: Session | null = null;

function showDetail(s: Session | null) {
  if (!s) return detail.close();
  const swap = detail.isOpen && shown !== s;
  shown = s;
  $('.d-name span', detailBody).textContent = s.name;
  $('.dot', detailBody).style.background = cssColor(colorIndex(s.name));
  $('.d-dur', detailBody).textContent = fmtDur(s.minutes);
  $('.d-when', detailBody).textContent = fmtWhen(s.startedAt);
  if (swap) $('.d-info', detailBody).animate({ opacity: [0, 1] }, { duration: 180, easing: EASE });
  detail.open();
  world.setSheetInset(detail.el.offsetHeight);
}

$('.danger', detailBody).addEventListener('click', () => {
  const s = shown;
  if (!s) return;
  sessions = sessions.filter((x) => x.id !== s.id);
  deleteSession(s.id);
  world.remove(s.id);
  detail.close();
  syncEmpty();
  toast('Deleted', 'Undo', () => {
    sessions.push(s);
    putSession(s);
    world.restore(s);
    syncEmpty();
  });
});

// ── toast ──
const toastEl = h('div', 'toast');
document.body.append(toastEl);
let toastTimer = 0;
function toast(text: string, action?: string, fn?: () => void) {
  clearTimeout(toastTimer);
  toastEl.replaceChildren(h('span', '', text));
  if (action && fn) {
    const b = h('button', 'press', action);
    b.addEventListener('click', () => {
      fn();
      hide();
    });
    toastEl.append(b);
  }
  const hide = () => toastEl.classList.remove('show');
  toastEl.classList.add('show');
  toastTimer = window.setTimeout(hide, 5000);
}

// ── world ──
world.init($<HTMLCanvasElement>('#c'), showDetail);
world.setSessions(sessions);
syncEmpty();
$('#c').classList.add('ready');

// ── adding ──
const add = createAdd({
  recent() {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [...sessions].sort((a, b) => b.createdAt - a.createdAt)) {
      const key = s.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s.name);
      if (out.length === 5) break;
    }
    return out;
  },
  onConfirm(d, from) {
    const now = Date.now();
    const s: Session = {
      id: crypto.randomUUID(),
      name: d.name,
      minutes: d.minutes,
      startedAt: d.startedAt ?? now - d.minutes * 60000,
      createdAt: now,
    };
    sessions.push(s);
    putSession(s);
    syncEmpty();
    world.launch(s, from);
  },
});
$('#add').addEventListener('click', add.open);

// ── stats ──
const stats = createStats(() => sessions);
$('#stats').addEventListener('click', stats.open);

// ── backup ──
const backup = new Sheet({ modal: true });
const backupBody = h('div', 'backup');
backupBody.innerHTML = `
  <h2>Backup</h2>
  <p>Everything lives on this device, nowhere else. An exported file is your only backup.</p>
  <button class="row-btn press" data-act="export">Export JSON</button>
  <label class="row-btn press">Import JSON<input type="file" accept="application/json,.json" /></label>
  <div class="note"></div>`;
backup.el.append(backupBody);
const note = $('.note', backupBody);

function syncNote(msg?: string) {
  const n = sessions.length;
  note.textContent =
    msg ??
    [
      `${n.toLocaleString('en-US')} ${n === 1 ? 'session' : 'sessions'}`,
      demoCount ? 'Demo data, kept apart from your log' : persisted ? 'Storage is persistent' : 'Storage may be cleared by the system',
    ].join(' · ');
}

$('#menu').addEventListener('click', () => {
  syncNote();
  backup.open();
});

$('[data-act=export]', backupBody).addEventListener('click', async () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const json = JSON.stringify({ app: 'marbles', version: 1, exportedAt: d.toISOString(), sessions }, null, 2);
  const file = new File([json], `marbles-${stamp}.json`, { type: 'application/json' });
  // The share sheet is the dependable way to reach Files from a home-screen app.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      syncNote(`Exported ${sessions.length.toLocaleString('en-US')} sessions`);
    } catch {
      /* share sheet dismissed */
    }
    return;
  }
  const a = h('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  syncNote(`Exported ${sessions.length.toLocaleString('en-US')} sessions`);
});

$<HTMLInputElement>('input[type=file]', backupBody).addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    // Merge by id: importing the same file twice changes nothing.
    const incoming = parseImport(await file.text());
    await putSessions(incoming);
    const before = sessions.length;
    sessions = await allSessions();
    detail.close();
    world.setSessions(sessions);
    syncEmpty();
    const added = sessions.length - before;
    syncNote(`Imported ${incoming.length.toLocaleString('en-US')} · ${added.toLocaleString('en-US')} new`);
  } catch (err) {
    syncNote(err instanceof SyntaxError ? "That file isn't valid JSON." : (err as Error).message);
  }
});

// iOS only applies :active styles once a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
