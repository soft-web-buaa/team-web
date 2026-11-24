// 听见校园 · 回声层：钉在一张声片某一秒的一句话。
// 数据形状（接后端时不变）：
//   { id, discId, t, text, author: { grade, dept, name, key } | null, at, demo }
// 现在：示例回声（plan3d/echo-seed.json，demo: true，页面上一律标「示例」）+ 这台设备上留的（localStorage）。
// 你留的话只在这台设备上，别人看不到，所以不算长期存储；接后端时只改本文件：
//   echoesOf   将来 GET  /api/discs/:id/echoes
//   addEcho    将来 POST /api/discs/:id/echoes   服务端要重做 validateLine，并按人限频（前端的检查可以被绕过）
//   hideEcho   将来 POST /api/echoes/:id/report  进审核队列；现在只对举报的这台设备隐藏
// 示例回声没有 author.key：counts() 按 key 数「几个人」，示例永远进不了人数。
import { signature } from './identity.js';

export const ECHO_MAX = 40;
const KEY = 'ks-echoes-v1';
const LOCAL_MAX = 200;

// 文字规则与 src/lib/rules.js 的 validateLine 是同一份（那边给 Vue 页面用，这边给舞台页用）。
// scripts/check-echoes.mjs 会拿一组句子比两边的结果，改一边忘了另一边会报错。
const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|cn|net|org|edu|top|xyz)\b)/i;
const DIGITS_RE = /\d[\d\s-]{5,}\d/;
const CONTACT_RE = /(加我|私信我|私我|微信号|vx号|qq号|\bvx\b|\bv信\b)/i;

/** 通过返回空字符串，不通过返回一句说明。 */
export function validateLine(text, max = ECHO_MAX) {
  const t = String(text || '').trim();
  if (!t) return '先写一句话。';
  if (t.length > max) return `最多 ${max} 个字。`;
  if (URL_RE.test(t)) return '这里不能放链接。';
  if (DIGITS_RE.test(t) || CONTACT_RE.test(t)) return '这里不能放号码或联系方式。';
  return '';
}

let seed = [];
let store = { mine: [], hidden: [] };

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Array.isArray(v.mine) && Array.isArray(v.hidden)) return v;
  } catch { /* 隐私模式或数据坏了：当作空的 */ }
  return { mine: [], hidden: [] };
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch { return false; }
}

/** 载入示例回声；取不到就是没有，页面照常。 */
export async function load(seedUrl = './echo-seed.json') {
  store = read();
  try {
    const res = await fetch(seedUrl);
    if (!res.ok) { seed = []; return { ok: false, n: 0 }; }
    const j = await res.json();
    seed = (j.echoes || []).filter((e) => e && e.discId && Number.isFinite(e.t) && !validateLine(e.text)).map((e) => ({ ...e, demo: true }));
    return { ok: true, n: seed.length };
  } catch {
    seed = [];
    return { ok: false, n: 0 };
  }
}

/** 一张声片上的回声，按秒排。举报过的这台设备上不再显示。 */
export function echoesOf(discId) {
  return [...seed, ...store.mine]
    .filter((e) => e.discId === discId && !store.hidden.includes(e.id))
    .sort((a, b) => a.t - b.t);
}

/** 这台设备上留过的回声条数（全部声片）。 */
export const mineCount = () => store.mine.length;

/**
 * 钉一句话。dur 是这张声片的长度（秒），t 超出就收回到范围里。
 * author 是落款快照（可以为 null：不落款也能说话）。失败时抛出一句人话。
 */
export function addEcho({ discId, t, text, dur, author }) {
  if (!discId) throw new Error('先选一张声片。');
  const bad = validateLine(text);
  if (bad) throw new Error(bad);
  if (store.mine.length >= LOCAL_MAX) throw new Error(`这台设备上最多留 ${LOCAL_MAX} 条回声，先删掉一些再留。`);
  const e = {
    id: `ec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    discId,
    t: Math.round(Math.min(Math.max(0, Number(t) || 0), dur || 10) * 10) / 10,
    text: String(text).trim(),
    author: author && (author.grade || author.dept || author.name) ? { grade: author.grade || '', dept: author.dept || '', name: author.name || '', key: author.key || null } : null,
    at: new Date().toISOString(),
    demo: false,
    mine: true,
  };
  store.mine.push(e);
  if (!write()) {
    store.mine.pop();
    throw new Error('这台设备的存储空间满了，这条没有存下。');
  }
  return e;
}

/** 举报：先对举报的这台设备隐藏。自己留的那条就是删除。 */
export function hideEcho(id) {
  const i = store.mine.findIndex((e) => e.id === id);
  if (i >= 0) store.mine.splice(i, 1);
  else if (!store.hidden.includes(id)) store.hidden.push(id);
  write();
}

/** 一行署名：「2025级 · 宇航学院」；示例在后面加「示例」，自己留的加「我」。 */
export function byline(e) {
  const s = signature(e.author);
  return [s === '未落款' ? '' : s, e.demo ? '示例' : e.mine ? '我' : ''].filter(Boolean).join(' · ');
}
