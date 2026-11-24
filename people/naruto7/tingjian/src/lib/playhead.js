// 播放头：组件挂着时每帧读一次舞台的播放位置（秒）。没挂就不跑。
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as stage from '../stage/stage.js';

export function usePlayhead() {
  const pos = ref(0), playing = ref(false);
  let raf = 0;
  const tick = () => { pos.value = stage.position(); playing.value = stage.playing(); raf = requestAnimationFrame(tick); };
  onMounted(() => { raf = requestAnimationFrame(tick); });
  onBeforeUnmount(() => cancelAnimationFrame(raf));
  return { pos, playing };
}
