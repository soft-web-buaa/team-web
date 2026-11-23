// 数据层：全站读写声音、回应、回声都只走这一个文件。
// 现在：种子数据（只读）+ 这台设备的 localStorage（用户留下的）。
// 后端选定后：把下面几个函数的函数体换成 fetch 云函数，函数签名不变，页面不用改。
// localStorage 只是占位，别人看不到你留的内容，所以不算"长期存储"（验收 A4 要等后端）。
import { reactive, computed } from 'vue';
import { SEED_SOUNDS, MOODS } from '../data/sounds.js';
import { TOPICS } from '../data/topics.js';
import { COHORTS, SEED_HEARD, SEED_ECHOES } from '../data/community.js';
import { blockById, pointInBlock } from '../data/campus.js';
import { nowHour } from './time.js';
import { validateLine } from './rules.js';

const KEY = 'tjxy-mvp-v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const arr = (v) => (Array.isArray(v) ? v : []);
const saved = load();

export const state = reactive({
  mine: arr(saved.mine),
  myReplies: arr(saved.myReplies),
  myEchoes: arr(saved.myEchoes),
  heard: arr(saved.heard),
  reported: arr(saved.reported),
  me: saved.me && COHORTS.includes(saved.me.cohort) ? { cohort: saved.me.cohort } : null,
});

function persist() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        mine: state.mine,
        myReplies: state.myReplies,
        myEchoes: state.myEchoes,
        heard: state.heard,
        reported: state.reported,
        me: state.me,
      }),
    );
  } catch {
    throw new Error('这台设备的存储空间满了。到“关于”页清除自己留下的内容，再试一次。');
  }
}

/** 先改状态再存；存不下就回滚，调用方拿到的是一句人话 */
function commit(apply, rollback) {
  apply();
  try {
    persist();
  } catch (e) {
    rollback();
    throw e;
  }
}

// ———— 声音 ————

export const allSounds = computed(() => [...SEED_SOUNDS, ...state.mine]);

export const counts = computed(() => {
  const total = allSounds.value.length;
  const real = allSounds.value.filter((s) => !s.demo).length;
  return { total, real, demo: total - real };
});

export function soundById(id) {
  return allSounds.value.find((s) => s.id === id) || null;
}

/** 留下一段声音。draft: { title, block, place, mood, story, src?, recipe?, duration, demo } */
export async function createSound(draft) {
  const block = blockById(draft.block);
  if (!block) throw new Error('先在地图上选一个地点。');
  if (!MOODS.includes(draft.mood)) throw new Error('先选一个心情。');
  if (!draft.src && !draft.recipe) throw new Error('先录一段声音，或者选一段示例声音。');
  const id = `mine-${Date.now().toString(36)}`;
  const sound = {
    id,
    title: String(draft.title || '').trim().slice(0, 12) || '我听到的声音',
    block: block.id,
    at: pointInBlock(id),
    place: String(draft.place || '').trim().slice(0, 16) || block.name,
    hour: nowHour(),
    mood: draft.mood,
    story: String(draft.story || '').trim().slice(0, 60),
    recipe: draft.recipe || null,
    src: draft.src || null,
    duration: draft.duration || 10,
    demo: !!draft.demo,
    by: draft.demo ? '示例' : '我',
    mine: true,
  };
  commit(
    () => state.mine.push(sound),
    () => state.mine.pop(),
  );
  return sound;
}

/** 清除这台设备上你留下的全部内容，包括你的入学年份 */
export async function removeMine() {
  state.mine = [];
  state.myReplies = [];
  state.myEchoes = [];
  state.heard = [];
  state.reported = [];
  state.me = null;
  persist();
}

export function hasMine() {
  return !!(state.mine.length || state.myReplies.length || state.myEchoes.length || state.heard.length || state.me);
}

// ———— 身份：只有入学年份 ————

export function setMe(cohort) {
  if (!COHORTS.includes(cohort)) throw new Error('先选一个入学年份。');
  const old = state.me;
  commit(
    () => {
      state.me = { cohort };
    },
    () => {
      state.me = old;
    },
  );
}

export function resetMe() {
  const old = state.me;
  commit(
    () => {
      state.me = null;
    },
    () => {
      state.me = old;
    },
  );
}

// ———— 举报：先对举报的人隐藏，后端接上以后进审核队列 ————

export function reportItem(id) {
  if (state.reported.includes(id)) return;
  commit(
    () => state.reported.push(id),
    () => state.reported.pop(),
  );
}

const visible = (item) => !state.reported.includes(item.id);

// ———— 同听：我也听过这段声音 ————

export function heardInfo(soundId) {
  const seed = SEED_HEARD[soundId] || [];
  const mine = state.heard.includes(soundId);
  const all = mine && state.me ? [...seed, state.me.cohort] : seed;
  const by = new Map();
  all.forEach((c) => by.set(c, (by.get(c) || 0) + 1));
  const rows = COHORTS.filter((c) => by.has(c)).map((c) => ({ cohort: c, n: by.get(c) }));
  return { total: all.length, rows, mine, hasDemo: seed.length > 0 };
}

/** 返回切换之后"我是否听过" */
export function toggleHeard(soundId) {
  if (!state.me) throw new Error('先选你的入学年份。');
  const i = state.heard.indexOf(soundId);
  if (i >= 0) {
    commit(
      () => state.heard.splice(i, 1),
      () => state.heard.splice(i, 0, soundId),
    );
    return false;
  }
  commit(
    () => state.heard.push(soundId),
    () => state.heard.pop(),
  );
  return true;
}

// ———— 回声：钉在声音某一秒的一句话 ————

export const ECHO_MAX = 40;

export function echoesOf(soundId) {
  return [...SEED_ECHOES, ...state.myEchoes]
    .filter((e) => e.soundId === soundId && visible(e))
    .sort((a, b) => a.t - b.t);
}

export async function createEcho(soundId, { t, text }) {
  const s = soundById(soundId);
  if (!s) throw new Error('这段声音不存在。');
  if (!state.me) throw new Error('先选你的入学年份。');
  const bad = validateLine(text, ECHO_MAX);
  if (bad) throw new Error(bad);
  const dur = s.duration || 10;
  const echo = {
    id: `e-${Date.now().toString(36)}`,
    soundId,
    t: Math.min(dur, Math.max(0, Number(t) || 0)),
    cohort: state.me.cohort,
    text: String(text).trim(),
    demo: false,
    mine: true,
  };
  commit(
    () => state.myEchoes.push(echo),
    () => state.myEchoes.pop(),
  );
  return echo;
}

// ———— 话题回应 ————

export function topicById(id) {
  return TOPICS.find((t) => t.id === id) || null;
}

export function repliesOf(topicId) {
  const t = topicById(topicId);
  const base = t ? t.replies : [];
  return [...base, ...state.myReplies.filter((r) => r.topicId === topicId)].filter(visible);
}

export const REPLY_MAX = 60;

export async function createReply(topicId, { text, mood }) {
  if (!topicById(topicId)) throw new Error('这个话题不存在。');
  if (!state.me) throw new Error('先选你的入学年份。');
  const bad = validateLine(text, REPLY_MAX);
  if (bad) throw new Error(bad);
  if (!MOODS.includes(mood)) throw new Error('先选一个心情。');
  const reply = {
    id: `r-${Date.now().toString(36)}`,
    topicId,
    text: String(text).trim(),
    mood,
    cohort: state.me.cohort,
    demo: false,
    mine: true,
  };
  commit(
    () => state.myReplies.push(reply),
    () => state.myReplies.pop(),
  );
  return reply;
}
