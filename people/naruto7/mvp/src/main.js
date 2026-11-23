import { createApp } from 'vue';
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import './styles/main.css';
import App from './App.vue';
import router from './router.js';
import { initClock } from './lib/clock.js';

// 先把天色定好再挂载，避免第一帧闪一下默认颜色
initClock();

createApp(App).use(router).mount('#app');
