// 路由用 hash 模式：部署到静态托管后，任何页面按 F5 都不会 404。
import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';
import PlaceView from './views/PlaceView.vue';
import CommunityView from './views/CommunityView.vue';
import TimeView from './views/TimeView.vue';
import MineView from './views/MineView.vue';
import AboutView from './views/AboutView.vue';

export const NAV = [
  { name: 'home', to: '/', label: '留声机', hint: '何处' },
  { name: 'community', to: '/community', label: '社区', hint: '众人' },
  { name: 'time', to: '/time', label: '年轮', hint: '何时' },
  { name: 'mine', to: '/mine', label: '我的', hint: '我' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: '留声机', mode: 'home' } },
    { path: '/place/:id', name: 'place', component: PlaceView, meta: { title: '地点', mode: 'place' } },
    { path: '/community', name: 'community', component: CommunityView, meta: { title: '社区', mode: 'community' } },
    { path: '/time', name: 'time', component: TimeView, meta: { title: '年轮', mode: 'time' } },
    { path: '/mine', name: 'mine', component: MineView, meta: { title: '我的', mode: 'mine' } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: '关于', mode: 'home' } },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
router.afterEach((to) => {
  document.title = to.name === 'home' ? '听见校园 · 有些声音，比我们在这里待得久' : `${to.meta.title} · 听见校园`;
});
export default router;
