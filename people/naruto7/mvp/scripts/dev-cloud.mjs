// 开发用云模拟器：实现 public/kesheng/src/web/contract.js 里的那份接口，用来在没有真后端时验证"A 留的话，B 看得到"。
// 它不是后端选型的替代：CloudBase 通了以后，把同样的接口换成云函数，页面不用动（决策 0001、0006）。
// 数据放在内存里，可选存到一个 JSON 文件（--file）。重启后文件在就还在。
//
// 用法：
//   node scripts/dev-cloud.mjs                      # 监听 127.0.0.1:8787，照片自动通过审核
//   node scripts/dev-cloud.mjs --review             # 照片先审后显：上传后是 pending，只有作者看得到
//   node scripts/dev-cloud.mjs --port 8788 --file .dev-cloud/state.json
// 代码里用：import { createCloud } from './dev-cloud.mjs'; const c = createCloud({ now: () => Date.now() }); await c.handle({ method, path, query, headers, body })
//
// 字段：
//   回声  { id: 'ec-…', discId, t (0–10 秒), text, author: { grade, dept, name, key } | null, photoId | null, at, status: 'ok' | 'held' }
//   照片  { id: 'ph-…', key (作者键), placeId, consent: { version, noIdentifiable }, status: 'pending' | 'ok', thumb/full (Buffer), at }
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ECHO_MAX, NAME_MAX, CONSENT_VERSION, PHOTO, LIMITS, validateLine, validateField, cleanField } from '../public/kesheng/src/web/contract.js';
import { inspectJpeg, cleanJpeg } from '../public/kesheng/src/web/jpeg-clean.js';

const KEY_RE = /^[0-9a-f]{16}$/;
const ECHO_ID_RE = /^ec-[a-z0-9-]{6,40}$/;
const PHOTO_ID_RE = /^ph-[a-z0-9-]{6,40}$/;
const err = (status, message) => ({ status, json: { ok: false, error: message } });
const ok = (json, status = 200) => ({ status, json: { ok: true, ...json } });

export function createCloud({ now = () => Date.now(), review = false, file = null } = {}) {
  const echoes = new Map();    // id → 回声
  const photos = new Map();    // id → 照片
  const reports = new Map();   // 回声 id → Set<作者键>
  const hits = new Map();      // `${动作}:${键}` → [时间戳]

  if (file && fs.existsSync(file)) {
    try {
      const s = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const e of s.echoes || []) echoes.set(e.id, e);
      for (const p of s.photos || []) photos.set(p.id, { ...p, thumb: Buffer.from(p.thumb, 'base64'), full: Buffer.from(p.full, 'base64') });
      for (const [id, ks] of s.reports || []) reports.set(id, new Set(ks));
    } catch { /* 文件坏了就当空的 */ }
  }
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      echoes: [...echoes.values()],
      photos: [...photos.values()].map((p) => ({ ...p, thumb: p.thumb.toString('base64'), full: p.full.toString('base64') })),
      reports: [...reports].map(([id, ks]) => [id, [...ks]]),
    }));
  };

  /** 限频：同一个键在 windowMs 里最多 n 次。返回 true 表示放行。 */
  function allow(action, key, n, windowMs) {
    const k = `${action}:${key}`, t = now();
    const arr = (hits.get(k) || []).filter((x) => t - x < windowMs);
    if (arr.length >= n) { hits.set(k, arr); return false; }
    arr.push(t); hits.set(k, arr);
    return true;
  }
  const dayCount = (action, key) => (hits.get(`${action}:${key}`) || []).length;

  const visibleTo = (e, key) => e.status === 'ok' || e.author?.key === key || e.key === key;
  const photoView = (p, key) => (p && (p.status === 'ok' || p.key === key) ? { id: p.id, state: p.status, placeId: p.placeId } : null);
  const echoView = (e, key) => ({
    id: e.id, discId: e.discId, t: e.t, text: e.text, at: e.at,
    author: e.author ? { grade: e.author.grade, dept: e.author.dept, name: e.author.name } : null,   // 作者键不外发
    mine: e.key === key,
    photo: e.photoId ? photoView(photos.get(e.photoId), key) : null,
    held: e.status === 'held' || undefined,
  });

  const b64 = (s) => (typeof s === 'string' && /^[A-Za-z0-9+/=]+$/.test(s) ? Buffer.from(s, 'base64') : null);

  function checkPhoto(buf, maxBytes, maxSide, label) {
    if (!buf || !buf.length) return `${label}缺失或不是 base64。`;
    if (buf.length > maxBytes) return `${label}太大（${Math.round(buf.length / 1024)} KB，上限 ${Math.round(maxBytes / 1024)} KB）。`;
    const r = inspectJpeg(buf);
    if (!r.ok) return `${label}：${r.error}`;
    if (Math.max(r.width, r.height) > maxSide) return `${label}的尺寸太大（${r.width}×${r.height}，长边上限 ${maxSide}）。`;
    if (Math.min(r.width, r.height) < PHOTO.minSide) return `${label}的尺寸太小。`;
    return '';
  }

  async function handle({ method, path: p, query = {}, headers = {}, body = null }) {
    const key = String(headers['x-ks-key'] || query.k || '').toLowerCase();
    const authed = KEY_RE.test(key);
    let m;

    if (method === 'GET' && p === '/api/health') return ok({ review, echoes: echoes.size, photos: photos.size });

    // —— 读 ——
    if (method === 'GET' && (m = p.match(/^\/api\/discs\/([^/]{1,64})\/echoes$/))) {
      const list = [...echoes.values()].filter((e) => e.discId === decodeURIComponent(m[1]) && visibleTo(e, key)).sort((a, b) => a.t - b.t);
      return ok({ echoes: list.map((e) => echoView(e, key)) });
    }
    if (method === 'GET' && (m = p.match(/^\/api\/places\/([^/]{1,32})\/photos$/))) {
      const list = [...photos.values()].filter((x) => x.placeId === decodeURIComponent(m[1]) && (x.status === 'ok' || x.key === key)).sort((a, b) => a.at.localeCompare(b.at));
      return ok({ photos: list.map((x) => ({ id: x.id, state: x.status, at: x.at, mine: x.key === key })) });
    }
    if (method === 'GET' && (m = p.match(/^\/api\/photos\/(ph-[a-z0-9-]{6,40})\/(thumb|full)$/))) {
      const x = photos.get(m[1]);
      if (!x || !(x.status === 'ok' || (authed && x.key === key))) return err(404, '没有这张照片。');
      return { status: 200, buffer: x[m[2]], type: 'image/jpeg', cache: x.status === 'ok' ? 'public, max-age=86400' : 'private, no-store' };
    }

    // —— 写：一律要有作者键 ——
    if (method !== 'GET' && !authed) return err(401, '缺少作者键。');

    if (method === 'POST' && p === '/api/echoes') {
      const b = body || {};
      if (!ECHO_ID_RE.test(String(b.id))) return err(400, '回声编号格式不对。');
      const prev = echoes.get(b.id);
      if (prev) return prev.key === key ? ok({ echo: echoView(prev, key), again: true }) : err(409, '这个编号已被用过。');
      if (typeof b.discId !== 'string' || !b.discId || b.discId.length > 64) return err(400, '声片编号不对。');
      const dur = Math.min(10, Math.max(0.5, Number(b.dur) || 10));
      const t = Number(b.t);
      if (!Number.isFinite(t) || t < 0 || t > dur + 0.05) return err(400, '这一秒不在声片的长度里。');
      const bad = validateLine(b.text, ECHO_MAX);
      if (bad) return err(400, bad);
      let author = null;
      if (b.author && typeof b.author === 'object') {
        author = { grade: cleanField(b.author.grade, NAME_MAX.grade), dept: cleanField(b.author.dept, NAME_MAX.dept), name: cleanField(b.author.name, NAME_MAX.name), key };
        for (const f of ['grade', 'dept', 'name']) { const w = validateField(author[f], NAME_MAX[f]); if (w) return err(400, `落款里的${{ grade: '年级', dept: '学院', name: '名字' }[f]}：${w}`); }
        if (!author.grade && !author.dept && !author.name) author = null;
      }
      let photoId = null;
      if (b.photoId) {
        const ph = photos.get(b.photoId);
        if (!ph || ph.key !== key) return err(400, '这张照片不存在，或不是你上传的。');
        photoId = ph.id;
      }
      if (!allow('echo-min', key, LIMITS.echoPerMin, 60_000)) return err(429, '一分钟里钉得太多了，过一会儿再来。');
      if (!allow('echo-day', key, LIMITS.echoPerDay, 86_400_000)) return err(429, '今天钉得够多了，明天再来。');
      const e = { id: b.id, discId: b.discId, t: Math.round(t * 10) / 10, text: String(b.text).trim(), author, key, photoId, at: new Date(now()).toISOString(), status: 'ok' };
      echoes.set(e.id, e); save();
      return ok({ echo: echoView(e, key) }, 201);
    }

    if (method === 'DELETE' && (m = p.match(/^\/api\/echoes\/(ec-[a-z0-9-]{6,40})$/))) {
      const e = echoes.get(m[1]);
      if (!e) return err(404, '没有这条回声。');
      if (e.key !== key) return err(403, '只有作者能删。');
      echoes.delete(e.id); reports.delete(e.id);
      if (e.photoId) photos.delete(e.photoId);
      save();
      return ok({});
    }

    if (method === 'POST' && (m = p.match(/^\/api\/echoes\/(ec-[a-z0-9-]{6,40})\/report$/))) {
      const e = echoes.get(m[1]);
      if (!e) return err(404, '没有这条回声。');
      if (e.key === key) return err(400, '自己留的话直接删掉就行。');
      const set = reports.get(e.id) || new Set();
      set.add(key); reports.set(e.id, set);
      if (set.size >= LIMITS.reportsToHold) e.status = 'held';
      save();
      return ok({ held: e.status === 'held' });
    }

    if (method === 'POST' && p === '/api/photos') {
      const b = body || {};
      if (!PHOTO_ID_RE.test(String(b.id))) return err(400, '照片编号格式不对。');
      const prev = photos.get(b.id);
      if (prev) return prev.key === key ? ok({ photo: photoView(prev, key), again: true }) : err(409, '这个编号已被用过。');
      if (typeof b.placeId !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(b.placeId)) return err(400, '地点编号不对。');
      if (!b.consent || b.consent.version !== CONSENT_VERSION || b.consent.noIdentifiable !== true) return err(400, '要先勾选"照片里没有能认出身份的人，或我已经问过"。');
      const thumb = b64(b.thumb), full = b64(b.full);
      const bad = checkPhoto(thumb, PHOTO.thumbMaxBytes, PHOTO.thumbMaxSide, '缩略图') || checkPhoto(full, PHOTO.fullMaxBytes, PHOTO.fullMaxSide, '大图');
      if (bad) return err(400, bad);
      if (!allow('photo-min', key, LIMITS.photoPerMin, 60_000)) return err(429, '一分钟里传得太多了，过一会儿再来。');
      const x = { id: b.id, key, placeId: b.placeId, consent: { version: CONSENT_VERSION, noIdentifiable: true }, status: review ? 'pending' : 'ok',
        thumb: Buffer.from(cleanJpeg(thumb)), full: Buffer.from(cleanJpeg(full)), at: new Date(now()).toISOString() };   // 去掉 EXIF 再存
      photos.set(x.id, x); save();
      return ok({ photo: photoView(x, key) }, 201);
    }

    return err(404, '没有这个接口。');
  }

  /** 测试和审核用：把一张照片放行或撤下。 */
  const moderate = (id, status) => { const x = photos.get(id); if (x) { x.status = status; save(); } return !!x; };
  return { handle, moderate, _state: { echoes, photos, reports } };
}

/** 把 handle 包成 (req, res) 处理函数：独立服务和 vite 插件（开发、预览时自带 /api）共用。 */
export function nodeHandler(cloud) {
  return async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 3 * 1024 * 1024) { res.writeHead(413, { 'content-type': 'application/json' }).end('{"ok":false,"error":"请求太大。"}'); return; } chunks.push(c); }
    let body = null;
    if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400, { 'content-type': 'application/json' }).end('{"ok":false,"error":"请求体不是 JSON。"}'); return; } }
    const r = await cloud.handle({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers, body });
    if (r.buffer) res.writeHead(r.status, { 'content-type': r.type, 'cache-control': r.cache || 'no-store' }).end(r.buffer);
    else res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(r.json));
  };
}

/** 单独起一个 http 服务（npm run dev:cloud）。 */
export function serve(cloud, { port = 8787, host = '127.0.0.1' } = {}) {
  const srv = http.createServer(nodeHandler(cloud));
  return new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(port, host, () => resolve(srv)); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  const val = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const cloud = createCloud({ review: a.includes('--review'), file: val('--file', null) });
  const port = Number(val('--port', 8787));
  await serve(cloud, { port });
  console.log(`开发用云模拟器：http://127.0.0.1:${port}/api/health  照片${a.includes('--review') ? '先审后显' : '自动通过'}  ${val('--file', '数据只在内存里')}`);
}
