import { pinyin } from 'pinyin-pro';
import ToJyutping from 'to-jyutping';
const poems = [
  ['杜甫《春望》', '深心金簪'],
  ['王之涣《登鹳雀楼》', '流楼'],
  ['李益《江南曲》', '期儿'],
  ['杜牧《清明》', '纷魂村'],
  ['岳飞《满江红》', '歇烈月切雪灭缺血阙'],
  ['李白《静夜思》', '光霜乡'],
];
const finalM = (c) => pinyin(c, { pattern: 'final', toneType: 'none' });
const jp = (c) => { const t = ToJyutping.getJyutpingText(c); return t; };
const rime = (j) => { const m = j.match(/^(?:ng|[bpmfdtnlgkhwzcsj]|gw|kw)?(.*?)\d?$/); return m ? m[1] : j; };
for (const [name, chars] of poems) {
  const M = [...chars].map(finalM);
  const J = [...chars].map(jp);
  const Jr = J.map(rime);
  const same = (a) => new Set(a).size === 1;
  console.log(name.padEnd(14), 'Mandarin', M.join('/'), same(M) ? 'SAME' : 'diff', '|', 'Cantonese', J.join('/'), '->', Jr.join('/'), same(Jr) ? 'SAME' : 'diff');
}
