// 听见校园 · CloudBase HTTP 云函数：把 HTTP 访问服务的 event 交给 server/api.mjs 的 handle（和本机同一份代码，只换存储）。
// 部署：npm run deploy:cloudbase（脚本把 server/、src/ 里要用的文件拷进来，再用 tcb 上传）。
// 云函数里不放密钥：@cloudbase/node-sdk 用当前环境的身份。审核口令从云函数的环境变量 KS_ADMIN_TOKEN 读。
import fs from 'node:fs';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-ks-key, x-ks-admin', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };

/** HTTP 访问服务的 event → api.handle → 集成响应。单独导出，本机能拿文件存储测它（scripts/check-api.mjs）。 */
export function toHttp(api) {
  return async (event) => {
    const method = String(event.httpMethod || 'GET').toUpperCase();
    if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    // /api 挂在这个函数上：path 里可能带也可能不带 /api 前缀
    let path = event.path || '/';
    if (!path.startsWith('/api')) path = `/api${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    let body = null;
    if (event.body) {
      try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); }
      catch { return { statusCode: 400, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"ok":false,"error":"请求体不是 JSON。"}' }; }
    }
    const r = await api.handle({ method, path, query: event.queryStringParameters || {}, headers, body });
    if (r.buffer) return { statusCode: r.status, headers: { ...CORS, 'content-type': r.type, 'cache-control': r.cache || 'no-store' }, body: Buffer.from(r.buffer).toString('base64'), isBase64Encoded: true };
    return { statusCode: r.status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(r.json) };
  };
}

let run = null;
export async function main(event) {
  if (!run) {
    const [{ createApi }, { cloudbaseStore }] = await Promise.all([import('./server/api.mjs'), import('./server/store-cloudbase.mjs')]);
    const calendar = JSON.parse(fs.readFileSync(new URL('./calendar.json', import.meta.url), 'utf8'));
    run = toHttp(createApi({ store: cloudbaseStore(), review: process.env.KS_REVIEW !== '0', adminToken: process.env.KS_ADMIN_TOKEN || '', calendar }));
  }
  return run(event);
}
