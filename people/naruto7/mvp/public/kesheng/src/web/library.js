// 刻声 · 数据层：页面只经过这里读写声片与身份，不直接碰 IndexedDB、localStorage 或目录文件。
// 接后端时只改这一个文件，每个函数注释里写了它将来对应的接口；数据形状不变（schema 2 + author + submittedAt）。
//   馆藏目录      fetchCatalog()   现在：GET {base}archive/catalog.json         将来：GET /api/catalog
//   馆藏音频      archiveAudio()   现在：GET {base}archive/audio/<档案号>.wav    将来：同一个 URL（对象存储）
//   我的柜子      localDiscs()     现在：IndexedDB 'kesheng'                       将来：GET /api/me/discs（离线时仍读本机）
//   存一张        saveDisc()       现在：IndexedDB put                              将来：本机 put + 后台同步
//   我是谁        me() / setMe()   现在：localStorage 里的刻声卡                    将来：会话里的账号；卡号作为认领凭据
//   史料          fetchHistory()   GET {base}history/index.json：只放选单（事件、日期、出处、地点事实），2026-10-20 用户拍板，口头认可、书面授权待补
//   史料音频      archivalAudio()  GET {base}archive/<file>：音频的唯一一份在 archive/audio/（catalog.json 是唯一真相源），history/ 不再放副本
import * as store from './store.js';
import { loadIdentity, saveIdentity, authorKey } from './identity.js';
import { tierOf } from './tier.js';

export async function fetchCatalog(base = './') {
  try {
    const res = await fetch(`${base}archive/catalog.json`, { cache: 'no-cache' });
    if (!res.ok) return { ok: false, entries: [] };
    const c = await res.json();
    // 馆藏只收真实的十秒：标了 archival / synthetic（或拼错 tier）的条目混进来也不算（src/web/tier.js）
    return { ok: true, entries: (c.entries || []).filter((e) => e.status === 'accessioned' && tierOf(e) === 'real') };
  } catch {
    return { ok: false, entries: [] };
  }
}

/** 馆藏目录里的史料条目（tier: archival）：只用来找史料的音频文件（file），不进计数之外的任何聚合。 */
export async function fetchArchival(base = './') {
  try {
    const res = await fetch(`${base}archive/catalog.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const c = await res.json();
    return (c.entries || []).filter((e) => e.status === 'accessioned' && tierOf(e) === 'archival');
  } catch {
    return [];
  }
}

/** 史料（tier: archival）：和馆藏分开取、分开放，不进计数与寻片（src/web/tier.js）。取不到就是没有，页面照常。 */
const HISTORY = 'history/';
export async function fetchHistory(base = './') {
  try {
    const res = await fetch(`${base}${HISTORY}index.json`);
    if (!res.ok) return { ok: false, items: [], places: {} };
    const h = await res.json();
    // 只认显式标了 archival 的条目：拼错的、没标的一律不收（不让它混成「真实」）
    return { ok: true, items: (h.items || []).filter((x) => tierOf(x) === 'archival'), places: h.places || {}, auth: h.auth || null };
  } catch {
    return { ok: false, items: [], places: {} };
  }
}

/**
 * 选单里的一段史料 → 馆藏目录里的同一段（id = arc-<packId>）。对不上就是 null（页面不列这段，不去取不存在的文件）。
 * 两边是不是同一段声音，按 sha256 核（test/unit/history.test.js），不按名字认。
 */
export function archivalOf(h, archival) {
  return (archival || []).find((e) => e.id === `arc-${h.packId}`) || null;
}

export async function archiveAudio(base, e) {
  // 条目上的 file 是唯一真相（史料 mp3 / 投稿盘 wav）；没有 file 的老条目退回 <no>.wav
  const path = e.file || `audio/${encodeURIComponent(e.no)}.wav`;
  const res = await fetch(`${base}archive/${path}`);
  if (!res.ok) throw new Error(`馆藏音频取不到（HTTP ${res.status}）`);
  return res.arrayBuffer();
}

/** 本机柜里的原始记录（pcm 还是 Blob，放的时候再解）。打不开库就返回 null，调用方明说「只在内存里」。 */
export async function localDiscs() {
  try { return await store.all(); } catch { return null; }
}

export const saveDisc = (d) => store.put(d);
export const discFromRecord = (rec) => store.fromRecord(rec);

/** 本机号的流水：柜里已有的最大序号 + 1（与主页同一规则，刷新后不撞号）。 */
export function nextLocalSeq(records) {
  let seq = 1;
  for (const r of records || []) {
    const m = /-(\d+)$/.exec(String(r.no || ''));
    if (m) seq = Math.max(seq, Number(m[1]) + 1);
  }
  return seq;
}

export function me() { try { return loadIdentity(); } catch { return null; } }
export function setMe(fields) { return saveIdentity(fields); }
/** 没有卡就建一张空落款的卡（卡号用来认出自己的盘；落款以后再填）。 */
export function ensureMe() { return me() || saveIdentity({ asked: false }); }
export async function myKey() { const id = me(); return id ? authorKey(id.uid) : null; }
