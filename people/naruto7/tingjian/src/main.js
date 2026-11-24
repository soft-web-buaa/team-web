import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import './styles/base.css';
import './lib/clock.js';

createApp(App).use(router).mount('#app');
