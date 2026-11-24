// 听见校园 · 云客户端。接口在 server/api.mjs；线上是 CloudBase 的 HTTP 云函数，本机是 vite 自带的 /api。
// 地址：网址里的 ?api= > <meta name="tj-api"> > '/api'。
// 返回值只有三种：{ ok: true, json } / { ok: false, offline: true }（连不上）/ { ok: false, status, error }（服务端明确拒绝，error 是一句人话）。
import { loadIdentity, saveIdentity, authorKey } from '../kesheng/web/identity.js';

let cachedKey = null, cachedUid = null;
export function apiBase() {
  const q = new URLSearchParams(location.search).get('api');
  const m = document.querySelector('meta[name="tj-api"]');
  return String(q || (m && m.content) || '/api').replace(/\/$/, '');
}
/** 我的作者键。create = true 时，没有刻声卡就建一张空落款的。 */
export async function myKey(create = false) {
  let id = loadIdentity();
  if (!id && create) id = saveIdentity({});
  if (!id) return null;
  if (cachedUid !== id.uid) { cachedKey = await authorKey(id.uid); cachedUid = id.uid; }
  return cachedKey;
}
export const keyNow = () => cachedKey;

export async function request(method, path, body = null, { timeout = 9000, create = false } = {}) {
  const key = await myKey(create);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(apiBase() + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'x-ks-key': key } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
      cache: 'no-store',
    });
    if (!(res.headers.get('content-type') || '').includes('json')) return { ok: false, offline: true };
    const json = await res.json();
    if (res.ok && json && json.ok) return { ok: true, json, status: res.status };
    if (res.status >= 500 || res.status === 429) return { ok: false, offline: res.status >= 500, status: res.status, error: (json && json.error) || '服务暂时不可用，稍后再试。' };
    return { ok: false, status: res.status, error: (json && json.error) || '没有成功，再试一次。' };
  } catch {
    return { ok: false, offline: true };
  } finally {
    clearTimeout(timer);
  }
}
export const audioUrl = (id) => `${apiBase()}/discs/${encodeURIComponent(id)}/audio${cachedKey ? `?k=${cachedKey}` : ''}`;
export const photoUrl = (id, which = 'thumb') => `${apiBase()}/photos/${encodeURIComponent(id)}/${which}${cachedKey ? `?k=${cachedKey}` : ''}`;
