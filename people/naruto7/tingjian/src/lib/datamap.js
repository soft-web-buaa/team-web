// 听见校园 · 数据地图：每个地点的几样量（纯函数，页面、舞台、自检共用）。
// 学黄泰霖原型社区里的「数据地图」（情绪热力、声音活跃度、安静角落、时段声景变化），但每一样都改成能直接量、能写清口径的：
//   张数   这里留下了几张（活跃度）
//   安静   这里的声音平均有多响，越静越「热」。响度是整段的均方根（dBFS）：真实录音由服务端收到 WAV 时算，示意盘由 scripts/measure-loudness.mjs 量合成的声音
//   心情   发帖的人自己选的心情（不从声音里猜）；一个地点取最多的那种，n 很小时照实写 n
// 「时段」不是一样量，是一个筛子：只看全站钟点前后一个半小时里录的。拖年轮的时针、点一天里的某一刻，地图跟着变。
import { MOODS } from './topics.js';

export const METRICS = [
  { id: 'count', name: '张数', say: '这里留下了几张。' },
  { id: 'quiet', name: '安静', say: '这里的声音平均有多静：整段的均方根响度，越静越深。' },
  { id: 'mood', name: '心情', say: '发帖的人自己选的心情，每个地方取最多的那一种。' },
];
export const FORMS = [
  { id: 'columns', name: '光柱', say: '每个地方一根光柱，高度是量的大小（开方，免得最高的一根把别的压扁）。' },
  { id: 'heat', name: '热力', say: '每个地方在地面上晕开一团，越大越深量越大。' },
  { id: 'contour', name: '等高线', say: '把各处的量当成一片地形，画等高线：峰是量最大的地方，像卡纸一层层叠起来。' },
  { id: 'rings', name: '年轮', say: '每个地方地上一张小年轮：一圈一个学年，哪个钟点声音多那一段就厚。' },
  { id: 'clock', name: '钟面', say: '每个地方地上一只钟：二十四根刻度，长短是那个钟点留下了几张。' },
];

export const MOOD_COL = { calm: '#5B7FA6', miss: '#8E6FA8', glad: '#C98A2E', tired: '#7D8790', tense: '#B5534A', warm: '#C2704F' };
export const MOOD_NAME = Object.fromEntries(MOODS.map((m) => [m.id, m.name]));

const near = (h, c, w) => { const x = Math.abs(h - c); return Math.min(x, 24 - x) <= w; };

/**
 * 每个地点的统计。entries：公开的盘（不含史料）；posts：带 placeId、mood 的帖子（真实 + 示例）。
 * hour：只看这个钟点前后 win 小时（null = 全天）。
 * @returns Map(placeId → { n, db, dbN, quiet, mood, moodN, moods, items })
 */
export function placeStats(places, entries, posts = [], { hour = null, win = 1.5 } = {}) {
  const out = new Map(places.map((p) => [p.id, { n: 0, dbSum: 0, dbN: 0, items: [], moods: {}, moodN: 0 }]));
  for (const e of entries) {
    const s = out.get(e.placeId);
    if (!s) continue;
    if (hour != null && (e.hour == null || !near(e.hour, hour, win))) continue;
    s.n++;
    s.items.push(e);
    if (Number.isFinite(e.db)) { s.dbSum += e.db; s.dbN++; }
  }
  for (const p of posts) {
    const s = out.get(p.placeId);
    if (!s || !p.mood) continue;
    if (hour != null) { const h = p.hour; if (h == null || !near(h, hour, win)) continue; }
    s.moods[p.mood] = (s.moods[p.mood] || 0) + 1;
    s.moodN++;
  }
  // 安静：把平均响度映射到 0..1。-35 dBFS 及以下算最静（1），-12 dBFS 及以上算最吵（0）
  for (const s of out.values()) {
    s.db = s.dbN ? s.dbSum / s.dbN : null;
    s.quiet = s.db == null ? 0 : Math.max(0, Math.min(1, (-12 - s.db) / 23));
    let best = null;
    for (const [k, v] of Object.entries(s.moods)) if (!best || v > s.moods[best]) best = k;
    s.mood = best;
  }
  return out;
}

/** 一样量在一个地点上的值（0..1 之前的原始值）与颜色键。 */
export function valueOf(s, metric) {
  if (metric === 'count') return s.n;
  if (metric === 'quiet') return s.dbN ? s.quiet : 0;
  if (metric === 'mood') return s.moodN;
  return 0;
}

/** 图例那一句：口径和 n。 */
export function legendLine(stats, metric, { hour = null, demo = 0 } = {}) {
  const all = [...stats.values()];
  const when = hour == null ? '全天' : `${Math.floor(hour)} 时前后一个半小时`;
  if (metric === 'count') return `${when} · ${all.reduce((a, s) => a + s.n, 0)} 张 · 16 个地方`;
  if (metric === 'quiet') { const n = all.reduce((a, s) => a + s.dbN, 0); return `${when} · ${n} 张量过响度（示意盘量的是合成的声音）`; }
  const n = all.reduce((a, s) => a + s.moodN, 0);
  return `${when} · ${n} 帖选了心情${demo ? `（其中示例 ${demo}）` : ''}`;
}
