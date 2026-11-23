// 刻声 · 素材分层（纯函数，单测覆盖：test/unit/tier.test.js）
// 口径（docs/SEASON-DEMO-v1.md）：一条声片只有三种来源，且只有 real 能进计数与检索。
//   real     = 用户/采样的现场十秒（有作者、有地点、有时刻）——唯一能说"这是北航某地某时的声片"
//   archival = 史料（校史/奥运等）——**必须显式声明 tier:'archival'**，不许从字段猜
//   synthetic= 示意（虚构凑满四季的那部分）——画面可以满，但计数与检索一律不算它
// 判据：任何"大盘看起来是满的"都不许让 real 计数变大；示意的存在必须在 labelOf 里可见。
// 为什么单独一个模块：r3 包里的 demo-catalog.json 已有 demo / synth 两个布尔，
// 但"是否计入第 N 张""是否进检索""UI 上要不要标出来"这三件事散落在页面里就会各走各的。

import { signature } from './identity.js';

export const TIERS = ['real', 'archival', 'synthetic'];

/**
 * 一条声片的来源。显式 tier 优先，其次才是旧字段（synth / demo）。
 * 非法的显式 tier 返回 'invalid'，**不静默降级成 real**——拼错的 'historcal' 比缺字段更危险。
 * @returns {'real'|'archival'|'synthetic'|'invalid'}
 */
export function tierOf(entry) {
  if (!entry || typeof entry !== 'object') return 'invalid';
  if (entry.tier !== undefined) return TIERS.includes(entry.tier) ? entry.tier : 'invalid';
  if (entry.synth === true || entry.demo === true) return 'synthetic';
  return 'real';
}

/** 只有 real 计入"全校第 N 张 / 本季 N 声"与署名聚合。 */
export function countsInReal(entry) {
  return tierOf(entry) === 'real';
}

/** 听声寻片（检索）只认 real，且必须能落到一个地点与一个时刻。 */
export function indexable(entry) {
  return tierOf(entry) === 'real' && !!entry.placeId && !!entry.at;
}

/** UI 上必须显示的唯一标记来源：示意 / 史料 / 不标。文案与颜色由页面定，判定只在这里。 */
export function labelOf(entry) {
  const t = tierOf(entry);
  if (t === 'synthetic') return '示意';
  if (t === 'archival') return '史料';
  return null;
}

/**
 * 四季大盘的聚合。visual 给画面用，real 给计数与"待参与"用。
 * pending 的语义：这一季真实为 0 ⇒ 仍然显示"待参与"邀请，哪怕画面上已经铺满了示意。
 * @returns {Record<string, {visual: number, real: number, synthetic: number, pending: boolean}>}
 */
export function seasonView(entries) {
  const out = {};
  for (const e of entries || []) {
    const key = e && e.semester;
    if (!key) continue;
    const t = tierOf(e);
    const b = (out[key] ||= { visual: 0, real: 0, synthetic: 0, pending: true });
    b.visual += 1;
    if (t === 'real') b.real += 1;
    else if (t === 'synthetic') b.synthetic += 1;
  }
  for (const b of Object.values(out)) b.pending = b.real === 0;
  return out;
}

/**
 * 放行前的校验。坏一条就整份不放行——概念污染一旦进大盘，事后没人分得清哪条是真的。
 *
 * 时刻（`at`）的规则分两种（2026-10-21 修订）：`real` / `synthetic` 必须有 `at`（要上时间轴、要检索）；
 * `archival` 允许**没有** `at`——史料常常"哪年哪月不知道"，逼它填时刻等于逼人编一个。
 * 一旦给它填了 `semester`，就必须同时有 `at`，否则那一格的时间是空的。
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateCatalog(entries) {
  const errors = [];
  if (!Array.isArray(entries)) return { ok: false, errors: ['catalog 不是数组'] };
  entries.forEach((e, i) => {
    const who = (e && e.id) || `#${i}`;
    const t = tierOf(e);
    if (t === 'invalid') {
      errors.push(`${who}: 非法 tier=${JSON.stringify(e && e.tier)}（只认 ${TIERS.join(' / ')}）`);
      return;
    }
    if (!e.placeId) errors.push(`${who}: 缺 placeId，画不进大盘，也检索不到`);
    // 可见性（2026-10-21 预留）：只有 public / private 两种；缺省 = public。
    // 现在没有私密条目，但字段先放行——将来加"心事盘"时不用迁移数据。
    if (e.visibility !== undefined && !['public', 'private'].includes(e.visibility)) {
      errors.push(`${who}: visibility 只认 public / private，收到 ${JSON.stringify(e.visibility)}`);
    }
    const needsAt = t !== 'archival' || e.semester !== undefined;
    if (needsAt && !e.at) errors.push(`${who}: 缺 at（时刻），无法判断它属于哪一季`);
    if (e.semester !== undefined && !/^\d{4}-\d{4}-[123]$/.test(String(e.semester))) {
      errors.push(`${who}: semester 格式应为 YYYY-YYYY-N，收到 ${JSON.stringify(e.semester)}`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/**
 * 计数的唯一出口（SPEC-DIGEST-1 §2 ④：页面不许自己 filter / 累加）。
 * - total：屏幕上能看见的盘（不含私密）——「藏片」只用这个数
 * - real / concept / archival：按 tierOf 分；concept = synthetic
 * - people：**只数 real** 里有落款的不同的人（作者摘要优先，其次落款文字）；虚构署名永远进不来
 * - 私密盘（visibility:'private'）哪个数都不进
 * @returns {{total:number, real:number, concept:number, archival:number, people:number}}
 */
export function counts(entries) {
  const out = { total: 0, real: 0, concept: 0, archival: 0, people: 0 };
  const who = new Set();
  for (const e of entries || []) {
    if (!e || e.visibility === 'private') continue;
    const t = tierOf(e);
    if (t === 'invalid') continue;
    out.total += 1;
    if (t === 'real') {
      out.real += 1;
      const a = e.author;
      const s = a ? signature(a) : '未落款';
      const k = a && (a.key || (s !== '未落款' ? s : null));
      if (k) who.add(k);
    } else if (t === 'synthetic') out.concept += 1;
    else out.archival += 1;
  }
  out.people = who.size;
  return out;
}

/**
 * §3.2.1 计数句式。两个数不在一句里混说，除非 N 全是 real。
 *   全 real            → 「M 个人留下 N 张」
 *   全 real、没人落款   → 「N 张 · 没落款的人」
 *   混合               → 「N 张藏片 · M 位参与者」
 *   混合、M = 0        → 「N 张藏片 · 还没有人在这里留下落款」
 * total = 0 返回空串，由调用方说邀请句。
 */
export function tallyText(c) {
  if (!c || !c.total) return '';
  if (c.real === c.total) return c.people ? `${c.people} 个人留下 ${c.total} 张` : `${c.total} 张 · 没落款的人`;
  return c.people ? `${c.total} 张藏片 · ${c.people} 位参与者` : `${c.total} 张藏片 · 还没有人在这里留下落款`;
}
