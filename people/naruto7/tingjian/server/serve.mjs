// 本机服务：dist/ 的静态页面 + /api（本机文件存储）。离线演示、局域网里给同学扫码都用它。
//   npm run build && npm run serve                 # http://127.0.0.1:8790
//   node server/serve.mjs --port 8790 --host 0.0.0.0 --data .data --review
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.mjs';
import { fileStore } from './store-file.mjs';
import { nodeHandler } from './http.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const val = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
const port = Number(val('--port', 8790)), host = val('--host', '127.0.0.1');
const dataDir = path.resolve(root, val('--data', '.data'));
const calendar = JSON.parse(fs.readFileSync(path.join(root, 'public/data/calendar.json'), 'utf8'));
const api = createApi({ store: fileStore(dataDir), review: a.includes('--review') || process.env.KS_REVIEW === '1', adminToken: process.env.KS_ADMIN_TOKEN || '', calendar });
const apiHandler = nodeHandler(api);
const dist = path.join(root, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) return apiHandler(req, res);
  let p = path.join(dist, decodeURIComponent(u.pathname));
  if (!p.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
  const ext = path.extname(p);
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': /\/assets\//.test(p) ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(p).pipe(res);
});
srv.listen(port, host, () => console.log(`听见校园：http://${host}:${port}  数据在 ${dataDir}`));
