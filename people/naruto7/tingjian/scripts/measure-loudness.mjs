// 给示意盘量响度：用页面同一个合成器生成每一张，算整段均方根（dBFS），写进 public/data/loudness.json。
// 示意盘的声音是合成的，所以响度也是合成声音的响度，页面上和示意盘一样标「示意」。真实录音的响度由服务端在收到 WAV 时算（server/api.mjs inspectWav）。
//   node scripts/measure-loudness.mjs        （约半分钟）
import fs from 'node:fs';
import { synthClip } from '../src/kesheng/web/plan3d/sounds.js';

const FS = 16000;   // 均方根和采样率关系不大，16 kHz 够用，比 48 kHz 快三倍
const cat = JSON.parse(fs.readFileSync('public/data/demo-catalog.json', 'utf8'));
const db = {};
for (const e of cat.entries) {
  if (!e.synth) continue;
  const x = synthClip(e.synth.v, e.synth.seed, e.seconds || 10, FS);
  let q = 0;
  for (const v of x) q += v * v;
  db[e.id] = Math.round(10 * Math.log10(q / x.length + 1e-12) * 10) / 10;
}
const out = { v: 1, unit: 'dBFS', note: '示意盘的响度：页面合成的声音整段的均方根。生成：scripts/measure-loudness.mjs', fs: FS, db };
fs.writeFileSync('public/data/loudness.json', JSON.stringify(out) + '\n');
console.log(`public/data/loudness.json：${Object.keys(db).length} 张`);
