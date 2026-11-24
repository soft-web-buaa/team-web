<script setup>
// 关于：数据从哪来、算了什么、放在哪、怎么删。评委一眼能看到合规与口径。
import { computed } from 'vue';
import Paper from '../components/Paper.vue';
import { L, siteCounts } from '../lib/library.js';

const c = computed(() => { void L.version; return siteCounts(); });
</script>

<template>
  <Paper label="关于">
    <p class="kicker">关于 · 听见校园</p>
    <h1 class="h1">一台放了很多年的留声机</h1>
    <p class="lede">学院路校园坐在盘心，外圈的刻纹一个学期一带。每一张盘是某人在某处某刻留下的十秒。以组长 naruto7 的个人作品「刻声」为底，团队重做。</p>

    <p class="h3">现在有多少</p>
    <table class="tbl">
      <tbody>
        <tr><th>真实录音</th><td class="num">{{ c.real }}</td><td>同学在某处某刻亲手刻的。只有它算人数：{{ c.people }} 位留了落款。</td></tr>
        <tr><th>史料</th><td class="num">{{ c.archival }}</td><td>口述北航、2008 奥运举重、北航之声、绿园实拍。标「史料」，每段写出处，不算人数。</td></tr>
        <tr><th>示意</th><td class="num">{{ c.concept }}</td><td>页面现场合成的声音，用来展示一个地方多年累积的样子。不挂落款、不编来历、不算人数。</td></tr>
      </tbody>
    </table>
    <p class="fine">计数只有一个出口（刻声 tier.js 的 counts）。页面上任何一个数都从这里来。</p>

    <p class="h3">颜色</p>
    <p class="fine">全站的颜色由一个钟点决定：此刻、你选的钟点、或者正在放的那张录下的钟点。三维里的太阳、窗灯和页面的纸、墨用的是同一个函数。正文对纸全天保持 7:1 以上的对比度。</p>

    <p class="h3">放在哪、怎么删</p>
    <p class="fine">云上：盘、钉的话、照片、收藏、举报。这台设备上：刻声卡、还没发出去的、对你隐藏的。照片的拍摄地点在设备上就去掉了，服务端再剥一遍；照片先审后显。文字拦链接和号码，三个不同的人举报先收起。你刻的盘、钉的话都可以自己真删。不收学号、手机号和定位。</p>

    <p class="h3">素材</p>
    <ul class="fine src">
      <li>地图：© OpenStreetMap contributors（ODbL 1.0）；校园体量参考 MrRoam/buaa-xueyuan-campus-3d。楼高是估算，分区是示意。</li>
      <li>字：朱雀仿宋（SIL OFL 1.1），按页面用到的字做了子集。</li>
      <li>三维：three.js（MIT）。刻纹、搓盘、录音、灯光、季节来自刻声。</li>
      <li>史料片段来自 B 站公开稿件与网易云电台，版权归原作者与上传者，随课程作业展示，不二次分发。</li>
    </ul>
    <p class="fine">做的人：走软小组，六个人。<RouterLink to="/">回到留声机</RouterLink></p>
  </Paper>
</template>

<style scoped>
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; font: 15px var(--f-show); padding: 10px 8px 10px 0; vertical-align: top; white-space: nowrap; }
.tbl td { padding: 10px 0; border-top: 1px solid var(--hair); vertical-align: top; color: var(--ink-2); }
.tbl td.num { font: 600 18px var(--f-ui); color: var(--ink); padding-right: 12px; }
.tbl tr:first-child td, .tbl tr:first-child th { border-top: 0; }
.tbl th { border-top: 1px solid var(--hair); }
.src { padding-left: 1.1em; }
.src li { margin-bottom: 6px; }
</style>
