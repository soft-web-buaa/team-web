// 听见校园 · 页面之间共享的一点状态（不进云、不进本机库）。
import { reactive } from 'vue';

export const ui = reactive({
  clip: null,          // 舞台上正在放的那张：{ id, seconds, dur, env, playing }
  layer: 'all',        // 社区光柱的口径：all 全部 / sem 本学期 / hour 这个钟点 / echo 被回应过的
  rec: { state: 'idle', n: 0, fs: 48000, level: 0 },   // idle / opening / rec
  take: null,          // 刚刻好、还没发出去的一段：{ pcm, fs, at, tex, seconds }
  recPlace: null,      // 刻的时候预选的地点（在地点页里按就是这里）
  screen: false,       // 屏风开着
  narrow: false,       // 窄屏（手机）
  sheet: 'half',       // 窄屏的纸：half / full / min
});
