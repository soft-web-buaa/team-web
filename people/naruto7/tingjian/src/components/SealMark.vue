<script setup>
// 一枚朱文小印「北航」：刻声卡用学号盖过章的记号。印泥红是除示波黄之外唯一不随钟点变的颜色（和收件箱的新消息点同一族）。
// 边缘用一点噪声扰动，像真盖上去的；fresh 时从上面按下来一次。
defineProps({ size: { type: Number, default: 46 }, fresh: Boolean, title: { type: String, default: '已用学号盖章' } });
const fid = `seal-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <svg class="seal-mark" :class="{ fresh }" :width="size * 0.64" :height="size" viewBox="0 0 32 50" role="img" :aria-label="title">
    <defs>
      <filter :id="fid" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="1.4" />
      </filter>
    </defs>
    <g :filter="`url(#${fid})`">
      <rect x="1.2" y="1.2" width="29.6" height="47.6" rx="2.2" fill="var(--seal)" />
      <text x="16" y="21.5" text-anchor="middle" class="ch">北</text>
      <text x="16" y="42.5" text-anchor="middle" class="ch">航</text>
    </g>
  </svg>
</template>

<style scoped>
.seal-mark { --seal: #B8322A; display: inline-block; vertical-align: middle; transform: rotate(-4deg); opacity: .9; }
.ch { font: 400 19px/1 var(--f-show); fill: var(--paper); }
.seal-mark.fresh { animation: stamp .42s cubic-bezier(.2, .9, .25, 1.15) both; }
@keyframes stamp {
  0% { transform: translateY(-10px) scale(1.5) rotate(-14deg); opacity: 0; }
  55% { transform: scale(.94) rotate(-3deg); opacity: .95; }
  100% { transform: rotate(-4deg); opacity: .9; }
}
</style>
