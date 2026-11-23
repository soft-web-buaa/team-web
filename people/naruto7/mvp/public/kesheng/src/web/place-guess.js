// 刻声 · 地点候选（「是这里吗」）。纯函数，页面与单测共用。
// 口径（REWORK-TASK-v3-6 §3.7.2，SPEC-DIGEST-1 §5 归我定，这里沿用它的默认）：
//   · 候选最多 2 处；过线的不够 2 处就少给；一处都不过线也不空问——给「最接近的一处，可能也不对」+「都不是」
//   · 候选一律 placeFrom:'guess'；只有用户点了「是这里」才写 'user' + placeConfirmedAt
//   · 「都不是」→ 地点留空，等用户在地图上点；不自动填最近的那处
//   · 分数是余弦，只在这里排序用，**不往外给**：页面拿不到分数，也就显示不了
// 场景剖面是候选生成器，不是定位器（src/dsp/scene.js）：真实数据上地点层最好只有 0.060（docs/FIND-v2.md:110）。
import { sceneTopK } from '../dsp/scene.js';

export const MAX_CANDS = 2;

/**
 * @param index     buildSceneIndex 的结果（key = 盘号）
 * @param profile   sceneProfile 的结果
 * @param placeOf   盘号 → 地点号
 * @returns {{places: string[], weak: boolean}}  weak = 没有一处过线，给的是最接近的一处
 */
export function placeCandidates(index, profile, placeOf, { minScore = 0.25, exclude = [] } = {}) {
  if (!index || !index.items || !index.items.length || !profile || !profile.ok) return { places: [], weak: false };
  const skip = new Set(exclude);
  const all = sceneTopK(index, profile, { k: index.items.length, minScore: -Infinity });
  const seen = new Set(), strong = [];
  let nearest = null;
  for (const r of all) {
    const pid = placeOf(r.key);
    if (!pid || skip.has(pid) || seen.has(pid)) continue;
    seen.add(pid);
    if (!nearest) nearest = pid;
    if (r.score >= minScore && strong.length < MAX_CANDS) strong.push(pid);
  }
  if (strong.length) return { places: strong, weak: false };
  return { places: nearest ? [nearest] : [], weak: !!nearest };
}

/** 问之前的那条记录：只有猜测，没有用户的回答。 */
export function guessRecord(c) {
  return { placeFrom: 'guess', guessTop1: c.places[0] || null, guessTop2: c.places[1] || null, userPlaceId: null, placeConfirmedAt: null };
}

/** 用户点了某一处（候选里的「是这里」，或「都不是」之后在地图上点的）。 */
export function confirmRecord(rec, placeId, now = new Date()) {
  if (!placeId) throw new Error('confirmRecord 需要一个地点号');
  return { ...rec, placeFrom: 'user', userPlaceId: placeId, placeConfirmedAt: now.toISOString() };
}

/** 「都不是」：地点留空，等用户自己指。记录里仍保留当时猜的是哪两处。 */
export function noneRecord(rec) {
  return { ...rec, placeFrom: 'guess', userPlaceId: null, placeConfirmedAt: null };
}
