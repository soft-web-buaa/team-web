// 预渲染「打开就看到的模型」：用无头 Chrome 把默认视角（上午 / 秋）截成两张图，
// 放在画布上方，页面还没画出三维第一帧时先给观众看这个。
//
//   node serve.mjs            # 另开一个终端，先把站点跑起来
//   node tools/bake-poster.mjs [http://127.0.0.1:8890/]
//
// 依赖本机 Chrome（用环境变量 CHROME 指定路径，或放在默认位置）与 Node 22+（有全局 WebSocket）。
// 生成：src/assets/poster-wide.jpg（宽屏）、src/assets/poster-portrait.jpg（窄屏）。
import { spawn } from 'node:child_process';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'src', 'assets');
const BASE = process.argv[2] || 'http://127.0.0.1:8890/';
const PORT = Number(process.env.CDP_PORT || 9721);
const CHROME_CANDIDATES = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const SHOTS = [
  { name: 'poster-wide.jpg', width: 1440, height: 900, mobile: false },
  { name: 'poster-portrait.jpg', width: 390, height: 844, mobile: true },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chromePath = await (async () => {
  for (const p of CHROME_CANDIDATES) { try { await access(p, constants.X_OK); return p; } catch { /* next */ } }
  throw new Error('找不到 Chrome：设 CHROME 环境变量指向浏览器可执行文件');
})();

const profile = await mkdtemp(join(tmpdir(), 'bake-poster-'));
const chrome = spawn(chromePath, ['--headless=new', '--enable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  'about:blank'], { stdio: 'ignore', windowsHide: true });

let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    wsUrl = (await r.json()).webSocketDebuggerUrl;
  } catch { await sleep(200); }
}
if (!wsUrl) { chrome.kill(); throw new Error('无头浏览器没起来'); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const evalJS = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Runtime.enable');
await send('Page.enable');

for (const s of SHOTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.width, height: s.height, deviceScaleFactor: 1, mobile: s.mobile });
  await send('Page.navigate', { url: `${BASE}?q=full` });
  await sleep(7000);                       // 等三维、阴影、四季都稳定
  // 只截三维画面：把叠在画布上的界面元素临时藏起来（标题、天光、提示、区块名标签、画布上方那张旧的 poster）
  await evalJS(`(() => {
    document.querySelectorAll('.stage-title,.hour,.hint,.labels').forEach((e) => { e.style.display = 'none'; });
    document.getElementById('poster')?.remove();
    const n = document.getElementById('nogl'); if (n) n.style.display = 'none';
    return true;
  })()`);
  await sleep(400);
  const rect = await evalJS(`(() => { const r = document.querySelector('.stage').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip: { ...rect, scale: 1 } });
  await writeFile(join(OUT, s.name), Buffer.from(shot.result.data, 'base64'));
  console.log(`写好 ${join(OUT, s.name)}（${Math.round(rect.width)}×${Math.round(rect.height)}）`);
}

ws.close();
chrome.kill();
