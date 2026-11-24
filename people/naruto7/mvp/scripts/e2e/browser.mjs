// 两个走查脚本共用：找本机的 Chrome 或 Edge 并启动无头浏览器，以及截图目录。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

/** 截图目录，带结尾斜杠。默认是 mvp 目录下的 .e2e-shots/，已在 .gitignore。 */
export function shotDir() {
  const dir = (process.env.SHOT_DIR || path.resolve(here, '../../.e2e-shots')).replace(/\\/g, '/').replace(/\/?$/, '/');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 启动无头浏览器；找不到可执行文件时说明原因并以退出码 2 结束。 */
export async function launch(extraArgs = []) {
  const exe = CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) {
    console.error('找不到 Chrome 或 Edge。用环境变量 CHROME_PATH 指定可执行文件的完整路径。');
    process.exit(2);
  }
  return puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', ...extraArgs] });
}
