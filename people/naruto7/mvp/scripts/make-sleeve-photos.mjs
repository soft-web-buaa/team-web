// 给每个地点拍一张「模型照」：把留声机上那座纸模型的镜头推到该地点的针前，截一张方图，存成唱片套子的正面。
// 这是纸模型的照片，不是校园实拍；页面上套子角上一律写「模型照」。团队拍到实拍后，把同名 jpg 换进 sleeves/，
// 再把 sleeves.json 里这个地点的 kind 改成 "photo"、写上拍摄人和日期，角标就变成「实拍」。
// 用法：先 npm run dev -- --port 5199，再 BASE_URL=http://127.0.0.1:5199/ node scripts/make-sleeve-photos.mjs
//   参数 --only XY01,XY02 只重拍这几处。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from './e2e/browser.mjs';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5199/').replace(/\/?$/, '/');
const DIR = fileURLToPath(new URL('../public/kesheng/src/web/plan3d/', import.meta.url));
const OUT = DIR + 'sleeves/';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt > 0 ? process.argv[onlyAt + 1].split(',') : null;

const campus = await fetch(BASE + 'kesheng/src/web/plan3d/campus-xy.json').then((r) => r.json());
const places = campus.places.filter((p) => !only || only.includes(p.id));

const browser = await launch(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']);
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
await page.goto(BASE + 'kesheng/src/web/plan3d/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__plan && window.__plan.ready && window.__plan.risen && window.__plan.risen(), { timeout: 150000 });
await sleep(9000);
// 只留画布：把标签、按钮、卡片都藏起来
await page.addStyleTag({ content: '.labels,.quick,.quick-note,.slots,.hint,.hour,.legend,.cab-link,.back-home,.card,.scale,.first,.boot{display:none!important}' });

const meta = JSON.parse(fs.existsSync(DIR + 'sleeves.json') ? fs.readFileSync(DIR + 'sleeves.json', 'utf8') : '{"places":{}}');
for (const p of places) {
  const x = p.x / 10, y = p.y / 10;
  await page.evaluate((x, y) => window.__plan.view(x, y, 420, 0.98, -0.55), x, y);
  await sleep(3500);
  const buf = await page.screenshot({ type: 'jpeg', quality: 82, clip: { x: 150, y: 110, width: 800, height: 600 } });
  fs.writeFileSync(OUT + p.id + '.jpg', buf);
  meta.places[p.id] = { ...(meta.places[p.id] || {}), photo: `./sleeves/${p.id}.jpg`, kind: (meta.places[p.id] && meta.places[p.id].kind === 'photo') ? 'photo' : 'model', name: p.name };
  console.log(`${p.id} ${p.name}  ${(buf.length / 1024).toFixed(0)} KB`);
}
meta.note = meta.note || '唱片套子的正面照。kind: model = 纸模型照；photo = 团队实拍（要写 by 和 date）。';
fs.writeFileSync(DIR + 'sleeves.json', JSON.stringify(meta, null, 1) + '\n');
console.log(problems.length ? '问题:\n' + problems.join('\n') : '页面没有报错。');
await browser.close();
