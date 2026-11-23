import { createRouter, createWebHashHistory } from 'vue-router'
import MapView from '@/views/MapView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/sound' },
    { path: '/sound/:id?', name: 'map', component: MapView },
    { path: '/:pathMatch(.*)*', redirect: '/sound' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
