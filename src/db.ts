export interface Session {
  id: string;
  name: string;
  minutes: number;
  startedAt: number;
  createdAt: number;
}

const STORE = 'sessions';
let dbp: Promise<IDBDatabase>;

export function openDB(name: string) {
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void) {
  return dbp.then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve((req ? req.result : undefined) as T);
        t.onerror = t.onabort = () => reject(t.error);
      }),
  );
}

export const allSessions = () => tx<Session[]>('readonly', (s) => s.getAll());
export const putSession = (x: Session) => tx<void>('readwrite', (s) => void s.put(x));
export const deleteSession = (id: string) => tx<void>('readwrite', (s) => void s.delete(id));
export const putSessions = (xs: Session[]) =>
  tx<void>('readwrite', (s) => xs.forEach((x) => s.put(x)));

/** Accepts our export shape or a bare array; drops anything that isn't a usable session. */
export function parseImport(text: string): Session[] {
  const data = JSON.parse(text);
  const list: unknown[] = Array.isArray(data) ? data : data?.sessions;
  if (!Array.isArray(list)) throw new Error('No sessions found in that file.');
  const out: Session[] = [];
  for (const raw of list) {
    const r = raw as Partial<Session>;
    const minutes = Number(r?.minutes);
    const startedAt = Number(r?.startedAt);
    if (typeof r?.name !== 'string' || !r.name.trim() || !(minutes > 0) || !Number.isFinite(startedAt))
      continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
      name: r.name.trim(),
      minutes,
      startedAt,
      createdAt: Number.isFinite(Number(r.createdAt)) ? Number(r.createdAt) : startedAt + minutes * 60000,
    });
  }
  if (!out.length) throw new Error('No sessions found in that file.');
  return out;
}
