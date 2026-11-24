// 听见校园 · 本机文件存储：开发与离线演示用。和 store-cloudbase.mjs 是同一组方法，api.mjs 不知道自己连的是哪一种。
// 一个集合一个 JSON 文件（.data/<集合>.json），文件放在 .data/files/。.data/ 在 .gitignore 里：真实用户的数据不进仓库。
import fs from 'node:fs';
import path from 'node:path';

export function fileStore(dir) {
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  const cols = new Map();
  const fileOf = (c) => path.join(dir, `${c}.json`);
  function col(c) {
    if (!cols.has(c)) {
      let m = new Map();
      try { m = new Map(JSON.parse(fs.readFileSync(fileOf(c), 'utf8')).map((x) => [x.id, x])); } catch { /* 还没有 */ }
      cols.set(c, m);
    }
    return cols.get(c);
  }
  const timers = new Map();
  function save(c) {   // 合并写：一阵子里改了很多次，只写一次
    clearTimeout(timers.get(c));
    timers.set(c, setTimeout(() => {
      const tmp = `${fileOf(c)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...col(c).values()]));
      fs.renameSync(tmp, fileOf(c));
    }, 60));
  }
  const match = (x, where) => Object.entries(where || {}).every(([k, v]) => x[k] === v);
  const safe = (name) => { const p = path.resolve(dir, 'files', name); if (!p.startsWith(path.resolve(dir, 'files'))) throw new Error('文件名不对'); return p; };
  return {
    kind: 'file',
    async get(c, id) { const x = col(c).get(id); return x ? structuredClone(x) : null; },
    async put(c, x) { col(c).set(x.id, structuredClone(x)); save(c); return x; },
    async del(c, id) { col(c).delete(id); save(c); },
    async list(c, where) { return [...col(c).values()].filter((x) => match(x, where)).map((x) => structuredClone(x)); },
    async putFile(name, buf) { const p = safe(name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); return `file:${name}`; },
    async getFile(ref) { return fs.readFileSync(safe(String(ref).replace(/^file:/, ''))); },
    async delFile(ref) { fs.rmSync(safe(String(ref).replace(/^file:/, '')), { force: true }); },
    flush() { for (const [c, t] of timers) { clearTimeout(t); fs.writeFileSync(fileOf(c), JSON.stringify([...col(c).values()])); } timers.clear(); },
  };
}
