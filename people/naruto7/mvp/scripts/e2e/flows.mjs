// 浏览器走查：把一个人会点的路径全点一遍，每一步断言，最后列出控制台和网络问题。
// 一键运行：npm run e2e（构建、起预览服务、跑本脚本、关服务）。
// 单独运行：先有一个在跑的站点，再 BASE_URL=http://127.0.0.1:4173/ node scripts/e2e/flows.mjs
//   BASE_URL     站点根地址，默认 http://127.0.0.1:4173/
//   CHROME_PATH  Chrome 或 Edge 可执行文件；不设就按常见位置找
//   SHOT_DIR     截图目录，默认 .e2e-shots/（已在 .gitignore）
// 退出码：全部通过且没有控制台、网络问题是 0；否则是 1；找不到浏览器是 2。
import { launch, shotDir } from './browser.mjs';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const OUT = shotDir();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch(['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);

const results = [];
const problems = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? '通过' : '失败'}  ${name}${extra ? '  ' + extra : ''}`);

async function open(url, w = 1280, h = 800, mobile = false) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}  @ ${page.url()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}  @ ${page.url()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(url, { waitUntil: 'networkidle0' });
  await sleep(500);
  return page;
}
const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const attr = (page) => page.evaluate(() => document.documentElement.dataset.period);

// 1 此刻页（原来的首页，现在在 /now）：键盘拖动时间轴，天色换时段；播放不报错
{
  const p = await open(`${BASE}?h=12#/now`);
  const before = await attr(p);
  await p.focus('input[type=range]');
  for (let i = 0; i < 200; i++) await p.keyboard.press('ArrowRight');
  await sleep(300);
  const after = await attr(p);
  ok('此刻页：键盘拖时间轴，天色从 ' + before + ' 变为 ' + after, before !== after);
  await p.click('.card .play');
  await sleep(1200);
  const playing = await p.$eval('.card .play', (e) => e.getAttribute('aria-pressed'));
  ok('此刻页：点播放后按钮进入播放态', playing === 'true');
  const toastMsg = await txt(p, '.toast');
  ok('此刻页：播放没有弹出错误提示', !toastMsg, toastMsg || '');
  await p.click('.card .play');
  await sleep(300);
  ok('此刻页：再点一次停止', (await p.$eval('.card .play', (e) => e.getAttribute('aria-pressed'))) === 'false');
  await p.keyboard.press('Tab');
  await p.screenshot({ path: OUT + 'f-focus.png' });
  await p.close();
}

// 1b 首页是留声机：整屏嵌入刻声的三维分区图（?embed=1），导航里"留声机"高亮；旧的地图页还在，只是不在导航里
{
  const p = await open(`${BASE}#/`);
  const src = await p.$eval('iframe.stage', (e) => e.getAttribute('src')).catch(() => null);
  ok('首页：整屏是留声机，嵌入的是刻声分区图', !!src && src.includes('plan3d/index.html') && src.includes('embed=1'), src || '没有 iframe');
  const on = await p.$$eval('.nav a.is-on', (a) => a.map((x) => x.textContent.trim()));
  ok('首页：导航里高亮的是"留声机"', on.length === 1 && on[0] === '留声机', on.join(','));
  const h = await p.$eval('iframe.stage', (e) => Math.round(e.getBoundingClientRect().height));
  ok('首页：留声机撑满顶栏下面的屏幕（高度 ≥ 视口的 70%）', h >= 800 * 0.7, `${h}px`);
  await p.close();
}

// 2 地图：点点位出卡片；换心情筛选；从别页带 ?id 来
{
  const p = await open(`${BASE}?h=21.9#/map`);
  const dots = await p.$$('.dot');
  ok('地图：8 个声音点', dots.length === 8, `实际 ${dots.length}`);
  await dots[0].click();
  await sleep(300);
  ok('地图：点点位后右侧出现声音卡', !!(await p.$('.side .card')));
  await p.click('.side .card .play');
  await sleep(1000);
  ok('地图：卡片里能播放', (await p.$eval('.side .card .play', (e) => e.getAttribute('aria-pressed'))) === 'true');
  const chips = await p.$$('.filter .chip');
  await chips[2].click();
  await sleep(200);
  const dim = await p.$$eval('.dot.off', (e) => e.length);
  ok('地图：按心情筛选后有点位变淡', dim > 0, `${dim} 个变淡`);
  await p.screenshot({ path: OUT + 'f-map-selected.png' });
  await p.close();
  const q = await open(`${BASE}#/map?id=snd-004`);
  ok('地图：带 ?id= 进入会选中并显示该声音', (await txt(q, '.side .card h3')) === '操场哨声');
  await q.close();
}

// 2b 社区层：同听、回声、链接拦截、举报
{
  const p = await open(`${BASE}?h=21.9#/map?id=snd-001`);
  const total0 = Number(await txt(p, '.social .total'));
  ok('社区：示例"人听过"数字显示，并带"示例数据"标记', total0 === 7 && !!(await p.$('.social .tag.demo')), `n=${total0}`);
  ok('社区：声音卡上显示跨年级的一句话', ((await txt(p, '.social .muted.small')) || '').includes('级到'), (await txt(p, '.social .muted.small')) || '');
  const pins0 = await p.$$eval('.wave rect.pin', (e) => e.length);
  ok('社区：波形上标出回声被钉住的位置', pins0 === 3, `${pins0} 个标记`);

  // 没选入学年份就点"我也听过"：先问年级，选完自动接着做
  await p.$$eval('.social .chip', (b) => b.find((x) => x.textContent.includes('我也听过')).click());
  await sleep(200);
  ok('社区：没落款时先问落款，而不是直接报错', !!(await p.$('.social .gate')));
  ok('社区：落款里有学院候选和名字输入框', (await p.$$('.social .gate input[type=text]')).length === 2 && (await p.$$('.social .gate datalist option')).length > 20, `${(await p.$$('.social .gate datalist option')).length} 个候选`);
  await p.$$eval('.social .gate .chip', (b) => b.find((x) => x.textContent.trim() === '2025 级').click());
  await p.type('.social .gate input[list]', '宇航学院');
  await p.type('.social .gate input:not([list])', '阿川');
  await p.$$eval('.social .gate button', (b) => b.find((x) => x.textContent.includes('用这个落款说话')).click());
  await sleep(300);
  const total1 = Number(await txt(p, '.social .total'));
  ok('社区：选完年级后自动记下"我也听过"，人数 +1', total1 === total0 + 1, `${total0} → ${total1}`);
  ok('社区：按钮变为"已记下"', ((await txt(p, '.social .chips .chip')) || '').includes('已记下'));

  // 留回声：链接被拦、号码被拦、正常通过
  await p.$$eval('.social .chip', (b) => b.find((x) => x.textContent.includes('留一句回声')).click());
  await sleep(200);
  ok('社区：留回声处显示我的落款', ((await txt(p, '.compose .who')) || '').includes('2025 级，宇航学院，阿川'), (await txt(p, '.compose .who')) || '');
  const echoesBefore = (await p.$$('.echoes li')).length;
  const input = '.compose input[type=text]';
  await p.type(input, '看这里 https://example.com');
  await p.click('.compose button[type=submit]');
  await sleep(200);
  ok('社区：回声里放链接被拦下并说明原因', (await txt(p, '.compose .err')) === '这里不能放链接。', (await txt(p, '.compose .err')) || '');
  await p.$eval(input, (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await p.type(input, '加我 13800138000');
  await p.click('.compose button[type=submit]');
  await sleep(200);
  ok('社区：回声里放号码被拦下', (await txt(p, '.compose .err')) === '这里不能放号码或联系方式。', (await txt(p, '.compose .err')) || '');
  await p.$eval(input, (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await p.type(input, '<b>我也在这里等过</b>');
  await p.click('.compose button[type=submit]');
  await sleep(300);
  const echoesAfter = (await p.$$('.echoes li')).length;
  ok('社区：正常的回声发出后条数 +1', echoesAfter === echoesBefore + 1, `${echoesBefore} → ${echoesAfter}`);
  const lastTxt = await p.$$eval('.echoes li .txt', (e) => e.map((x) => x.textContent));
  ok('社区：回声里的 <b> 原样显示，不被当成 HTML', lastTxt.includes('<b>我也在这里等过</b>'));
  ok('社区：新回声标成"我的"', (await p.$$eval('.echoes .tag.real', (e) => e.length)) === 1);
  ok('社区：新回声旁显示落款', (await p.$$eval('.echoes .by', (e) => e.some((x) => x.textContent.includes('2025 级，宇航学院，阿川')))));
  // 举报：这一条从我这里消失
  await p.click('.echoes li:first-child button.link');
  await sleep(300);
  ok('社区：举报后这一条对我隐藏', (await p.$$('.echoes li')).length === echoesAfter - 1);
  await p.screenshot({ path: OUT + 'f-social.png' });
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  ok('社区：刷新后"我也听过"仍记得', Number(await txt(p, '.social .total')) === total0 + 1);
  await p.close();
}

// 3 留声：空提交报错；示例流程走通；落到地图并出现在列表
{
  const p = await open(`${BASE}#/record`);
  await p.click('button[type=submit]');
  await sleep(200);
  const errs = await p.$$eval('.errors li', (e) => e.map((x) => x.textContent));
  ok('留声：什么都不填就提交，给出明确的缺项提示', errs.length >= 2, errs.join(' | '));
  await p.$$eval('button[role=radio]', (b) => b.find((x) => x.textContent.trim() === '教学区').click());
  await p.$$eval('button[role=radio]', (b) => b.find((x) => x.textContent.trim() === '预备铃').click());
  await p.$$eval('button[role=radio]', (b) => b.find((x) => x.textContent.trim() === '犯困').click());
  await p.type('input[maxlength="12"]', '我的走廊');
  await p.type('textarea', '<b>测试</b> 超长文本' + '字'.repeat(80));
  await p.click('button[type=submit]');
  await sleep(800);
  ok('留声：提交后跳到地图', p.url().includes('#/map'), p.url().split('#')[1]);
  ok('留声：地图上选中的是刚留的声音', (await txt(p, '.side .card h3')) === '我的走廊');
  const story = await txt(p, '.side .story');
  ok('留声：<b> 标签原样显示、文本被截到 60 字内', story && story.startsWith('<b>测试</b>') && story.length <= 60, `长度 ${story && story.length}`);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('tjxy-mvp-v1') || '{}'));
  ok('留声：已存进本机存储', stored.mine && stored.mine.length === 1);
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  ok('留声：刷新后地图上还是 9 个点', (await p.$$('.dot')).length === 9);
  // 麦克风路径（用假设备）
  await p.goto(`${BASE}#/record`, { waitUntil: 'networkidle0' });
  await p.$$eval('button[role=radio]', (b) => b.find((x) => x.textContent.trim() === '用麦克风录').click());
  await p.$$eval('button', (b) => b.find((x) => x.textContent.includes('开始录音')).click());
  await sleep(1500);
  await p.$$eval('button', (b) => b.find((x) => x.textContent.includes('停止录音')).click());
  await sleep(1200);
  ok('留声：假麦克风录音后出现可试听的播放键', !!(await p.$('.after .play')));
  await p.close();
}

// 4 回应：话题页、发回应、刷新还在
{
  const p = await open(`${BASE}#/topics/closing`);
  // 浏览器的本地存储在各个测试之间是共享的，先清掉，模拟一个第一次来的人
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  const n0 = (await p.$$('.replies li')).length;
  ok('回应：没落款时先问落款，不显示输入框', !!(await p.$('.reply .gate')) && !(await p.$('.reply textarea')));
  await p.type('.reply .gate input[list]', 'www.abc.com');
  await p.$$eval('.reply .gate button', (b) => b.find((x) => x.textContent.includes('用这个落款说话')).click());
  await sleep(200);
  ok('落款：学院里放链接被拦下', (await txt(p, '.reply .gate .err')) === '学院：这里不能放链接。', (await txt(p, '.reply .gate .err')) || '');
  await p.$eval('.reply .gate input[list]', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await p.$$eval('.reply .gate button', (b) => b.find((x) => x.textContent.includes('不落款，直接说')).click());
  await sleep(200);
  ok('回应：选"不落款，直接说"后可以直接写', !!(await p.$('.reply textarea')));
  await p.type('.reply textarea', '先是风声');
  await p.click('.reply button[type=submit]');
  await sleep(200);
  ok('回应：没选心情时给出提示', (await txt(p, '.reply .err')) === '先选一个心情。');
  await p.$$eval('.reply button[role=radio]', (b) => b[0].click());
  await p.$eval('.reply textarea', (e) => { e.value = '看 www.abc.com'; e.dispatchEvent(new Event('input')); });
  await p.click('.reply button[type=submit]');
  await sleep(200);
  ok('回应：放链接被拦下', (await txt(p, '.reply .err')) === '这里不能放链接。', (await txt(p, '.reply .err')) || '');
  await p.$eval('.reply textarea', (e) => { e.value = '先是风声'; e.dispatchEvent(new Event('input')); });
  await p.click('.reply button[type=submit]');
  await sleep(300);
  ok('回应：不落款发出的回应旁显示"未落款"', ((await txt(p, '.replies li:last-child .muted')) || '').includes('未落款'), (await txt(p, '.replies li:last-child .muted')) || '');
  ok('回应：发出后回应数 +1', (await p.$$('.replies li')).length === n0 + 1, `${n0} → ${(await p.$$('.replies li')).length}`);
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  ok('回应：F5 刷新子页面不白屏且回应还在', (await p.$$('.replies li')).length === n0 + 1);
  await p.close();
  const q = await open(`${BASE}#/topics/no-such`);
  ok('回应：不存在的话题有说明和返回入口', (await txt(q, 'h1')) === '没有这个话题' && !!(await q.$('.empty a')));
  await q.close();
}

// 5 时间：柱子点击改钟点；史料能播
{
  const p = await open(`${BASE}?h=3#/time`);
  const bars = await p.$$('.bar');
  await bars[7].click();
  await sleep(200);
  ok('时间：点柱子把钟点拨到 7 点前后，天色变为清晨', (await attr(p)) === 'dawn');
  await p.click('.archive li:first-child .play');
  await sleep(1200);
  ok('时间：史料可播放', (await p.$eval('.archive li:first-child .play', (e) => e.getAttribute('aria-pressed'))) === 'true');
  ok('时间：史料播放没有错误提示', !(await txt(p, '.toast')), (await txt(p, '.toast')) || '');
  await p.close();
}

// 6 关于：清除我的内容
{
  const p = await open(`${BASE}#/about`);
  await p.$$eval('button', (b) => b.find((x) => x.textContent.includes('清除我留下的内容')).click());
  await sleep(300);
  ok('关于：清除按钮有反馈', !!(await txt(p, '.toast')), (await txt(p, '.toast')) || '');
  const left = await p.evaluate(() => JSON.parse(localStorage.getItem('tjxy-mvp-v1') || '{}'));
  ok('关于：清除后声音、回声、同听、落款都被清空', !left.me && !(left.mine || []).length && !(left.myEchoes || []).length && !(left.heard || []).length, JSON.stringify(left).slice(0, 80));
  const disabled = await p.$$eval('button[disabled]', (b) => b.length);
  ok('关于：即将开放的按钮是灰态', disabled >= 1);
  await p.close();
}

// 7 手机宽度：每页无横向溢出，底部导航可点
{
  for (const path of ['/', '/now', '/map', '/record', '/topics', '/topics/closing', '/time', '/about']) {
    const p = await open(`${BASE}?h=18.3#${path}`, 375, 780, true);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`手机 375px：${path} 无横向溢出`, over <= 0, over > 0 ? `溢出 ${over}px` : '');
    await p.close();
  }
}

console.log(results.join('\n'));
console.log('\n控制台与网络问题：' + problems.length);
problems.forEach((x) => console.log(' -', x));
const failed = results.filter((r) => r.startsWith('失败')).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed}，失败 ${failed}；控制台与网络问题 ${problems.length}。`);
await browser.close();
process.exitCode = failed || problems.length ? 1 : 0;
