// 听见校园 · 云客户端。接口在 server/api.mjs；线上是 CloudBase 的 HTTP 云函数，本机是 vite 自带的 /api。
// 地址：网址里的 ?api= > <meta name="tj-api"> > '/api'。
// 返回值只有三种：{ ok: true, json } / { ok: false, offline: true }（连不上）/ { ok: false, status, error, code }（服务端明确拒绝，error 是一句人话）。
// 身份：没盖章时是刻声卡算出的作者键（x-ks-key）；用学号盖过章，改带令牌（Authorization），作者键用账号的。
import { loadIdentity, saveIdentity, authorKey } from '../kesheng/web/identity.js';

const SEAL = 'tj-seal-v1';
let cachedKey = null, cachedUid = null;
/** 这台设备上的章：{ token, key, account: { sid, since, sig } } 或 null。 */
export function seal() {
  try { const s = JSON.parse(localStorage.getItem(SEAL)); return s && s.token && /^[0-9a-f]{16}$/.test(s.key) ? s : null; } catch { return null; }
}
export function setSeal(s) { try { localStorage.setItem(SEAL, JSON.stringify(s)); } catch { /* 隐私模式：这一页有效 */ } cachedKey = s.key; cachedUid = null; }
export function clearSeal() { try { localStorage.removeItem(SEAL); } catch { /* 无 */ } cachedKey = null; cachedUid = null; }
/** 令牌过期或被退出时（服务端 401 code=session）通知一下界面。 */
let onLost = null;
export const whenSealLost = (fn) => { onLost = fn; };
export function apiBase() {
  const q = new URLSearchParams(location.search).get('api');
  const m = document.querySelector('meta[name="tj-api"]');
  return String(q || (m && m.content) || '/api').replace(/\/$/, '');
}
/** 我的作者键。create = true 时，没有刻声卡就建一张空落款的。 */
export async function myKey(create = false) {
  const s = seal();
  if (s) { cachedKey = s.key; return s.key; }
  let id = loadIdentity();
  if (!id && create) id = saveIdentity({});
  if (!id) return null;
  if (cachedUid !== id.uid) { cachedKey = await authorKey(id.uid); cachedUid = id.uid; }
  return cachedKey;
}
export const keyNow = () => cachedKey;

export async function request(method, path, body = null, { timeout = 9000, create = false } = {}) {
  const key = await myKey(create);
  const s = seal();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(apiBase() + path, {
      method,
      // 请求体仍是 JSON，但声明成 text/plain：CloudBase HTTP 网关对 application/json 的请求体卡 100 KB（EXCEED_MAX_PAYLOAD_SIZE），
      // 一张 10 秒的盘 base64 后约 625 KB，过不去；text/plain 走函数 event 的 6 MB 档。服务端不看 content-type，照样 JSON.parse
      headers: { ...(body ? { 'content-type': 'text/plain;charset=utf-8' } : {}), ...(s ? { authorization: `Bearer ${s.token}` } : key ? { 'x-ks-key': key } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
      cache: 'no-store',
    });
    if (!(res.headers.get('content-type') || '').includes('json')) return { ok: false, offline: true };
    const json = await res.json();
    if (res.ok && json && json.ok) return { ok: true, json, status: res.status };
    if (res.status === 401 && json && json.code === 'session' && s) { clearSeal(); if (onLost) onLost(json.error); }
    if (res.status >= 500 || res.status === 429) return { ok: false, offline: res.status >= 500, status: res.status, error: (json && json.error) || '服务暂时不可用，稍后再试。' };
    return { ok: false, status: res.status, code: json && json.code, error: (json && json.error) || '没有成功，再试一次。' };
  } catch {
    return { ok: false, offline: true };
  } finally {
    clearTimeout(timer);
  }
}
export const audioUrl = (id) => `${apiBase()}/discs/${encodeURIComponent(id)}/audio${cachedKey ? `?k=${cachedKey}` : ''}`;
export const photoUrl = (id, which = 'thumb') => `${apiBase()}/photos/${encodeURIComponent(id)}/${which}${cachedKey ? `?k=${cachedKey}` : ''}`;
