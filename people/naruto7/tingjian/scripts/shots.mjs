// 截图走查：构建好的页面起在预览服务上，用本机 Chrome 按几个钟点、几个板块、两种宽度截图，收集控制台报错。
//   npm run build && node scripts/shots.mjs [名字前缀]
// 截图在 .e2e/shots/。找不到 Chrome 时设 CHROME_PATH。
import fs from 'node:fs';
import path from 'node:path';
import { preview } from 'vite';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const out = path.resolve('.e2e/shots');
fs.mkdirSync(out, { recursive: true });
const only = process.argv[2] || '';

const server = await preview({ preview: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
const base = 'http://127.0.0.1:5199/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
const problems = [];

async function shot(name, url, { w = 1440, h = 900, wait = 9000, act = null, screen = false } = {}) {
  if (only && !only.split(',').some((o) => name === o || (o.endsWith('*') && name.startsWith(o.slice(0, -1))))) return;   // 名字用逗号隔开；结尾带 * 是前缀
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) problems.push(`${name} [${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${name} [pageerror] ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`${name} [requestfailed] ${r.url()} ${r.failure() && r.failure().errorText}`));
  if (!screen) await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('tj-entered', '1'); } catch { /* */ } });
  const t0 = Date.now();
  await page.goto(base + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage && window.__stage.frames > 3, { timeout: 60000 }).catch(() => problems.push(`${name} 舞台 60 秒内没起来`));
  if (act) await act(page);
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const info = await page.evaluate(() => ({ lite: window.__stage && window.__stage.lite, mode: window.__stage && window.__stage.mode, frames: window.__stage && window.__stage.frames }));
  console.log(`${name}  ${((Date.now() - t0) / 1000).toFixed(1)} 秒  ${JSON.stringify(info)}`);
  await page.close();
}

await shot('screen-dusk', '?h=18.4&screen=1', { screen: true, wait: 2500 });
await shot('screen-noon', '?h=12.5&screen=1', { screen: true, wait: 2500 });
await shot('home-morning', '?h=8#/', { wait: 9000 });
await shot('home-night', '?h=22.5#/', { wait: 9000 });
await shot('place-lib', '?h=16#/place/XY01', { wait: 9000 });
await shot('place-gym', '?h=19.2#/place/XY06', { wait: 9000 });
await shot('community', '?h=20#/community', { wait: 9000 });
await shot('comm-thread', '?h=21.5#/community?post=ps-demo-01', { wait: 8000 });
await shot('comm-topics', '?h=15#/community?tab=topics', { wait: 7000 });
await shot('comm-relay', '?h=11.5#/community?tab=relay', { wait: 7000 });
await shot('comm-board', '?h=9#/community?tab=board', { wait: 8000 });
await shot('comm-albums', '?h=16#/community?tab=albums', { wait: 7000 });
await shot('comm-album', '?h=7.5#/community?tab=albums&album=al-zaoba', { wait: 8000 });
await shot('comm-scene', '?h=19#/community?tab=scene', { wait: 7000 });
await shot('time', '?h=10#/time', { wait: 9000 });
await shot('mine', '?h=13#/mine', { wait: 8000 });
await shot('m-home', '?h=17#/', { w: 390, h: 844, wait: 9000 });
await shot('m-screen', '?h=6.5&screen=1', { w: 390, h: 844, wait: 2500, screen: true });

await browser.close();
await server.close();
const uniq = [...new Set(problems)];
console.log(uniq.length ? `\n控制台与网络问题 ${uniq.length} 条：\n${uniq.slice(0, 40).join('\n')}` : '\n控制台与网络问题 0 条');
