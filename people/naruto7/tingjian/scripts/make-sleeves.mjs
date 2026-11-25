// 唱片套的「模型照」：每个地方进楼后的特写（楼被提起来、背景虚掉），按楼的中心裁成正方形。
//   npm run build && node scripts/make-sleeves.mjs
// 输出 public/sleeves/XY01.jpg … XY16.jpg（640×640）。不是实拍：套子上角标写「模型照」，sleeves.json 里 kind: "model"。
// 用本机显卡渲染（--use-angle=d3d11）；没有独显时去掉这两个参数也能跑，只是慢。
import fs from 'node:fs';
import path from 'node:path';
import { preview } from 'vite';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const sleeves = JSON.parse(fs.readFileSync('public/data/sleeves.json', 'utf8'));
const ids = Object.keys(sleeves.places);
const server = await preview({ preview: { port: 5196, host: '127.0.0.1' }, logLevel: 'error' });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('tj-entered', '1'); localStorage.setItem('tj-tier', JSON.stringify({ t: 'high', gpu: '' })); } catch { /* */ } });
for (const id of ids) {
  await page.goto(`http://127.0.0.1:5196/?h=16.2&q=full#/place/${id}`, { waitUntil: 'load' });
  await page.waitForFunction((pid) => window.__stage && window.__stage.frames > 3 && window.__stage.heroLift(pid) !== null, { timeout: 90000 }, id);
  await new Promise((r) => setTimeout(r, 4500));
  // 只要楼：把页面上的纸、播放条、顶栏都藏起来
  await page.addStyleTag({ content: '.paper,.deck,.press,.top,.labels,.toast{display:none!important}' });
  await new Promise((r) => setTimeout(r, 600));
  const c = await page.evaluate((pid) => window.__stage.heroScreen(pid), id);
  const S = 600, x = Math.max(0, Math.min(1440 - S, Math.round(c.x - S / 2))), y = Math.max(0, Math.min(900 - S, Math.round(c.y - S / 2 - 130)));
  const out = path.resolve('public/sleeves', `${id}.jpg`);
  await page.screenshot({ path: out, type: 'jpeg', quality: 84, clip: { x, y, width: S, height: S } });
  console.log(id, sleeves.places[id].name, `${Math.round(fs.statSync(out).size / 1024)} KB`);
}
await browser.close();
server.httpServer.close();
process.exit(0);
