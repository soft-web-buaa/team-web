// 一键走查：构建，起预览服务，跑一个走查脚本，关服务，把退出码带回来。
//   npm run e2e                  先构建，再跑 54 项走查（flows.mjs）
//   npm run e2e:kesheng          先构建，再跑刻声副本冒烟（kesheng-smoke.mjs）
//   在命令后面加 -- --no-build   跳过构建，用现有的 dist/
// 端口默认 4173，被占用就直接报错，不换端口（换了端口，走查打到的可能是别人的服务）。
import { build, preview } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.E2E_PORT || 4173);
const script = process.argv.includes('kesheng') ? 'kesheng-smoke.mjs' : 'flows.mjs';

if (!process.argv.includes('--no-build')) await build({ root, logLevel: 'warn' });

const server = await preview({ root, logLevel: 'warn', preview: { host: '127.0.0.1', port, strictPort: true } });
const code = await new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(root, 'scripts/e2e', script)], {
    stdio: 'inherit',
    env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}/` },
  });
  child.on('exit', (c) => resolve(c ?? 1));
});
await server.close();
process.exit(code);
