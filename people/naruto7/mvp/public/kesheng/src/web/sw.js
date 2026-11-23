// 刻声 · Service Worker（T-04）
// 目标：断网刷新后页面照常能用——刻、搓、测、寻都不依赖网络；馆藏音频第一次播放后进缓存。
// 策略：精确预缓存「首屏 + 引擎 + 字体 + 数据」；其余同源 GET 用「缓存优先 + 回填」。
// 升级：改 VERSION 就会换一个缓存桶，旧的自动清掉（不要在别处写死版本）。
const VERSION = 'ks-v9-2026-10-22';

const SHELL = [
  './', './index.html', './app.js', './style.css',
  './store.js', './zip.js', './slot.js', './calendar.js', './plan.js', './disc.js', './groove.js',
  './naming.js', './median.js', './vendor/fflate.js', './tier.js', './find.js', './place-guess.js',
  './submit.js', './identity.js', './library.js', './receipt.js', './semester.js', './rings.js',
  '../dsp/fft.js', '../dsp/biquad.js', '../dsp/stft.js', '../dsp/fingerprint.js', '../dsp/quality.js', '../dsp/rt60.js', '../dsp/synth.js', '../dsp/scene.js',
  '../worklets/scratch.js', '../worklets/capture.js',
  './fonts/ks-fangsong-subset.woff2',
  './data/calendar.json', './data/places.json', './data/places-xy.json', './archive/catalog.json',
  // 史料：选单只剩 index.json；音频唯一的一份在 archive/audio/（catalog.json 是真相源），第一次播放后进缓存
  './history/index.json',
  // 分区图：页面、示例柜（声纹 1 MB，后台线程里摆）、示例与地点候选
  './plan3d/', './plan3d/index.html', './plan3d/plan3d.js', './plan3d/plan3d.css', './plan3d/sounds.js', './plan3d/campus-xy.json', './plan3d/demo-catalog.json',
  './plan3d/bands.js', './plan3d/model.js', './plan3d/quick.js', './plan3d/light-rig.js', './plan3d/shelf.js', './plan3d/shelf-worker.js', './plan3d/examples.js', './plan3d/derived/shelf-v1.json', './plan3d/derived/shelf-v1.bin',
  './fonts/ks-fangsong-plan.woff2',
  // three.js（vendored 0.180）：分区图离线也要能画；清单由 test/unit/offline-shell.test.js 按导入树核对
  './vendor/three/BufferGeometryUtils.js', './vendor/three/CopyShader.js', './vendor/three/EffectComposer.js', './vendor/three/GTAOPass.js', './vendor/three/GTAOShader.js', './vendor/three/HorizontalTiltShiftShader.js', './vendor/three/LuminosityHighPassShader.js', './vendor/three/MaskPass.js', './vendor/three/OrbitControls.js', './vendor/three/OutputPass.js', './vendor/three/OutputShader.js', './vendor/three/Pass.js', './vendor/three/PoissonDenoiseShader.js', './vendor/three/RenderPass.js', './vendor/three/RoomEnvironment.js', './vendor/three/ShaderPass.js', './vendor/three/SimplexNoise.js', './vendor/three/UnrealBloomPass.js', './vendor/three/VerticalTiltShiftShader.js', './vendor/three/three.core.min.js', './vendor/three/three.module.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 逐个加，任何一个 404 都不让整次安装失败（那份资源只是离线时不可用）
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const CATALOG = './archive/catalog.json';

/** 目录走网络优先：撤回、入藏要立刻对回访者生效（缓存优先会让旧目录一直活着）。
 *  顺带把「目录里已经没有的馆藏音频」从缓存里删掉——否则撤回后音频仍可从缓存播放。 */
async function refreshCatalog(cache) {
  const res = await fetch(CATALOG, { cache: 'no-store' });
  if (!res.ok) return;
  const data = await res.clone().json();
  await cache.put(CATALOG, res);
  const allowed = new Set((data.entries || [])
    .filter((e) => e.status === 'accessioned')
    .map((e) => new URL(`./archive/${e.file || `audio/${encodeURIComponent(e.no)}.wav`}`, self.location).pathname));
  const keys = await cache.keys();
  await Promise.all(keys.map(async (req) => {
    const p = new URL(req.url).pathname;
    if (p.includes('/archive/audio/') && !allowed.has(p)) await cache.delete(req);
  }));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 馆藏目录：网络优先，离线退回缓存
  if (url.pathname.endsWith('/archive/catalog.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try { await refreshCatalog(cache); } catch { /* 离线：用缓存 */ }
      const hit = await cache.match(CATALOG, { ignoreSearch: true });
      return hit || fetch(CATALOG);
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch {
      // 断网且没缓存：导航请求退回首页，其余原样失败（不伪造内容）
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw new Error('离线且没有缓存：' + url.pathname);
    }
  })());
});
