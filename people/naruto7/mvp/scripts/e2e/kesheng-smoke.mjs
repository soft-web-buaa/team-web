// 刻声副本冒烟：能打开、能就绪、数字对得上、控制台和网络没有报错、手机宽度不溢出。
// 前提：站点里有 public/kesheng/（来自分支 feature/mvp-kesheng-embed）。没有就跳过，并说明原因。
// 一键运行：npm run e2e:kesheng
// 单独运行：先有一个在跑的站点，再 BASE_URL=http://127.0.0.1:4173/ node scripts/e2e/kesheng-smoke.mjs
//   环境变量同 flows.mjs：BASE_URL、CHROME_PATH、SHOT_DIR
// EXPECT 里的数字对应刻声提交 94665936（2026-10-28）。副本更新后要同步改，改之前先跑 verify-kesheng-import。
// 用软件渲染的 WebGL（SwiftShader），不需要显卡，但慢，等待时间放得长。手机真机的帧率这个脚本测不了。
// 退出码：全部通过是 0；有失败或有报错是 1；找不到浏览器是 2；副本不在是 0（打印"跳过"）。
import { launch, shotDir } from './browser.mjs';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const PLAN = BASE + 'kesheng/src/web/plan3d/index.html';
const HOME = BASE + 'kesheng/src/web/index.html';
const EXPECT = { pins: 16, entries: 231, total: 272, real: 0, echoPins: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 站点对不存在的路径会回退到自己的 index.html 并返回 200，所以不能只看状态码，要看页面标题是刻声的。
const probe = await fetch(PLAN).then(async (r) => ({ status: r.status, html: await r.text() })).catch(() => ({ status: 0, html: '' }));
if (probe.status !== 200 || !/<title>[^<]*刻声/.test(probe.html)) {
  console.log(`跳过：${PLAN} 没有刻声的页面（状态 ${probe.status || '连不上'}）。刻声副本在分支 feature/mvp-kesheng-embed 里，合并之后站点里才有。`);
  process.exit(0);
}

const OUT = shotDir();
const browser = await launch(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']);
const results = [];
const problems = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? '通过' : '失败'}  ${name}${extra ? '  ' + extra : ''}`);

async function open(url, { w = 1280, h = 800, mobile = false, ready = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const tag = `${mobile ? '手机' : '桌面'} ${url.replace(BASE, '')}`;
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${tag}] console.error: ${m.text().slice(0, 160)}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`[${tag}] HTTP ${r.status()}: ${r.url()}`));
  page.on('requestfailed', (r) => problems.push(`[${tag}] requestfailed: ${r.url()}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (ready) {
    await page.waitForFunction(() => window.__plan && window.__plan.ready, { timeout: 90000 });
    await sleep(9000);
  }
  return page;
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// 1 桌面：分区图就绪，数字对得上，地点卡能打开
{
  const p = await open(PLAN, { ready: true });
  const info = await p.evaluate(() => ({
    pins: window.__plan.pins,
    entries: window.__plan.entries,
    counts: window.__plan.counts(),
    nogl: !!window.__plan.nogl,
    quality: window.__plan.quality,
  }));
  console.log('分区图状态：', JSON.stringify(info));
  ok('分区图：WebGL 场景建起来了', !info.nogl);
  ok('分区图：地点数', info.pins === EXPECT.pins, `期望 ${EXPECT.pins}，实际 ${info.pins}`);
  ok('分区图：概念盘条数', info.entries === EXPECT.entries, `期望 ${EXPECT.entries}，实际 ${info.entries}`);
  ok('分区图：总数含史料', info.counts.total === EXPECT.total, `期望 ${EXPECT.total}，实际 ${info.counts.total}`);
  ok('分区图：真实录音是 0，没有把概念盘和史料算成真人', info.counts.real === EXPECT.real, `实际 ${info.counts.real}`);
  await p.evaluate(() => window.__plan.openPlace('XY01'));
  await sleep(3500);
  const card = await p.$eval('#card-body', (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  ok('分区图：点开地点卡有内容', card.length > 20, card.slice(0, 50));
  // 回声层：打开页面时载入的那张声片带着示例回声；盘面上有对应的回声针；点一条就能跳过去
  const ec = await p.evaluate(() => ({
    shown: !document.getElementById('echoes').hidden,
    pins: document.querySelectorAll('.echo-pin').length,
    marks: window.__plan.echoMarks,
    demoTag: [...document.querySelectorAll('.echo-line .b')].every((b) => b.textContent.includes('示例')),
  }));
  ok('回声：打开页面时载入的声片带着自己的回声（主楼的下课铃 2 条，不是全部示例）', ec.shown && ec.pins === EXPECT.echoPins, `期望 ${EXPECT.echoPins}，实际 ${ec.pins}`);
  ok('回声：盘面上的回声针与回声带同数', ec.marks.n === ec.pins && ec.marks.visible, JSON.stringify(ec.marks));
  ok('回声：示例回声每一条都标了"示例"', ec.demoTag);
  // 链接被拦、号码被拦、正常的钉上
  await p.click('#echo-open');
  await p.type('#echo-text', '看 https://example.com');
  await p.click('.echo-send');
  const e1 = await p.$eval('#echo-err', (e) => e.textContent);
  ok('回声：放链接被拦下并说明原因', e1 === '这里不能放链接。', e1);
  await p.$eval('#echo-text', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await p.type('#echo-text', '加我 13800138000');
  await p.click('.echo-send');
  const e2 = await p.$eval('#echo-err', (e) => e.textContent);
  ok('回声：放号码被拦下', e2 === '这里不能放号码或联系方式。', e2);
  await p.$eval('#echo-text', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await p.type('#echo-text', '<b>我也站在这里过</b>');
  await p.click('.echo-send');
  await sleep(300);
  await sleep(1500);   // 发件箱后台发到云上
  const after = await p.evaluate(async () => {
    const key = await (await import('../cloud.js')).myKey(false);
    const r = await fetch('/api/discs/concept-033/echoes', { headers: { 'x-ks-key': key } }).then((x) => x.json());
    return { pins: document.querySelectorAll('.echo-pin').length, marks: window.__plan.echoMarks.n,
      text: [...document.querySelectorAll('.echo-line .w')].map((x) => x.textContent), inCloud: r.echoes.filter((e) => e.mine).map((e) => e.text),
      waiting: !document.getElementById('echo-sync').hidden };
  });
  ok('回声：正常的话钉上后回声带与盘面都多一根', after.pins === ec.pins + 1 && after.marks === ec.pins + 1, `${ec.pins} → ${after.pins}`);
  ok('回声：列表里只有这张声片自己的话，不混进别的声片的', after.text.length === EXPECT.echoPins + 1, `${after.text.length} 条`);
  ok('回声：<b> 原样显示，不被当成 HTML', after.text.includes('<b>我也站在这里过</b>'));
  ok('回声：话在云上（不是只在这台设备上）', after.inCloud.includes('<b>我也站在这里过</b>'), `云上我的 ${after.inCloud.length} 条`);
  ok('回声：发出去之后没有"待发出"的提示', !after.waiting);

  // 回归：云上取回来的内容没变时，不重画回声带（重画会让显影动画重放、列表滚动位置和焦点丢掉）
  const same = await p.evaluate(async () => {
    const mark = document.querySelector('.echo-line');
    if (mark) mark.dataset.keep = '1';
    const pinEl = document.querySelector('.echo-pin');
    if (pinEl) pinEl.dataset.keep = '1';
    await window.__plan.refreshEchoes();
    await window.__plan.refreshEchoes();
    return { line: !!document.querySelector('.echo-line[data-keep="1"]'), pin: !!document.querySelector('.echo-pin[data-keep="1"]') };
  });
  ok('回声：云上取回来的没变时不重画（列表行与钉都还是原来那个节点）', same.line && same.pin, JSON.stringify(same));

  // 另一个人（独立的浏览器环境：另一份 localStorage，另一个作者键）打开同一张声片，看得到 A 留的话
  const ctxB = await browser.createBrowserContext();
  const pb = await ctxB.newPage();
  await pb.setViewport({ width: 1280, height: 800 });
  pb.on('pageerror', (e) => problems.push(`[B] pageerror: ${e.message}`));
  pb.on('console', (m) => m.type() === 'error' && problems.push(`[B] console.error: ${m.text().slice(0, 160)}`));
  await pb.goto(PLAN, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pb.waitForFunction(() => window.__plan && window.__plan.ready, { timeout: 90000 });
  await sleep(9000);
  const seenByB = await pb.evaluate(() => ({ lines: [...document.querySelectorAll('.echo-line .w')].map((x) => x.textContent), mineTag: [...document.querySelectorAll('.echo-line .b')].some((x) => x.textContent.includes('我')) }));
  ok('社区：另一个人（B）在自己的浏览器里看得到 A 钉的话', seenByB.lines.includes('<b>我也站在这里过</b>'), `${seenByB.lines.length} 条`);
  ok('社区：B 看到的是 2 条示例加 A 的 1 条', seenByB.lines.length === EXPECT.echoPins + 1, `${seenByB.lines.length} 条`);
  ok('社区：B 看到的那条不带"我"的标记', !seenByB.mineTag);

  // 照片：A 配一张带定位信息的照片；服务端剥掉定位；先审后显由 check:cloud 覆盖，这里验证界面链路
  const jpg = await pb.evaluate(async () => {
    const key = await (await import('../cloud.js')).myKey(true);
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const g = c.getContext('2d'); g.fillStyle = '#24304A'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#E6BE3A'; g.beginPath(); g.arc(160, 120, 50, 0, 7); g.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
    const u8 = new Uint8Array(await blob.arrayBuffer());
    const payload = new TextEncoder().encode('Exif\0\0GPSLatitude=39.9866N GPSLongitude=116.3446E');
    const seg = new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
    const withExif = new Uint8Array([...u8.slice(0, 2), ...seg, ...u8.slice(2)]);
    let bin = ''; for (const b of withExif) bin += String.fromCharCode(b);
    const body = { id: 'ph-smoke-0001', placeId: 'XY02', consent: { version: 1, noIdentifiable: true }, thumb: btoa(bin), full: btoa(bin) };
    const up = await fetch('/api/photos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ks-key': key }, body: JSON.stringify(body) }).then((r) => r.json());
    const got = new Uint8Array(await (await fetch('/api/photos/ph-smoke-0001/full')).arrayBuffer());
    const text = new TextDecoder('latin1').decode(got);
    return { ok: up.ok, state: up.photo && up.photo.state, hasGps: text.includes('GPSLatitude') || text.includes('Exif'), soi: got[0] === 0xff && got[1] === 0xd8, size: got.length };
  });
  ok('照片：B 上传带定位信息的照片成功，开发云默认自动通过', jpg.ok && jpg.state === 'ok', JSON.stringify({ ok: jpg.ok, state: jpg.state }));
  ok('照片：从云上取回的照片里没有定位信息，仍是 JPEG', jpg.soi && !jpg.hasGps, `${jpg.size} 字节`);
  await pb.close();
  await ctxB.close();
  await p.evaluate(() => window.__plan.openPlace('XY01'));
  await sleep(2500);
  const cv = await p.evaluate(() => { const i = document.querySelector('.cover img'); const c = document.querySelector('.cover figcaption'); return { w: i ? i.naturalWidth : 0, cap: c ? c.textContent : '' }; });
  ok('套子：地点卡上有照片，说明里如实写"模型照"', cv.w > 0 && cv.cap.startsWith('模型照'), `${cv.w}px，${cv.cap.slice(0, 12)}`);
  await p.screenshot({ path: OUT + 'kesheng-plan3d.png' });
  await p.close();
}

// 1b 嵌入模式（听见校园首页里的样子）：没有"回到刻声盘"，卡片标题是首页的话
{
  const p = await open(PLAN + '?embed=1', { ready: true });
  const em = await p.evaluate(() => ({ back: getComputedStyle(document.querySelector('.back-home')).display, h1: document.querySelector('#card-body h1').textContent }));
  ok('嵌入模式：不显示"回到刻声盘"', em.back === 'none', em.back);
  ok('嵌入模式：卡片标题是首页的话', em.h1 === '有些声音，比我们在这里待得久。', em.h1);
  await p.close();
}

// 2 手机宽度：分区图和地点卡都不横向溢出
{
  const p = await open(PLAN, { w: 375, h: 800, mobile: true, ready: true });
  const over1 = await overflow(p);
  ok('手机 375px：分区图无横向溢出', over1 <= 0, over1 > 0 ? `溢出 ${over1}px` : '');
  await p.evaluate(() => window.__plan.openPlace('XY01'));
  await sleep(3500);
  const over2 = await overflow(p);
  ok('手机 375px：打开地点卡后无横向溢出', over2 <= 0, over2 > 0 ? `溢出 ${over2}px` : '');
  console.log('手机画质模式：', JSON.stringify(await p.evaluate(() => window.__plan.quality)));
  await p.screenshot({ path: OUT + 'kesheng-plan3d-mobile.png' });
  await p.close();
}

// 3 主页：单张声片页能打开
{
  const p = await open(HOME);
  await sleep(5000);
  const title = await p.title();
  ok('主页：能打开，标题含"刻声"', title.includes('刻声'), title);
  await p.screenshot({ path: OUT + 'kesheng-home.png' });
  await p.close();
}

console.log(results.join('\n'));
console.log('\n控制台与网络问题：' + problems.length);
problems.forEach((x) => console.log(' -', x));
const failed = results.filter((r) => r.startsWith('失败')).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed}，失败 ${failed}；控制台与网络问题 ${problems.length}。`);
await browser.close();
process.exitCode = failed || problems.length ? 1 : 0;
