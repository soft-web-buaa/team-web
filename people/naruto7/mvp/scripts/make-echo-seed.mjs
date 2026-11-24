// 生成示例回声：public/kesheng/src/web/plan3d/echo-seed.json。
// 回声钉在合成声里真正发生的那一秒：脚本把每张盘的声音按页面同一套配方合成出来，
// 取 100 毫秒窗里最响的那一刻（at: 'peak'），或者写死一个秒数（at: 数字）。声音配方改了，重跑一次。
// 这些话是示例（demo），不是哪位同学说的：只写年级，不写学院、不写名字，页面上一律标「示例」。
// 用法：node scripts/make-echo-seed.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { synthClip } from '../public/kesheng/src/web/plan3d/sounds.js';
import { validateLine } from '../public/kesheng/src/web/community.js';

const dir = fileURLToPath(new URL('../public/kesheng/src/web/plan3d/', import.meta.url));
const catalog = JSON.parse(fs.readFileSync(dir + 'demo-catalog.json', 'utf8'));
const discs = new Map((catalog.entries || catalog).map((e) => [e.id, e]));
const FS = 48000;

// [盘号, 钉在哪一秒（'peak' = 最响的那一刻 / 数字 / 'tail' = 结尾前一秒半）, 年级, 一句话]
const SPEC = [
  ['concept-033', 'peak', '2025级', '铃一响，后排的人已经把书合上了。'],
  ['concept-033', 7.5, '2021级', '毕业那天我站在楼梯口，等它响完才走。'],
  ['concept-030', 'peak', '2023级', '考试最后十分钟，我一直盯着钟等这一声。'],
  ['concept-017', 'peak', '2020级', '楼梯口先是一阵脚步，然后有人喊了谁的名字。'],
  ['concept-028', 'peak', '2024级', '门关上以后，整间教室又回答了一遍。'],
  ['concept-007', 'peak', '2023级', '叮的一声之后，整层楼的椅子一起往后拉。'],
  ['concept-007', 'tail', '2022级', '出门的时候，管理员还在后面说慢点走。'],
  ['concept-016', 'peak', '2025级', '中庭里有人咳了一声，三楼都听见了。'],
  ['concept-004', 'peak', '2023级', '还书的人多的时候，脚步声比翻书声还响。'],
  ['concept-012', 'peak', '2025级', '约好在门口见，两个人都在问你到了吗。'],
  ['concept-048', 'peak', '2026级', '刷过去的这一声，是我在学校的第一声。'],
  ['concept-045', 'peak', '2024级', '连廊上风大，脚步声被吹得很碎。'],
  ['concept-051', 'peak', '2019级', '铃响以后，座位上的小声说话才真正停下来。'],
  ['concept-055', 'peak', '2021级', '散场的时候，大家说话都比平时轻一点。'],
  ['concept-065', 'peak', '2026级', '拍一下手，要等一会儿，房间才回答。'],
  ['concept-209', 'peak', '2021级', '叫到自己的号，反而没听清。'],
  ['concept-113', 'peak', '2019级', '托盘磕在一起，就知道今天人多。'],
  ['concept-118', 'peak', '2021级', '打饭的阿姨记得我不要香菜。'],
  ['concept-179', 'peak', '2022级', '哨声一响，才发现自己已经落后半圈。'],
  ['concept-185', 'peak', '2025级', '九月的夜里，虫叫比操场上的人多。'],
  ['concept-184', 'peak', '2024级', '夜跑的人都不说话，只有鞋底的声音。'],
  ['concept-087', 'peak', '2024级', '一声拍手，整个馆里转了两圈才停。'],
  ['concept-082', 'peak', '2021级', '进球那一下，我们这边先喊了出来。'],
  ['concept-143', 'peak', '2022级', '行李箱的轮子一响，隔着门就知道谁回来了。'],
  ['concept-162', 'peak', '2023级', '楼梯间里的回响，比教室里的好听。'],
  ['concept-158', 'peak', '2022级', '喜鹊叫的时候，我正在背单词。'],
  ['concept-220', 'peak', '2022级', '银杏叶落下来的声音，要安静了才听得见。'],
  ['concept-230', 'peak', '2025级', '下课十分钟，整栋楼像在换气。'],
  ['concept-111', 'peak', '2026级', '夜里的泳池，水声比人声大。'],
  ['concept-069', 'peak', '2021级', '展厅太大，咳嗽也像在发言。'],
  ['concept-079', 'peak', '2025级', '门口的风，是整个博物馆里最像飞机的声音。'],
  ['concept-171', 'peak', '2022级', '刷卡之后那一声滴，我每次都怀疑没通过。'],
  ['concept-194', 'peak', '2023级', '晚上的楼梯口，只剩最后一批人。'],
  ['concept-136', 'peak', '2024级', '叫号声一响，十个人同时低头看手机。'],
];

function loudest(e) {
  const x = synthClip(e.synth.v, e.synth.seed, e.seconds, FS), W = FS / 10;
  let best = -1, at = 0;
  for (let i = 0; i + W <= x.length; i += W) {
    let s = 0;
    for (let j = i; j < i + W; j++) s += x[j] * x[j];
    if (s > best) { best = s; at = i / FS; }
  }
  return at;
}

const echoes = SPEC.map(([discId, at, grade, text], i) => {
  const e = discs.get(discId);
  if (!e) throw new Error(`${discId} 不在 demo-catalog.json 里`);
  const bad = validateLine(text);
  if (bad) throw new Error(`${discId}：${bad}（${text}）`);
  const raw = at === 'peak' ? loudest(e) : at === 'tail' ? e.seconds - 1.5 : at;
  const t = Math.round(Math.min(Math.max(0, raw), e.seconds - 0.2) * 10) / 10;
  return { id: `ec-demo-${String(i + 1).padStart(3, '0')}`, discId, t, text, author: { grade } };
});

const out = {
  v: 1,
  note: '示例回声：话是写出来的示例，不是哪位同学说的；声音是页面合成的。只写年级，不写学院和名字。生成：scripts/make-echo-seed.mjs',
  echoes,
};
fs.writeFileSync(dir + 'echo-seed.json', JSON.stringify(out, null, 1) + '\n');
console.log(`写入 ${echoes.length} 条示例回声，覆盖 ${new Set(echoes.map((e) => e.discId)).size} 张盘。`);
for (const e of echoes.slice(0, 6)) console.log(`  ${e.discId}  ${String(e.t).padStart(4)} 秒  ${e.author.grade}  ${e.text}`);
