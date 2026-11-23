// 数据自检：npm run check:sounds
// 检查声音和话题数据是否合规，并打印"关于"页用的两个数（真实、示例）。
import { SEED_SOUNDS, MOODS } from '../src/data/sounds.js';
import { TOPICS } from '../src/data/topics.js';
import { BLOCKS } from '../src/data/campus.js';
import { RECIPES } from '../src/lib/synth.js';
import { COHORTS, SEED_ECHOES, SEED_HEARD } from '../src/data/community.js';
import { validateLine } from '../src/lib/rules.js';

const errors = [];
const err = (m) => errors.push(m);

const ids = new Set();
for (const s of SEED_SOUNDS) {
  if (!/^snd-\d{3}$/.test(s.id)) err(`${s.id}: id 格式应为 snd-三位数`);
  if (ids.has(s.id)) err(`${s.id}: id 重复`);
  ids.add(s.id);
  if (!s.title || s.title.length > 12) err(`${s.id}: 标题为空或超过 12 字`);
  if (!BLOCKS.some((b) => b.id === s.block)) err(`${s.id}: 分区 ${s.block} 不存在`);
  if (!Array.isArray(s.at) || s.at.length !== 2 || s.at.some((v) => v < 0 || v > 1)) err(`${s.id}: at 要是 [0,1] 内的两个数`);
  if (!(s.hour >= 0 && s.hour < 24)) err(`${s.id}: hour 要在 0 到 24 之间`);
  if (!MOODS.includes(s.mood)) err(`${s.id}: 心情 ${s.mood} 不在列表里`);
  if (!s.src && !RECIPES[s.recipe]) err(`${s.id}: 既没有 src，也没有可用的合成配方`);
  if (s.demo === false && !s.src) err(`${s.id}: 标成真实录音却没有 src`);
  if (s.demo === true && s.by !== '示例') err(`${s.id}: 示例声音的 by 应写"示例"`);
  if (s.story && s.story.length > 150) err(`${s.id}: story 超过 150 字`);
}

for (const t of TOPICS) {
  for (const id of t.soundIds) if (!ids.has(id)) err(`话题 ${t.id}: 引用了不存在的声音 ${id}`);
  for (const r of t.replies) if (!r.demo) err(`话题 ${t.id}: 预置回应必须标 demo`);
}

const byId = new Map(SEED_SOUNDS.map((s) => [s.id, s]));
const echoIds = new Set();
for (const e of SEED_ECHOES) {
  if (echoIds.has(e.id)) err(`回声 ${e.id}: id 重复`);
  echoIds.add(e.id);
  const s = byId.get(e.soundId);
  if (!s) err(`回声 ${e.id}: 引用了不存在的声音 ${e.soundId}`);
  else if (!(e.t >= 0 && e.t <= s.duration)) err(`回声 ${e.id}: t=${e.t} 超出这段声音的时长 ${s.duration} 秒`);
  if (!COHORTS.includes(e.cohort)) err(`回声 ${e.id}: 入学年份 ${e.cohort} 不在列表里`);
  if (!e.demo) err(`回声 ${e.id}: 预置回声必须标 demo`);
  const bad = validateLine(e.text, 40);
  if (bad) err(`回声 ${e.id}: ${bad}`);
}
for (const [id, list] of Object.entries(SEED_HEARD)) {
  if (!byId.has(id)) err(`同听数据引用了不存在的声音 ${id}`);
  for (const c of list) if (!COHORTS.includes(c)) err(`同听 ${id}: 入学年份 ${c} 不在列表里`);
}
for (const t of TOPICS) for (const r of t.replies) {
  if (!COHORTS.includes(r.cohort)) err(`话题 ${t.id} 回应 ${r.id}: 缺少或写错入学年份`);
  const bad = validateLine(r.text, 60);
  if (bad) err(`话题 ${t.id} 回应 ${r.id}: ${bad}`);
}

const real = SEED_SOUNDS.filter((s) => !s.demo).length;
const demo = SEED_SOUNDS.length - real;
console.log(`声音：共 ${SEED_SOUNDS.length} 段，真实 ${real}，示例 ${demo}`);
console.log(`回声：${SEED_ECHOES.length} 条（全部示例），同听数据覆盖 ${Object.keys(SEED_HEARD).length} 段声音`);
console.log(`话题：${TOPICS.length} 个，预置回应 ${TOPICS.reduce((n, t) => n + t.replies.length, 0)} 条（全部示例）`);

if (errors.length) {
  console.error(`\n发现 ${errors.length} 个问题：`);
  errors.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log('数据检查通过。');
