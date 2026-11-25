// 浏览器走查：构建 → 预览服务（自带 /api，本机文件存储，临时目录）→ 用本机 Chrome 走一遍主路径，退出码 0 才算过。
//   npm run e2e
// 麦克风用 Chrome 的假设备（一段 440 Hz 的嘟声）。两个独立的浏览器环境：A 刻一张、钉一句，B 看得到。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
process.env.KS_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-e2e-'));
await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 5198, host: '127.0.0.1' }, logLevel: 'error' });
const base = 'http://127.0.0.1:5198/';
const out = path.resolve('.e2e/run');
fs.mkdirSync(out, { recursive: true });
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args });
let pass = 0, fail = 0;
const problems = [];
let deleted = null;
const t = (name, cond) => { if (cond) { pass++; console.log('通过  ', name); } else { fail++; console.log('不通过', name); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(ctx, url, { screen = false, w = 1440, h = 900 } = {}) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
  await page.setViewport({ width: w, height: h });
  // 走查自己在真删之后去取那张的声音，预期就是 404：这一条不算问题
  page.on('console', (m) => { if (m.type() === 'error' && !(deleted && (m.location().url || '').includes(deleted))) problems.push(`[console] ${m.text()} ${m.location().url || ''}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) problems.push(`[requestfailed] ${r.url()}`); });
  if (!screen) await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('tj-entered', '1'); } catch { /* */ } });
  await page.goto(base + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage && window.__stage.frames > 2, { timeout: 60000 });
  return page;
}
// 等舞台到某个状态；超时不抛错，打出当时的状态（软件渲染一秒只有两三帧，给足时间）
async function until(page, fn, arg, ms = 60000) {
  try { await page.waitForFunction(fn, { timeout: ms, polling: 300 }, arg); return true; }
  catch { console.log('  等待超时，当时：', await page.evaluate(() => JSON.stringify({ mode: window.__stage && window.__stage.mode, place: window.__stage && window.__stage.place, flying: window.__stage && window.__stage.flying, frames: window.__stage && window.__stage.frames, hash: location.hash }))); return false; }
}
// 同一个标签页换网址（软件渲染时新开标签页会卡住）
async function go(page, url, { w = 1440, h = 900 } = {}) {
  await page.setViewport({ width: w, height: h });
  await page.goto(base + url, { waitUntil: 'load' });
  await until(page, () => window.__stage && window.__stage.frames > 2, null, 90000);
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent).catch(() => '');

// —— 1. 屏风 ——
console.log('— 1. 屏风');
const A = await browser.createBrowserContext();
let p = await open(A, '?h=18.4', { screen: true });
t('进站先看到屏风，四扇屏', (await p.$$('.screen .leaf')).length === 4);
t('屏风上的主句', (await text(p, '.screen .main')).includes('比我们在这里待得久'));
t('此刻所在的那一扇亮着（18:24 是昏）', (await text(p, '.leaf.now .w')) === '昏');
const css0 = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper'));
await p.waitForFunction(() => !document.querySelector('.hold[disabled]'), { timeout: 30000 });
const hold = await p.$('.hold');
const hb = await hold.boundingBox();
await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await p.mouse.down();
await p.waitForFunction(() => window.__stage.playing, { timeout: 20000 }).catch(() => {});
t('按住听：在放史料（口述北航 3）', (await p.evaluate(() => window.__stage.clip)) === 'arc-oral-ep3-043');
await sleep(2200);
t('听的时候字幕换成那句口述', (await text(p, '.screen .sub')).includes('荒地'));
await p.mouse.up();
await p.waitForFunction(() => !document.querySelector('.screen'), { timeout: 8000 }).catch(() => {});
t('松手：屏风折起来，进到留声机', !(await p.$('.screen')) && (await p.evaluate(() => window.__stage.mode)) === 'home');
t('进站一次只秀一次完整的开场', (await p.evaluate(() => window.__stage.shows().intro)) === 1);
t('天色是 18:24 的（纸不是白天的颜色）', css0 && css0.trim() !== 'rgb(247 247 244)');

// —— 2. 留声机 → 进一栋楼 → 楼被提起来 ——
console.log('— 2. 留声机 → 进一栋楼 → 楼被提起来');
await go(p, '?h=10#/');
await sleep(1500);
t('留声机：纸上列出这个钟点的盘', (await p.$$('.paper .disc-row')).length > 0);
const navs = await p.$$eval('.nav a', (as) => as.map((a) => a.textContent.replace(/\s+/g, '')));
t('四个板块：留声机、社区、年轮、我的', ['留声机', '社区', '年轮', '我的'].every((x, i) => navs[i] && navs[i].startsWith(x)));
await p.evaluate(() => { location.hash = '#/place/XY01'; });
await until(p, () => window.__stage.mode === 'place' && !window.__stage.flying);
await sleep(800);
t('进地点：图书馆那栋楼被提起来了', (await p.evaluate(() => window.__stage.heroLift('XY01'))) > 20);
t('地点页标题', (await text(p, '.paper .h1')) === '图书馆');
t('地点页有年轮', !!(await p.$('.paper .ring svg')));
await p.evaluate(() => { location.hash = '#/place/XY06'; });
await until(p, () => window.__stage.mode === 'place' && window.__stage.place === 'XY06' && !window.__stage.flying);
await until(p, () => window.__stage.heroLift('XY01') < 2 && window.__stage.heroLift('XY06') > 20, null, 20000);
t('换到体育馆：图书馆落回去，体育馆提起来', (await p.evaluate(() => window.__stage.heroLift('XY01'))) < 2 && (await p.evaluate(() => window.__stage.heroLift('XY06'))) > 20);
t('体育馆的从前：奥运举重的史料', (await text(p, '.paper')).includes('这里的从前'));
t('进地点的完整过场：每会话最多两次', (await p.evaluate(() => window.__stage.shows().enterPlace)) <= 3);

// —— 3. 社区：光柱升起来 ——
console.log('— 3. 社区：光柱升起来');
await p.evaluate(() => { location.hash = '#/community'; });
await until(p, () => window.__stage.mode === 'community');
await sleep(3500);
t('社区：光柱升起来了', (await p.evaluate(() => window.__stage.column('XY02'))) > 30);
await p.evaluate(() => { location.hash = '#/community?tab=board'; });
await until(p, () => document.querySelectorAll('.paper [role=radiogroup] .chip').length >= 4, null, 20000);
const chips = await p.$$('.paper [role=radiogroup] .chip');
await chips[1].click();
await sleep(1500);
t('社区：图层切到「本学期」，说明跟着换', (await text(p, '.paper')).includes('只数这个学期'));

// —— 4. 年轮：拖时针，整站变色 ——
console.log('— 4. 年轮：拖时针，整站变色');
await p.evaluate(() => { location.hash = '#/time'; });
await until(p, () => window.__stage.mode === 'time');
await sleep(1000);
const before = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
await p.$eval('.dayline input', (el) => { el.value = '22.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForFunction(() => document.documentElement.dataset.dark === '1', { timeout: 5000 }).catch(() => {});   // 渐变 0.9 秒；慢机器上留余量
const after = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
t('年轮：拖到 22:30，整站的纸变成夜里的颜色', before !== after && (await p.evaluate(() => document.documentElement.dataset.dark)) === '1');
t('右上角写明在看别的钟点，给「回到此刻」', !!(await p.$('.clock .back')));
await p.click('.clock .back');
await sleep(1500);
t('回到此刻', !(await p.$('.clock .back')));
const tabs = await p.$$('.paper [role=tab]');
await tabs[2].click();
await sleep(400);
t('一代人：校史时间线，每条有出处', (await p.$$('.era li')).length >= 10);

// —— 5. 刻一张（假麦克风）→ 选地点 → 发出去 → 落到针上 ——
console.log('— 5. 刻一张（假麦克风）→ 选地点 → 发出去 → 落到针上');
await p.evaluate(() => { location.hash = '#/place/XY04'; });
await until(p, () => window.__stage.place === 'XY04' && !window.__stage.flying);
const press = await p.$('.press');
const pb = await press.boundingBox();
await p.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
await p.mouse.down();
await p.waitForFunction(() => document.querySelector('.press.is-rec') && /秒/.test(document.querySelector('.press span').textContent), { timeout: 15000 }).catch(() => {});
await sleep(2600);
await p.mouse.up();
await p.waitForSelector('.rec-sheet', { timeout: 10000 }).catch(() => {});
t('按住刻：松手后出现「它是在哪儿录的」', !!(await p.$('.rec-sheet')));
t('在地点页里按，地点预选为晨兴音乐厅', (await text(p, '.rec-sheet .chip.on')) === '晨兴音乐厅');
await p.type('.rec-sheet input.input', '排练前调音');
await p.click('.rec-sheet .btn');
await p.waitForFunction(() => !document.querySelector('.rec-sheet'), { timeout: 20000 }).catch(() => {});
await sleep(1500);
const mine = await p.evaluate(async () => { const r = await fetch('/api/discs'); return (await r.json()).discs.filter((d) => d.note === '排练前调音'); });
t('发出去了：云上有这一张（地点、时段、学期由服务端算）', mine.length === 1 && mine[0].placeId === 'XY04' && !!mine[0].slot && !!mine[0].semester);
const discId = mine[0] && mine[0].id;

// —— 6. 钉一句话 ——
console.log('— 6. 钉一句话');
await p.evaluate(() => { location.hash = '#/place/XY04'; });
await sleep(1500);
const rows = await p.$$('.paper .disc-row');
for (const r of rows) { if ((await r.evaluate((el) => el.textContent)).includes('排练前调音')) { await r.click(); break; } }
await sleep(1500);
await p.click('.band .btn').catch(() => {});
await sleep(300);
await p.type('.band form input.input', '这一秒是第一个音');
await p.click('.band form button[type=submit]');
await sleep(2500);
const ec = await p.evaluate(async (id) => (await (await fetch(`/api/discs/${id}/echoes`)).json()).echoes, discId);
t('钉一句话：云上有', ec.length === 1 && ec[0].text === '这一秒是第一个音');
await p.screenshot({ path: path.join(out, 'a-place.png') });

// —— 7. 另一个人（独立的浏览器环境）看得到 ——
console.log('— 7. 另一个人（独立的浏览器环境）看得到');
await p.goto('about:blank');          // 软件渲染同时开两块三维画布会卡住：A 先让出来
const B = await browser.createBrowserContext();
const q = await open(B, '?h=19#/community?tab=sound');   // 「刚刚有人说」在社区的「声音」页签
await sleep(2500);
t('B 在社区的「刚刚有人说」里看得到 A 钉的话', (await text(q, '.paper')).includes('这一秒是第一个音'));
const heard = await q.evaluate(async (id) => { const k = 'e'.repeat(16); const r = await fetch(`/api/discs/${id}/heard`, { method: 'POST', headers: { 'x-ks-key': k, 'content-type': 'application/json' }, body: '{}' }); return (await r.json()).heard; }, discId);
t('B 点「我也听过」', heard === 1);
await q.close();
await B.close();
// —— 社区：发帖、回楼中楼、抱抱、接一棒 ——
console.log('— 社区');
await go(p, '?h=19#/community');
await until(p, () => document.querySelectorAll('.paper .post').length >= 10, null, 30000);
t('广场：示例帖都在（标「示例」）', (await p.$$('.paper .post')).length >= 12 && (await text(p, '.paper .post .tier')) === '示例');
await p.click('.paper .bar .btn');
await p.waitForSelector('.compose textarea');
await p.type('.compose textarea', '图书馆三楼的空调声，比闭馆广播还准时。');
const moodBtn = (await p.$$('.compose [role=radio]'))[0];
await moodBtn.click();
await p.click('.compose .btn');
await until(p, () => /post=ps-/.test(location.hash), null, 20000);
t('发帖：发出去以后进到这个帖子的楼里', (await text(p, '.thread .post .text')).includes('空调声'));
const postApi = await p.evaluate(async () => (await (await fetch('/api/posts')).json()).posts.filter((x) => x.text.includes('空调声')));
t('发帖：云上有，心情是选的那种', postApi.length === 1 && postApi[0].mood === 'calm');
await p.type('.thread .say textarea', '二楼也一样');
await p.click('.thread .say .btn');
await until(p, () => document.querySelectorAll('.thread .floor').length === 1, null, 15000);
t('回复：成了 2 楼', (await text(p, '.thread .floor .m')).startsWith('2 楼'));
await p.click('.thread .floor .act');
await p.type('.thread .say textarea', '楼中楼');
await p.click('.thread .say .btn');
await until(p, () => document.querySelector('.thread .kids'), null, 15000);
t('楼中楼：挂在 2 楼下面', (await text(p, '.thread .kids')).includes('楼中楼'));
const hug = (await p.$$('.thread .post footer .act'))[1];
await hug.click();
await until(p, () => /抱抱 1/.test(document.querySelector('.thread .post footer').textContent), null, 10000);
t('抱抱：计数 1，按钮亮起来', (await text(p, '.thread .post footer')).includes('抱抱 1'));
await go(p, '?h=19#/community?post=ps-demo-r3');
await until(p, () => document.querySelector('.thread .chain'), null, 20000);
t('接力：示例链三棒都在', (await p.$$('.thread .chain li:not(.next)')).length === 3);
await p.evaluate(() => { const e = [...document.querySelectorAll('.disc-row, .snd')][0]; if (e) e.click(); });
await sleep(1200);
await p.click('.thread .chain .next .btn');
await until(p, () => document.querySelector('.compose .relay-up'), null, 15000);
t('接下一棒：写帖子的框里说明接在第 3 棒后面', (await text(p, '.compose .relay-up')).includes('第 3 棒'));
await p.type('.compose textarea', '第四棒：吃完回宿舍');
await p.evaluate(() => { const b = [...document.querySelectorAll('.compose .chip')].find((x) => x.textContent.includes('附上正在放的')); if (b) b.click(); });
await p.click('.compose .btn');
await until(p, () => /post=ps-/.test(location.hash) && !/demo/.test(location.hash), null, 20000);
const relayApi = await p.evaluate(async () => (await (await fetch('/api/posts')).json()).posts.filter((x) => x.relayRoot === 'ps-demo-r1'));
t('接力：接上了，是第 4 棒', relayApi.length === 1 && relayApi[0].relayIndex === 4);
await go(p, '?h=9#/community?tab=board');
await until(p, () => document.querySelectorAll('.heat .cell').length > 300, null, 20000);
t('看板：心情 6 种、16 × 24 的热力格', (await p.$$('.moods .mood')).length === 6 && (await p.$$('.heat .cell')).length === 16 * 24);

await go(p, '?h=19#/mine');
await sleep(2500);
t('A 的「我的」：刻过一张', (await text(p, '.paper .h1')).startsWith('1 张'));
const tabsM = await p.$$('.paper [role=tab]');
await tabsM[3].click();   // 我刻的 / 收藏 / 我的帖子 / 回应我的 / 刻声卡
await sleep(500);
t('A 的「回应我的」：有人也听过', (await text(p, '.paper')).includes('也听过'));
await tabsM[0].click();
await sleep(300);
deleted = discId;
const delBtn = await p.$('.mine-row .link');
await delBtn.click(); await sleep(200); await delBtn.click();
await sleep(2000);
const left = await p.evaluate(async (id) => (await fetch(`/api/discs/${id}/audio`)).status, discId);
t('A 真删：云上的声音取不到了', left === 404);

// —— 8. 手机宽度 ——
console.log('— 8. 手机宽度');
const m = p;
await go(m, '?h=12#/', { w: 390, h: 844 });
await sleep(2000);
const ov = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
t('手机：没有横向滚动', !ov);
t('手机：纸是底部抽屉', (await m.$eval('.paper', (el) => el.getBoundingClientRect().bottom)) >= 843);
await m.screenshot({ path: path.join(out, 'm-home.png') });
await m.close();

await browser.close();
await server.close();
const uniq = [...new Set(problems)];
t(`控制台与网络问题 0 条${uniq.length ? `（${uniq.length} 条：${uniq.slice(0, 6).join(' | ')}）` : ''}`, uniq.length === 0);
console.log(`\n浏览器走查：${pass} 项通过，${fail} 项不通过`);
fs.rmSync(process.env.KS_DATA, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
