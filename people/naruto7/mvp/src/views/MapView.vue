<script setup>
// 地图：声音点钉在校园示意图上，一天轨道决定哪些点此刻亮着。
import { computed, ref, watch, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import CampusMap from '../components/CampusMap.vue';
import DayTrack from '../components/DayTrack.vue';
import SoundCard from '../components/SoundCard.vue';
import { hour, setHour } from '../lib/clock.js';
import { isLit, fmt } from '../lib/time.js';
import { allSounds, soundById } from '../lib/store.js';
import { MOODS } from '../data/sounds.js';
import { CAMPUS_NAME } from '../data/campus.js';

const route = useRoute();
const mood = ref(null);
const selectedId = ref(null);

const matchIds = computed(() => (mood.value ? new Set(allSounds.value.filter((s) => s.mood === mood.value).map((s) => s.id)) : null));
const lit = computed(() => allSounds.value.filter((s) => isLit(s, hour.value) && (!matchIds.value || matchIds.value.has(s.id))));
const selected = computed(() => soundById(selectedId.value));

function pick(id) {
  selectedId.value = id;
}

// 从别的页面带着 ?id= 来：选中它，并把天色拨到它通常出现的钟点
function applyQuery() {
  const s = soundById(route.query.id);
  if (s) {
    selectedId.value = s.id;
    setHour(s.hour);
  }
}
onMounted(applyQuery);
watch(() => route.query.id, applyQuery);
</script>

<template>
  <h1 class="page-title">地图</h1>
  <p class="lead muted intro">{{ CAMPUS_NAME }}。拖动下面的轨道换一个钟点，亮着的点是这个钟点前后能听到的声音。</p>

  <div class="top">
    <DayTrack compact />
    <div class="filter" role="group" aria-label="按心情筛选">
      <span class="muted small">按心情看</span>
      <div class="chips">
        <button class="chip" type="button" :aria-pressed="mood === null" @click="mood = null">全部</button>
        <button v-for="m in MOODS" :key="m" class="chip" type="button" :aria-pressed="mood === m" @click="mood = m">{{ m }}</button>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="mapcol">
      <CampusMap :sounds="allSounds" :hour="hour" :selected-id="selectedId" :match-ids="matchIds" @select="pick" />
    </div>

    <aside class="side" aria-live="polite">
      <SoundCard v-if="selected" :key="selected.id" :sound="selected" social="full" />
      <div v-else class="hint">
        <p>点地图上的一个点，在这里听。</p>
        <p v-if="lit.length" class="muted small">
          此刻亮着：
          <template v-for="(s, i) in lit" :key="s.id">
            <button class="link" type="button" @click="pick(s.id)">{{ s.title }}</button><span v-if="i < lit.length - 1">、</span>
          </template>
        </p>
        <p v-else class="empty">
          {{ fmt(hour) }} 前后没有声音{{ mood ? '（心情：' + mood + '）' : '' }}。拖到 7、12、18 或 21 点看看，或者
          <RouterLink class="link" to="/record">自己留一段</RouterLink>。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.intro {
  margin-top: 0.4rem;
}

.top {
  display: grid;
  gap: 1rem;
  margin-block: 1.4rem 1.2rem;
  max-width: 54rem;
}

.filter {
  display: grid;
  gap: 0.4rem;
}

.grid {
  display: grid;
  gap: 1.4rem;
  align-items: start;
}

.hint {
  display: grid;
  gap: 0.6rem;
  padding: 1.1rem 1.2rem;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-panel);
}

@media (min-width: 900px) {
  .grid {
    grid-template-columns: minmax(0, 1.6fr) minmax(18rem, 1fr);
  }

  .side {
    position: sticky;
    top: 1rem;
  }
}
</style>
