// 听见校园 · 发件箱：还没发到云上的话和照片，先存在这台设备上（IndexedDB），连上以后再发。
// 它只是中转站，不是另一份数据：发成功就删，云上那份才是准的。读不出来（隐私模式、配额满）就退回内存，页面会照常，只是刷新就没了。
const DB = 'ks-outbox', STORE = 'items';
let dbp = null;
const mem = new Map();
let memOnly = false;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('没有 IndexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('被占用'));
  });
  return dbp;
}

async function run(mode, fn) {
  if (memOnly) return fn(null);
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      let out;
      try { out = fn(t.objectStore(STORE)); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } catch {
    memOnly = true;   // 以后都走内存，不再反复试
    return fn(null);
  }
}

export const isMemoryOnly = () => memOnly;
export const all = () => run('readonly', (s) => (s ? s.getAll() : { result: [...mem.values()] })).then((r) => (Array.isArray(r) ? r : r && Array.isArray(r.result) ? r.result : []));
export const put = (item) => run('readwrite', (s) => { if (s) s.put(item); else mem.set(item.id, item); });
export const del = (id) => run('readwrite', (s) => { if (s) s.delete(id); else mem.delete(id); });
