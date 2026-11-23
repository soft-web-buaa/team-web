<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <div class="modal" role="dialog" aria-modal="true" aria-label="关于本项目" @click.self="ui.aboutOpen = false">
    <div class="modal__card about">
      <button class="modal__close" type="button" aria-label="关闭" @click="ui.aboutOpen = false">×</button>
      <p class="eyebrow">ABOUT · 课程演示版</p>
      <h2>听见校园</h2>
      <p class="lede">
        一张可以听的地图。拖动底部的时间轴，看学院路校区从清晨到深夜的光线变化，点开任意一个声音点，
        听一段十秒钟的校园切片，读一条别人留下的声音记忆。
      </p>

      <dl>
        <div>
          <dt>学校</dt>
          <dd>北京航空航天大学 · 学院路校区</dd>
        </div>
        <div>
          <dt>技术</dt>
          <dd>Vue 3 · Leaflet · Web Audio · Canvas</dd>
        </div>
        <div>
          <dt>小组</dt>
          <dd>软件导论 6 人组 · 10 个工作日</dd>
        </div>
      </dl>

      <ul class="notes">
        <li><strong>演示数据</strong>声音条目、故事与“声音记忆”均为课程演示用虚构内容，不对应真实人物。</li>
        <li><strong>合成音</strong>当前版本不包含真实录音，播放的是 Web Audio 实时合成的提示音。</li>
        <li><strong>校园平面图</strong>底图取自北航学院路校区平面图，仅用于课程演示，版权归原图作者与学校所有，不作商业用途。</li>
        <li><strong>社区范围</strong>收藏仅保存在本机；声音记忆提交后标记为“待审核”，仅本机可见，不进入公开库。</li>
      </ul>

      <footer class="modal__foot">听见校园 · Soundscape Atlas · v0.1</footer>
    </div>
  </div>
</template>

<style scoped>
.modal__card.about {
  max-width: 560px;
}

h2 {
  margin: 6px 0 0;
  font-family: var(--font-serif);
  font-size: 34px;
  letter-spacing: 0.16em;
  color: var(--ink);
}

.lede {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.95;
  color: color-mix(in srgb, var(--ink) 85%, transparent);
}

dl {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 18px 0 0;
  padding: 14px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

dl div {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

dt {
  flex: none;
  width: 42px;
  color: var(--ink-soft);
  letter-spacing: 0.1em;
}

dd {
  margin: 0;
  color: var(--ink);
}

.notes {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.notes li {
  position: relative;
  padding-left: 14px;
  font-size: 12px;
  line-height: 1.8;
  color: color-mix(in srgb, var(--ink) 82%, transparent);
}

.notes li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.notes strong {
  color: var(--ink);
  font-weight: 600;
  margin-right: 6px;
}

@media (max-width: 720px) {
  h2 {
    font-size: 27px;
  }
}
</style>
