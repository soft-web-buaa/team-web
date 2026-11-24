// 听见校园 · 接口：一份代码，两种存储（本机文件 store-file.mjs / CloudBase store-cloudbase.mjs）。
// 本机开发、离线演示用 server/serve.mjs 起；线上是 CloudBase 的 HTTP 云函数 cloudfunctions/api（同一份 handle）。
// 写入一律在这里重做校验：前端的检查可以被绕过（DESIGN.md §6）。
//
// 接口（JSON；身份 = 请求头 x-ks-key，刻声卡算出的 16 位作者键，不是登录）：
//   GET    /api/health
//   GET    /api/discs                         公开的声片（不含别人的心事盘、没到期的时间胶囊），带同听数、回声数
//   GET    /api/discs/:id/audio               这张的声音（WAV）
//   POST   /api/discs                         刻一张：{ id, placeId, note, author, visibility, capsuleUntil, at, audio(base64 WAV) }
//   DELETE /api/discs/:id                     只有作者能删；回声、同听一并删
//   POST   /api/discs/:id/heard               我也听过（再点一次取消）
//   GET    /api/discs/:id/echoes              一张声片上的回声
//   POST   /api/echoes                        钉一句话（可带 photoId）
//   DELETE /api/echoes/:id                    只有作者能删，照片一并删
//   POST   /api/echoes/:id/report             举报；不同的人满 3 次先收起
//   GET    /api/feed                          全站最近的回声（社区的回声流）
//   POST   /api/photos                        上传一张照片（缩略 + 大图，base64 JPEG），要带同意；先审后显
//   GET    /api/photos/:id/(thumb|full)       审核通过的人人可看；审核中只有作者能看（?k=作者键）
//   GET    /api/places/:placeId/photos        这个地点的照片印样
//   GET    /api/me                            我的：我刻的（含心事盘和没到期的胶囊）、我收藏的、回应我的
//   PUT    /api/me/favs/:discId  DELETE 同    收藏 / 取消
//   GET    /api/admin/pending                 审核：待审照片（请求头 x-ks-admin = 环境变量 KS_ADMIN_TOKEN）
//   POST   /api/admin/photos/:id              { status: 'ok' | 'pending' | 'removed' }
import { ECHO_MAX, NAME_MAX, CONSENT_VERSION, PHOTO, LIMITS, validateLine, validateField, cleanField } from '../src/kesheng/web/contract.js';
import { inspectJpeg, cleanJpeg } from '../src/kesheng/web/jpeg-clean.js';
import { hourOf, slotOfHour, semesterOf } from '../src/lib/when.js';

const KEY_RE = /^[0-9a-f]{16}$/;
const ID = { disc: /^ds-[a-z0-9-]{6,40}$/, echo: /^ec-[a-z0-9-]{6,40}$/, photo: /^ph-[a-z0-9-]{6,40}$/ };
const PLACES = new Set(Array.from({ length: 16 }, (_, i) => `XY${String(i + 1).padStart(2, '0')}`));
export const DISC = { maxSec: 10.5, minSec: 0.8, maxBytes: 1100 * 1024, noteMax: 40, perMin: 3, perDay: 30, capsuleMaxDays: 400 };
const err = (status, message) => ({ status, json: { ok: false, error: message } });
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
      return { ok: true, fs, seconds };
    }
    o += 8 + size + (size & 1);
  }
  return { ok: false, error: 'WAV 里没有声音数据。' };
}

export function createApi({ store, now = () => Date.now(), review = false, adminToken = '', calendar = null } = {}) {
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
      id: d.id, placeId: d.placeId, at: d.at, slot: d.slot, hour: d.hour, semester: d.semester, week: d.week, seconds: d.seconds,
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
    return { id: e.id, discId: e.discId, t: e.t, text: e.text, at: e.at, author: author(e.author), mine: e.key === key, photo: await photoView(e.photoId, key), held: e.status === 'held' || undefined };
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
    const h = new Map(), e = new Map();
    for (const x of heard) h.set(x.discId, (h.get(x.discId) || 0) + 1);
    for (const x of echoes) if (x.status === 'ok') e.set(x.discId, (e.get(x.discId) || 0) + 1);
    return { h, e, heard };
  }

  async function handle({ method, path, query = {}, headers = {}, body = null }) {
    const key = String(headers['x-ks-key'] || query.k || '').toLowerCase();
    const authed = KEY_RE.test(key);
    let m;
    try {
      if (method === 'GET' && path === '/api/health') return ok({ review, store: store.kind, at: iso() });

      // —— 读 ——
      if (method === 'GET' && path === '/api/discs') {
        const all = await store.list('discs');
        const { h, e, heard } = await counts();
        const mineHeard = new Set(heard.filter((x) => x.key === key).map((x) => x.discId));
        const list = all.filter((d) => discVisible(d, key)).sort((a, b) => a.at.localeCompare(b.at));
        return ok({ discs: list.map((d) => discView(d, key, { heard: h.get(d.id) || 0, echoes: e.get(d.id) || 0, heardByMe: mineHeard.has(d.id) })) });
      }
      if (method === 'GET' && (m = path.match(/^\/api\/discs\/(ds-[a-z0-9-]{6,40})\/audio$/))) {
        const d = await store.get('discs', m[1]);
        if (!d || !discVisible(d, key)) return err(404, '没有这张声片。');
        const buf = await store.getFile(d.audio);
        return { status: 200, buffer: buf, type: 'audio/wav', cache: d.visibility === 'private' ? 'private, no-store' : 'public, max-age=604800' };
      }
      if (method === 'GET' && (m = path.match(/^\/api\/discs\/([^/]{1,64})\/echoes$/))) {
        const id = decodeURIComponent(m[1]);
        const list = (await store.list('echoes', { discId: id })).filter((x) => visibleEcho(x, key)).sort((a, b) => a.t - b.t);
        return ok({ echoes: await Promise.all(list.map((x) => echoView(x, key))) });
      }
      if (method === 'GET' && path === '/api/feed') {
        const list = (await store.list('echoes')).filter((x) => x.status === 'ok').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
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
          const { h, e, heard } = await counts();
          const inbox = [];
          for (const x of await store.list('echoes')) if (myIds.has(x.discId) && x.key !== key && x.status === 'ok') inbox.push({ kind: 'echo', discId: x.discId, at: x.at, text: x.text, t: x.t, author: author(x.author) });
          for (const x of heard) if (myIds.has(x.discId) && x.key !== key) inbox.push({ kind: 'heard', discId: x.discId, at: x.at });
          inbox.sort((a, b) => b.at.localeCompare(a.at));
          return ok({ discs: mine.map((d) => discView(d, key, { heard: h.get(d.id) || 0, echoes: e.get(d.id) || 0 })), favs, inbox: inbox.slice(0, 60) });
        }
        if ((m = path.match(/^\/api\/me\/favs\/([^/]{1,64})$/))) {
          const id = `${key}:${decodeURIComponent(m[1])}`;
          if (method === 'PUT') { await store.put('favs', { id, key, discId: decodeURIComponent(m[1]), at: iso() }); return ok({}); }
          if (method === 'DELETE') { await store.del('favs', id); return ok({}); }
        }
        return err(404, '没有这个接口。');
      }

      // —— 写：一律要有作者键 ——
      if (method !== 'GET' && !authed) return err(401, '缺少作者键。');

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
        const d = { id: b.id, key, placeId: b.placeId, at, hour: Math.round(h * 100) / 100, slot: slotOfHour(h), semester: sem.key, week: sem.week, seconds: Math.round(w.seconds * 100) / 100,
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
        await store.delFile(d.audio).catch(() => {});
        await store.del('discs', d.id);
        return ok({});
      }
      if (method === 'POST' && (m = path.match(/^\/api\/discs\/(ds-[a-z0-9-]{6,40}|concept-\d{3}|arc-[a-z0-9-]{3,40})\/heard$/))) {
        const id = `${m[1]}:${key}`;
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
        await store.put('reports', { id: `${e.id}:${key}`, echoId: e.id, key, at: iso() });
        const n = (await store.list('reports', { echoId: e.id })).length;
        if (n >= LIMITS.reportsToHold && e.status !== 'held') await store.put('echoes', { ...e, status: 'held' });
        return ok({ held: n >= LIMITS.reportsToHold });
      }

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
  async function dropPhoto(id) {
    const p = await store.get('photos', id);
    if (!p) return;
    await store.delFile(p.thumb).catch(() => {});
    await store.delFile(p.full).catch(() => {});
    await store.del('photos', id);
  }
  return { handle };
}
