// 刻声 · 年轮：同一个地点 × 不同学期。纯函数，页面和单测共用。
// 一条声片在这里只需要：id、placeId、semester、at（ISO，带时区）、slot、week、author（落款快照）、mine。
// 文案由数据生成：有几个学期、几个人、上一位是谁——不写死任何「温情」句子，数据不够就少说。
import { semesterSeq, semesterLabel, SLOT_WORD } from './semester.js';
import { signature } from './identity.js';
import { counts, tallyText, countsInReal } from './tier.js';

const DAY = 86400000;
// at 可能是 UTC（…Z）也可能带 +08:00：一律按时刻比，不按字符串比
const T = (at) => Date.parse(at) || 0;
export const byTime = (a, b) => T(a.at) - T(b.at);

/** 一个地点的年轮：按学期从早到晚分圈，圈内按时间排。 */
export function ringsOf(list, placeId) {
  return ringsOfList(list.filter((e) => e.placeId === placeId));
}

/** 任意一组声片按学期分圈（一个人的柜子也这样排：一个学期一圈，不管在哪个地点）。 */
export function ringsOfList(list) {
  const here = list.filter((e) => semesterSeq(e.semester) != null);
  const by = new Map();
  for (const e of here) {
    const k = e.semester;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  return [...by.entries()]
    .map(([semester, items]) => ({ semester, seq: semesterSeq(semester), items: items.sort(byTime) }))
    .sort((a, b) => a.seq - b.seq);
}

/** 不同的人：只数 real（口径在 tier.js counts，这里不另算）。 */
export function peopleOf(list) {
  return counts(list).people;
}

/** 「3 天前」「上周」「两个学期前」这一类相对说法（以 now 为准，只用于句子里）。 */
export function ago(at, now) {
  const d = Math.floor((now - new Date(at).getTime()) / DAY);
  if (!Number.isFinite(d)) return '';
  if (d <= 0) return '今天';
  if (d === 1) return '昨天';
  if (d < 14) return `${d} 天前`;            // 「1 周前」比「10 天前」含糊，两周内都报天数
  if (d < 31) return `${Math.round(d / 7)} 周前`;
  if (d < 365) return `${Math.round(d / 30)} 个月前`;
  return `${Math.round(d / 365)} 年前`;
}

export function when(e) {
  const w = e.week ? `第 ${e.week} 周` : '';
  return `${semesterLabel(e.semester)}${w ? ' · ' + w : ''}${e.slot ? ' · ' + (SLOT_WORD[e.slot] || e.slot) : ''}`;
}

/**
 * 刚刻完一张之后的那句话。e = 刚刻的这张（已在 list 里）。
 * 例：「新主楼在 2026 秋的第 3 张，你在北航的第 1 张。上一位在这里刻的是 2023级 · 仪器学院 · 小周，2 周前的晚上。」
 */
export function landingLine(list, e, placeName, { now = Date.now(), mineCount = null, history = null } = {}) {
  // 「第几张 / 上一位 / 几圈年轮」说的都是人留下的盘：只看 real（tier.js countsInReal）
  const real = list.filter((x) => countsInReal(x) && x.visibility !== 'private');
  const rings = ringsOf(real, e.placeId);
  const ring = rings.find((r) => r.semester === e.semester);
  const nth = ring ? ring.items.findIndex((x) => x.id === e.id) + 1 : 1;
  const mc = mineCount ?? list.filter((x) => x.mine).length;
  const parts = [`${placeName}在 ${semesterLabel(e.semester)}的第 ${nth} 张，你在北航刻的第 ${mc} 张。`];
  const before = real
    .filter((x) => x.placeId === e.placeId && x.id !== e.id && !x.mine && T(x.at) < T(e.at))
    .sort((a, b) => byTime(b, a))[0];
  const past = (history || []).filter((h) => h.placeId === e.placeId);
  if (before) {
    const who = before.author && signature(before.author) !== '未落款' ? signature(before.author) : '一位没落款的人';
    parts.push(`上一位在这里留下声音的是 ${who}，${ago(before.at, now)}的${SLOT_WORD[before.slot] || '某个时候'}。`);
  } else {
    // 有史料的地方，「没有人留下过声音」不成立：只说没人在这里刻过
    // 有史料或藏片的地方，「没有人留下过声音」不成立：只说没人在这里刻过
    const stocked = past.length || list.some((x) => x.placeId === e.placeId && x.id !== e.id && !countsInReal(x));
    parts.push(stocked ? '在你之前，还没有人在这里刻过。' : '在你之前，这里没有人留下过声音。');
  }
  const pl = pastLine(past, e.at);
  if (pl) parts.push(pl);
  if (rings.length > 1) {
    const first = rings[0];
    parts.push(`这里最早的一张在 ${semesterLabel(first.semester)}；到今天是 ${rings.length} 圈年轮。`);
  }
  return parts.join('');
}

/** 「2008 年 8 月 11 日」：史料的日期是日历日（YYYY-MM-DD），不带时区，不换算。 */
export function dayText(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  return m ? `${+m[1]} 年 ${+m[2]} 月 ${+m[3]} 日` : '';
}

/** 两个日子之间满了几年（到了周年才算一年）。 */
export function yearsBetween(from, to) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(from || '')), b = new Date(to);
  if (!a || Number.isNaN(b.getTime())) return null;
  const y = b.getFullYear() - +a[1], md = (b.getMonth() + 1) * 100 + b.getDate() < +a[2] * 100 + +a[3];
  return y - (md ? 1 : 0);
}

/**
 * 刻下的这张和这个地点的史料对照的一句（tier: archival，src/web/tier.js）。史料不计张数，这句话也不报张数。
 * 取最早的一段：知道事件日期的报日期和隔了几年；只知道发布日期的（口述）只说是哪年发布的、讲了什么。
 */
export function pastLine(past, at) {
  const list = (past || []).filter((h) => h && h.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const h = list[0];
  if (!h) return '';
  if (h.dateKind === 'event') {
    const y = yearsBetween(h.date, at);
    return `这里存着的最早一段声音，是 ${dayText(h.date)}${h.event}${y != null && y > 0 ? `；你这张和它隔着 ${y} 年` : ''}。`;
  }
  return `这里存着一段 ${String(h.date).slice(0, 4)} 年发布的口述：${String(h.what || h.title).replace(/。$/, '')}。`;
}

/** 一个地点的概括：「4 个学期，从 2023 秋到 2026 秋，2 个人留下 4 张。」——计数句式见 tier.js tallyText。
 *  张数算这个地点的全部公开条目（史料没有学期也算藏片）；「几个学期」只看有学期的。 */
export function placeLine(list, placeId, current) {
  const here = list.filter((e) => e.placeId === placeId && e.visibility !== 'private');
  const tally = tallyText(counts(here));
  if (!tally) return `还没有人在这里刻过。${current ? semesterLabel(current) + '的第一张会是谁的？' : ''}`;
  const rings = ringsOfList(here);
  const span = rings.length > 1 ? `${rings.length} 个学期，从 ${semesterLabel(rings[0].semester)}到 ${semesterLabel(rings.at(-1).semester)}，` : rings.length ? `${semesterLabel(rings[0].semester)}，` : '';
  return `${span}${tally}。`;
}

/** 整个馆藏的一行：随数据变。「4 个学期 · 16 个地点 · 231 张藏片 · 还没有人在这里留下落款」 */
export function campusLine(list, current, isPlace = () => true) {
  const pub = list.filter((e) => e.visibility !== 'private');
  const tally = tallyText(counts(pub));
  if (!tally) return `学院路馆藏还是空的。${current ? semesterLabel(current) + '的' : ''}第一张声片，还没有人刻。`;
  const sems = new Set(pub.map((e) => e.semester).filter(Boolean));
  const places = new Set(pub.map((e) => e.placeId).filter((id) => id && isPlace(id)));
  const head = sems.size > 1 ? `${sems.size} 个学期 · ` : sems.size ? `${semesterLabel([...sems][0])} · ` : '';
  return `${head}${places.size} 个地点 · ${tally}。`;
}

/** 「我的」：跨了几个学期、走过几个地点。 */
export function mineLine(mine) {
  if (!mine.length) return '你还没有刻过。选一个地点，按住「在这里刻」。';
  const sems = new Set(mine.map((e) => e.semester).filter(Boolean)).size;
  const places = new Set(mine.map((e) => e.placeId).filter(Boolean)).size;
  const kept = mine.filter((e) => e.archived).length;
  return `你在北航刻了 ${mine.length} 张，走过 ${places} 个地点${sems > 1 ? `，跨了 ${sems} 个学期` : ''}。${kept ? `其中 ${kept} 张已入馆。` : '都还在你的柜子里，没入馆。'}`;
}

/** 一个人的柜子：「2018级 · 数学学院 · 小鹿：9 个学期，走过 8 个地点，留下 12 张。最早一张在 2019 秋。」 */
export function personLine(list, who) {
  if (!list.length) return `${who}还没有留下声音。`;
  const rings = ringsOfList(list);
  const places = new Set(list.map((e) => e.placeId).filter(Boolean)).size;
  const span = rings.length > 1 ? `${rings.length} 个学期，` : '';
  const first = rings.length ? `最早一张在 ${semesterLabel(rings[0].semester)}。` : '';
  return `${who}：${span}走过 ${places} 个地点，留下 ${list.length} 张。${first}`;
}

/**
 * 往年的今天：往年（不含今年）同一个月日前后 days 天里留下的声片，近的年份在前。
 * 只看月日，不看星期；跨年的边界（12 月底 / 1 月初）按日历日的差算。
 */
export function onThisDay(list, now = new Date(), days = 3) {
  const y = now.getFullYear();
  const out = [];
  for (const e of list) {
    const d = new Date(e.at);
    if (Number.isNaN(d.getTime()) || d.getFullYear() >= y) continue;
    const same = new Date(y, d.getMonth(), d.getDate());
    const diff = Math.abs(Math.round((same - new Date(y, now.getMonth(), now.getDate())) / DAY));
    if (Math.min(diff, 365 - diff) <= days) out.push(e);
  }
  return out.sort((a, b) => new Date(b.at).getFullYear() - new Date(a.at).getFullYear() || byTime(a, b));
}

/** 时段 → 年轮图上的角度（从正上方顺时针，度）：按一天 24 小时排，夜在顶上。 */
export function hourAngle(at) {
  const d = new Date(at);
  const h = d.getHours() + d.getMinutes() / 60;
  return (h / 24) * 360;
}

export { DAY };
