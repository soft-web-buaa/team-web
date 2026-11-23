// 数据层：全站读写声音和回应都只走这一个文件。
// 现在：种子数据（只读）+ 这台设备的 localStorage（用户留下的）。
// 后端选定后：把下面几个 async 函数的函数体换成 fetch 云函数，函数签名不变，页面不用改。
// localStorage 只是占位，别人看不到你留的声音，所以不算"长期存储"（验收 A4 要等后端）。
import { reactive, computed } from 'vue';
import { SEED_SOUNDS, MOODS } from '../data/sounds.js';
import { TOPICS } from '../data/topics.js';
import { blockById, pointInBlock } from '../data/campus.js';
import { nowHour } from './time.js';

const KEY = 'tjxy-mvp-v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const saved = load();
export const state = reactive({
  mine: Array.isArray(saved.mine) ? saved.mine : [],
  myReplies: Array.isArray(saved.myReplies) ? saved.myReplies : [],
});

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mine: state.mine, myReplies: state.myReplies }));
  } catch {
    throw new Error('这台设备的存储空间满了。到“关于”页清除自己留下的声音，再试一次。');
  }
}

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
  state.mine.push(sound);
  try {
    persist();
  } catch (e) {
    state.mine.pop();
    throw e;
  }
  return sound;
}

export async function removeMine() {
  state.mine = [];
  state.myReplies = [];
  persist();
}

export function topicById(id) {
  return TOPICS.find((t) => t.id === id) || null;
}

export function repliesOf(topicId) {
  const t = topicById(topicId);
  const base = t ? t.replies : [];
  return [...base, ...state.myReplies.filter((r) => r.topicId === topicId)];
}

export async function createReply(topicId, { text, mood }) {
  const t = String(text || '').trim();
  if (!t) throw new Error('先写一句话。');
  if (!topicById(topicId)) throw new Error('这个话题不存在。');
  if (!MOODS.includes(mood)) throw new Error('先选一个心情。');
  const reply = { id: `r-${Date.now().toString(36)}`, topicId, text: t.slice(0, 60), mood, demo: false, mine: true };
  state.myReplies.push(reply);
  try {
    persist();
  } catch (e) {
    state.myReplies.pop();
    throw e;
  }
  return reply;
}
