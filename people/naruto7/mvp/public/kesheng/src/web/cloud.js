// 听见校园 · 云客户端：把 contract.js 里的接口包成几个函数。浏览器和 Node（自检）都能用。
// 接口地址：globalThis.__KS_API__ > 网址里的 ?api= > 页面里的 <meta name="ks-api"> > '/api'（开发和预览时由 vite 代理到开发用云模拟器）。
// 换成 CloudBase 时，把地址指到云函数的网关，页面不用动；跨域要在网关上配 CORS，并放行 x-ks-key 这个请求头。
//
// 返回值只有三种：
//   { ok: true, json }                       成功
//   { ok: false, offline: true }             连不上、超时、或者返回的不是 JSON（单页应用的预览服务会对不存在的路径返回 200 的 index.html，不能当成功）
//   { ok: false, status, error }             服务端明确拒绝：error 是一句人话，直接给用户看
import { loadIdentity, saveIdentity, authorKey } from './identity.js';

const keys = new Map();   // 卡号 → 作者键：算一次就够

export function apiBase() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('api') : null;
  const m = typeof document !== 'undefined' ? document.querySelector('meta[name="ks-api"]') : null;
  return String(globalThis.__KS_API__ || q || (m && m.content) || '/api').replace(/\/$/, '');
}

/** 我的作者键。create = true 时，没有刻声卡就建一张空落款的（第一次说话时）。 */
export async function myKey(create = false) {
  let id = loadIdentity();
  if (!id && create) id = saveIdentity({ asked: false });
  if (!id) return null;
  if (!keys.has(id.uid)) keys.set(id.uid, await authorKey(id.uid));
  return keys.get(id.uid);
}

export async function request(method, path, body = null, { timeout = 8000, create = false } = {}) {
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

/** 照片地址。审核中的照片只有作者能看，所以带上作者键（它本来就是公开目录里的摘要，不是密码）。 */
export function photoUrl(id, which = 'thumb', key = null) {
  return `${apiBase()}/photos/${encodeURIComponent(id)}/${which}${key ? `?k=${key}` : ''}`;
}
