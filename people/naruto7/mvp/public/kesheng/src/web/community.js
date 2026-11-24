// 听见校园 · 回声层（云优先）：钉在一张声片某一秒的一句话，可以配一张照片。
//
// 数据放哪（决策 0006）：
//   云    回声、照片、落款快照、举报与审核状态、同意记录。别人要看到的、要长期在的，都以云为准。
//   本机  发件箱（还没发出去的话和照片，连上就发）、「对我隐藏」。只有我自己要用，丢了也不丢别人的东西。
//   不留  照片里的 EXIF：浏览器重新编码时去掉，服务端再剥一遍。
// 接口见 contract.js，客户端见 cloud.js。云不通时页面照常：我留的话先显示成「待发出」，连上自动发；
// 被服务端拒绝的（链接、号码、照片不合格）显示成「被退回」并写明原因，由本人删掉。
//
// 示例回声（plan3d/echo-seed.json，demo: true）永远在，页面上一律标「示例」，不进计数，也不会发到云上。
import { signature } from './identity.js';
import { ECHO_MAX, validateLine, CONSENT_VERSION } from './contract.js';
import * as cloud from './cloud.js';
import * as outbox from './outbox.js';

export { ECHO_MAX, validateLine };

const HIDDEN_KEY = 'ks-hidden-v1';
const OLD_KEY = 'ks-echoes-v1';     // PR #23 的本机版：读到就搬进发件箱，然后删掉
const OUTBOX_MAX = 40;

let seed = [];
const cached = new Map();           // discId → 云上最近一次取到的回声
const placeCache = new Map();       // placeId → 云上的照片印样
let queue = [];                     // 发件箱里的条目（含被退回的）
let hidden = [];
let online = null;                  // null 还没试过 / true / false
let key = null;                     // 我的作者键（同步读，给照片地址用）
const listeners = new Set();

export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
const emit = () => listeners.forEach((f) => { try { f(); } catch { /* 一个监听器出错不拖累别的 */ } });

const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const dataUrl = (b64) => `data:image/jpeg;base64,${b64}`;

function readHidden() {
  try { const v = JSON.parse(localStorage.getItem(HIDDEN_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeHidden() { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)); } catch { /* 存不下就只对这一页有效 */ } }

/** 载入：示例回声、发件箱、对我隐藏的；然后试着把发件箱发出去。取不到示例就是没有，页面照常。 */
export async function load(seedUrl = './echo-seed.json') {
  hidden = readHidden();
  try { key = await cloud.myKey(false); } catch { key = null; }
  try { queue = await outbox.all(); } catch { queue = []; }
  // 旧版本留在 localStorage 里的话：搬进发件箱，保证不丢
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (old && Array.isArray(old.mine) && old.mine.length) {
      for (const e of old.mine) {
        if (!e || !e.discId || validateLine(e.text)) continue;
        const item = { id: rid('ec'), kind: 'echo', state: 'pending', at: e.at || new Date().toISOString(), photo: null,
          echo: { id: null, discId: e.discId, t: e.t, text: e.text, dur: 10, author: e.author || null } };
        item.echo.id = item.id;
        await outbox.put(item);
        queue.push(item);
      }
    }
    localStorage.removeItem(OLD_KEY);
  } catch { /* 没有旧数据 */ }
  try {
    const res = await fetch(seedUrl);
    const j = res.ok ? await res.json() : { echoes: [] };
    seed = (j.echoes || []).filter((e) => e && e.discId && Number.isFinite(e.t) && !validateLine(e.text)).map((e) => ({ ...e, demo: true }));
  } catch { seed = []; }
  flush();
  return { ok: true, n: seed.length };
}

const viewOfQueued = (p) => ({
  id: p.id, discId: p.echo.discId, t: p.echo.t, text: p.echo.text, at: p.at, mine: true,
  author: p.echo.author,
  local: p.state === 'rejected' ? 'rejected' : 'pending', error: p.error || null,
  photo: p.photo ? { id: p.photo.id, state: 'local', src: dataUrl(p.photo.thumb), full: dataUrl(p.photo.full) } : null,
});

/** 一张声片上的回声，按秒排：示例 + 云上的 + 我发件箱里的。我举报过的不显示。 */
export function echoesOf(discId) {
  const fromCloud = cached.get(discId) || [];
  const have = new Set(fromCloud.map((e) => e.id));
  const queued = queue.filter((p) => p.echo.discId === discId && !have.has(p.id)).map(viewOfQueued);
  const demo = seed.filter((e) => e.discId === discId);   // 示例回声只属于它钉的那张声片
  return [...demo, ...fromCloud, ...queued].filter((e) => !hidden.includes(e.id)).sort((a, b) => a.t - b.t);
}

/** 照片的地址：本机还没发出的用内嵌图，云上的走接口。which: 'thumb' | 'full'。 */
export function photoSrc(e, which = 'thumb') {
  const p = e && e.photo;
  if (!p) return null;
  if (p.state === 'local') return which === 'full' ? p.full : p.src;
  return cloud.photoUrl(p.id, which, key);
}

/** 从云上取这张声片的回声。取到了返回 true；连不上返回 false，页面继续用已有的。 */
export async function refresh(discId) {
  const r = await cloud.request('GET', `/discs/${encodeURIComponent(discId)}/echoes`);
  if (r.ok) { online = true; cached.set(discId, r.json.echoes); } else if (r.offline) online = false;
  emit();
  return r.ok;
}

/** 这个地点的照片印样（云上审核通过的 + 我自己的）。 */
export async function refreshPlace(placeId) {
  const r = await cloud.request('GET', `/places/${encodeURIComponent(placeId)}/photos`);
  if (r.ok) { online = true; placeCache.set(placeId, r.json.photos); } else if (r.offline) online = false;
  emit();
  return r.ok;
}
export const placePhotos = (placeId) => (placeCache.get(placeId) || []).map((p) => ({ ...p, src: cloud.photoUrl(p.id, 'thumb', key), full: cloud.photoUrl(p.id, 'full', key) }));

/**
 * 钉一句话（可以带一张照片）。先校验，再放进发件箱，马上显示成「待发出」，然后后台发。
 * photo: { thumb, full, consent: true }（photo.js 的 prepare 给出前两项；consent 是用户勾选的"照片里没有能认出身份的人，或我已经问过"）。
 * placeId 只有带照片时才要：照片挂在地点的印样上。失败时抛出一句人话。
 */
export async function addEcho({ discId, t, text, dur, author, photo = null, placeId = null }) {
  if (!discId) throw new Error('先选一张声片。');
  const bad = validateLine(text);
  if (bad) throw new Error(bad);
  if (photo && photo.consent !== true) throw new Error('要先勾选"照片里没有能认出身份的人，或我已经问过"。');
  if (photo && !placeId) throw new Error('这张声片还没有地点，先在校园里点一根针，再配照片。');
  if (queue.length >= OUTBOX_MAX) throw new Error('还有太多没发出去的，连上网络之后再钉。');
  const id = rid('ec');
  const a = author && (author.grade || author.dept || author.name) ? { grade: author.grade || '', dept: author.dept || '', name: author.name || '' } : null;
  const item = {
    id, kind: 'echo', state: 'pending', at: new Date().toISOString(),
    echo: { id, discId, t: Math.round(Math.min(Math.max(0, Number(t) || 0), dur || 10) * 10) / 10, text: String(text).trim(), dur: dur || 10, author: a },
    photo: photo ? { id: rid('ph'), placeId, thumb: photo.thumb, full: photo.full } : null,
  };
  await outbox.put(item);
  queue.push(item);
  emit();
  flush();
  return viewOfQueued(item);
}

let flushing = false;
/** 把发件箱发出去。连不上就留着，被拒绝的标成「被退回」。 */
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (const item of [...queue]) {
      if (item.state === 'rejected') continue;
      if (item.photo && !item.photoDone) {
        const r = await cloud.request('POST', '/photos', { id: item.photo.id, placeId: item.photo.placeId, consent: { version: CONSENT_VERSION, noIdentifiable: true }, thumb: item.photo.thumb, full: item.photo.full }, { timeout: 25000, create: true });
        if (r.ok) { item.photoDone = true; await outbox.put(item); }
        else if (r.offline) { online = false; break; }
        else if (r.status === 429) break;
        else { item.state = 'rejected'; item.error = `照片：${r.error}`; await outbox.put(item); continue; }
      }
      const r = await cloud.request('POST', '/echoes', { ...item.echo, photoId: item.photo ? item.photo.id : null }, { create: true });
      if (r.ok) {
        online = true;
        queue = queue.filter((x) => x.id !== item.id);
        await outbox.del(item.id);
        const list = cached.get(item.echo.discId) || [];
        if (!list.some((e) => e.id === item.id)) list.push(r.json.echo);
        cached.set(item.echo.discId, list);
        if (!key) key = await cloud.myKey(false);
        if (item.photo) refreshPlace(item.photo.placeId);   // 我的照片印样里马上出现
      } else if (r.offline) { online = false; break; }
      else if (r.status === 429) break;
      else { item.state = 'rejected'; item.error = r.error; await outbox.put(item); }
    }
  } finally {
    flushing = false;
    emit();
  }
}

/** 删掉自己的（云上也删），或举报别人的（对我隐藏，云上记一次举报）。示例只对我隐藏。 */
export async function hideEcho(id) {
  const q = queue.find((x) => x.id === id);
  if (q) { queue = queue.filter((x) => x.id !== id); await outbox.del(id); emit(); return { ok: true }; }
  let found = null;
  for (const list of cached.values()) { const e = list.find((x) => x.id === id); if (e) { found = { e, list }; break; } }
  if (found && found.e.mine) {
    const r = await cloud.request('DELETE', `/echoes/${encodeURIComponent(id)}`);
    if (r.ok) { found.list.splice(found.list.indexOf(found.e), 1); emit(); }
    return r;
  }
  if (!String(id).startsWith('ec-demo-')) cloud.request('POST', `/echoes/${encodeURIComponent(id)}/report`, {}, { create: true });
  hidden.push(id); writeHidden(); emit();
  return { ok: true };
}

/** 页面角落那一行状态用：连没连上、有几条在等、几条被退回。 */
export const status = () => ({
  online, waiting: queue.filter((p) => p.state === 'pending').length, rejected: queue.filter((p) => p.state === 'rejected').length, memoryOnly: outbox.isMemoryOnly(),
});

/** 一行署名：「2025级 · 宇航学院」；示例、我、待发出、被退回在后面加一个小标。 */
export function byline(e) {
  const s = signature(e.author);
  const tag = e.demo ? '示例' : e.local === 'rejected' ? '被退回' : e.local === 'pending' ? '待发出' : e.held ? '已被收起' : e.mine ? '我' : '';
  const ph = e.photo && e.photo.state === 'pending' ? '照片审核中' : '';
  return [s === '未落款' ? '' : s, tag, ph].filter(Boolean).join(' · ');
}

// 连上网络就发；页面开着时每 20 秒也试一次（云的另一头可能刚好恢复）
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flush());
  setInterval(() => { if (queue.some((p) => p.state === 'pending')) flush(); }, 20000);
}
