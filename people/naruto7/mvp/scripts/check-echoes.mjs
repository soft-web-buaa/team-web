// 回声自检：npm run check:echoes
// 查三件事：示例回声的数据合规；舞台页（community.js）和 Vue 页面（src/lib/rules.js）的文字拦截规则一致；
// 每条示例回声钉的那一秒确实落在这张声片的长度里。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateLine as stageRule, ECHO_MAX } from '../public/kesheng/src/web/community.js';
import { validateLine as vueRule } from '../src/lib/rules.js';

const dir = fileURLToPath(new URL('../public/kesheng/src/web/plan3d/', import.meta.url));
const errors = [];
const err = (m) => errors.push(m);

const seed = JSON.parse(fs.readFileSync(dir + 'echo-seed.json', 'utf8'));
const cat = JSON.parse(fs.readFileSync(dir + 'demo-catalog.json', 'utf8'));
const discs = new Map((cat.entries || cat).map((e) => [e.id, e]));

const ids = new Set();
for (const e of seed.echoes) {
  if (ids.has(e.id)) err(`${e.id}: id 重复`);
  ids.add(e.id);
  const d = discs.get(e.discId);
  if (!d) { err(`${e.id}: 引用了不存在的声片 ${e.discId}`); continue; }
  if (!(e.t >= 0 && e.t <= d.seconds)) err(`${e.id}: t=${e.t} 超出这张声片的长度 ${d.seconds} 秒`);
  const bad = stageRule(e.text, ECHO_MAX);
  if (bad) err(`${e.id}: ${bad}`);
  if (!e.author || !/^\d{4}级$/.test(e.author.grade || '')) err(`${e.id}: 示例回声只写年级（形如 2025级）`);
  if (e.author && (e.author.name || e.author.dept || e.author.key)) err(`${e.id}: 示例回声不写名字、学院，也不带 key（带了会混进"几个人"）`);
  if (e.demo === false) err(`${e.id}: 预置回声必须是示例`);
}

// 两份规则对同一组句子给出同样的结论
const samples = [
  '', '   ', '正常的一句话。', '很'.repeat(ECHO_MAX), '很'.repeat(ECHO_MAX + 1),
  '看 www.example.com', 'https://a.b', '我的网站 abc.cn', '加我微信', '私信我', 'vx 我', 'v信聊', '微信号是 abc',
  '13812345678', '1234567', '12 34 56 78', '三年前的今天', '2024年9月', 'qq号 123',
];
for (const s of samples) {
  const a = stageRule(s, ECHO_MAX), b = vueRule(s, ECHO_MAX);
  if (a !== b) err(`两份规则不一致：「${s.slice(0, 20)}」舞台页="${a}"，Vue 页面="${b}"`);
}

const perDisc = new Map();
for (const e of seed.echoes) perDisc.set(e.discId, (perDisc.get(e.discId) || 0) + 1);
console.log(`示例回声：${seed.echoes.length} 条，覆盖 ${perDisc.size} 张声片（全部示例）`);
console.log(`规则一致性：${samples.length} 句，舞台页与 Vue 页面结论相同`);

if (errors.length) {
  console.error(`\n发现 ${errors.length} 个问题：`);
  errors.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log('回声检查通过。');
