// 部署到 CloudBase：页面进静态托管，接口进 HTTP 云函数 api，挂在同域的 /api 下。
//   1. 在 .env 里填 TCB_ENV_ID、TCB_SECRET_ID、TCB_SECRET_KEY（.env 不进仓库）
//   2. npm run build && npm run deploy:cloudbase
// 用 @cloudbase/cli（npx 临时装）。脚本只读 .env，不把密钥打印出来，也不写进任何文件。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const env = Object.fromEntries((fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env'), 'utf8') : '').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const need = ['TCB_ENV_ID', 'TCB_SECRET_ID', 'TCB_SECRET_KEY'];
const miss = need.filter((k) => !env[k]);
if (miss.length) { console.error(`.env 里缺 ${miss.join('、')}。见 .env.example。`); process.exit(1); }
if (!fs.existsSync(path.join(root, 'dist/index.html'))) { console.error('先 npm run build。'); process.exit(1); }

// 1. 组装云函数目录：handle、存储、契约、JPEG 清洗、时间口径、校历
const fn = path.join(root, 'cloudfunctions/api');
const copy = (from, to) => { fs.mkdirSync(path.dirname(path.join(fn, to)), { recursive: true }); fs.copyFileSync(path.join(root, from), path.join(fn, to)); };
copy('server/api.mjs', 'server/api.mjs');
copy('server/store-cloudbase.mjs', 'server/store-cloudbase.mjs');
for (const f of ['contract.js', 'jpeg-clean.js', 'calendar.js']) copy(`src/kesheng/web/${f}`, `src/kesheng/web/${f}`);
copy('src/lib/when.js', 'src/lib/when.js');
copy('public/data/calendar.json', 'calendar.json');
fs.writeFileSync(path.join(fn, 'package.json'), JSON.stringify({ name: 'tingjian-api', main: 'index.js', dependencies: { '@cloudbase/node-sdk': '^4.2.1' } }, null, 2));

// 2. 用 CLI 登录、部署。注意：tcb login 只认命令行参数，密钥会在本机进程列表里短暂可见；不打印、不落盘
const cli = (args) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', '@cloudbase/cli@latest', ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, TCB_SECRET_ID: env.TCB_SECRET_ID, TCB_SECRET_KEY: env.TCB_SECRET_KEY }, shell: process.platform === 'win32' });
const E = ['-e', env.TCB_ENV_ID];
cli(['login', '--apiKeyId', env.TCB_SECRET_ID, '--apiKey', env.TCB_SECRET_KEY]);
cli(['fn', 'deploy', 'api', '--dir', 'cloudfunctions/api', '--force', ...E]);
cli(['service', 'create', '-p', '/api', '-f', 'api', ...E]);
cli(['hosting', 'deploy', 'dist', '/', ...E]);
console.log(`\n部署完。页面：https://${env.TCB_ENV_ID}.tcloudbaseapp.com/  接口：同域 /api。集合 discs、echoes、photos、heard、favs、reports 要在控制台的数据库里建好（第一次）。`);
