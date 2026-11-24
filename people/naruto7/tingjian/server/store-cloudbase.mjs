// 听见校园 · CloudBase 存储：云开发数据库（文档型）+ 云存储。方法和 store-file.mjs 一样。
// 在云函数里：cloudbaseStore() 用当前环境，不需要密钥；在本机连云（导数据、自检）：cloudbaseStore({ env, secretId, secretKey })，密钥只从 .env 读。
// 集合：discs、echoes、photos、heard、favs、reports（第一次写入前要在控制台建好，或运行 scripts/deploy-cloudbase.mjs）。
import tcb from '@cloudbase/node-sdk';

export function cloudbaseStore(opts = {}) {
  const app = tcb.init(opts.env ? opts : { env: tcb.SYMBOL_CURRENT_ENV });
  const db = app.database();
  const strip = (d) => { if (!d) return null; const { _id, _openid, ...rest } = d; return { id: _id, ...rest }; };
  return {
    kind: 'cloudbase',
    async get(c, id) {
      const r = await db.collection(c).doc(id).get();
      return strip(r.data && r.data[0]);
    },
    async put(c, x) {
      const { id, ...rest } = x;
      await db.collection(c).doc(id).set(rest);
      return x;
    },
    async del(c, id) { await db.collection(c).doc(id).remove(); },
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
    async putFile(name, buf) {
      const r = await app.uploadFile({ cloudPath: `tingjian/${name}`, fileContent: buf });
      return r.fileID;
    },
    async getFile(ref) {
      const r = await app.downloadFile({ fileID: ref });
      return r.fileContent;
    },
    async delFile(ref) { await app.deleteFile({ fileList: [ref] }); },
  };
}
