// 部署到 CloudBase：接口进云函数 api（挂在 HTTP 访问服务的 /api），页面进静态托管。
//   1. 在 .env 里填 TCB_ENV_ID、TCB_SECRET_ID、TCB_SECRET_KEY（.env 不进仓库）
//   2. npm run build && npm run deploy:cloudbase
// 用 @cloudbase/manager-node（腾讯云的管理 SDK）。密钥只从 .env 读，不进命令行参数、不打印、不写进任何文件。
// 页面和接口不在同一个域名：上传页面时把 <meta name="tj-api"> 改成接口的地址，并把页面域名加进安全域名。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CloudBase from '@cloudbase/manager-node';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env'), 'utf8') : '').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const miss = ['TCB_ENV_ID', 'TCB_SECRET_ID', 'TCB_SECRET_KEY'].filter((k) => !env[k]);
if (miss.length) { console.error(`.env 里缺 ${miss.join('、')}。见 .env.example。`); process.exit(1); }
if (!fs.existsSync(path.join(root, 'dist/index.html'))) { console.error('先 npm run build。'); process.exit(1); }
const hide = (s) => String(s).split(env.TCB_SECRET_ID).join('［隐］').split(env.TCB_SECRET_KEY).join('［隐］');
const only = process.argv.slice(2);              // 可以只部署一部分：fn / db / route / web
const want = (k) => !only.length || only.includes(k);
export const COLLECTIONS = ['discs', 'echoes', 'photos', 'heard', 'favs', 'reports', 'posts', 'replies', 'reacts', 'topics', 'relays', 'albums', 'tracks', 'files'];

const app = new CloudBase({ secretId: env.TCB_SECRET_ID, secretKey: env.TCB_SECRET_KEY, envId: env.TCB_ENV_ID });
const step = async (name, fn) => {
  process.stdout.write(`${name}…`);
  try { const r = await fn(); console.log(` 好了${r ? `：${hide(r)}` : ''}`); return true; }
  catch (e) { console.log(` 没成功：${hide(e.code || '')} ${hide(e.message || e).slice(0, 300)}`); return false; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— 1. 云函数：把 handle、存储、契约、JPEG 清洗、时间口径、校历拷进函数目录，上传，云上装依赖 ——
const fnDir = path.join(root, 'cloudfunctions/api');
const copy = (from, to) => { fs.mkdirSync(path.dirname(path.join(fnDir, to)), { recursive: true }); fs.copyFileSync(path.join(root, from), path.join(fnDir, to)); };
copy('server/api.mjs', 'server/api.mjs');
copy('server/store-cloudbase.mjs', 'server/store-cloudbase.mjs');
for (const f of ['contract.js', 'jpeg-clean.js', 'calendar.js']) copy(`src/kesheng/web/${f}`, `src/kesheng/web/${f}`);
for (const f of fs.readdirSync(path.join(root, 'src/lib')).filter((f) => ['when.js', 'topics.js'].includes(f))) copy(`src/lib/${f}`, `src/lib/${f}`);
copy('public/data/calendar.json', 'calendar.json');
// 函数根目录的 package.json 没有 type（index.js 是 CommonJS 入口）；src/ 里是 ES 模块的 .js，要单独标出来
fs.writeFileSync(path.join(fnDir, 'src/package.json'), JSON.stringify({ type: 'module' }));
fs.writeFileSync(path.join(fnDir, 'package.json'), JSON.stringify({ name: 'tingjian-api', private: true, main: 'index.js', dependencies: { '@cloudbase/node-sdk': '^4.2.1' } }, null, 2));
const func = { name: 'api', runtime: 'Nodejs18.15', handler: 'index.main', timeout: 20, memorySize: 256, installDependency: true,
  envVariables: { KS_REVIEW: env.KS_REVIEW || '1', KS_ADMIN_TOKEN: env.KS_ADMIN_TOKEN || '' }, ignore: ['node_modules', 'node_modules/**'] };
if (want('fn')) {
  const exists = (await app.functions.listFunctions(100, 0)).some((f) => f.FunctionName === 'api');
  if (!exists) await step('新建云函数 api', () => app.functions.createFunction({ func, functionRootPath: path.join(root, 'cloudfunctions'), force: true }).then(() => ''));
  else {
    await step('更新云函数代码', () => app.functions.updateFunctionCode({ func, functionRootPath: path.join(root, 'cloudfunctions') }).then(() => ''));
    // 代码更新完之前函数是 Updating，改不了配置：等它变回 Active 再改
    for (let i = 0; i < 40; i++) { const d = await app.functions.getFunctionDetail('api').catch(() => null); if (d && d.Status === 'Active') break; await sleep(3000); }
    await step('更新云函数配置', () => app.functions.updateFunctionConfig(func).then(() => ''));
  }
  // 云上装依赖要一会儿：等到状态是 Active
  for (let i = 0; i < 60; i++) {
    const d = await app.functions.getFunctionDetail('api').catch(() => null);
    if (d && d.Status === 'Active') { console.log(`云函数 api 就绪（${d.Runtime}）`); break; }
    if (d && /Fail/i.test(d.Status)) { console.log(`云函数状态：${d.Status} ${hide(d.StatusDesc || '')}`); break; }
    await sleep(5000);
  }
}

// —— 2. 数据库集合 ——
// 新环境是 PostgreSQL + 文档插件：管理接口建不了集合，用数据库 SDK 建；插件没开时先开（等同控制台「文档编辑器」里点开通）
if (want('db')) {
  const svc = app.commonService('tcb', '2018-06-08');
  await step('文档插件', async () => { const r = await svc.call({ Action: 'EnablePGDocumentExt', Param: { EnvId: env.TCB_ENV_ID } }); return r.Enabled ? '已开' : JSON.stringify(r); });
  const { default: tcb } = await import('@cloudbase/node-sdk');
  const db = tcb.init({ env: env.TCB_ENV_ID, secretId: env.TCB_SECRET_ID, secretKey: env.TCB_SECRET_KEY }).database();
  for (const c of COLLECTIONS) {
    await step(`集合 ${c}`, async () => {
      try { await db.createCollection(c); return '新建'; }
      catch (e) { if (e.code === 'DATABASE_COLLECTION_ALREADY_EXIST') return '已有'; throw e; }
    });
  }
}

// —— 3. HTTP 访问服务：/api → 云函数 api；页面域名加进安全域名 ——
const hosting = (await app.hosting.getInfo())[0];
const webDomain = hosting && hosting.CdnDomain;
const apiDomain = (await app.access.getDomainList()).DefaultDomain;
if (want('route')) {
  const routes = (await app.access.getAccessList()).APISet || [];
  if (!routes.some((a) => a.Path === '/api')) await step('HTTP 访问路由 /api', () => app.access.createAccess({ path: '/api', name: 'api' }).then(() => ''));
  else console.log('HTTP 访问路由 /api 已有');
  const domains = ((await app.env.getEnvAuthDomains()).Domains || []).map((d) => d.Domain);
  const need = [webDomain, '127.0.0.1', 'localhost'].filter((d) => d && !domains.includes(d));
  if (need.length) await step(`安全域名 ${need.join('、')}`, () => app.env.createEnvDomain(need).then(() => ''));
}

// —— 4. 静态托管：dist 拷到 .deploy，把接口地址写进去，上传 ——
if (want('web')) {
  const out = path.join(root, '.deploy');
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'dist'), out, { recursive: true });
  const html = path.join(out, 'index.html');
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('<meta name="tj-api" content="/api">', `<meta name="tj-api" content="https://${apiDomain}/api">`));
  let n = 0;
  await step('上传页面', () => app.hosting.uploadFiles({ localPath: out, cloudPath: '', parallel: 8, onFileFinish: () => { n++; } }).then(() => `${n} 个文件`));
}
console.log(`\n页面：https://${webDomain}/\n接口：https://${apiDomain}/api/health`);
