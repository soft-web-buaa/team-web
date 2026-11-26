import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';
import { createApi } from './server/api.mjs';
import { fileStore } from './server/store-file.mjs';
import { nodeHandler } from './server/http.mjs';
import { localLogin } from './server/mail.mjs';

// 开发与预览时自带 /api（本机文件存储，数据在 .data/）。构建出来的静态文件里没有它：线上的 /api 是 CloudBase 云函数。
function localApi() {
  let handler = null;
  const mount = (server) => {
    const ready = (async () => {
      const calendar = JSON.parse(fs.readFileSync(path.resolve('public/data/calendar.json'), 'utf8'));
      const dataDir = path.resolve(process.env.KS_DATA || '.data');
      handler = nodeHandler(createApi({ store: fileStore(dataDir), review: process.env.KS_REVIEW === '1', adminToken: process.env.KS_ADMIN_TOKEN || '', calendar, login: await localLogin(dataDir) }));
    })();
    server.middlewares.use(async (req, res, next) => { if (!req.url.startsWith('/api/')) return next(); await ready; return handler(req, res); });
  };
  return { name: 'tingjian-local-api', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig({
  base: './',
  plugins: [vue(), localApi()],
  // three.js 单独成一块：它不常变，浏览器缓存住以后，改页面只要重新下小的那一块
  build: { target: 'es2022', chunkSizeWarningLimit: 900, rolldownOptions: { output: { advancedChunks: { groups: [{ name: 'three', test: /node_modules[\/]three/ }, { name: 'vue', test: /node_modules[\/](@vue|vue|vue-router)/ }] } } } },
  server: { port: 5273, host: '127.0.0.1' },
  preview: { port: 5274, host: '127.0.0.1' },
});
