import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createCloud, nodeHandler } from './scripts/dev-cloud.mjs';

// 开发（npm run dev）和预览（npm run preview、npm run e2e）时，/api 由进程内的开发用云模拟器接住，数据在内存里，重启就清。
// 这样一台电脑上开两个浏览器窗口，就能看到"A 留的话，B 看得到"。构建出来的静态文件里没有它：部署到哪里，/api 就要指到哪里的云。
// KS_REVIEW=1 npm run dev：照片先审后显（上传后只有作者自己看得到）。
function devCloud() {
  const cloud = createCloud({ review: process.env.KS_REVIEW === '1' });
  const h = nodeHandler(cloud);
  // 注意：钩子不能返回值。Vite 会把返回的函数当成"后置钩子"无参数调用，返回 connect 应用本身就会崩（req 是 undefined）
  const mount = (server) => {
    server.middlewares.use((req, res, next) => (req.url && req.url.startsWith('/api/') ? h(req, res) : next()));
  };
  return { name: 'ks-dev-cloud', configureServer: mount, configurePreviewServer: mount };
}

// base 用相对路径，部署到 Pages 子路径也能打开；路由用 hash 模式，子页面按 F5 不会 404
export default defineConfig({
  base: './',
  plugins: [vue(), devCloud()],
  build: { chunkSizeWarningLimit: 700 },
});
