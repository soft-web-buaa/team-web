// 刻声 · 声片柜的持久化（IndexedDB）— schema 2（馆藏预留）
// 口径：docs/ARCHIVE-v1.md §1 + docs/ARCHIVE-T1.md §1。
// - 与馆藏**同一结构**：本机柜与将来的公开馆藏共用一份记录格式，入藏时不迁移；
// - schema 1 的旧记录读进来补默认值，不改库里的旧数据；
// - 索引：campus / placeId / slot / kind / at（将来四轴筛选与馆藏检索共用）。
// - 2026-10-20 加了两个可空字段 author / submittedAt：旧记录读进来是 null，库版本不用升。
// 读不出来（隐私模式、配额满、浏览器禁用）一律抛错，由调用方降级为内存模式，不静默丢数据。

import { slotOf } from './slot.js';

const DB_NAME = 'kesheng';
const DB_VERSION = 2;
const STORE = 'discs';
export const SCHEMA = 2;
const INDEXES = ['campus', 'placeId', 'slot', 'kind', 'at'];

/** 声音类型：六类 + 说不清（兜底，不计入六类，筛选时单列） */
export const KINDS = {
  voice: '人声与人群',
  move: '脚步与移动',
  machine: '机械与设备',
  signal: '提示与信号',
  nature: '自然与天气',
  space: '空间与回响',
  unsure: '说不清',
};

/** 状态机（ARCHIVE-T1 §2）：本机只会写 local；其余状态由馆员侧的入藏流程写。 */
export const STATUSES = ['local', 'received', 'accessioned', 'rejected', 'withdrawn'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('这个浏览器没有 IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE)
        ? req.transaction.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: 'id' });
      for (const name of INDEXES) {
        if (!store.indexNames.contains(name)) store.createIndex(name, name, { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('打不开本地库'));
    req.onblocked = () => reject(new Error('本地库被另一个标签页占着'));
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    let out;
    try { out = fn(t.objectStore(STORE)); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error || new Error('本地库存取失败'));
    t.onabort = () => reject(t.error || new Error('本地库事务被中止'));
  }));
}

export function pcmToBlob(pcm) {
  const copy = new Float32Array(pcm);            // 只拷视图覆盖的那段
  return new Blob([copy.buffer], { type: 'application/octet-stream' });
}

export async function blobToPcm(blob) {
  return new Float32Array(await blob.arrayBuffer());
}

const mmdd = (iso) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 声片对象 → 记录（schema 2） */
export function toRecord(d) {
  const at = d.at || new Date().toISOString();
  return {
    id: d.id,
    schema: SCHEMA,
    no: d.no,
    date: d.date || mmdd(at),
    campus: d.campus,
    place: d.place,
    placeId: d.placeId || null,
    zoneId: d.zoneId || null,
    buildingId: d.buildingId || null,
    slot: d.slot || slotOf(new Date(at)),
    week: d.week ?? null,
    semester: d.semester || null,
    kind: d.kind || null,
    note: d.note || '',
    at,
    pin: d.pin || null,
    sha256: d.sha256 || null,
    status: d.status || 'local',
    archive: d.archive || null,
    author: d.author || null,                    // 落款快照（含卡号；见 identity.js），以后改落款不影响旧盘
    submittedAt: d.submittedAt || null,          // 导出投稿包的时间；入没入馆以馆藏目录为准
    seconds: d.seconds,
    fs: d.fs,
    dur: d.dur || null,
    meta: d.meta || '',
    pcm: pcmToBlob(d.pcm),
    tex: d.tex instanceof Uint8Array ? d.tex : new Uint8Array(d.tex),
    prints: (d.prints || []).map(([h, t]) => [h, t]),
  };
}

/** 记录 → 声片对象；schema 1 的旧记录在这里补默认值，不改库里那份。 */
export async function fromRecord(rec) {
  const pcm = await blobToPcm(rec.pcm);
  const at = rec.at || new Date().toISOString();
  return {
    id: rec.id,
    no: rec.no || null,
    pcm,
    fs: rec.fs,
    seconds: rec.seconds,
    tex: rec.tex instanceof Uint8Array ? rec.tex : new Uint8Array(rec.tex),
    prints: rec.prints || [],
    place: rec.place,
    placeId: rec.placeId || null,
    zoneId: rec.zoneId || null,
    buildingId: rec.buildingId || null,
    campus: rec.campus,
    note: rec.note,
    at,
    // schema 1 → 2 的默认值
    date: rec.date || mmdd(at),
    slot: rec.slot || slotOf(new Date(at)),
    week: rec.week ?? null,
    semester: rec.semester || null,
    kind: rec.kind || null,
    pin: rec.pin || null,
    sha256: rec.sha256 || null,
    status: rec.status || 'local',
    archive: rec.archive || null,
    author: rec.author || null,
    submittedAt: rec.submittedAt || null,
    dur: rec.dur || pcm.length / rec.fs,
    meta: rec.meta || '',
  };
}

export const put = (d) => tx('readwrite', (s) => s.put(toRecord(d)));
export const del = (id) => tx('readwrite', (s) => s.delete(id));
export const clearAll = () => tx('readwrite', (s) => s.clear());
export const count = () => tx('readonly', (s) => s.count());
export const all = () => tx('readonly', (s) => s.getAll());

/** 按四轴筛（将来馆藏检索沿用同一套） */
export function query({ campus, placeId, slot, kind } = {}) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const idx = t.objectStore(STORE).index('at');
    const out = [];
    const req = idx.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(out); return; }
      const r = cur.value;
      if ((campus == null || r.campus === campus)
        && (placeId === undefined || r.placeId === placeId)
        && (slot == null || r.slot === slot)
        && (kind == null || r.kind === kind)) out.push(r);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  }));
}

export async function estimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}

export async function persist() {
  if (!navigator.storage || !navigator.storage.persist) return 'unsupported';
  try { return (await navigator.storage.persist()) ? 'granted' : 'denied'; } catch { return 'denied'; }
}
