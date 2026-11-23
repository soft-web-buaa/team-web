<script setup>
// 回应：话题是预置的问题，每个话题下挂几段原声和大家的回应。
// 没有话题 id 时显示话题列表；有 id 时显示这个话题的页面。
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import SoundCard from '../components/SoundCard.vue';
import { TOPICS } from '../data/topics.js';
import { MOODS } from '../data/sounds.js';
import CohortGate from '../components/CohortGate.vue';
import { cohortLabel } from '../data/community.js';
import { topicById, repliesOf, createReply, soundById, reportItem, REPLY_MAX } from '../lib/store.js';
import { say } from '../lib/toast.js';

const route = useRoute();
const topic = computed(() => topicById(route.params.id));
const sounds = computed(() => (topic.value ? topic.value.soundIds.map(soundById).filter(Boolean) : []));
const replies = computed(() => (topic.value ? repliesOf(topic.value.id) : []));

const text = ref('');
const mood = ref('');
const error = ref('');
const busy = ref(false);

function report(r) {
  reportItem(r.id);
  say('已隐藏这一条。');
}

function countOf(t) {
  return { sounds: t.soundIds.length, replies: repliesOf(t.id).length };
}

async function send() {
  error.value = '';
  busy.value = true;
  try {
    await createReply(topic.value.id, { text: text.value, mood: mood.value });
    text.value = '';
    mood.value = '';
    say('已回应');
  } catch (e) {
    error.value = e.message || '没有发出去，再试一次。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- 话题页 -->
  <template v-if="route.params.id">
    <section v-if="topic" class="topic">
      <p><RouterLink class="link small" to="/topics">所有话题</RouterLink></p>
      <h1 class="page-title">{{ topic.title }}</h1>
      <p class="prompt">{{ topic.prompt }}</p>

      <h2 class="section-title">原声</h2>
      <div class="sounds">
        <SoundCard v-for="s in sounds" :key="s.id" :sound="s" />
      </div>

      <h2 class="section-title">回应</h2>
      <ul v-if="replies.length" class="replies">
        <li v-for="r in replies" :key="r.id">
          <p>{{ r.text }}</p>
          <p class="muted small">
            {{ r.cohort ? cohortLabel(r.cohort) + '，' : '' }}心情：{{ r.mood }}
            <span v-if="r.demo" class="tag demo">示例</span>
            <span v-else-if="r.mine" class="tag real">我的</span>
            <button class="link small" type="button" :aria-label="'举报这条回应：' + r.text" @click="report(r)">举报</button>
          </p>
        </li>
      </ul>
      <p v-else class="empty">还没有回应。听完上面的声音，写第一句。</p>

      <form class="reply" novalidate @submit.prevent="send">
        <CohortGate why="回应之前，先告诉我们你是哪一级的，不用实名。">
          <label class="field">
            <span>你的回应（最多 {{ REPLY_MAX }} 字，不能放链接和号码）</span>
            <textarea v-model="text" rows="2" :maxlength="REPLY_MAX" placeholder="你听到的是什么？"></textarea>
          </label>
          <div class="chips" role="radiogroup" aria-label="心情">
            <button v-for="m in MOODS" :key="m" class="chip" type="button" role="radio" :aria-checked="mood === m" :class="{ on: mood === m }" @click="mood = m">{{ m }}</button>
          </div>
          <p v-if="error" class="err" role="alert">{{ error }}</p>
          <button class="btn" type="submit" :disabled="busy">回应</button>
          <p class="muted small">现在只存在这台设备上，别人看不到。</p>
        </CohortGate>
      </form>
    </section>

    <section v-else class="topic">
      <h1 class="page-title">没有这个话题</h1>
      <p class="empty">话题可能已经下线。<RouterLink class="link" to="/topics">回到话题列表</RouterLink></p>
    </section>
  </template>

  <!-- 话题列表 -->
  <template v-else>
    <h1 class="page-title">回应</h1>
    <p class="lead muted intro">每个话题是一个问题。先听原声，再回应一句。</p>
    <ul class="list">
      <li v-for="t in TOPICS" :key="t.id">
        <RouterLink :to="'/topics/' + t.id">
          <strong>{{ t.title }}</strong>
          <span class="q">{{ t.prompt }}</span>
          <span class="muted small">
            <span class="num">{{ countOf(t).sounds }}</span> 段原声，<span class="num">{{ countOf(t).replies }}</span> 条回应
          </span>
        </RouterLink>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.intro {
  margin-top: 0.4rem;
}

.list {
  max-width: 44rem;
  margin-top: 1.4rem;
  border-top: 1px solid var(--line-strong);
}

.list li {
  border-bottom: 1px solid var(--line-strong);
}

.list a {
  display: grid;
  gap: 0.15rem;
  padding: 1rem 0;
  text-decoration: none;
}

.list strong {
  font-size: var(--t-1);
  font-weight: 400;
}

.list a:hover strong {
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.25em;
}

.topic {
  display: grid;
  gap: 1rem;
  max-width: 44rem;
}

.prompt {
  font-size: var(--t-1);
  line-height: 1.6;
}

.topic .section-title {
  margin-top: 1rem;
}

.sounds {
  display: grid;
  gap: 1rem;
}

.replies {
  display: grid;
  gap: 0.9rem;
}

.replies li {
  padding-left: 1rem;
  border-left: 3px solid var(--line-strong);
}

.reply {
  display: grid;
  gap: 0.8rem;
  margin-top: 0.6rem;
  padding-top: 1.2rem;
  border-top: 1px solid var(--line-strong);
}

.err {
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--accent);
  background: var(--panel);
}

.reply .btn {
  justify-self: start;
}
</style>
