/* IndexedDB, wrapped just enough to be readable.
 *
 * What lives here and why it is safe to:
 *   identity  — CryptoKey objects with non-extractable private halves.
 *               Structured-clone keeps them opaque: JS can use them, and
 *               cannot read them, even from this origin.
 *   labs      — the lab key is stored ONLY as an envelope sealed to this
 *               device, so a raw dump of the database yields ciphertext.
 *   moments   — the user's own capture log, in the clear. It never leaves
 *               the device unsealed, and encrypting it here would buy
 *               nothing without an OS keystore to hold the wrapping key.
 *               Stated plainly in docs/THREAT_MODEL.md rather than
 *               dressed up as more than it is.
 */
const DB_NAME = 'living-paper';
const DB_VERSION = 1;

export const STORES = {
  identity: 'identity',
  labs: 'labs',
  devices: 'devices',
  meetings: 'meetings',
  moments: 'moments',
  jobs: 'jobs',
  answers: 'answers',
  kb: 'kb',
  settings: 'settings',
};

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const mk = (name, opts, indexes = []) => {
        if (db.objectStoreNames.contains(name)) return;
        const s = db.createObjectStore(name, opts);
        for (const [n, path, o] of indexes) s.createIndex(n, path, o);
      };
      mk(STORES.identity, { keyPath: 'id' });
      mk(STORES.labs, { keyPath: 'labId' });
      mk(STORES.devices, { keyPath: 'kid' }, [['byLab', 'labId', {}]]);
      mk(STORES.meetings, { keyPath: 'id' }, [['byStart', 'startedAt', {}]]);
      mk(STORES.moments, { keyPath: 'id' }, [['byMeeting', 'meetingId', {}]]);
      mk(STORES.jobs, { keyPath: 'jobId' }, [['byStatus', 'status', {}], ['byMeeting', 'meetingId', {}]]);
      mk(STORES.answers, { keyPath: 'jobId' }, [['byMeeting', 'meetingId', {}]]);
      mk(STORES.kb, { keyPath: 'id' }, [['byLab', 'labId', {}]]);
      mk(STORES.settings, { keyPath: 'key' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
export const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const all = (store) => tx(store, 'readonly', (s) => s.getAll());
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());

export function byIndex(store, index, value) {
  return tx(store, 'readonly', (s) => s.index(index).getAll(value));
}

export async function setSetting(key, value) { return put(STORES.settings, { key, value }); }
export async function getSetting(key, fallback = null) {
  const row = await get(STORES.settings, key);
  return row === undefined ? fallback : row.value;
}

/** Full local wipe — the panic button on the Security screen. */
export async function wipeEverything() {
  for (const s of Object.values(STORES)) await clear(s);
  _db?.close();
  _db = null;
  await new Promise((res) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
}

export const uid = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
