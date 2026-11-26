// 听见校园 · 学号登记：给刻声卡盖一个北航的章（DESIGN.md §7c）。
//   POST /api/auth/code    { sid }          往 学号@buaa.edu.cn 寄六位验证码
//   POST /api/auth/verify  { sid, code }    验对了发一张会话令牌；这台设备上匿名留下的一并认到名下
// 不碰统一认证密码。云上只存：学号的 HMAC（认人）、打码的学号（给本人看）、验证码的 HMAC、令牌的 SHA-256。
// 账号的作者键沿用刻声卡算出来的那一串：盘、帖子、收藏上记的 key 不用改，只是从此要带令牌才写得进去。
import crypto from 'node:crypto';

export const MAIL_DOMAIN = 'buaa.edu.cn';
export const SID_RE = /^(?:[a-z]{2})?\d{6,10}$/;          // 本科 8 位数字；研究生 SY / ZY / BY 加数字
export const AUTH = { codeTtl: 10 * 60_000, resendMs: 60_000, perSidDay: 6, tries: 5, sessionDays: 180, perIpHour: 20 };
export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const KEY_RE = /^[0-9a-f]{16}$/;
// 记着作者键的集合。id 里带键的（收藏、同听、举报、反应）认领时要换成新 id
const OWNED = ['discs', 'echoes', 'photos', 'heard', 'favs', 'reports', 'posts', 'replies', 'reacts', 'topics', 'albums', 'tracks'];

export const normSid = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/@buaa\.edu\.cn$/, '');
export const maskSid = (sid) => (sid.length <= 4 ? sid : `${sid.slice(0, sid.length - 6 > 0 ? sid.length - 6 : 2)}****${sid.slice(-2)}`);

export function createAuth({ store, now, secret, mailer = null, devCodes = false }) {
  const mac = (s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const acctId = (sid) => `ac-${mac(`sid:${sid}`).slice(0, 24)}`;
  const loginId = (sid) => `lg-${mac(`sid:${sid}`).slice(0, 24)}`;
  const sessId = (token) => `ss-${sha(token).slice(0, 40)}`;
  const day = () => new Date(now() + 8 * 3600_000).toISOString().slice(0, 10);   // 按北京时间算「今天」
  const ipHits = new Map();
  const fail = (status, error, extra = {}) => ({ fail: { status, error, ...extra } });
  const view = (a) => ({ sid: a.sidMask, since: a.at, sig: a.sig || null });

  async function keyOwner(key) {
    if (!KEY_RE.test(key)) return null;
    return (await store.list('accounts', { key }))[0] || null;
  }

  async function sendCode(raw, ip = '') {
    if (!mailer) return fail(503, '学号登记暂时没开，过一阵再来。');
    const sid = normSid(raw);
    if (!SID_RE.test(sid)) return fail(400, '学号的样子不对：本科是 8 位数字，研究生是 SY、ZY、BY 加数字。');
    if (ip) {
      const t = now(), arr = (ipHits.get(ip) || []).filter((x) => t - x < 3600_000);
      if (arr.length >= AUTH.perIpHour) return fail(429, '这个网络寄得太多了，过一小时再来。');
      arr.push(t); ipHits.set(ip, arr);
    }
    const id = loginId(sid), prev = await store.get('logins', id);
    if (prev && prev.code && now() - prev.sentAt < AUTH.resendMs) {   // 上一封还没用掉才要等；刚盖完章换台设备可以马上再寄
      const wait = Math.ceil((AUTH.resendMs - (now() - prev.sentAt)) / 1000);
      return fail(429, `刚寄过，${wait} 秒后可以再寄。`, { wait });
    }
    const n = prev && prev.day === day() ? prev.n : 0;
    if (n >= AUTH.perSidDay) return fail(429, '今天给这个学号寄得够多了，明天再来。');
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const to = `${sid}@${MAIL_DOMAIN}`;
    try { await mailer.send({ to, ...letter(maskSid(sid), code) }); }
    catch (e) { console.error('寄验证码失败：', e && e.message); return fail(502, '邮件没寄出去，过一会儿再试。'); }
    await store.put('logins', { id, code: mac(`code:${sid}:${code}`), exp: now() + AUTH.codeTtl, tries: 0, sentAt: now(), day: day(), n: n + 1 });
    return { to: `${maskSid(sid)}@${MAIL_DOMAIN}`, wait: AUTH.resendMs / 1000, ...(devCodes ? { devCode: code } : {}) };
  }

  async function verify(raw, rawCode, deviceKey) {
    const sid = normSid(raw), code = String(rawCode ?? '').replace(/\D/g, '');
    if (!SID_RE.test(sid)) return fail(400, '学号的样子不对。');
    const id = loginId(sid), rec = await store.get('logins', id);
    if (!rec || !rec.code || now() > rec.exp) return fail(400, '验证码过期了，再寄一封。');
    if (rec.tries >= AUTH.tries) return fail(429, '错的次数太多，再寄一封新的。');
    const want = Buffer.from(rec.code, 'hex'), got = Buffer.from(mac(`code:${sid}:${code}`), 'hex');
    if (code.length !== 6 || !crypto.timingSafeEqual(want, got)) {
      await store.put('logins', { ...rec, tries: rec.tries + 1 });
      const left = AUTH.tries - rec.tries - 1;
      return fail(400, left ? `验证码不对，还能再试 ${left} 次。` : '验证码不对。再寄一封新的吧。');
    }
    await store.put('logins', { ...rec, code: null });                       // 一码一用
    const aid = acctId(sid);
    let acct = await store.get('accounts', aid), merged = 0;
    const free = KEY_RE.test(deviceKey || '') && !(await keyOwner(deviceKey));
    if (!acct) {
      acct = { id: aid, key: free ? deviceKey : crypto.randomBytes(8).toString('hex'), sidMask: maskSid(sid), at: new Date(now()).toISOString(), sig: null };
      await store.put('accounts', acct);
    } else if (free && deviceKey !== acct.key) {
      merged = await adopt(deviceKey, acct.key);
    }
    const token = crypto.randomBytes(24).toString('base64url');
    await store.put('sessions', { id: sessId(token), acct: aid, key: acct.key, at: new Date(now()).toISOString(), exp: now() + AUTH.sessionDays * 86400_000 });
    return { token, key: acct.key, account: view(acct), merged };
  }

  /** 这台设备上匿名留下的（作者键 from）并到账号（作者键 to）名下。返回并过来几件。 */
  async function adopt(from, to) {
    let n = 0;
    for (const c of OWNED) {
      for (const x of await store.list(c, { key: from })) {
        const id = x.id.includes(from) ? x.id.split(from).join(to) : x.id;
        if (id !== x.id) { await store.del(c, x.id); if (await store.get(c, id)) continue; }   // 账号上已经有同一件（比如两边都收藏过）
        await store.put(c, { ...x, id, key: to });
        n++;
      }
    }
    for (const x of await store.list('reacts', { targetKey: from })) await store.put('reacts', { ...x, targetKey: to });
    for (const x of await store.list('replies', { postKey: from })) await store.put('replies', { ...x, postKey: to });
    return n;
  }

  async function session(token) {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const s = await store.get('sessions', sessId(token));
    return s && s.exp > now() ? s : null;
  }
  const account = (s) => store.get('accounts', s.acct);
  async function logout(token) { await store.del('sessions', sessId(token)); }
  async function setSig(s, sig) {
    const a = await account(s);
    if (!a) return null;
    const next = { ...a, sig };
    await store.put('accounts', next);
    return view(next);
  }
  return { sendCode, verify, session, account: async (s) => { const a = await account(s); return a && view(a); }, logout, setSig, keyOwner };
}

/** 验证码那封信：纯文字一份，带一点版式的 HTML 一份。 */
export function letter(sidMask, code) {
  const subject = `听见校园 · 盖章用的验证码 ${code}`;
  const text = `你在「听见校园」用学号 ${sidMask} 给刻声卡盖章。\n\n验证码：${code}\n十分钟内有效，只能用一次。\n\n不是你本人在操作的话，不用理会这封信，什么都不会发生。\n\n听见校园 · 学院路刻声馆藏`;
  const html = `<div style="max-width:460px;margin:0 auto;padding:28px 26px;background:#F4EFE4;color:#1E1A14;font:15px/1.7 'PingFang SC','Microsoft YaHei',sans-serif">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;color:#6A6152">听见校园 · 学院路刻声馆藏</p>
<p style="margin:0 0 18px">你在用学号 ${sidMask} 给刻声卡盖章。</p>
<p style="margin:0;font:400 40px/1.1 'FangSong','STFangsong',serif;letter-spacing:.32em;color:#1E1A14">${code}</p>
<p style="margin:14px 0 0;font-size:12px;color:#6A6152">十分钟内有效，只能用一次。不是你本人在操作的话，不用理会这封信，什么都不会发生。</p></div>`;
  return { subject, text, html };
}
