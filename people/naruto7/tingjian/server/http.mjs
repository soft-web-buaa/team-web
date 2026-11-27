// 把 api.handle 包成 Node 的 (req, res)：本机服务（serve.mjs）和 vite 开发服务器共用。
export function nodeHandler(api) {
  return async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 4.4 * 1024 * 1024) { res.writeHead(413, { 'content-type': 'application/json' }).end('{"ok":false,"error":"请求太大。"}'); return; }
      chunks.push(c);
    }
    let body = null;
    if (chunks.length) {
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400, { 'content-type': 'application/json' }).end('{"ok":false,"error":"请求体不是 JSON。"}'); return; }
    }
    const r = await api.handle({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers, body });
    if (r.buffer) res.writeHead(r.status, { 'content-type': r.type, 'cache-control': r.cache || 'no-store' }).end(r.buffer);
    else res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(r.json));
  };
}
