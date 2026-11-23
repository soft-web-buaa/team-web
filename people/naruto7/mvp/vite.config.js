import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// base 用相对路径，部署到 Pages 子路径也能打开；路由用 hash 模式，子页面按 F5 不会 404
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: { chunkSizeWarningLimit: 700 },
});
