// 听见校园 · 盖章：用学号给刻声卡盖一个北航的章（DESIGN.md §7c）。接口在 server/auth.mjs。
// 没盖章照样能听、能刻；盖了章，换设备时用学号再盖一次，盘、帖子、收藏都认得回来。
import { reactive } from 'vue';
import * as cloud from './cloud.js';
import { L, say, refresh } from './library.js';
import { loadIdentity, saveIdentity, signature } from '../kesheng/web/identity.js';

export const S = reactive({
  open: null,                       // null 还没问过 / true 开了 / false 没开（线上没配寄信）
  account: cloud.seal() ? cloud.seal().account : null,
  dev: '',                          // 本机开发：服务端把验证码带回来，页面替你填上
});
cloud.whenSealLost((msg) => { S.account = null; say(msg || '章过期了，用学号再盖一次。'); });

export async function probe() {
  if (S.open !== null) return S.open;
  const r = await cloud.request('GET', '/health');
  S.open = r.ok ? !!r.json.login : false;
  return S.open;
}

/** 寄验证码。返回 { ok, to, wait } 或 { ok: false, error, wait }。 */
export async function sendCode(sid) {
  const r = await cloud.request('POST', '/auth/code', { sid });
  if (r.ok) { S.dev = r.json.devCode || ''; return { ok: true, to: r.json.to, wait: r.json.wait || 60 }; }
  return { ok: false, error: r.offline ? '连不上云，等一会儿再寄。' : r.error, wait: 0 };
}

/** 验码、盖章。落款跟着账号走：账号上有就用账号的；账号上没有、这台设备上有，就把这台的存上去。 */
export async function stamp(sid, code) {
  const r = await cloud.request('POST', '/auth/verify', { sid, code }, { create: true });
  if (!r.ok) return { ok: false, error: r.offline ? '连不上云，等一会儿再试。' : r.error };
  const { token, key, account, merged } = r.json;
  const local = loadIdentity();
  if (account.sig && (account.sig.grade || account.sig.dept || account.sig.name)) L.identity = saveIdentity(account.sig);
  cloud.setSeal({ token, key, account });
  if (!account.sig && local && signature(local) !== '未落款') { const s = await pushSig(local); if (s) account.sig = s.sig; }
  S.account = account;
  S.dev = '';
  await refresh();
  return { ok: true, merged };
}

/** 改落款时顺手存到账号上（换设备时跟过去）。没盖章就什么都不做。 */
export async function pushSig(f) {
  if (!cloud.seal()) return null;
  const r = await cloud.request('PUT', '/auth/sig', { grade: f.grade || '', dept: f.dept || '', name: f.name || '' });
  if (!r.ok) return null;
  const s = cloud.seal();
  cloud.setSeal({ ...s, account: r.json.account });
  S.account = r.json.account;
  return r.json.account;
}

/** 这台设备退出：令牌作废，刻声卡换一张新的空卡（旧卡的键已经认在学号名下，留着它这台设备还会认出那些盘）。 */
export async function leave() {
  await cloud.request('POST', '/auth/logout');
  cloud.clearSeal();
  try { localStorage.removeItem('ks-identity-v1'); } catch { /* 无 */ }
  location.reload();
}
