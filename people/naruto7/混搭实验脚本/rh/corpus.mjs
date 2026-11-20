import fs from 'fs';
import { pinyin } from 'pinyin-pro';
import ToJyutping from 'to-jyutping';

const data = JSON.parse(fs.readFileSync('tang.json', 'utf8'));
const all = data.map((p) => p.paragraphs.join('')).join('');
const cnt = (cs) => cs.split('').reduce((a, c) => a + (all.split(c).length - 1), 0);
console.log('poems', data.length, '| traditional-only chars', cnt('國風長門頭見來書與還'), '| simplified-only chars', cnt('国风长门头见来书与还'));

const splitLines = (paras) => paras.join('').split(/[，。！？、；：,.!?;:]/).map((s) => s.trim()).filter(Boolean);
const regular = [];
for (const p of data) {
  const lines = splitLines(p.paragraphs);
  const n = lines[0] ? lines[0].length : 0;
  if (![5, 7].includes(n)) continue;
  if (!lines.every((l) => l.length === n)) continue;
  if (![4, 8].includes(lines.length)) continue;
  regular.push(lines);
}
console.log('regular 5/7-char 4- or 8-line poems:', regular.length);

const GROUP = {};
const add = (g, arr) => arr.forEach((f) => (GROUP[f] = g));
add('a', ['a', 'ia', 'ua']); add('o', ['o', 'e', 'uo']); add('ie', ['ie', 'üe', 'ue']);
add('i', ['i', 'ü', 'er', 'v']); add('u', ['u']); add('ai', ['ai', 'uai']); add('ei', ['ei', 'ui', 'uei']);
add('ao', ['ao', 'iao']); add('ou', ['ou', 'iu', 'iou']); add('an', ['an', 'ian', 'uan', 'üan', 'van']);
add('en', ['en', 'in', 'un', 'ün', 'uen', 'vn']); add('ang', ['ang', 'iang', 'uang']);
add('eng', ['eng', 'ing', 'ong', 'iong', 'ueng']);

const jpRime = (jp) => {
  if (!jp) return null;
  const m = jp.match(/^(ng|gw|kw|[bpmfdtnlgkhwzcsj])?(.*?)([1-6])$/);
  if (!m) return null;
  return m[2] === '' ? (m[1] || null) : m[2];
};

let n = 0, skipM = 0, skipC = 0, mand = 0, cant = 0, both = 0, onlyM = 0, onlyC = 0, mandStrict = 0;
const missed = {};
for (const lines of regular) {
  const idx = lines.length === 4 ? [1, 3] : [1, 3, 5, 7];
  const mk = [], ms = [], ck = [];
  let bad = false;
  for (const i of idx) {
    const f = pinyin(lines[i], { pattern: 'final', toneType: 'none', type: 'array' });
    const last = f[f.length - 1];
    const list = ToJyutping.getJyutpingList(lines[i]);
    const jp = list && list.length ? list[list.length - 1][1] : null;
    const r = jpRime(jp);
    const g = GROUP[last];
    if (!g || !r) { bad = true; if (!g) missed[last] = (missed[last] || 0) + 1; continue; }
    mk.push(g); ms.push(last); ck.push(r);
  }
  if (bad || mk.length !== idx.length) { skipM++; continue; }
  n++;
  const same = (a) => new Set(a).size === 1;
  const M = same(mk), C = same(ck);
  mand += M; cant += C; both += M && C; onlyM += M && !C; onlyC += !M && C; mandStrict += same(ms);
}
const pct = (x) => (100 * x / n).toFixed(1) + '%';
console.log('analysed poems', n, '| skipped (unreadable char/rime)', skipM);
console.log('all rhyme words in one group: Mandarin 13-rhyme', pct(mand), '| Mandarin exact final', pct(mandStrict), '| Cantonese exact rime', pct(cant));
console.log('Cantonese only', pct(onlyC), '| Mandarin only', pct(onlyM), '| both', pct(both), '| neither', (100 * (n - both - onlyM - onlyC) / n).toFixed(1) + '%');
console.log('unmapped mandarin finals (top):', JSON.stringify(missed).slice(0, 160));
