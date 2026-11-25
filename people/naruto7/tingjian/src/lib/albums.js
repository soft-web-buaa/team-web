// 听见校园 · 合辑（客户端）：官方征集的和大家建的合辑、往里放一段、连着听、叠成一张。接口在 server/api.mjs 的 albums()。
// 学黄泰霖原型的「主题合辑」和「共建唱片」：他的共建是几个人共有一张唱片；这里落成「几个人的十秒刻进同一道纹」，页面现场把几段叠成一张盘放。
import { reactive } from 'vue';
import * as cloud from './cloud.js';
import { PRESET_ALBUMS, ALBUM } from './albums-preset.js';
import { L, entryById, ensureMe, isPublic, play, say } from './library.js';
import * as audio from './audio.js';
import * as stage from '../stage/stage.js';

export { ALBUM };
export const A = reactive({
  list: PRESET_ALBUMS.map((a) => ({ ...a, preset: true, tracks: 0, people: 0, joined: false, mine: false })),
  tracks: {},          // albumId → 云上的几段
  online: null, version: 0,
});
const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const me = () => { const id = ensureMe(); return id.grade || id.dept || id.name ? { grade: id.grade || '', dept: id.dept || '', name: id.name || '' } : null; };
const fail = (r, what) => new Error(r.offline ? `连不上云，${what}不了。连上网络再试。` : r.error || '没有成功，再试一次。');

export async function refreshAlbums() {
  const r = await cloud.request('GET', '/albums');
  if (r.ok) { A.list = r.json.albums; A.online = true; } else if (r.offline) A.online = false;
  A.version++;
}
export async function loadAlbum(id) {
  const r = await cloud.request('GET', `/albums/${encodeURIComponent(id)}`);
  if (r.ok) {
    A.tracks[id] = r.json.tracks;
    const i = A.list.findIndex((a) => a.id === id);
    if (i >= 0) A.list[i] = r.json.album; else A.list.push(r.json.album);
    A.online = true;
  } else if (r.offline) A.online = false;
  A.version++;
}
export const albumById = (id) => A.list.find((a) => a.id === id) || null;

/** 一张合辑里的每一段：示意的种子在前，云上大家放的按时间接在后面。每一段带上「谁放的」。 */
export function itemsOf(a) {
  if (!a) return [];
  const seeds = (a.seeds || []).map((id) => ({ id: `seed-${id}`, e: entryById(id), seed: true })).filter((x) => x.e);
  const ts = (A.tracks[a.id] || []).map((t) => ({ id: t.id, e: entryById(t.soundId), t })).filter((x) => x.e && (isPublic(x.e) || x.e.mine));
  return [...seeds, ...ts];
}
/** 列表上的一句：「8 段 · 3 人放过」。示意的种子不算人。 */
export function albumLine(a) {
  const seeds = (a.seeds || []).length;
  const parts = [`${seeds + (a.tracks || 0)} 段`];
  if (a.people) parts.push(`${a.people} 人放过`);
  else if (a.preset) parts.push('等你放第一段');
  return parts.join(' · ');
}

export async function createAlbum(name, intro = '') {
  const r = await cloud.request('POST', '/albums', { id: rid('al'), name: name.trim(), intro: intro.trim(), author: me() }, { create: true });
  if (!r.ok) throw fail(r, '建');
  A.list = [...A.list.filter((a) => a.id !== r.json.album.id), r.json.album];
  A.tracks[r.json.album.id] = [];
  A.version++;
  return r.json.album;
}
export async function addTrack(albumId, e) {
  if (!e) throw new Error('先选一段声音。');
  if (e.tier === 'real' && (e.visibility === 'private' || e.locked)) throw new Error('只给自己的、还封着的盘放不进合辑。');
  if (e.local) throw new Error('这一张还没发出去，等连上云再放。');
  const r = await cloud.request('POST', `/albums/${encodeURIComponent(albumId)}/tracks`, { id: rid('tk'), soundId: e.id, author: me() }, { create: true });
  if (!r.ok) throw fail(r, '放');
  await loadAlbum(albumId);
  return r.json.track;
}
export async function takeOut(track) {
  const r = await cloud.request('DELETE', `/tracks/${encodeURIComponent(track.id)}`);
  if (!r.ok) throw fail(r, '拿出来');
  await loadAlbum(track.albumId);
}
export async function removeAlbum(id) {
  const r = await cloud.request('DELETE', `/albums/${encodeURIComponent(id)}`);
  if (!r.ok) throw fail(r, '删');
  A.list = A.list.filter((a) => a.id !== id);
  delete A.tracks[id];
  A.version++;
}

// ====================================================================================
// 连着听：一段放完接下一段（接力的「从第一棒连着听」也用它）。手动放了别的就停
// ====================================================================================
export const Q = reactive({ list: [], i: -1, name: '' });
let qTimer = 0;
export function playQueue(list, name = '') {
  stopQueue();
  Q.list = list.filter(Boolean); Q.name = name;
  if (!Q.list.length) return;
  step(0);
}
async function step(i) {
  clearTimeout(qTimer);
  if (i >= Q.list.length) { stopQueue(); return; }
  Q.i = i;
  const e = Q.list[i];
  await play(e, { hour: i === 0 });
  const id = e.id;
  const wait = () => {
    if (!L.playing || L.playing.id !== id) { stopQueue(); return; }      // 中途放了别的
    const dur = Math.min(e.seconds || 10, 10);
    if (stage.playing() && stage.position() >= dur - 0.12) { step(i + 1); return; }
    qTimer = setTimeout(wait, 120);
  };
  qTimer = setTimeout(wait, 400);
}
export function stopQueue() { clearTimeout(qTimer); Q.list = []; Q.i = -1; Q.name = ''; }

// ====================================================================================
// 叠成一张：至多 8 段，统一成 48 kHz，各自先归一到同样的响度，再叠起来、压住峰值。刻成一张十秒的盘
// ====================================================================================
const FS = 48000;
function resample(pcm, fs) {
  if (fs === FS) return pcm;
  const n = Math.floor((pcm.length / fs) * FS), out = new Float32Array(n), k = fs / FS;
  for (let i = 0; i < n; i++) { const x = i * k, j = Math.floor(x), f = x - j; out[i] = (pcm[j] || 0) * (1 - f) + (pcm[j + 1] || 0) * f; }
  return out;
}
export async function mixOf(list) {
  const pick = list.filter(Boolean).slice(0, ALBUM.mixMax);
  const N = FS * 10, sum = new Float32Array(N);
  for (const e of pick) {
    const s = await audio.soundOf(e);
    const x = resample(s.pcm, s.fs);
    const len = Math.min(N, Math.round(Math.min(e.seconds || 10, 10) * FS));
    let q = 0;
    for (let i = 0; i < len; i++) q += x[i] * x[i];
    const g = 0.18 / Math.max(1e-4, Math.sqrt(q / Math.max(1, len)));     // 各段先拉到同样的均方根
    for (let i = 0; i < len; i++) sum[i] += x[i] * Math.min(g, 6);
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(sum[i]));
  const k = peak > 0.92 ? 0.92 / peak : 1;
  for (let i = 0; i < N; i++) sum[i] *= k;
  return { pcm: sum, fs: FS, n: pick.length };
}
export async function playMix(a, list) {
  stopQueue();
  const pick = list.filter(Boolean).slice(0, ALBUM.mixMax);
  if (pick.length < 2) { say('至少要两段才叠得起来。'); return; }
  try {
    const { pcm, fs, n } = await mixOf(pick);
    const id = `mix-${a.id}-${pick.map((e) => e.id).join('.').length}-${pick.length}-${pick.at(-1).id}`;
    const e = { id, tier: 'mix', place: '', note: `「${a.name}」叠成一张`, seconds: 10, pcm, fs, hour: null, semester: null, mix: pick };
    L.playing = e;
    stage.setEchoes([]);
    await stage.load(e, { autoplay: true, label: `合辑　${a.name}　${n} 段叠成一张` });
  } catch (x) { say(`叠不起来：${x.message || x}`); }
}
