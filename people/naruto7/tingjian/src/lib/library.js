// 听见校园 · 馆藏：全站的声片、回声、我的。页面只经过这里读写数据，三维舞台只经过这里拿到要画的东西。
// 三层素材（口径只走刻声 tier.js）：真实（云上，有人在某处某刻录的）、史料（标「史料」）、示意（页面合成的概念盘，不挂落款、不算人数）。
// 数据放哪见 DESIGN.md §6：云上的以云为准；本机只放刻声卡、发件箱、对我隐藏。
import { reactive, markRaw } from 'vue';
import { tierOf, counts, tallyText } from '../kesheng/web/tier.js';
import { semesterLabel, semesterSeq, currentSemester, SLOT_WORD } from '../kesheng/web/semester.js';
import { signature, loadIdentity, saveIdentity, snapshot, cardFile, importIdentity } from '../kesheng/web/identity.js';
import { validateLine, ECHO_MAX, CONSENT_VERSION } from '../kesheng/web/contract.js';
import * as cloud from './cloud.js';
import * as outbox from './outbox.js';
import { bj, slotOfHour, semesterOf, dayKey } from './when.js';
import { encodeWav } from './audio.js';
import * as stage from '../stage/stage.js';
import { goHour } from './clock.js';

const BASE = import.meta.env.BASE_URL;
export { ECHO_MAX, signature, semesterLabel, SLOT_WORD, tallyText, counts };

export const L = reactive({
  ready: false, failed: '',
  campus: null, places: [], zones: [], placeById: markRaw(new Map()), cal: null, nowSem: null,
  entries: [],                // 全部声片（真实 + 史料 + 示意），按时间从早到晚
  facts: {},                  // placeId → [{ text, src }]
  online: null,               // null 还没试过 / true / false
  feed: [],                   // 社区的回声流（云上）
  me: { discs: [], favs: [], inbox: [] },
  echoes: {},                 // discId → 云上的回声
  pending: [],                // 发件箱里还没发出去的（盘、话）
  hidden: [],                 // 对我隐藏的回声
  playing: null,              // 正在放的那张
  identity: loadIdentity(),
  readAt: (() => { try { return localStorage.getItem('tj-read-at') || ''; } catch { return ''; } })(),   // 收件箱读到哪一刻（这台设备上）
  toast: '',
  version: 0,                 // 条目变了就加一（视图用它重算）
});
const byId = new Map();
export const entryById = (id) => byId.get(id) || null;
const seedEchoes = [];

export function say(t) { L.toast = t; clearTimeout(say.t); say.t = setTimeout(() => { if (L.toast === t) L.toast = ''; }, 5200); }

// ====================================================================================
// 载入
// ====================================================================================
const j = (p) => fetch(`${BASE}${p}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export async function init() {
  const [campus, demo, arch, hist, cal, seed, loud] = await Promise.all([j('data/campus-xy.json'), j('data/demo-catalog.json'), j('archive/catalog.json'), j('history/index.json'), j('data/calendar.json'), j('data/echo-seed.json'), j('data/loudness.json')]);
  const dbOf = (loud && loud.db) || {};
  if (!campus) { L.failed = '校园数据取不到。'; return; }
  L.campus = markRaw(campus);
  L.places = campus.places;
  L.zones = campus.zones;
  for (const p of campus.places) L.placeById.set(p.id, p);
  L.cal = cal;
  L.nowSem = currentSemester(new Date(), cal) || semesterOf(Date.now(), cal).key;
  L.facts = (hist && hist.places) ? Object.fromEntries(Object.entries(hist.places).map(([k, v]) => [k, v.facts || []])) : {};
  const list = [];
  for (const e of (demo && demo.entries) || []) {
    if (e.status !== 'accessioned' || tierOf(e) !== 'synthetic' || !L.placeById.has(e.placeId)) continue;
    const b = bj(e.at);
    list.push({ id: e.id, tier: 'synthetic', placeId: e.placeId, place: e.place, zoneId: L.placeById.get(e.placeId).z, at: e.at, hour: b ? b.h : null, slot: e.slot,
      semester: e.semester, week: e.week, seconds: e.seconds, note: e.note, kind: e.kind, synth: e.synth, author: null, mine: false, heard: 0, echoN: 0, day: dayKey(e.at), db: dbOf[e.id] ?? null });
  }
  const histBy = new Map(((hist && hist.items) || []).map((h) => [`arc-${h.packId}`, h]));
  for (const e of (arch && arch.entries) || []) {
    if (e.status !== 'accessioned' || tierOf(e) !== 'archival') continue;
    const h = histBy.get(e.id);
    const placeId = h && L.placeById.has(h.placeId) ? h.placeId : null;
    const event = h && h.dateKind === 'event';
    const at = event ? `${h.date}T12:00:00+08:00` : null;
    list.push({ id: e.id, tier: 'archival', no: e.no, placeId, place: placeId ? L.placeById.get(placeId).name : e.place, zoneId: placeId ? L.placeById.get(placeId).z : null,
      at, hour: null, slot: null, semester: event ? semesterOf(at, cal).key : null, seconds: e.seconds, note: (h && h.what) || e.copy || e.note, copy: e.copy || '', title: h ? h.title : e.note,
      url: `${BASE}archive/${e.file}`, src: e.source, hsrc: h ? h.source : null, date: h ? h.date : null, dateKind: h ? h.dateKind : null, dateHint: e.source && e.source.dateHint, facts: h ? h.facts || [] : [],
      kind: e.kind, author: null, mine: false, heard: 0, echoN: 0, day: event ? h.date.slice(5) : null });
  }
  for (const e of list) byId.set(e.id, e);
  L.entries = sortAt(list);
  for (const e of (seed && seed.echoes) || []) if (e && e.discId && Number.isFinite(e.t) && !validateLine(e.text)) seedEchoes.push({ ...e, demo: true });
  try { L.hidden = JSON.parse(localStorage.getItem('tj-hidden') || '[]'); } catch { L.hidden = []; }
  try { L.pending = (await outbox.all()).sort((a, b) => a.at.localeCompare(b.at)); } catch { L.pending = []; }
  for (const p of L.pending) if (p.kind === 'disc') addLocal(p);
  L.ready = true;
  pushToStage();
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  window.addEventListener('online', () => flush());
}
const T = (e) => (e.at ? Date.parse(e.at) : 0);
const sortAt = (list) => list.sort((a, b) => T(a) - T(b));

/** 云上的：公开的盘（含我的心事盘与胶囊）、回声流、我的。连不上就用已有的，页面照常。 */
export async function refresh() {
  const r = await cloud.request('GET', '/discs');
  if (r.ok) {
    L.online = true;
    const seen = new Set();
    for (const d of r.json.discs) { seen.add(d.id); upsertReal(d); }
    for (const e of [...byId.values()]) if (e.tier === 'real' && !e.local && !seen.has(e.id)) { byId.delete(e.id); L.entries = L.entries.filter((x) => x.id !== e.id); }
    const heardIds = new Map(r.json.discs.map((d) => [d.id, d]));
    void heardIds;
  } else if (r.offline) L.online = false;
  const f = await cloud.request('GET', '/feed');
  if (f.ok) L.feed = f.json.echoes;
  if (cloud.keyNow() || loadIdentity()) {
    const m = await cloud.request('GET', '/me');
    if (m.ok) L.me = { discs: m.json.discs, favs: m.json.favs, inbox: m.json.inbox };
  }
  flush();
  L.version++;
  pushToStage();
}
function realNo(d) {
  const b = bj(d.at), same = L.entries.filter((x) => x.tier === 'real' && x.placeId === d.placeId && x.semester === d.semester && x.week === d.week && T(x) <= Date.parse(d.at));
  return `KS-${d.placeId}-${b ? b.y : '----'}W${d.week ? String(d.week).padStart(2, '0') : '--'}-${String(Math.max(1, same.length + (same.some((x) => x.id === d.id) ? 0 : 1))).padStart(3, '0')}`;
}
function upsertReal(d) {
  let e = byId.get(d.id);
  const p = L.placeById.get(d.placeId);
  const fields = { tier: 'real', placeId: d.placeId, place: p ? p.name : '', zoneId: p ? p.z : null, at: d.at, hour: d.hour, slot: d.slot, semester: d.semester, week: d.week, seconds: d.seconds, db: d.db ?? null,
    note: d.note, author: d.author && (d.author.grade || d.author.dept || d.author.name) ? d.author : null, mine: d.mine, heard: d.heard || 0, heardByMe: !!d.heardByMe, echoN: d.echoes || 0,
    visibility: d.visibility, capsuleUntil: d.capsuleUntil, locked: d.locked, url: cloud.audioUrl(d.id), day: dayKey(d.at), local: false };
  if (e) Object.assign(e, fields);
  else { e = reactive({ id: d.id, ...fields }); byId.set(d.id, e); L.entries = sortAt([...L.entries, e]); }
  if (!e.no) e.no = realNo(d);
  return e;
}
/** 发件箱里的盘：还没发出去，先当成我的一张（放得出来，标「待发出」）。 */
function addLocal(p) {
  const d = p.disc;
  if (byId.has(d.id)) return;
  const b = bj(d.at), sem = semesterOf(d.at, L.cal), pl = L.placeById.get(d.placeId);
  const e = reactive({ id: d.id, tier: 'real', placeId: d.placeId, place: pl ? pl.name : '', zoneId: pl ? pl.z : null, at: d.at, hour: b.h, slot: slotOfHour(b.h), semester: sem.key, week: sem.week,
    seconds: p.seconds, note: d.note, author: d.author, mine: true, heard: 0, echoN: 0, visibility: d.visibility, capsuleUntil: d.capsuleUntil, local: p.state === 'rejected' ? 'rejected' : 'pending', error: p.error || '', wav: p.disc.audio, day: dayKey(d.at) });
  e.no = realNo(e);
  byId.set(d.id, e);
  L.entries = sortAt([...L.entries, e]);
}

// ====================================================================================
// 给三维舞台的：钉点上的盘、学期带、社区每处的张数
// ====================================================================================
export function pushToStage() {
  const nowSeq = semesterSeq(L.nowSem);
  const pins = new Map();
  for (const e of L.entries) {
    if (!e.placeId || e.tier === 'archival') continue;
    if (!pins.has(e.placeId)) pins.set(e.placeId, []);
    const sq = semesterSeq(e.semester);
    pins.get(e.placeId).push({ id: e.id, mine: e.mine, age: nowSeq != null && sq != null ? Math.min(1, Math.max(0, nowSeq - sq) / 15) : 0 });
  }
  stage.setPins(pins);
  stage.setBands(L.entries.filter((e) => e.semester && !(e.tier === 'real' && e.visibility === 'private')));
}
/** 社区：每个地点符合 test 的张数。 */
export function countByPlace(test = () => true) {
  const m = new Map(L.places.map((p) => [p.id, 0]));
  for (const e of L.entries) if (e.placeId && test(e)) m.set(e.placeId, (m.get(e.placeId) || 0) + 1);
  return m;
}

// ====================================================================================
// 查
// ====================================================================================
export const atPlace = (pid) => L.entries.filter((e) => e.placeId === pid);
export const isPublic = (e) => !(e.tier === 'real' && (e.visibility === 'private' || e.locked));
export function placeLine(pid) { return tallyText(counts(atPlace(pid).filter(isPublic))) || '这里还没有声音。'; }
export function siteCounts() { return counts(L.entries.filter(isPublic)); }
/** 一行署名：真实盘写落款；示意不写人；史料写出处。 */
export function byline(e) {
  if (e.tier === 'mix') return `${e.mix.length} 个人的十秒`;
  if (e.tier === 'archival') return '史料';
  if (e.tier === 'synthetic') return '示意';
  const s = e.author ? signature(e.author) : '';
  return [s && s !== '未落款' ? s : '没落款的人', e.mine ? '我' : ''].filter(Boolean).join(' · ');
}
export function title(e) {
  if (!e) return '';
  if (e.tier === 'archival') return e.title || e.note;
  return e.note || `${e.place}的十秒`;
}
export function whenText(e) {
  if (e.tier === 'mix') { const ys = e.mix.map((x) => x.semester).filter(Boolean).sort(); return ys.length ? `${semesterLabel(ys[0])} 到 ${semesterLabel(ys.at(-1))}` : ''; }
  if (e.tier === 'archival') return e.dateKind === 'event' && e.date ? dateCN(e.date) : e.dateHint || '年份不详';
  const b = e.at ? bj(e.at) : null;
  const sem = semesterLabel(e.semester);
  if (e.tier === 'synthetic') return `${sem} · ${SLOT_WORD[e.slot] || e.slot}`;
  return b ? `${sem}${e.week ? ` · 第 ${e.week} 周` : ''} · ${b.mo} 月 ${b.d} 日 ${String(Math.floor(b.h)).padStart(2, '0')}:${String(Math.floor((b.h % 1) * 60)).padStart(2, '0')}` : sem;
}
export function dateCN(d) { const [y, m, dd] = String(d).split('-').map(Number); return `${y} 年 ${m} 月${dd ? ` ${dd} 日` : ''}`; }
export const tierWord = (e) => (e.tier === 'archival' ? '史料' : e.tier === 'synthetic' ? '示意' : e.local === 'pending' ? '待发出' : e.local === 'rejected' ? '被退回' : e.visibility === 'private' ? '只给自己' : e.locked ? '封存中' : '真实');
/** 死蜡上刻的字。真实盘写档案号；示意不给档案号，只写哪一季、哪里；史料写史料号。 */
export const inscription = (e) => (e.tier === 'archival' ? `史料　${e.no}` : e.tier === 'synthetic' ? `${semesterLabel(e.semester)}　${e.place}　示意` : `${e.no}　${semesterLabel(e.semester)} 刻于学院路`);

// ====================================================================================
// 放
// ====================================================================================
let wavDecode = null;
/** 放一张。seek：从第几秒放；hour：false = 不改整站的钟点。 */
export async function play(e, { seek = null, auto = true, hour = true } = {}) {
  if (!e) return;
  if (e.locked && !e.mine) { say('这张还封着，到开封那天才听得到。'); return; }
  const spec = { ...e };
  if (e.wav && !e.url) {
    if (!wavDecode) wavDecode = (await import('../kesheng/web/receipt.js')).decodeWav16;
    const bin = Uint8Array.from(atob(e.wav), (c) => c.charCodeAt(0));
    Object.assign(spec, wavDecode(bin));
  }
  L.playing = e;
  try {
    await stage.load(spec, { autoplay: auto && seek == null, label: inscription(e) });
  } catch (err) { say(`${title(e)} 放不出来：${err.message || err}`); return; }
  if (seek != null) stage.seek(seek);
  if (hour && auto && e.hour != null) goHour(e.hour, { source: 'clip', label: `${e.place || ''}${e.place ? ' · ' : ''}${semesterLabel(e.semester)}` });
  syncEchoes();
  loadEchoes(e.id);
}
export async function shuffle(pool) {
  const from = (pool || L.entries).filter((x) => isPublic(x) && x.id !== (L.playing && L.playing.id));
  if (!from.length) return;
  await play(from[Math.floor(Math.random() * from.length)]);
}

// ====================================================================================
// 回声：钉在一张声片某一秒的一句话
// ====================================================================================
export function echoesOf(id) {
  if (!id) return [];
  const cloudList = L.echoes[id] || [];
  const have = new Set(cloudList.map((x) => x.id));
  const queued = L.pending.filter((p) => p.kind === 'echo' && p.echo.discId === id && !have.has(p.id)).map((p) => ({ ...p.echo, mine: true, local: p.state === 'rejected' ? 'rejected' : 'pending', error: p.error }));
  return [...seedEchoes.filter((x) => x.discId === id), ...cloudList, ...queued].filter((x) => !L.hidden.includes(x.id)).sort((a, b) => a.t - b.t);
}
export async function loadEchoes(id) {
  if (!id) return;
  const r = await cloud.request('GET', `/discs/${encodeURIComponent(id)}/echoes`);
  if (r.ok) { L.echoes[id] = r.json.echoes; L.online = true; } else if (r.offline) L.online = false;
  syncEchoes();
}
export function syncEchoes() { stage.setEchoes(L.playing ? echoesOf(L.playing.id).map((x) => ({ t: x.t, mine: !!x.mine })) : []); }
export function echoByline(x) {
  const s = x.author ? signature(x.author) : '';
  const tag = x.demo ? '示例' : x.local === 'rejected' ? '被退回' : x.local === 'pending' ? '待发出' : x.held ? '已被收起' : x.mine ? '我' : '';
  return [s && s !== '未落款' ? s : '', tag, x.photo && x.photo.state === 'pending' ? '照片审核中' : ''].filter(Boolean).join(' · ');
}
const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
/** 钉一句话（可以带一张照片：{ thumb, full }，要勾过同意）。先进发件箱，显示「待发出」，然后后台发。 */
export async function pinEcho({ disc, t, text, photo = null }) {
  const bad = validateLine(text);
  if (bad) throw new Error(bad);
  if (photo && !disc.placeId) throw new Error('这张声片没有地点，配不了照片。');
  const id = rid('ec');
  const me = ensureMe();
  const item = { id, kind: 'echo', state: 'pending', at: new Date().toISOString(),
    echo: { id, discId: disc.id, t: Math.round(Math.min(Math.max(0, t), disc.seconds || 10) * 10) / 10, text: String(text).trim(), dur: disc.seconds || 10, author: authorOf(me) },
    photo: photo ? { id: rid('ph'), placeId: disc.placeId, thumb: photo.thumb, full: photo.full } : null };
  await outbox.put(item);
  L.pending = [...L.pending, item];
  syncEchoes();
  flush();
}
export async function dropEcho(x) {
  if (x.local) { await outbox.del(x.id); L.pending = L.pending.filter((p) => p.id !== x.id); syncEchoes(); return; }
  if (x.mine) {
    const r = await cloud.request('DELETE', `/echoes/${encodeURIComponent(x.id)}`);
    if (!r.ok) { say(r.error || '没删掉，连上网络再试。'); return; }
    L.echoes[x.discId] = (L.echoes[x.discId] || []).filter((y) => y.id !== x.id);
    say('删掉了。');
  } else {
    if (!x.demo) cloud.request('POST', `/echoes/${encodeURIComponent(x.id)}/report`, {}, { create: true });
    L.hidden = [...L.hidden, x.id];
    try { localStorage.setItem('tj-hidden', JSON.stringify(L.hidden)); } catch { /* 只对这一页有效 */ }
    say(x.demo ? '这条示例收起来了。' : '举报了，这一条对你隐藏。三个人举报会先收起。');
  }
  syncEchoes();
}

// ====================================================================================
// 我也听过、收藏
// ====================================================================================
export async function toggleHeard(e) {
  const r = await cloud.request('POST', `/discs/${encodeURIComponent(e.id)}/heard`, {}, { create: true });
  if (!r.ok) { say(r.error || '连不上云，等一会儿再点。'); return; }
  e.heard = r.json.heard; e.heardByMe = r.json.heardByMe;
  heardLocal[e.id] = { n: r.json.heard, me: r.json.heardByMe };
}
export const heardLocal = reactive({});
export const isFav = (e) => L.me.favs.includes(e.id);
export async function toggleFav(e) {
  const on = isFav(e);
  const r = await cloud.request(on ? 'DELETE' : 'PUT', `/me/favs/${encodeURIComponent(e.id)}`, null, { create: true });
  if (!r.ok) { say(r.error || '连不上云，等一会儿再点。'); return; }
  L.me.favs = on ? L.me.favs.filter((x) => x !== e.id) : [...L.me.favs, e.id];
}

// ====================================================================================
// 刻一张、发出去
// ====================================================================================
export function ensureMe() { let id = loadIdentity(); if (!id) id = saveIdentity({}); L.identity = id; return id; }
const authorOf = (id) => (id && (id.grade || id.dept || id.name) ? { grade: id.grade || '', dept: id.dept || '', name: id.name || '' } : null);
export function setSignature(f) { L.identity = saveIdentity(f); }
export function exportCard() { const id = ensureMe(); return new Blob([cardFile(id)], { type: 'application/json' }); }
export function importCard(text) { L.identity = importIdentity(text); location.reload(); }

/** take = { pcm, fs, at(Date) }；draft = { placeId, note, visibility, capsuleUntil }。返回新的条目（先是「待发出」）。 */
export async function publish(take, draft) {
  if (!L.placeById.has(draft.placeId)) throw new Error('先选一个地点。');
  if (draft.note) { const bad = validateLine(draft.note, 40); if (bad) throw new Error(`一句话：${bad}`); }
  const me = ensureMe();
  const n = Math.min(take.pcm.length, Math.round(take.fs * 10));
  const wav = encodeWav(take.pcm.subarray(0, n), take.fs, 24000);
  let s = '';
  for (let i = 0; i < wav.length; i += 0x8000) s += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
  const id = rid('ds');
  const item = { id, kind: 'disc', state: 'pending', at: new Date().toISOString(), seconds: n / take.fs,
    disc: { id, placeId: draft.placeId, note: (draft.note || '').trim(), author: authorOf(me), visibility: draft.visibility === 'private' ? 'private' : 'public', capsuleUntil: draft.capsuleUntil || null, at: take.at.toISOString(), audio: btoa(s) } };
  await outbox.put(item);
  L.pending = [...L.pending, item];
  addLocal(item);
  pushToStage();
  L.version++;
  await flush();
  return byId.get(id);
}
export async function deleteDisc(e) {
  if (e.local) { await outbox.del(e.id); L.pending = L.pending.filter((p) => p.id !== e.id); }
  else {
    const r = await cloud.request('DELETE', `/discs/${encodeURIComponent(e.id)}`);
    if (!r.ok) { say(r.error || '没删掉，连上网络再试。'); return false; }
  }
  byId.delete(e.id);
  L.entries = L.entries.filter((x) => x.id !== e.id);
  L.me.discs = L.me.discs.filter((x) => x.id !== e.id);
  if (L.playing && L.playing.id === e.id) L.playing = null;
  pushToStage();
  L.version++;
  return true;
}

let flushing = false;
/** 把发件箱发出去。连不上就留着；被服务端拒绝的标「被退回」并写明原因。 */
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (const item of [...L.pending]) {
      if (item.state === 'rejected') continue;
      let r;
      if (item.kind === 'disc') {
        r = await cloud.request('POST', '/discs', item.disc, { timeout: 30000, create: true });
        if (r.ok) {
          await outbox.del(item.id);
          L.pending = L.pending.filter((p) => p.id !== item.id);
          const e = byId.get(item.id);
          if (e) { const wav = e.wav; upsertReal(r.json.disc); e.local = false; e.wav = wav; }
          L.online = true;
          continue;
        }
      } else {
        if (item.photo && !item.photoDone) {
          const p = await cloud.request('POST', '/photos', { id: item.photo.id, placeId: item.photo.placeId, consent: { version: CONSENT_VERSION, noIdentifiable: true }, thumb: item.photo.thumb, full: item.photo.full }, { timeout: 25000, create: true });
          if (p.ok) { item.photoDone = true; await outbox.put(item); }
          else if (p.offline || p.status === 429) break;
          else { item.state = 'rejected'; item.error = `照片：${p.error}`; await outbox.put(item); continue; }
        }
        r = await cloud.request('POST', '/echoes', { ...item.echo, photoId: item.photo ? item.photo.id : null }, { create: true });
        if (r.ok) {
          await outbox.del(item.id);
          L.pending = L.pending.filter((p) => p.id !== item.id);
          L.echoes[item.echo.discId] = [...(L.echoes[item.echo.discId] || []).filter((x) => x.id !== item.id), r.json.echo];
          L.online = true;
          continue;
        }
      }
      if (r.offline) { L.online = false; break; }
      if (r.status === 429) break;
      item.state = 'rejected'; item.error = r.error;
      await outbox.put(item);
      const e = byId.get(item.id);
      if (e) { e.local = 'rejected'; e.error = r.error; }
    }
  } finally {
    flushing = false;
    L.pending = [...L.pending];
    syncEchoes();
  }
}

// ====================================================================================
// 一代人：校史的时间线。每一条都有出处，没有出处的不写（DESIGN.md §6「不编数据」）
// ====================================================================================
export const ERA = [
  { y: 1952, when: '1952 年 10 月 25 日', text: '清华大学、北洋大学等八所院校的航空系合并，组建北京航空学院。', src: 'https://www.news.cn/2022-10/25/c_1129078994.htm', srcName: '新华网' },
  { y: 1953, when: '建校初期（年份不详）', text: '「那会儿是一片荒地，上课、吃饭、开会，都在工棚里。」', audio: 'arc-oral-ep3-043', srcName: '口述北航 3' },
  { y: 1954, when: '建校初期（年份不详）', text: '「打上木桩、围起来，就是学校头几栋楼：先修一号楼，再修对面三号楼。」', audio: 'arc-oral-ep1-125', srcName: '口述北航 1' },
  { y: 1958, when: '五十年代末（具体年份各处说法不一）', text: '「地面只剩一米。我国第一架无人驾驶飞机，在那一刻落地。」', audio: 'arc-oral-ep3-804', srcName: '口述北航 3 · 北京五号' },
  { y: 1985, when: '1985 年', text: '北京航空馆成立，2012 年新馆建成，更名北京航空航天博物馆。', src: 'https://news.gmw.cn/2025-11/02/content_38385341.htm', srcName: '光明网' },
  { y: 1988, when: '1988 年 4 月', text: '更名为北京航空航天大学。', src: 'https://www.news.cn/2022-10/25/c_1129078994.htm', srcName: '新华网' },
  { y: 2001, when: '2001 年 8 月', text: '体育馆落成，为第 21 届世界大学生运动会的排球比赛而建。', src: 'https://zh.wikipedia.org/wiki/%E5%8C%97%E4%BA%AC%E8%88%AA%E7%A9%BA%E8%88%AA%E5%A4%A9%E5%A4%A7%E5%AD%A6%E4%BD%93%E8%82%B2%E9%A6%86', srcName: '维基百科' },
  { y: 2008, when: '2008 年 8 月', text: '北京奥运会举重比赛在体育馆举行。这里存着赛场里的三段十秒。', audio: 'arc-oly-o05', src: 'https://news.buaa.edu.cn/info/1002/57234.htm', srcName: '北航新闻网' },
  { y: 2012, when: '2012 年 5 月 15 日', text: '晨兴音乐厅落成首演。', src: 'https://baike.baidu.com/item/%E6%99%A8%E5%85%B4%E9%9F%B3%E4%B9%90%E5%8E%85', srcName: '百度百科' },
  { y: 2016, when: '2015–2018 年间', text: '北航之声的电台节目，片头的十秒留了六段。', audio: 'arc-radio-r01', srcName: '北航之声' },
];

// ====================================================================================
// 收件箱的已读（学黄泰霖原型的收件箱）：只记「读到哪一刻」，存在这台设备上；比它新的算未读
// ====================================================================================
export const unread = () => L.me.inbox.filter((x) => x.at > (L.readAt || '')).length;
export function markRead() {
  const t = L.me.inbox.reduce((m, x) => (x.at > m ? x.at : m), L.readAt || '');
  L.readAt = t;
  try { localStorage.setItem('tj-read-at', t); } catch { /* 隐私模式 */ }
}
