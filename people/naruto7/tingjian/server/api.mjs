// 听见校园 · 接口：一份代码，两种存储（本机文件 store-file.mjs / CloudBase store-cloudbase.mjs）。
// 本机开发、离线演示用 server/serve.mjs 起；线上是 CloudBase 的 HTTP 云函数 cloudfunctions/api（同一份 handle）。
// 写入一律在这里重做校验：前端的检查可以被绕过（DESIGN.md §6）。
//
// 接口（JSON；身份 = 请求头 x-ks-key，刻声卡算出的 16 位作者键；用学号盖过章的卡改带 Authorization: Bearer 令牌，见 auth.mjs）：
//   GET    /api/health                        带 login：学号登记开没开
//   POST   /api/auth/code  /api/auth/verify    学号登记：寄验证码、验码换令牌
//   GET    /api/auth/me    POST /api/auth/logout    PUT /api/auth/sig（落款跟着账号走）
//   GET    /api/discs                         公开的声片（不含别人的心事盘、没到期的时间胶囊），带同听数、回声数
//   GET    /api/discs/:id/audio               这张的声音（WAV）
//   POST   /api/discs                         刻一张：{ id, placeId, note, author, visibility, capsuleUntil, at, audio(base64 WAV) }
//   DELETE /api/discs/:id                     只有作者能删；回声、同听一并删
//   POST   /api/discs/:id/heard               我也听过（再点一次取消）
//   GET    /api/discs/:id/echoes              一张声片上的回声（含「后来」，带 later: true）
//   POST   /api/echoes                        钉一句话（可带 photoId）；后来也走这里，带 { later: true }
//   DELETE /api/echoes/:id                    只有作者能删，照片一并删（「后来」也走这里：只有刻这张盘的人能写、能删）
//   POST   /api/echoes/:id/report             举报；不同的人满 3 次先收起
//   GET    /api/feed                          全站最近的回声（社区的回声流）
//   POST   /api/photos                        上传一张照片（缩略 + 大图，base64 JPEG），要带同意；先审后显
//   GET    /api/photos/:id/(thumb|full)       审核通过的人人可看；审核中只有作者能看（?k=作者键）
//   GET    /api/places/:placeId/photos        这个地点的照片印样
//   GET    /api/me                            我的：我刻的（含心事盘和没到期的胶囊）、我收藏的、回应我的
//   PUT    /api/me/favs/:discId  DELETE 同    收藏 / 取消
//   GET    /api/albums                        合辑：官方征集的和用户建的，带段数、人数、我建的、我放过
//   GET    /api/albums/:id                    一张合辑里云上的几段（示意的种子在页面里）
//   POST   /api/albums                        建一张合辑：{ id, name, intro, author }
//   POST   /api/albums/:id/tracks             放一段进去：{ id, soundId, author }
//   DELETE /api/albums/:id  /api/tracks/:id   建的人删合辑；放的人或建的人拿出一段
//   GET    /api/admin/pending                 审核：待审照片（请求头 x-ks-admin = 环境变量 KS_ADMIN_TOKEN）
//   POST   /api/admin/photos/:id              { status: 'ok' | 'pending' | 'removed' }
import { ECHO_MAX, LATER_MAX, NAME_MAX, CONSENT_VERSION, PHOTO, LIMITS, validateLine, validateField, cleanField } from '../src/kesheng/web/contract.js';
import { inspectJpeg, cleanJpeg } from '../src/kesheng/web/jpeg-clean.js';
import { hourOf, slotOfHour, semesterOf } from '../src/lib/when.js';
import { PRESET_TOPICS, MOOD_IDS, POST, DEMO_POST_RE, SOUND_ID_RE } from '../src/lib/topics.js';
import { PRESET_ALBUMS, ALBUM, ALBUM_ID_RE, TRACK_ID_RE } from '../src/lib/albums-preset.js';
import { createAuth } from './auth.mjs';
import crypto from 'node:crypto';

const KEY_RE = /^[0-9a-f]{16}$/;
const ID = { disc: /^ds-[a-z0-9-]{6,40}$/, echo: /^ec-[a-z0-9-]{6,40}$/, photo: /^ph-[a-z0-9-]{6,40}$/ };
const PLACES = new Set(Array.from({ length: 16 }, (_, i) => `XY${String(i + 1).padStart(2, '0')}`));
export const DISC = { maxSec: 10.5, minSec: 0.8, maxBytes: 1100 * 1024, noteMax: 40, perMin: 3, perDay: 30, capsuleMaxDays: 400 };
// 「后来」：刻下很久以后，作者在盘旁边补的一句。原声不改，一条条叠上去，一张盘最多 5 条。
export const LATER = { max: LATER_MAX, perDisc: 5, perMin: 3 };
const err = (status, message, code) => ({ status, json: { ok: false, error: message, ...(code ? { code } : {}) } });
const ok = (json, status = 200) => ({ status, json: { ok: true, ...json } });
const b64 = (s) => (typeof s === 'string' && s.length < 3_000_000 && /^[A-Za-z0-9+/=]+$/.test(s) ? Buffer.from(s, 'base64') : null);

/** 16 位单声道 PCM 的 WAV：读出采样率与秒数；不合格返回一句人话。 */
export function inspectWav(buf) {
  if (!buf || buf.length < 44) return { ok: false, error: '声音文件缺失。' };
  const tag = (o) => buf.toString('ascii', o, o + 4);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { ok: false, error: '只收 WAV 格式的声音。' };
  let o = 12, fs = 0, ch = 0, bits = 0, fmt = 0;
  while (o + 8 <= buf.length) {
    const id = tag(o), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') { fmt = buf.readUInt16LE(o + 8); ch = buf.readUInt16LE(o + 10); fs = buf.readUInt32LE(o + 12); bits = buf.readUInt16LE(o + 22); }
    if (id === 'data') {
      if (fmt !== 1 || ch !== 1 || bits !== 16) return { ok: false, error: '只收 16 位单声道的 WAV。' };
      if (fs < 8000 || fs > 48000) return { ok: false, error: '采样率不在 8–48 kHz 之间。' };
      const bytes = Math.min(size, buf.length - o - 8);
      const seconds = bytes / 2 / fs;
      if (seconds > DISC.maxSec) return { ok: false, error: '最长十秒。' };
      if (seconds < DISC.minSec) return { ok: false, error: '太短了，至少一秒。' };
      // 响度：整段的均方根，dBFS。数据地图「安静角落」用它（量出来的，不是猜的）
      let q = 0;
      const n = Math.floor(bytes / 2);
      for (let i = 0; i < n; i++) { const v = buf.readInt16LE(o + 8 + i * 2) / 32768; q += v * v; }
      const db = Math.round(10 * Math.log10(q / Math.max(1, n) + 1e-12) * 10) / 10;
      return { ok: true, fs, seconds, db };
    }
    o += 8 + size + (size & 1);
  }
  return { ok: false, error: 'WAV 里没有声音数据。' };
}

export function createApi({ store, now = () => Date.now(), review = false, adminToken = '', calendar = null, login = null } = {}) {
  // login = { secret, mailer, devCodes }；不给就是没开学号登记（寄码返回 503，其余照旧）
  const auth = createAuth({ store, now, secret: (login && login.secret) || crypto.randomBytes(32).toString('hex'), mailer: login && login.mailer, devCodes: !!(login && login.devCodes) });
  const hits = new Map();   // 限频：同一个实例里有效（云函数多实例时各算各的，课程规模够用；写在 README 的已知缺口里）
  function allow(action, key, n, windowMs) {
    const k = `${action}:${key}`, t = now();
    const arr = (hits.get(k) || []).filter((x) => t - x < windowMs);
    if (arr.length >= n) { hits.set(k, arr); return false; }
    arr.push(t); hits.set(k, arr);
    return true;
  }

  const iso = () => new Date(now()).toISOString();
  const locked = (d) => d.capsuleUntil && Date.parse(d.capsuleUntil) > now();
  const discVisible = (d, key) => d.status !== 'removed' && (d.key === key || (d.visibility !== 'private' && !locked(d) && d.status !== 'held'));
  const author = (a) => (a ? { grade: a.grade || '', dept: a.dept || '', name: a.name || '' } : null);
  function discView(d, key, extra = {}) {
    const mine = d.key === key;
    return {
      id: d.id, placeId: d.placeId, at: d.at, slot: d.slot, hour: d.hour, semester: d.semester, week: d.week, seconds: d.seconds, db: d.db ?? null,
      note: d.note || '', author: author(d.author), visibility: d.visibility, capsuleUntil: d.capsuleUntil || null,
      locked: !!locked(d), mine, tier: 'real', ...extra,
    };
  }
  function cleanAuthor(a, key) {
    if (!a || typeof a !== 'object') return { author: null };
    const out = { grade: cleanField(a.grade, NAME_MAX.grade), dept: cleanField(a.dept, NAME_MAX.dept), name: cleanField(a.name, NAME_MAX.name), key };
    for (const f of ['grade', 'dept', 'name']) { const w = validateField(out[f], NAME_MAX[f]); if (w) return { error: `落款里的${{ grade: '年级', dept: '学院', name: '名字' }[f]}：${w}` }; }
    return { author: out.grade || out.dept || out.name ? out : null };
  }
  const visibleEcho = (e, key) => e.status === 'ok' || e.key === key;
  async function photoView(id, key) {
    if (!id) return null;
    const p = await store.get('photos', id);
    return p && (p.status === 'ok' || p.key === key) ? { id: p.id, state: p.status, placeId: p.placeId } : null;
  }
  async function echoView(e, key) {
    return { id: e.id, discId: e.discId, t: e.t, text: e.text, at: e.at, author: author(e.author), mine: e.key === key, photo: await photoView(e.photoId, key), held: e.status === 'held' || undefined,
      later: e.later || undefined, daysAfter: e.later ? (e.daysAfter ?? null) : undefined };
  }
  function checkPhoto(buf, maxBytes, maxSide, label) {
    if (!buf || !buf.length) return `${label}缺失或不是 base64。`;
    if (buf.length > maxBytes) return `${label}太大（${Math.round(buf.length / 1024)} KB，上限 ${Math.round(maxBytes / 1024)} KB）。`;
    const r = inspectJpeg(buf);
    if (!r.ok) return `${label}：${r.error}`;
    if (Math.max(r.width, r.height) > maxSide) return `${label}的尺寸太大。`;
    if (Math.min(r.width, r.height) < PHOTO.minSide) return `${label}的尺寸太小。`;
    return '';
  }
  async function counts() {
    const heard = await store.list('heard'), echoes = await store.list('echoes');
    const h = new Map(), e = new Map(), l = new Map();
    for (const x of heard) h.set(x.discId, (h.get(x.discId) || 0) + 1);
    for (const x of echoes) {
      if (x.later) { l.set(x.discId, (l.get(x.discId) || 0) + 1); continue; }
      if (x.status === 'ok') e.set(x.discId, (e.get(x.discId) || 0) + 1);
    }
    return { h, e, l, heard };
  }

  async function handle({ method, path, query = {}, headers = {}, body = null }) {
    const bearer = String(headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const deviceKey = String(headers['x-ks-key'] || query.k || '').toLowerCase();
    let m, sess = null;
    try {
      if (method === 'GET' && path === '/api/health') return ok({ review, store: store.kind, login: !!(login && login.mailer), at: iso() });
      if (bearer && !(sess = await auth.session(bearer))) return err(401, '章过期了：到「我的 · 刻声卡」用学号再盖一次。', 'session');
      const key = sess ? sess.key : deviceKey;
      const authed = KEY_RE.test(key);

      // —— 学号登记 ——
      if (path.startsWith('/api/auth/')) {
        const b = body || {};
        let r;
        if (method === 'POST' && path === '/api/auth/code') {
          const ip = String(headers['x-forwarded-for'] || headers['x-real-ip'] || '').split(',')[0].trim();
          r = await auth.sendCode(b.sid, ip);
        } else if (method === 'POST' && path === '/api/auth/verify') r = await auth.verify(b.sid, b.code, deviceKey);
        else if (method === 'GET' && path === '/api/auth/me') r = sess ? { account: await auth.account(sess) } : { fail: { status: 401, error: '还没盖章。' } };
        else if (method === 'POST' && path === '/api/auth/logout') { if (sess) await auth.logout(bearer); r = {}; }
        else if (method === 'PUT' && path === '/api/auth/sig') {
          if (!sess) return err(401, '还没盖章。');
          const a = cleanAuthor(b, key);
          if (a.error) return err(400, a.error);
          r = { account: await auth.setSig(sess, a.author ? author(a.author) : null) };
        } else return err(404, '没有这个接口。');
        return r.fail ? { status: r.fail.status, json: { ok: false, ...r.fail } } : ok(r);
      }

      // —— 读 ——
      if (method === 'GET' && path === '/api/discs') {
        const all = await store.list('discs');
        const { h, e, l, heard } = await counts();
        const mineHeard = new Set(heard.filter((x) => x.key === key).map((x) => x.discId));
        const list = all.filter((d) => discVisible(d, key)).sort((a, b) => a.at.localeCompare(b.at));
        return ok({ discs: list.map((d) => discView(d, key, { heard: h.get(d.id) || 0, echoes: e.get(d.id) || 0, laterN: l.get(d.id) || 0, heardByMe: mineHeard.has(d.id) })) });
      }
      if (method === 'GET' && (m = path.match(/^\/api\/discs\/(ds-[a-z0-9-]{6,40})\/audio$/))) {
        const d = await store.get('discs', m[1]);
        if (!d || !discVisible(d, key)) return err(404, '没有这张声片。');
        if (locked(d)) return err(403, `还没到开封那天（${d.capsuleUntil.slice(0, 10)}），连你自己也要等。`);
        const buf = await store.getFile(d.audio);
        return { status: 200, buffer: buf, type: 'audio/wav', cache: d.visibility === 'private' ? 'private, no-store' : 'public, max-age=604800' };
      }
      if (method === 'GET' && (m = path.match(/^\/api\/discs\/([^/]{1,64})\/echoes$/))) {
        const id = decodeURIComponent(m[1]);
        const d = await store.get('discs', id);
        const canSee = !d || discVisible(d, key);   // 「后来」和这张盘同进同出：心事盘、没到期的胶囊，别人看不到
        const list = (await store.list('echoes', { discId: id })).filter((x) => visibleEcho(x, key) && (!x.later || canSee))
          .sort((a, b) => (a.later || b.later ? (Number(!!a.later) - Number(!!b.later)) || String(a.at).localeCompare(String(b.at)) : a.t - b.t));
        return ok({ echoes: await Promise.all(list.map((x) => echoView(x, key))) });
      }
      if (method === 'GET' && path === '/api/feed') {
        const list = (await store.list('echoes')).filter((x) => x.status === 'ok' && !x.later).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
        return ok({ echoes: await Promise.all(list.map((x) => echoView(x, key))) });
      }
      if (method === 'GET' && (m = path.match(/^\/api\/places\/([A-Za-z0-9_-]{1,32})\/photos$/))) {
        const list = (await store.list('photos', { placeId: m[1] })).filter((x) => x.status === 'ok' || x.key === key).sort((a, b) => b.at.localeCompare(a.at));
        return ok({ photos: list.map((x) => ({ id: x.id, state: x.status, at: x.at, mine: x.key === key })) });
      }
      if (method === 'GET' && (m = path.match(/^\/api\/photos\/(ph-[a-z0-9-]{6,40})\/(thumb|full)$/))) {
        const x = await store.get('photos', m[1]);
        if (!x || !(x.status === 'ok' || (authed && x.key === key))) return err(404, '没有这张照片。');
        return { status: 200, buffer: await store.getFile(x[m[2]]), type: 'image/jpeg', cache: x.status === 'ok' ? 'public, max-age=86400' : 'private, no-store' };
      }

      // —— 审核 ——
      if (path.startsWith('/api/admin/')) {
        if (!adminToken || headers['x-ks-admin'] !== adminToken) return err(403, '没有审核权限。');
        if (method === 'GET' && path === '/api/admin/pending') {
          const list = (await store.list('photos', { status: 'pending' })).sort((a, b) => a.at.localeCompare(b.at));
          return ok({ photos: list.map((x) => ({ id: x.id, placeId: x.placeId, at: x.at })) });
        }
        if (method === 'POST' && (m = path.match(/^\/api\/admin\/photos\/(ph-[a-z0-9-]{6,40})$/))) {
          const x = await store.get('photos', m[1]);
          if (!x) return err(404, '没有这张照片。');
          const st = body && body.status;
          if (!['ok', 'pending', 'removed'].includes(st)) return err(400, 'status 只认 ok / pending / removed。');
          await store.put('photos', { ...x, status: st });
          return ok({});
        }
        return err(404, '没有这个接口。');
      }

      // —— 我的 ——
      if (path === '/api/me' || path.startsWith('/api/me/')) {
        if (!authed) return err(401, '缺少作者键。');
        if (method === 'GET' && path === '/api/me') {
          const mine = (await store.list('discs', { key })).filter((d) => d.status !== 'removed').sort((a, b) => a.at.localeCompare(b.at));
          const favs = (await store.list('favs', { key })).map((f) => f.discId);
          const myIds = new Set(mine.map((d) => d.id));
          const { h, e, l, heard } = await counts();
          const inbox = [], later = {};
          for (const x of await store.list('echoes')) {
            if (myIds.has(x.discId) && x.later) (later[x.discId] = later[x.discId] || []).push(await echoView(x, key));   // 我写的「后来」，回到「我的」就不用一条条问
            if (myIds.has(x.discId) && x.key !== key && x.status === 'ok') inbox.push({ kind: 'echo', discId: x.discId, at: x.at, text: x.text, t: x.t, author: author(x.author) });
          }
          for (const x of heard) if (myIds.has(x.discId) && x.key !== key) inbox.push({ kind: 'heard', discId: x.discId, at: x.at });
          // 社区里回应我的：回我帖子的、回我那一层的、给我共鸣或我也是的
          const myPosts = new Set((await store.list('posts', { key })).map((p) => p.id));
          const myReplyPost = new Map((await store.list('replies', { key })).map((r) => [r.id, r.postId]));
          const myReplies = new Set(myReplyPost.keys());
          for (const r of await store.list('replies')) {
            if (r.key === key || r.status !== 'ok') continue;
            if (myPosts.has(r.postId) || (r.parentId && myReplies.has(r.parentId))) inbox.push({ kind: 'reply', postId: r.postId, at: r.at, text: r.text, author: author(r.author) });
          }
          for (const x of await store.list('reacts')) if (x.key !== key && (myPosts.has(x.target) || myReplies.has(x.target))) inbox.push({ kind: x.type, target: x.target, postId: myPosts.has(x.target) ? x.target : myReplyPost.get(x.target), at: x.at });
          // 合辑：别人往我建的合辑里放了一段
          const myAlbums = new Map((await store.list('albums', { key })).filter((a) => a.status !== 'removed').map((a) => [a.id, a.name]));
          if (myAlbums.size) for (const x of await store.list('tracks')) if (x.key !== key && x.status === 'ok' && myAlbums.has(x.albumId)) inbox.push({ kind: 'track', albumId: x.albumId, albumName: myAlbums.get(x.albumId), discId: x.soundId, at: x.at, author: author(x.author) });
          inbox.sort((a, b) => b.at.localeCompare(a.at));
          for (const id of Object.keys(later)) later[id].sort((a, b) => a.at.localeCompare(b.at));
          return ok({ discs: mine.map((d) => discView(d, key, { heard: h.get(d.id) || 0, echoes: e.get(d.id) || 0, laterN: l.get(d.id) || 0 })), favs, later, inbox: inbox.slice(0, 60) });
        }
        if ((m = path.match(/^\/api\/me\/favs\/([^/]{1,64})$/))) {
          const id = `${key}_${decodeURIComponent(m[1])}`;
          if (method === 'PUT') { await store.put('favs', { id, key, discId: decodeURIComponent(m[1]), at: iso() }); return ok({}); }
          if (method === 'DELETE') { await store.del('favs', id); return ok({}); }
        }
        return err(404, '没有这个接口。');
      }

      // —— 写：一律要有作者键 ——
      if (method !== 'GET' && !authed) return err(401, '缺少作者键。');
      // 盖过章的卡：作者键认的是一个学号，光有键不够，要带令牌（退出登录、换设备之后，旧设备上的键写不进去）
      if (method !== 'GET' && !sess && await auth.keyOwner(key)) return err(401, '这张卡盖过章：到「我的 · 刻声卡」用学号再盖一次就能接着写。', 'sealed');

      if (method === 'POST' && path === '/api/discs') {
        const b = body || {};
        if (!ID.disc.test(String(b.id))) return err(400, '声片编号格式不对。');
        const prev = await store.get('discs', b.id);
        if (prev) return prev.key === key ? ok({ disc: discView(prev, key), again: true }) : err(409, '这个编号已被用过。');
        if (!PLACES.has(b.placeId)) return err(400, '先选一个地点。');
        const note = String(b.note || '').trim();
        if (note) { const bad = validateLine(note, DISC.noteMax); if (bad) return err(400, `一句话：${bad}`); }
        const a = cleanAuthor(b.author, key);
        if (a.error) return err(400, a.error);
        const visibility = b.visibility === 'private' ? 'private' : 'public';
        let capsuleUntil = null;
        if (b.capsuleUntil) {
          const t = Date.parse(b.capsuleUntil);
          if (!Number.isFinite(t) || t <= now() || t - now() > DISC.capsuleMaxDays * 86400000) return err(400, '时间胶囊的开封日要在今天之后、一年零一个月之内。');
          capsuleUntil = new Date(t).toISOString();
        }
        const audio = b64(b.audio);
        if (!audio || audio.length > DISC.maxBytes) return err(400, '声音文件缺失或太大。');
        const w = inspectWav(audio);
        if (!w.ok) return err(400, w.error);
        if (!allow('disc-min', key, DISC.perMin, 60_000)) return err(429, '一分钟里刻得太多了，过一会儿再来。');
        if (!allow('disc-day', key, DISC.perDay, 86_400_000)) return err(429, '今天刻得够多了，明天再来。');
        // 时刻：发件箱里放了一阵的，用录下的那一刻（不早于 36 小时、不晚于现在）；否则用服务端的现在
        const ct = Date.parse(b.at);
        const at = Number.isFinite(ct) && ct <= now() + 60_000 && now() - ct < 36 * 3600000 ? new Date(Math.min(ct, now())).toISOString() : iso();
        const h = hourOf(at), sem = semesterOf(at, calendar);
        const ref = await store.putFile(`discs/${b.id}.wav`, audio, 'audio/wav');
        const d = { id: b.id, key, placeId: b.placeId, at, hour: Math.round(h * 100) / 100, slot: slotOfHour(h), semester: sem.key, week: sem.week, seconds: Math.round(w.seconds * 100) / 100, db: w.db,
          note, author: a.author, visibility, capsuleUntil, status: 'ok', audio: ref, createdAt: iso() };
        await store.put('discs', d);
        return ok({ disc: discView(d, key, { heard: 0, echoes: 0 }) }, 201);
      }
      if (method === 'DELETE' && (m = path.match(/^\/api\/discs\/(ds-[a-z0-9-]{6,40})$/))) {
        const d = await store.get('discs', m[1]);
        if (!d) return err(404, '没有这张声片。');
        if (d.key !== key) return err(403, '只有刻它的人能删。');
        for (const x of await store.list('echoes', { discId: d.id })) { if (x.photoId) await dropPhoto(x.photoId); await store.del('echoes', x.id); }
        for (const x of await store.list('heard', { discId: d.id })) await store.del('heard', x.id);
        for (const x of await store.list('tracks', { soundId: d.id })) await store.del('tracks', x.id);
        await store.delFile(d.audio).catch(() => {});
        await store.del('discs', d.id);
        return ok({});
      }
      if (method === 'POST' && (m = path.match(/^\/api\/discs\/(ds-[a-z0-9-]{6,40}|concept-\d{3}|arc-[a-z0-9-]{3,40})\/heard$/))) {
        const id = `${m[1]}_${key}`;
        const had = await store.get('heard', id);
        if (had) await store.del('heard', id);
        else {
          if (!allow('heard-min', key, 30, 60_000)) return err(429, '点得太快了。');
          await store.put('heard', { id, key, discId: m[1], at: iso() });
        }
        const n = (await store.list('heard', { discId: m[1] })).length;
        return ok({ heard: n, heardByMe: !had });
      }

      if (method === 'POST' && path === '/api/echoes') {
        const b = body || {};
        if (!ID.echo.test(String(b.id))) return err(400, '回声编号格式不对。');
        const prev = await store.get('echoes', b.id);
        if (prev) return prev.key === key ? ok({ echo: await echoView(prev, key), again: true }) : err(409, '这个编号已被用过。');
        if (typeof b.discId !== 'string' || !/^[a-z0-9-]{3,64}$/.test(b.discId)) return err(400, '声片编号不对。');
        // 「后来」：不钉在某一秒，是作者很久以后在盘旁边补的一句。和回声存一个集合，校验、举报、随盘真删都复用。
        if (b.later === true) {
          const d = await store.get('discs', b.discId);
          if (!d || d.status === 'removed') return err(404, '没有这张声片。');
          if (d.key !== key) return err(403, '只有刻它的人能写后来。');
          const bad = validateLine(b.text, LATER.max);
          if (bad) return err(400, bad);
          const have = (await store.list('echoes', { discId: d.id })).filter((x) => x.later);
          if (have.length >= LATER.perDisc) return err(400, `这张盘已经写了 ${LATER.perDisc} 条后来，再放不下了。`);
          if (!allow('later-min', key, LATER.perMin, 60_000)) return err(429, '一分钟里写得太多了，过一会儿再来。');
          const a = cleanAuthor(b.author, key);
          if (a.error) return err(400, a.error);
          const at = iso();
          const daysAfter = Math.max(0, Math.floor((Date.parse(at) - Date.parse(d.at)) / 86400000));
          const e = { id: b.id, discId: d.id, later: true, text: String(b.text).trim(), author: a.author, key, at, daysAfter, status: 'ok' };
          await store.put('echoes', e);
          return ok({ echo: await echoView(e, key) }, 201);
        }
        const dur = Math.min(10, Math.max(0.5, Number(b.dur) || 10));
        const t = Number(b.t);
        if (!Number.isFinite(t) || t < 0 || t > dur + 0.05) return err(400, '这一秒不在声片的长度里。');
        const bad = validateLine(b.text, ECHO_MAX);
        if (bad) return err(400, bad);
        const a = cleanAuthor(b.author, key);
        if (a.error) return err(400, a.error);
        let photoId = null;
        if (b.photoId) {
          const ph = await store.get('photos', b.photoId);
          if (!ph || ph.key !== key) return err(400, '这张照片不存在，或不是你上传的。');
          photoId = ph.id;
        }
        if (!allow('echo-min', key, LIMITS.echoPerMin, 60_000)) return err(429, '一分钟里钉得太多了，过一会儿再来。');
        if (!allow('echo-day', key, LIMITS.echoPerDay, 86_400_000)) return err(429, '今天钉得够多了，明天再来。');
        const e = { id: b.id, discId: b.discId, t: Math.round(t * 10) / 10, text: String(b.text).trim(), author: a.author, key, photoId, at: iso(), status: 'ok' };
        await store.put('echoes', e);
        return ok({ echo: await echoView(e, key) }, 201);
      }
      if (method === 'DELETE' && (m = path.match(/^\/api\/echoes\/(ec-[a-z0-9-]{6,40})$/))) {
        const e = await store.get('echoes', m[1]);
        if (!e) return err(404, '没有这条回声。');
        if (e.key !== key) return err(403, '只有作者能删。');
        if (e.photoId) await dropPhoto(e.photoId);
        await store.del('echoes', e.id);
        for (const r of await store.list('reports', { echoId: e.id })) await store.del('reports', r.id);
        return ok({});
      }
      if (method === 'POST' && (m = path.match(/^\/api\/echoes\/(ec-[a-z0-9-]{6,40})\/report$/))) {
        const e = await store.get('echoes', m[1]);
        if (!e) return err(404, '没有这条回声。');
        if (e.key === key) return err(400, '自己留的话直接删掉就行。');
        await store.put('reports', { id: `${e.id}_${key}`, echoId: e.id, key, at: iso() });
        const n = (await store.list('reports', { echoId: e.id })).length;
        if (n >= LIMITS.reportsToHold && e.status !== 'held') await store.put('echoes', { ...e, status: 'held' });
        return ok({ held: n >= LIMITS.reportsToHold });
      }

      // —— 社区：帖子、楼中楼、话题、共鸣与我也是、接力 ——
      const cm = await community({ method, path, query, body, key, authed });
      if (cm) return cm;
      const am = await albums({ method, path, body, key, authed });
      if (am) return am;

      if (method === 'POST' && path === '/api/photos') {
        const b = body || {};
        if (!ID.photo.test(String(b.id))) return err(400, '照片编号格式不对。');
        const prev = await store.get('photos', b.id);
        if (prev) return prev.key === key ? ok({ photo: { id: prev.id, state: prev.status, placeId: prev.placeId }, again: true }) : err(409, '这个编号已被用过。');
        if (!PLACES.has(b.placeId)) return err(400, '地点编号不对。');
        if (!b.consent || b.consent.version !== CONSENT_VERSION || b.consent.noIdentifiable !== true) return err(400, '要先勾选"照片里没有能认出身份的人，或我已经问过"。');
        const thumb = b64(b.thumb), full = b64(b.full);
        const bad = checkPhoto(thumb, PHOTO.thumbMaxBytes, PHOTO.thumbMaxSide, '缩略图') || checkPhoto(full, PHOTO.fullMaxBytes, PHOTO.fullMaxSide, '大图');
        if (bad) return err(400, bad);
        if (!allow('photo-min', key, LIMITS.photoPerMin, 60_000)) return err(429, '一分钟里传得太多了，过一会儿再来。');
        const tRef = await store.putFile(`photos/${b.id}-t.jpg`, Buffer.from(cleanJpeg(thumb)), 'image/jpeg');   // 去掉 EXIF 再存
        const fRef = await store.putFile(`photos/${b.id}-f.jpg`, Buffer.from(cleanJpeg(full)), 'image/jpeg');
        const x = { id: b.id, key, placeId: b.placeId, consent: { version: CONSENT_VERSION, noIdentifiable: true }, status: review ? 'pending' : 'ok', thumb: tRef, full: fRef, at: iso() };
        await store.put('photos', x);
        return ok({ photo: { id: x.id, state: x.status, placeId: x.placeId } }, 201);
      }

      return err(404, '没有这个接口。');
    } catch (e) {
      return err(500, `服务出错了：${e && e.message ? e.message : e}`);
    }
  }
  // ====================================================================================
  // 社区（学贴吧的楼层、豆瓣小组的「回应」、小红书的 #话题、网易云的抱抱、Instagram 的 Add Yours 接力）
  //   帖子 post：一段文字，可以带一段声音（自己刻的、示意盘、史料）、一个地点、一种心情、至多 3 个话题
  //   回复 reply：楼层；回复某一层就是楼中楼，只有两层（Reddit 的十层对一周的课程项目是负担）
  //   反应 react：共鸣（不评价，只说「我在」）、我也是（同一种经历）。再点一次取消
  //   接力 relay：帖子带 relayOf 就是接在某一棒后面；链按根帖归，第几棒由服务端数
  //   示例帖（ps-demo-xx）在页面里，不在云上：可以回复、可以共鸣，但删不掉、不算人数
  // ====================================================================================
  const postVisible = (p, key) => p && p.status !== 'removed' && (p.status !== 'held' || p.key === key);
  const isDemo = (id) => DEMO_POST_RE.test(String(id));
  const isDemoReply = (id) => /^rp-demo-[a-z0-9]{2,8}$/.test(String(id));
  async function soundOk(id, key) {
    if (!id) return null;
    if (!SOUND_ID_RE.test(String(id))) return '附的声音编号不对。';
    if (String(id).startsWith('ds-')) { const d = await store.get('discs', id); if (!d || !discVisible(d, key) || d.visibility === 'private' || locked(d)) return '附的那张盘不存在，或者不是公开的。'; }
    return null;
  }
  async function reactCounts(ids, key) {
    const want = new Set(ids), out = new Map();
    for (const r of await store.list('reacts')) {
      if (!want.has(r.target)) continue;
      const o = out.get(r.target) || { hug: 0, same: 0, my: [] };
      o[r.type] = (o[r.type] || 0) + 1;
      if (r.key === key) o.my.push(r.type);
      out.set(r.target, o);
    }
    return out;
  }
  const replyView = (r, key, rc) => ({ id: r.id, postId: r.postId, parentId: r.parentId || null, text: r.text, soundId: r.soundId || null, at: r.at, author: author(r.author), mine: r.key === key,
    held: r.status === 'held' || undefined, ...(rc.get(r.id) || { hug: 0, same: 0, my: [] }) });
  function postView(p, key, extra = {}) {
    return { id: p.id, text: p.text, topics: p.topics || [], placeId: p.placeId || null, mood: p.mood || null, soundId: p.soundId || null, relayOf: p.relayOf || null, relayRoot: p.relayRoot || null, relayIndex: p.relayIndex || null,
      at: p.at, author: author(p.author), mine: p.key === key, held: p.status === 'held' || undefined, ...extra };
  }
  async function topicList() {
    const own = (await store.list('topics')).filter((t) => t.status !== 'removed');
    return [...PRESET_TOPICS.map((t) => ({ ...t, preset: true })), ...own.map((t) => ({ id: t.id, name: t.name, intro: t.intro || '', at: t.at, preset: false }))];
  }
  async function community({ method, path, query, body, key, authed }) {
    let m;
    if (method === 'GET' && path === '/api/topics') {
      const ts = await topicList(), posts = (await store.list('posts')).filter((p) => postVisible(p, key));
      const n = new Map(), last = new Map();
      for (const p of posts) for (const t of p.topics || []) { n.set(t, (n.get(t) || 0) + 1); if (!last.has(t) || p.at > last.get(t)) last.set(t, p.at); }
      return ok({ topics: ts.map((t) => ({ ...t, posts: n.get(t.id) || 0, lastAt: last.get(t.id) || null })) });
    }
    if (method === 'GET' && path === '/api/posts') {
      let posts = (await store.list('posts')).filter((p) => postVisible(p, key));
      if (query.topic) posts = posts.filter((p) => (p.topics || []).includes(query.topic));
      if (query.place) posts = posts.filter((p) => p.placeId === query.place);
      if (query.relay) posts = posts.filter((p) => p.relayRoot === query.relay || p.id === query.relay);
      if (query.mine === '1') posts = posts.filter((p) => p.key === key);
      const replies = (await store.list('replies')).filter((r) => r.status === 'ok');
      const rn = new Map();
      for (const r of replies) rn.set(r.postId, (rn.get(r.postId) || 0) + 1);
      const rc = await reactCounts(posts.map((p) => p.id), key);
      const out = posts.map((p) => postView(p, key, { replies: rn.get(p.id) || 0, ...(rc.get(p.id) || { hug: 0, same: 0, my: [] }) }));
      // 热门：回复 4、我也是 2、共鸣 1，按时间衰减（一天折半）。最新：按时间
      const score = (p) => (p.replies * 4 + p.same * 2 + p.hug) / Math.pow(1 + (now() - Date.parse(p.at)) / 86400000, 1);
      out.sort(query.sort === 'hot' ? (a, b) => score(b) - score(a) : (a, b) => b.at.localeCompare(a.at));
      // 示例帖上的回复数和反应数也带回去（示例帖本身在页面里）
      const demoIds = [...new Set(replies.filter((r) => isDemo(r.postId)).map((r) => r.postId))];
      const drc = await reactCounts([...demoIds, ...String(query.demo || '').split(',').filter(isDemo)], key);
      const demo = {};
      for (const id of new Set([...demoIds, ...drc.keys()])) demo[id] = { replies: rn.get(id) || 0, ...(drc.get(id) || { hug: 0, same: 0, my: [] }) };
      return ok({ posts: out.slice(0, 200), demo });
    }
    if (method === 'GET' && (m = path.match(/^\/api\/posts\/(ps-[a-z0-9-]{4,40})$/))) {
      const p = isDemo(m[1]) ? null : await store.get('posts', m[1]);
      if (!isDemo(m[1]) && !postVisible(p, key)) return err(404, '没有这个帖子，或者它被收起了。');
      const replies = (await store.list('replies', { postId: m[1] })).filter((r) => r.status === 'ok' || r.key === key).sort((a, b) => a.at.localeCompare(b.at));
      const demoIds = String(query.demo || '').split(',').filter(isDemoReply);
      const rc = await reactCounts([m[1], ...replies.map((r) => r.id), ...demoIds], key);
      const root = p ? p.relayRoot : isDemo(query.root) ? query.root : null;
      const relay = root ? (await store.list('posts', { relayRoot: root })).filter((x) => postVisible(x, key)).sort((a, b) => a.relayIndex - b.relayIndex).map((x) => postView(x, key)) : [];
      const counts = Object.fromEntries(demoIds.map((id) => [id, rc.get(id) || { hug: 0, same: 0, my: [] }]));
      return ok({ post: p ? postView(p, key, rc.get(p.id) || { hug: 0, same: 0, my: [] }) : null, self: rc.get(m[1]) || { hug: 0, same: 0, my: [] }, replies: replies.map((r) => replyView(r, key, rc)), relay, counts });
    }
    if (method === 'GET' && path === '/api/stats') {
      // 看板：心情（只数帖子上用户自己选的）；回声与帖子按地点、按钟点。都只数真实的，页面写 n
      const posts = (await store.list('posts')).filter((p) => p.status === 'ok');
      const mood = {};
      for (const p of posts) if (p.mood) mood[p.mood] = (mood[p.mood] || 0) + 1;
      const moodPlace = {};
      for (const p of posts) if (p.mood && p.placeId) { moodPlace[p.mood] = moodPlace[p.mood] || {}; moodPlace[p.mood][p.placeId] = (moodPlace[p.mood][p.placeId] || 0) + 1; }
      return ok({ mood, moodPlace, posts: posts.length, replies: (await store.list('replies')).filter((r) => r.status === 'ok').length, reacts: (await store.list('reacts')).length });
    }

    if (!/^\/api\/(posts|replies|topics|react)/.test(path)) return null;
    if (!authed) return err(401, '缺少作者键。');

    if (method === 'POST' && path === '/api/topics') {
      const b = body || {};
      if (!/^tp-[a-z0-9-]{6,40}$/.test(String(b.id))) return err(400, '话题编号格式不对。');
      const name = String(b.name || '').trim().replace(/^#/, '');
      if (name.length < POST.topicName[0] || name.length > POST.topicName[1]) return err(400, `话题名 ${POST.topicName[0]} 到 ${POST.topicName[1]} 个字。`);
      const bad = validateLine(name, POST.topicName[1]) || (b.intro ? validateLine(b.intro, POST.topicIntro) : '');
      if (bad) return err(400, bad);
      const all = await topicList();
      const same = all.find((t) => t.name === name);
      if (same) return ok({ topic: same, again: true });
      if (!allow('topic-day', key, 3, 86_400_000)) return err(429, '今天建的话题够多了，明天再来。');
      const t = { id: b.id, name, intro: String(b.intro || '').trim(), key, at: iso(), status: 'ok' };
      await store.put('topics', t);
      return ok({ topic: { id: t.id, name: t.name, intro: t.intro, at: t.at, preset: false, posts: 0 } }, 201);
    }

    if (method === 'POST' && path === '/api/posts') {
      const b = body || {};
      if (!/^ps-[a-z0-9-]{6,40}$/.test(String(b.id)) || isDemo(b.id)) return err(400, '帖子编号格式不对。');
      const prev = await store.get('posts', b.id);
      if (prev) return prev.key === key ? ok({ post: postView(prev, key), again: true }) : err(409, '这个编号已被用过。');
      const text = String(b.text || '').trim();
      const bad = validateLine(text, POST.textMax);
      if (bad) return err(400, bad);
      const a = cleanAuthor(b.author, key);
      if (a.error) return err(400, a.error);
      const ids = new Set((await topicList()).map((t) => t.id));
      const topics = [...new Set(Array.isArray(b.topics) ? b.topics : [])];
      if (topics.length > POST.topicsMax) return err(400, `最多带 ${POST.topicsMax} 个话题。`);
      if (topics.some((t) => !ids.has(t))) return err(400, '有一个话题不存在。');
      if (b.placeId && !PLACES.has(b.placeId)) return err(400, '地点编号不对。');
      if (b.mood && !MOOD_IDS.has(b.mood)) return err(400, '心情只能从给的几种里选。');
      const sbad = await soundOk(b.soundId, key);
      if (sbad) return err(400, sbad);
      let relayOf = null, relayRoot = null, relayIndex = null;
      if (b.relayOf) {
        const up = isDemo(b.relayOf) ? { id: b.relayOf, relayRoot: isDemo(b.relayRoot) ? b.relayRoot : b.relayOf, relayIndex: Math.max(1, Math.min(99, Number(b.relayUpIndex) || 1)), status: 'ok' } : await store.get('posts', b.relayOf);
        if (!up || !postVisible(up, key)) return err(400, '要接的那一棒不在了。');
        if (!b.soundId) return err(400, '接力要附一段声音。');
        relayOf = up.id; relayRoot = up.relayRoot || up.id;
        const chain = await store.list('posts', { relayRoot });
        relayIndex = Math.max(up.relayIndex || 1, ...chain.map((x) => x.relayIndex || 1)) + 1;
        if (!up.relayRoot && !isDemo(up.id)) await store.put('posts', { ...up, relayRoot: up.id, relayIndex: 1 });
      } else if (b.relayStart) { relayRoot = b.id; relayIndex = 1; if (!b.soundId) return err(400, '发起接力要附一段声音，作为第一棒。'); }
      if (!allow('post-min', key, 3, 60_000)) return err(429, '一分钟里发得太多了，过一会儿再来。');
      if (!allow('post-day', key, 30, 86_400_000)) return err(429, '今天发得够多了，明天再来。');
      const p = { id: b.id, key, text, author: a.author, topics, placeId: b.placeId || null, mood: b.mood || null, soundId: b.soundId || null, relayOf, relayRoot, relayIndex, at: iso(), status: 'ok' };
      await store.put('posts', p);
      return ok({ post: postView(p, key, { replies: 0, hug: 0, same: 0, my: [] }) }, 201);
    }
    if (method === 'DELETE' && (m = path.match(/^\/api\/posts\/(ps-[a-z0-9-]{6,40})$/))) {
      const p = await store.get('posts', m[1]);
      if (!p) return err(404, '没有这个帖子。');
      if (p.key !== key) return err(403, '只有发帖的人能删。');
      for (const r of await store.list('replies', { postId: p.id })) { await store.del('replies', r.id); for (const x of await store.list('reacts', { target: r.id })) await store.del('reacts', x.id); }
      for (const x of await store.list('reacts', { target: p.id })) await store.del('reacts', x.id);
      await store.del('posts', p.id);
      return ok({});
    }
    if (method === 'POST' && (m = path.match(/^\/api\/posts\/(ps-[a-z0-9-]{4,40})\/replies$/))) {
      const b = body || {};
      const p = isDemo(m[1]) ? { id: m[1], status: 'ok' } : await store.get('posts', m[1]);
      if (!postVisible(p, key)) return err(404, '没有这个帖子，或者它被收起了。');
      if (!/^rp-[a-z0-9-]{6,40}$/.test(String(b.id))) return err(400, '回复编号格式不对。');
      const prev = await store.get('replies', b.id);
      if (prev) return prev.key === key ? ok({ reply: replyView(prev, key, new Map()), again: true }) : err(409, '这个编号已被用过。');
      const text = String(b.text || '').trim();
      const bad = validateLine(text, POST.replyMax);
      if (bad) return err(400, bad);
      let parentId = null;
      if (b.parentId && isDemoReply(b.parentId) && isDemo(m[1])) parentId = b.parentId;
      else if (b.parentId) {
        const up = await store.get('replies', b.parentId);
        if (!up || up.postId !== m[1]) return err(400, '要回的那一层不在了。');
        parentId = up.parentId || up.id;          // 只有两层：回楼中楼也挂在那一层下面
      }
      const sbad = await soundOk(b.soundId, key);
      if (sbad) return err(400, sbad);
      const a = cleanAuthor(b.author, key);
      if (a.error) return err(400, a.error);
      if (!allow('reply-min', key, 6, 60_000)) return err(429, '一分钟里回得太多了，过一会儿再来。');
      if (!allow('reply-day', key, 100, 86_400_000)) return err(429, '今天回得够多了，明天再来。');
      const r = { id: b.id, postId: m[1], parentId, key, text, soundId: b.soundId || null, author: a.author, at: iso(), status: 'ok', postKey: p.key || null };
      await store.put('replies', r);
      return ok({ reply: replyView(r, key, new Map()) }, 201);
    }
    if (method === 'DELETE' && (m = path.match(/^\/api\/replies\/(rp-[a-z0-9-]{6,40})$/))) {
      const r = await store.get('replies', m[1]);
      if (!r) return err(404, '没有这条回复。');
      if (r.key !== key) return err(403, '只有回复的人能删。');
      for (const x of await store.list('replies', { parentId: r.id })) await store.put('replies', { ...x, parentId: null });   // 楼中楼不跟着消失，升成一层
      for (const x of await store.list('reacts', { target: r.id })) await store.del('reacts', x.id);
      await store.del('replies', r.id);
      return ok({});
    }
    if (method === 'POST' && path === '/api/react') {
      const b = body || {};
      if (!['hug', 'same'].includes(b.type)) return err(400, '只有「共鸣」和「我也是」。');
      const target = String(b.target || '');
      const tp = /^ps-/.test(target) ? (isDemo(target) ? { status: 'ok' } : await store.get('posts', target)) : /^rp-/.test(target) ? (isDemoReply(target) ? { status: 'ok' } : await store.get('replies', target)) : null;
      if (!tp || tp.status === 'removed') return err(404, '没有这一条。');
      const id = `${target}_${b.type}_${key}`;
      const had = await store.get('reacts', id);
      if (had) await store.del('reacts', id);
      else {
        if (!allow('react-min', key, 40, 60_000)) return err(429, '点得太快了。');
        await store.put('reacts', { id, target, type: b.type, key, at: iso(), targetKey: tp.key || null });
      }
      const all = await store.list('reacts', { target });
      return ok({ hug: all.filter((x) => x.type === 'hug').length, same: all.filter((x) => x.type === 'same').length, on: !had });
    }
    if (method === 'POST' && (m = path.match(/^\/api\/(posts|replies)\/((?:ps|rp)-[a-z0-9-]{6,40})\/report$/))) {
      const col = m[1], x = await store.get(col, m[2]);
      if (!x) return err(404, '没有这一条。');
      if (x.key === key) return err(400, '自己发的直接删掉就行。');
      await store.put('reports', { id: `${x.id}_${key}`, echoId: x.id, kind: col, key, at: iso() });
      const n = (await store.list('reports', { echoId: x.id })).length;
      if (n >= LIMITS.reportsToHold && x.status !== 'held') await store.put(col, { ...x, status: 'held' });
      return ok({ held: n >= LIMITS.reportsToHold });
    }
    return null;
  }

  // ====================================================================================
  // 合辑（学黄泰霖原型的主题合辑与共建唱片）
  //   合辑 album：一个名字、一句介绍；预置的几张在 src/lib/albums-preset.js（种子是示意盘），用户也可以建（一天 3 张）
  //   一段 track：把一张公开的盘放进合辑。同一张盘在一张合辑里只放一次；一张合辑最多 24 段云上的
  //   共建：几个人往同一张合辑里放，页面能把它们叠成一张十秒的盘。谁放的都写着
  // ====================================================================================
  const albumVisible = (a) => a && a.status !== 'removed';
  async function albumOf(id) {
    const pre = PRESET_ALBUMS.find((a) => a.id === id);
    if (pre) return { ...pre, preset: true };
    const a = await store.get('albums', id);
    return albumVisible(a) ? a : null;
  }
  function albumView(a, ts, key) {
    const mine = ts.filter((t) => t.key === key);
    return { id: a.id, name: a.name, intro: a.intro || '', preset: !!a.preset, seeds: a.preset ? a.seeds : [], at: a.at || null, author: a.preset ? null : author(a.author),
      mine: !a.preset && a.key === key, joined: mine.length > 0, tracks: ts.length, people: new Set(ts.map((t) => t.key)).size, lastAt: ts.reduce((m, t) => (t.at > m ? t.at : m), '') || null };
  }
  const trackView = (t, key, albumKey) => ({ id: t.id, albumId: t.albumId, soundId: t.soundId, at: t.at, author: author(t.author), mine: t.key === key, canTake: t.key === key || albumKey === key });
  async function albums({ method, path, body, key, authed }) {
    let m;
    if (!/^\/api\/(albums|tracks)(\/|$)/.test(path)) return null;
    if (method === 'GET' && path === '/api/albums') {
      const own = (await store.list('albums')).filter(albumVisible).sort((a, b) => b.at.localeCompare(a.at));
      const ts = (await store.list('tracks')).filter((t) => t.status === 'ok');
      const by = new Map();
      for (const t of ts) { if (!by.has(t.albumId)) by.set(t.albumId, []); by.get(t.albumId).push(t); }
      const list = [...PRESET_ALBUMS.map((a) => ({ ...a, preset: true })), ...own];
      return ok({ albums: list.map((a) => albumView(a, by.get(a.id) || [], key)) });
    }
    if (method === 'GET' && (m = path.match(/^\/api\/albums\/(al-[a-z0-9-]{3,40})$/))) {
      const a = await albumOf(m[1]);
      if (!a) return err(404, '没有这张合辑。');
      const ts = (await store.list('tracks', { albumId: a.id })).filter((t) => t.status === 'ok').sort((x, y) => x.at.localeCompare(y.at));
      return ok({ album: albumView(a, ts, key), tracks: ts.map((t) => trackView(t, key, a.key)) });
    }
    if (!authed) return err(401, '缺少作者键。');
    if (method === 'POST' && path === '/api/albums') {
      const b = body || {};
      if (!ALBUM_ID_RE.test(String(b.id)) || PRESET_ALBUMS.some((a) => a.id === b.id)) return err(400, '合辑编号格式不对。');
      const prev = await store.get('albums', b.id);
      if (prev) return prev.key === key ? ok({ album: albumView(prev, [], key), again: true }) : err(409, '这个编号已被用过。');
      const name = String(b.name || '').trim(), intro = String(b.intro || '').trim();
      if (name.length < ALBUM.nameMin || name.length > ALBUM.nameMax) return err(400, `合辑名 ${ALBUM.nameMin} 到 ${ALBUM.nameMax} 个字。`);
      const bad = validateLine(name, ALBUM.nameMax) || (intro ? validateLine(intro, ALBUM.introMax) : '');
      if (bad) return err(400, bad);
      const all = [...PRESET_ALBUMS, ...(await store.list('albums')).filter(albumVisible)];
      if (all.some((a) => a.name === name)) return err(409, '已经有一张同名的合辑了，去那张里放吧。');
      const a0 = cleanAuthor(b.author, key);
      if (a0.error) return err(400, a0.error);
      if (!allow('album-day', key, ALBUM.perDay, 86_400_000)) return err(429, '今天建的合辑够多了，明天再来。');
      const a = { id: b.id, name, intro, key, author: a0.author, at: iso(), status: 'ok' };
      await store.put('albums', a);
      return ok({ album: albumView(a, [], key) }, 201);
    }
    if (method === 'POST' && (m = path.match(/^\/api\/albums\/(al-[a-z0-9-]{3,40})\/tracks$/))) {
      const b = body || {};
      const a = await albumOf(m[1]);
      if (!a) return err(404, '没有这张合辑。');
      if (!TRACK_ID_RE.test(String(b.id))) return err(400, '编号格式不对。');
      const prev = await store.get('tracks', b.id);
      if (prev) return prev.key === key ? ok({ track: trackView(prev, key, a.key), again: true }) : err(409, '这个编号已被用过。');
      if (!b.soundId) return err(400, '要放一段声音进去。');
      const sbad = await soundOk(b.soundId, key);
      if (sbad) return err(400, sbad);
      const ts = (await store.list('tracks', { albumId: a.id })).filter((t) => t.status === 'ok');
      if ((a.seeds || []).includes(b.soundId) || ts.some((t) => t.soundId === b.soundId)) return err(409, '这一段已经在这张合辑里了。');
      if (ts.length >= ALBUM.tracksMax) return err(409, `这张合辑满了（${ALBUM.tracksMax} 段）。建一张新的接着放吧。`);
      const a0 = cleanAuthor(b.author, key);
      if (a0.error) return err(400, a0.error);
      if (!allow('track-min', key, ALBUM.trackPerMin, 60_000)) return err(429, '一分钟里放得太多了，过一会儿再来。');
      if (!allow('track-day', key, ALBUM.trackPerDay, 86_400_000)) return err(429, '今天放得够多了，明天再来。');
      const t = { id: b.id, albumId: a.id, soundId: b.soundId, key, author: a0.author, at: iso(), status: 'ok' };
      await store.put('tracks', t);
      return ok({ track: trackView(t, key, a.key) }, 201);
    }
    if (method === 'DELETE' && (m = path.match(/^\/api\/tracks\/(tk-[a-z0-9-]{6,40})$/))) {
      const t = await store.get('tracks', m[1]);
      if (!t) return err(404, '没有这一段。');
      const a = await albumOf(t.albumId);
      if (t.key !== key && !(a && !a.preset && a.key === key)) return err(403, '只有放它的人、建合辑的人能拿出来。');
      await store.del('tracks', t.id);
      return ok({});
    }
    if (method === 'DELETE' && (m = path.match(/^\/api\/albums\/(al-[a-z0-9-]{3,40})$/))) {
      const a = await store.get('albums', m[1]);
      if (!a || !albumVisible(a)) return err(404, '没有这张合辑。');
      if (a.key !== key) return err(403, '只有建它的人能删。');
      for (const t of await store.list('tracks', { albumId: a.id })) await store.del('tracks', t.id);
      await store.del('albums', a.id);
      return ok({});
    }
    return err(404, '没有这个接口。');
  }

  async function dropPhoto(id) {
    const p = await store.get('photos', id);
    if (!p) return;
    await store.delFile(p.thumb).catch(() => {});
    await store.delFile(p.full).catch(() => {});
    await store.del('photos', id);
  }
  return { handle };
}
