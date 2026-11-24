// 听见校园 · 社区（客户端）：帖子、楼中楼、话题、抱抱与我也是、接力、多机位、看板。接口在 server/api.mjs 的 community()。
// 学了几家：贴吧的楼层与楼中楼（只两层）、豆瓣小组的「回应」、小红书的 #话题、网易云音乐的抱抱、Instagram 的 Add Yours 接力、
// SoundCloud 钉在某一秒的评论（已经有：回声）、aporee 声音地图只收现场录音的口径。
// 示例帖在 public/data/demo-posts.json：标「示例」，不算人数，删不掉；但在它下面回复、抱抱是真的，存在云上。
import { reactive } from 'vue';
import * as cloud from './cloud.js';
import { validateLine } from '../kesheng/web/contract.js';
import { PRESET_TOPICS, POST, MOODS } from './topics.js';
import { L, ensureMe, isPublic } from './library.js';

const BASE = import.meta.env.BASE_URL;
export const C = reactive({
  ready: false, demo: [], demoReplies: [],
  topics: PRESET_TOPICS.map((t) => ({ ...t, preset: true, posts: 0 })),
  posts: [],            // 云上的帖子（自带 replies / hug / same / my）
  counts: {},           // 示例帖在云上收到的回复数与反应
  stats: null, online: null, version: 0,
});
const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const zero = () => ({ replies: 0, hug: 0, same: 0, my: [] });
const T = (at) => Date.parse(at) || 0;

let loading = null;
/** 载入示例帖（只一次），再从云上取。几处同时调用时共用同一次载入。 */
export function init() {
  if (!loading) loading = loadDemo();
  return loading.then(refresh);
}
async function loadDemo() {
  if (!C.ready) {
    try {
      const j = await fetch(`${BASE}data/demo-posts.json`).then((r) => r.json());
      C.demo = j.posts.map((p) => ({ ...p, demo: true, author: { grade: p.grade }, topics: p.topics || [] }));
      C.demoReplies = j.replies.map((r) => ({ ...r, demo: true, author: { grade: r.grade }, parentId: r.parentId || null }));
    } catch { C.demo = []; C.demoReplies = []; }
    C.ready = true;
  }
}
export async function refresh() {
  const [t, p] = await Promise.all([cloud.request('GET', '/topics'), cloud.request('GET', `/posts?demo=${C.demo.map((x) => x.id).join(',')}`)]);
  if (t.ok) C.topics = t.json.topics;
  if (p.ok) { C.posts = p.json.posts; C.counts = p.json.demo || {}; C.online = true; } else if (p.offline) C.online = false;
  C.version++;
}
export async function loadStats() {
  const r = await cloud.request('GET', '/stats');
  if (r.ok) C.stats = r.json;
  return C.stats;
}

// ====================================================================================
// 读
// ====================================================================================
export const allPosts = () => [...C.demo, ...C.posts];
export const topicById = (id) => C.topics.find((t) => t.id === id) || null;
export const topicName = (id) => (topicById(id) || {}).name || '';
export const topicCount = (id) => allPosts().filter((p) => p.topics.includes(id)).length;
/** 一个帖子的回复数与反应：云上的帖子自带；示例帖 = 写好的示例回复 + 云上别人回的。 */
export function countsOf(p) {
  if (!p.demo) return { replies: p.replies || 0, hug: p.hug || 0, same: p.same || 0, my: p.my || [] };
  const c = C.counts[p.id] || zero();
  return { ...c, my: c.my || [], replies: (c.replies || 0) + C.demoReplies.filter((r) => r.postId === p.id).length };
}
/** 帖子流。热门：回复 4、我也是 2、抱抱 1，一天折半（和服务端同一个公式）。 */
export function feed({ sort = 'new', topic = null, place = null } = {}) {
  let a = allPosts();
  if (topic) a = a.filter((p) => p.topics.includes(topic));
  if (place) a = a.filter((p) => p.placeId === place);
  const score = (p) => { const c = countsOf(p); return (c.replies * 4 + c.same * 2 + c.hug + 1) / (1 + (Date.now() - T(p.at)) / 86400000); };
  return a.sort(sort === 'hot' ? (x, y) => score(y) - score(x) : (x, y) => T(y.at) - T(x.at));
}
export function ago(at) {
  const d = (Date.now() - T(at)) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 14) return `${Math.floor(d / 86400)} 天前`;
  const b = new Date(at);
  return `${b.getMonth() + 1} 月 ${b.getDate()} 日`;
}
/** 一个帖子的详情：帖子本身、楼层（含楼中楼）、它所在的接力链。 */
export async function open(id) {
  if (!loading) loading = loadDemo();
  await loading;
  const p = allPosts().find((x) => x.id === id) || null;
  const demoReps = C.demoReplies.filter((r) => r.postId === id);
  const q = new URLSearchParams({ demo: demoReps.map((r) => r.id).join(',') });
  if (p && p.demo && p.relayRoot) q.set('root', p.relayRoot);
  const r = await cloud.request('GET', `/posts/${encodeURIComponent(id)}?${q}`);
  if (!r.ok && !(p && p.demo)) return { error: r.offline ? '连不上云，打不开这个帖子。' : r.error };
  const j = r.ok ? r.json : { post: null, self: zero(), replies: [], relay: [], counts: {} };
  const post = p && p.demo ? { ...p, ...(j.self || zero()), demo: true } : j.post || p;
  const replies = [...demoReps.map((x) => ({ ...x, ...((j.counts || {})[x.id] || zero()) })), ...j.replies].sort((a, b) => T(a.at) - T(b.at));
  let relay = [];
  if (post && post.relayRoot) {
    const seen = new Set();
    relay = [...C.demo.filter((x) => x.relayRoot === post.relayRoot), ...j.relay, ...C.posts.filter((x) => x.relayRoot === post.relayRoot)]
      .filter((x) => (seen.has(x.id) ? false : seen.add(x.id))).sort((a, b) => a.relayIndex - b.relayIndex);
  }
  return { post, replies, relay };
}
/** 楼层：楼主算 1 楼，回复从 2 楼起；楼中楼挂在它回的那一层下面。 */
export function floors(replies) {
  const top = replies.filter((r) => !r.parentId || !replies.some((x) => x.id === r.parentId));
  return top.map((r, i) => ({ ...r, floor: i + 2, kids: replies.filter((k) => k.parentId === r.id) }));
}
/** 全部接力链：按根分组，每条从第一棒排到最后一棒；最近有人接的排前面。 */
export function chains() {
  const by = new Map();
  for (const p of allPosts()) if (p.relayRoot) { if (!by.has(p.relayRoot)) by.set(p.relayRoot, []); by.get(p.relayRoot).push(p); }
  return [...by.values()].map((a) => a.sort((x, y) => x.relayIndex - y.relayIndex)).sort((a, b) => T(b.at(-1).at) - T(a.at(-1).at));
}

// ====================================================================================
// 多机位：同一个地点、前后半小时里的几段真实录音，自动归成「一场」。不用谁去组队，正常刻就会长出来
// ====================================================================================
export const SCENE_GAP = 30 * 60 * 1000;
export function scenes() {
  void L.version;
  const by = new Map();
  for (const e of L.entries) {
    if (e.tier !== 'real' || !isPublic(e) || !e.placeId || !e.at) continue;
    if (!by.has(e.placeId)) by.set(e.placeId, []);
    by.get(e.placeId).push(e);
  }
  const out = [];
  for (const list of by.values()) {
    list.sort((a, b) => T(a.at) - T(b.at));
    let cur = [list[0]];
    for (let i = 1; i <= list.length; i++) {
      const e = list[i];
      if (e && T(e.at) - T(cur.at(-1).at) <= SCENE_GAP) { cur.push(e); continue; }
      if (cur.length > 1) out.push(cur);
      cur = e ? [e] : [];
    }
  }
  return out.sort((a, b) => T(b[0].at) - T(a[0].at));
}
/** 示意的「同一时段」：同一个地点、同一学期、同一个时段的示意盘（页面合成的，只用来看多机位长什么样）。 */
export function sameSlot() {
  void L.version;
  const by = new Map();
  for (const e of L.entries) {
    if (e.tier !== 'synthetic' || !e.placeId) continue;
    const k = `${e.placeId}|${e.semester}|${e.slot}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  return [...by.values()].filter((a) => a.length > 1).sort((a, b) => String(b[0].semester).localeCompare(String(a[0].semester))).slice(0, 8);
}

// ====================================================================================
// 看板：心情的共鸣、地点 × 钟点
// ====================================================================================
/** 心情：真实帖（云上统计）和示例帖分开数，页面上两种颜色、各写 n。 */
export function moodTally() {
  const real = (C.stats && C.stats.mood) || {};
  const demo = {};
  for (const p of C.demo) if (p.mood) demo[p.mood] = (demo[p.mood] || 0) + 1;
  return MOODS.map((m) => ({ ...m, real: real[m.id] || 0, demo: demo[m.id] || 0 }));
}
/** 同一种心情的人在哪儿：这种心情的帖子最多的三个地点（真实 + 示例，一起数，页面写明）。 */
export function moodPlaces(moodId) {
  const n = new Map();
  const add = (pid, k = 1) => n.set(pid, (n.get(pid) || 0) + k);
  for (const p of C.demo) if (p.mood === moodId && p.placeId) add(p.placeId);
  const mp = (C.stats && C.stats.moodPlace && C.stats.moodPlace[moodId]) || {};
  for (const [pid, k] of Object.entries(mp)) add(pid, k);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
}
/** 地点 × 钟点：16 个地点 × 24 个钟点，每格几张。onlyReal = 只数真实录音。 */
export function heat(onlyReal = false) {
  void L.version;
  const g = new Map(L.places.map((p) => [p.id, new Array(24).fill(0)]));
  for (const e of L.entries) {
    if (!e.placeId || e.hour == null || !isPublic(e)) continue;
    if (onlyReal && e.tier !== 'real') continue;
    const row = g.get(e.placeId);
    if (row) row[Math.floor(e.hour) % 24]++;
  }
  return g;
}

// ====================================================================================
// 写
// ====================================================================================
const me = () => { const id = ensureMe(); return id.grade || id.dept || id.name ? { grade: id.grade || '', dept: id.dept || '', name: id.name || '' } : null; };
const fail = (r, what) => new Error(r.offline ? `连不上云，${what}不出去。连上网络再试。` : r.error || '没有成功，再试一次。');
export async function post(d) {
  const bad = validateLine(d.text, POST.textMax);
  if (bad) throw new Error(bad);
  if ((d.relayOf || d.relayStart) && !d.soundId) throw new Error('接力要附一段声音。');
  const body = { id: rid('ps'), text: d.text.trim(), topics: d.topics || [], placeId: d.placeId || null, mood: d.mood || null, soundId: d.soundId || null, author: me() };
  if (d.relayOf) Object.assign(body, { relayOf: d.relayOf, relayRoot: d.relayRoot, relayUpIndex: d.relayUpIndex });
  else if (d.relayStart) body.relayStart = true;
  const r = await cloud.request('POST', '/posts', body, { create: true });
  if (!r.ok) throw fail(r, '发');
  C.posts = [r.json.post, ...C.posts];
  C.version++;
  return r.json.post;
}
export async function reply(postId, text, { parentId = null, soundId = null } = {}) {
  const bad = validateLine(text, POST.replyMax);
  if (bad) throw new Error(bad);
  const r = await cloud.request('POST', `/posts/${encodeURIComponent(postId)}/replies`, { id: rid('rp'), text: text.trim(), parentId, soundId, author: me() }, { create: true });
  if (!r.ok) throw fail(r, '回');
  const p = C.posts.find((x) => x.id === postId);
  if (p) p.replies = (p.replies || 0) + 1;
  else if (/^ps-demo-/.test(postId)) C.counts[postId] = { ...(C.counts[postId] || zero()), replies: ((C.counts[postId] || {}).replies || 0) + 1 };
  C.version++;
  return r.json.reply;
}
/** 抱抱 / 我也是：再点一次取消。holder 是页面上显示这一条计数的那个对象（帖子或楼层），直接改它。 */
export async function react(target, type, holder) {
  const r = await cloud.request('POST', '/react', { target, type }, { create: true });
  if (!r.ok) throw fail(r, '点');
  const my = (holder.my || []).filter((x) => x !== type);
  if (r.json.on) my.push(type);
  Object.assign(holder, { hug: r.json.hug, same: r.json.same, my });
  const p = C.posts.find((x) => x.id === target);
  if (p && p !== holder) Object.assign(p, { hug: r.json.hug, same: r.json.same, my });
  if (/^ps-demo-/.test(target)) C.counts[target] = { ...(C.counts[target] || zero()), hug: r.json.hug, same: r.json.same, my };
  C.version++;
  return r.json;
}
export async function createTopic(name, intro = '') {
  const r = await cloud.request('POST', '/topics', { id: rid('tp'), name, intro }, { create: true });
  if (!r.ok) throw fail(r, '建');
  if (!C.topics.some((t) => t.id === r.json.topic.id)) C.topics = [...C.topics, r.json.topic];
  return r.json.topic;
}
export async function removePost(id) {
  const r = await cloud.request('DELETE', `/posts/${encodeURIComponent(id)}`);
  if (!r.ok) throw fail(r, '删');
  C.posts = C.posts.filter((x) => x.id !== id);
  C.version++;
}
export async function removeReply(id) {
  const r = await cloud.request('DELETE', `/replies/${encodeURIComponent(id)}`);
  if (!r.ok) throw fail(r, '删');
}
export async function report(kind, id) {
  const r = await cloud.request('POST', `/${kind}/${encodeURIComponent(id)}/report`, {}, { create: true });
  if (!r.ok) throw fail(r, '举报');
  return r.json.held;
}
