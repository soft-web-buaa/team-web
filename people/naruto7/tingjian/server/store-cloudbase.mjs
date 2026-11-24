// 听见校园 · CloudBase 存储：云开发数据库（文档型）+ 云存储。方法和 store-file.mjs 一样。
// 在云函数里：cloudbaseStore() 用当前环境，不需要密钥；在本机连云（导数据、自检）：cloudbaseStore({ env, secretId, secretKey })，密钥只从 .env 读。
// 集合：discs、echoes、photos、heard、favs、reports、posts、replies、reacts、topics、relays、files（由 scripts/deploy-cloudbase.mjs db 建）。
import tcb from '@cloudbase/node-sdk';

export function cloudbaseStore(opts = {}) {
  const app = tcb.init(opts.env ? opts : { env: tcb.SYMBOL_CURRENT_ENV });
  const db = app.database();
  const notFound = (e) => (e && (e.code === 'DOCUMENT_NOT_FOUND' || /Document not found/i.test(e.message || '')));
  const strip = (d) => { if (!d) return null; const { _id, _openid, ...rest } = d; return { id: _id, ...rest }; };
  return {
    kind: 'cloudbase',
    async get(c, id) {
      try {
        const r = await db.collection(c).doc(id).get();
        return strip(r.data && r.data[0]);
      } catch (e) {
        if (notFound(e)) return null;   // PostgreSQL 文档插件取不存在的一条会抛错；旧的文档型数据库是返回空
        throw e;
      }
    },
    async put(c, x) {
      const { id, ...rest } = x;
      await db.collection(c).doc(id).set(rest);
      return x;
    },
    async del(c, id) { try { await db.collection(c).doc(id).remove(); } catch (e) { if (!notFound(e)) throw e; } },
    async list(c, where) {
      const out = [];
      const q = where && Object.keys(where).length ? db.collection(c).where(where) : db.collection(c);
      for (let skip = 0; ; skip += 1000) {          // 一次最多 1000 条
        const r = await q.skip(skip).limit(1000).get();
        out.push(...r.data.map(strip));
        if (r.data.length < 1000) break;
      }
      return out;
    },
    // 声音（≤1.1 MB）和照片（≤0.9 MB）存进 files 集合，base64 一条一份（PostgreSQL 文档插件单条上限 16 MiB）。
    // 新环境的云存储要另建 PostgreSQL 存储桶、另配服务端密钥；课程规模用数据库更省事。旧的 cloud:// 引用照旧走云存储。
    async putFile(name, buf, type = '') {
      const id = String(name).replace(/[^A-Za-z0-9._-]/g, '_');
      await db.collection('files').doc(id).set({ name, type, size: buf.length, data: Buffer.from(buf).toString('base64') });
      return `db:${id}`;
    },
    async getFile(ref) {
      if (String(ref).startsWith('cloud://')) return (await app.downloadFile({ fileID: ref })).fileContent;
      const r = await db.collection('files').doc(String(ref).replace(/^db:/, '')).get();
      return Buffer.from(r.data[0].data, 'base64');
    },
    async delFile(ref) {
      if (String(ref).startsWith('cloud://')) { await app.deleteFile({ fileList: [ref] }); return; }
      try { await db.collection('files').doc(String(ref).replace(/^db:/, '')).remove(); } catch (e) { if (!notFound(e)) throw e; }
    },
  };
}
