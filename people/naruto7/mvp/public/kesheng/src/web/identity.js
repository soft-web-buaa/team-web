// 刻声 · 轻身份：每台设备一张「刻声卡」。
// 口径（用户 2026-10-20）：落款 = 年级 + 院系 + 姓名，姓名可以是昵称。
// - 卡号 uid（UUID v4）只在本机、投稿包和不部署的馆员台账里出现。公开目录只放 authorKey(uid)：
//   一串摘要，页面拿本机卡号算出同一串，就能在馆藏里认出「这是我的盘」，别人拿它反推不出卡号。
//   将来接真账号时，卡号就是认领凭据（谁出示得了这张卡，谁就是这些盘的作者），所以它不公开。
// - 每张盘存的是落款快照：以后改落款，旧盘不跟着变。
// - 没有密码、没有注册：卡丢了就是丢了。换设备靠「导出 / 导入刻声卡」。

const KEY = 'ks-identity-v1';
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const AUTHOR_SALT = 'kesheng-author-v1:';

const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function normalize(f = {}) {
  return { grade: clean(f.grade, 12), dept: clean(f.dept, 24), name: clean(f.name, 16) };
}

/** 「2024级 · 宇航学院 · 阿川」；三项都空时是「未落款」。 */
export function signature(a) {
  const parts = a ? [a.grade, a.dept, a.name].filter(Boolean) : [];
  return parts.length ? parts.join(' · ') : '未落款';
}

export function isUid(s) { return UUID4.test(String(s || '')); }

export function loadIdentity(st = globalThis.localStorage) {
  try {
    const v = JSON.parse(st.getItem(KEY));
    return v && isUid(v.uid) ? v : null;
  } catch { return null; }
}

/** 建卡或改落款；卡号一经生成不再变。 */
export function saveIdentity(fields, st = globalThis.localStorage) {
  const prev = loadIdentity(st);
  const now = new Date().toISOString();
  const id = { v: 1, uid: prev ? prev.uid : crypto.randomUUID(), ...normalize(fields), createdAt: prev ? prev.createdAt : now, updatedAt: now };
  st.setItem(KEY, JSON.stringify(id));
  return id;
}

/** 盘上存的落款快照（含卡号：只进本机库和投稿包，入藏时卡号被馆员工具挪进台账）。 */
export function snapshot(id) {
  return id ? { uid: id.uid, grade: id.grade, dept: id.dept, name: id.name } : null;
}

export function cardFile(id) {
  return JSON.stringify({ kind: 'kesheng-card', v: 1, uid: id.uid, grade: id.grade, dept: id.dept, name: id.name, createdAt: id.createdAt }, null, 2);
}

export function parseCard(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('读不懂这个文件'); }
  if (!o || o.kind !== 'kesheng-card' || !isUid(o.uid)) throw new Error('这不是刻声卡');
  const now = new Date().toISOString();
  return { v: 1, uid: o.uid.toLowerCase(), ...normalize(o), createdAt: o.createdAt || now, updatedAt: now };
}

export function importIdentity(text, st = globalThis.localStorage) {
  const id = parseCard(text);
  st.setItem(KEY, JSON.stringify(id));
  return id;
}

/** 公开用的作者摘要：sha256(盐 + 卡号) 的前 16 位十六进制。tools/archive-cli.mjs 用同一公式（单测对齐）。 */
export async function authorKey(uid) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(AUTHOR_SALT + String(uid).toLowerCase()));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
