<script setup>
// 关于：数据哪来、数了多少、素材来源、过程证据。这页是给评委和陌生人看的。
import { counts, removeMine, state } from '../lib/store.js';
import { say } from '../lib/toast.js';
import { weekLabel } from '../data/semester.js';
import { ARCHIVE } from '../data/archive.js';

const REPO = 'https://github.com/soft-web-buaa/team-web';

async function clear() {
  if (!state.mine.length && !state.myReplies.length) {
    say('这台设备上没有你留下的内容。');
    return;
  }
  if (!window.confirm('清除这台设备上你留下的所有声音和回应？清除后不能恢复。')) return;
  await removeMine();
  say('已清除');
}
</script>

<template>
  <h1 class="page-title">关于</h1>
  <p class="lead muted intro">这是《走进软件》课程的团队项目。{{ weekLabel() }}。</p>

  <section class="block" aria-labelledby="data-h">
    <h2 id="data-h" class="section-title">数据从哪来</h2>
    <p>
      现在共 <span class="num">{{ counts.total }}</span> 段声音：<span class="num">{{ counts.real }}</span> 段真实录音，<span class="num">{{ counts.demo }}</span> 段示例。
    </p>
    <ul class="plain">
      <li>示例声音由浏览器合成，带“示例”标记，不是某个人在某处的真实记录。</li>
      <li>另有 <span class="num">{{ ARCHIVE.length }}</span> 段校史史料，是从公开视频截下的十秒，带“史料”标记，在“时间”页，不计入上面的数。授权状态是口头认可，书面授权还在补；原作者或上传者提出异议，我们会撤下。</li>
      <li>真实录音由团队成员和身边的人在校园里录制，录制者同意使用。</li>
      <li>统计只数真实录音。数据少的时候，页面会写出 n，不下结论。</li>
    </ul>
  </section>

  <section class="block" aria-labelledby="priv-h">
    <h2 id="priv-h" class="section-title">隐私与你的声音</h2>
    <ul class="plain">
      <li>录音只存在你自己的设备上，现在没有上传到任何服务器。</li>
      <li>地点只到建筑或区域，不记录精确位置。</li>
      <li>请不要录下能听清的他人对话。</li>
    </ul>
    <div class="actions">
      <button class="btn ghost" type="button" @click="clear">清除我留下的内容</button>
      <button class="btn ghost" type="button" disabled aria-disabled="true">申请删除线上声音（即将开放）</button>
    </div>
  </section>

  <section class="block" aria-labelledby="src-h">
    <h2 id="src-h" class="section-title">素材来源</h2>
    <ul class="plain">
      <li>字体：霞鹜文楷（SIL OFL 1.1）、Barlow Condensed（SIL OFL 1.1），随网页一起提供。</li>
      <li>地图：学院路校区的分区示意，位置是相对的，不是测绘数据。</li>
      <li>学期和周次来自学校校历。</li>
    </ul>
  </section>

  <section class="block" aria-labelledby="team-h">
    <h2 id="team-h" class="section-title">我们怎么做的</h2>
    <p>代码、分工、会议纪要和每天的进度都在仓库里，可以直接查看。</p>
    <p>
      <a class="link" :href="REPO" target="_blank" rel="noopener noreferrer">打开项目仓库</a>
    </p>
  </section>
</template>

<style scoped>
.intro {
  margin-top: 0.4rem;
}

.block {
  display: grid;
  gap: 0.7rem;
  max-width: 40rem;
  padding-top: 2rem;
}

.plain {
  display: grid;
  gap: 0.4rem;
  padding-left: 1.2rem;
  list-style: disc;
}

.plain li::marker {
  color: var(--accent);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 0.3rem;
}
</style>
