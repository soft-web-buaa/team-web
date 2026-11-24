<script setup>
// 首页：留声机。刻声的三维分区图整体嵌进来，铺满导航下面的整块屏幕。
// 嵌入用 ?embed=1：舞台页自己去掉"回到刻声盘"，把主句换成首页的话。
// 同源，所以落款、回声、柜子都在同一个 localStorage 里，不用来回传话。
// 离开这一页，iframe 随页面卸载，正在放的声音跟着停。
import { ref } from 'vue';

const SRC = './kesheng/src/web/plan3d/index.html?embed=1';
const loaded = ref(false);
</script>

<template>
  <section class="stage-wrap" aria-label="留声机：学院路校区的声片柜">
    <iframe
      class="stage"
      :src="SRC"
      title="留声机：点一个地点，听那里一个学期一个学期留下的声音"
      allow="microphone; autoplay"
      @load="loaded = true"
    ></iframe>
    <noscript>
      <p class="fallback">留声机需要打开浏览器的脚本功能。</p>
    </noscript>
  </section>
</template>

<style scoped>
.stage-wrap {
  position: relative;
  height: var(--stage-h);
  background: #07080a;
}

.stage {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #07080a;
}

.fallback {
  position: absolute;
  inset: 40% 1rem auto;
  color: #f2f4f3;
  text-align: center;
}
</style>
