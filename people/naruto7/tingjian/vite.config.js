import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';
import { createApi } from './server/api.mjs';
import { fileStore } from './server/store-file.mjs';
import { nodeHandler } from './server/http.mjs';

// 开发与预览时自带 /api（本机文件存储，数据在 .data/）。构建出来的静态文件里没有它：线上的 /api 是 CloudBase 云函数。
function localApi() {
  let handler = null;
  const mount = (server) => {
    if (!handler) {
      const calendar = JSON.parse(fs.readFileSync(path.resolve('public/data/calendar.json'), 'utf8'));
      handler = nodeHandler(createApi({ store: fileStore(path.resolve(process.env.KS_DATA || '.data')), review: process.env.KS_REVIEW === '1', adminToken: process.env.KS_ADMIN_TOKEN || '', calendar }));
    }
    server.middlewares.use((req, res, next) => (req.url.startsWith('/api/') ? handler(req, res) : next()));
  };
  return { name: 'tingjian-local-api', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig({
  base: './',
  plugins: [vue(), localApi()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { port: 5190, host: '127.0.0.1' },
  preview: { port: 5191, host: '127.0.0.1' },
});
