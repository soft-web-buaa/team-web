// 路由用 hash 模式：部署到静态托管后，任何子页面按 F5 都不会 404（MEMORY 里的坑）。
import { createRouter, createWebHashHistory } from 'vue-router';
import { stop } from './lib/audio.js';
import StageView from './views/StageView.vue';
import HomeView from './views/HomeView.vue';
import MapView from './views/MapView.vue';
import RecordView from './views/RecordView.vue';
import TopicsView from './views/TopicsView.vue';
import TimeView from './views/TimeView.vue';
import AboutView from './views/AboutView.vue';
import NotFoundView from './views/NotFoundView.vue';

const routes = [
  { path: '/', component: StageView, meta: { title: '听见校园', full: true } },
  { path: '/now', component: HomeView, meta: { title: '此刻' } },
  { path: '/map', component: MapView, meta: { title: '地图' } },
  { path: '/record', component: RecordView, meta: { title: '留声' } },
  { path: '/topics/:id?', component: TopicsView, meta: { title: '回应' } },
  { path: '/time', component: TimeView, meta: { title: '时间' } },
  { path: '/about', component: AboutView, meta: { title: '关于' } },
  { path: '/:pathMatch(.*)*', component: NotFoundView, meta: { title: '没有这个页面' } },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  stop(); // 换页就停掉正在播的声音
  const t = to.meta.title;
  document.title = t && t !== '听见校园' ? `${t} · 听见校园` : '听见校园 · 声景地图';
});

export default router;
