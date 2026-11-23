<script setup>
// 留声：四步，真的是先后顺序，所以用编号。
// 声音来源有两种：用麦克风录一段（最长 10 秒），或者先选一段示例声音试试流程。
import { ref, computed, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import PlayButton from '../components/PlayButton.vue';
import { BLOCKS } from '../data/campus.js';
import { MOODS } from '../data/sounds.js';
import { createSound } from '../lib/store.js';
import { fmt, nowHour } from '../lib/time.js';
import { say } from '../lib/toast.js';

const router = useRouter();

const LABELS = { bell: '铃声', prepbell: '预备铃', birds: '鸟鸣', whistle: '哨声', canteen: '食堂', rain: '雨声', basketball: '运球声', cat: '猫叫' };
const DURATIONS = { bell: 10, prepbell: 7, birds: 12, whistle: 9, canteen: 12, rain: 12, basketball: 9, cat: 7 };

const block = ref('');
const place = ref('');
const source = ref('example'); // 'example' | 'mic'
const recipe = ref('bell');
const micSrc = ref('');
const micError = ref('');
const recording = ref(false);
const mood = ref('');
const title = ref('');
const story = ref('');
const agreed = ref(false);
const busy = ref(false);
const errors = ref([]);

let stream = null;
let rec = null;
let chunks = [];
let stopTimer = 0;

const preview = computed(() => ({
  id: 'draft',
  title: source.value === 'mic' ? '我录的声音' : LABELS[recipe.value],
  recipe: source.value === 'example' ? recipe.value : null,
  src: source.value === 'mic' ? micSrc.value : null,
  duration: source.value === 'mic' ? 10 : DURATIONS[recipe.value],
}));
const hasSound = computed(() => (source.value === 'example' ? !!recipe.value : !!micSrc.value));

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('读取录音失败。'));
    r.readAsDataURL(blob);
  });
}

async function startRec() {
  micError.value = '';
  micSrc.value = '';
  try {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('这个浏览器不能录音。');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec = new MediaRecorder(stream);
    chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recording.value = false;
      const blob = new Blob(chunks, { type: rec.mimeType });
      if (blob.size > 700000) {
        micError.value = '这段录音太大，存不下。录短一点再试。';
        return;
      }
      micSrc.value = await blobToDataUrl(blob);
    };
    rec.start();
    recording.value = true;
    stopTimer = setTimeout(stopRec, 10000);
  } catch (e) {
    recording.value = false;
    micError.value =
      e && e.name === 'NotAllowedError'
        ? '没有拿到麦克风。点地址栏左边的锁，允许使用麦克风，再试一次。'
        : (e && e.message) || '录音失败。先选一段示例声音也可以走完这个流程。';
  }
}

function stopRec() {
  clearTimeout(stopTimer);
  if (rec && rec.state === 'recording') rec.stop();
}

onBeforeUnmount(() => {
  clearTimeout(stopTimer);
  if (rec && rec.state === 'recording') rec.stop();
});

function validate() {
  const e = [];
  if (!block.value) e.push('第 1 步：选一个地点。');
  if (!hasSound.value) e.push('第 2 步：录一段声音，或选一段示例声音。');
  if (!mood.value) e.push('第 3 步：选一个心情。');
  if (source.value === 'mic' && !agreed.value) e.push('第 4 步：勾选“这段声音是我自己录的”。');
  errors.value = e;
  return e.length === 0;
}

async function submit() {
  if (!validate()) return;
  busy.value = true;
  try {
    const demo = source.value === 'example';
    const s = await createSound({
      title: title.value || (demo ? LABELS[recipe.value] : ''),
      block: block.value,
      place: place.value,
      mood: mood.value,
      story: story.value,
      src: preview.value.src,
      recipe: preview.value.recipe,
      duration: preview.value.duration,
      demo,
    });
    say('已留下这段声音');
    router.push({ path: '/map', query: { id: s.id } });
  } catch (e) {
    errors.value = [e.message || '没有留下，再试一次。'];
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1 class="page-title">留声</h1>
  <p class="lead muted intro">留下一段你在校园里听到的声音。它会记在 <span class="num">{{ fmt(nowHour()) }}</span> 这个钟点。</p>

  <form class="steps" novalidate @submit.prevent="submit">
    <ol>
      <li>
        <h2>选一个地点</h2>
        <div class="chips" role="radiogroup" aria-label="地点">
          <button
            v-for="b in BLOCKS"
            :key="b.id"
            class="chip"
            type="button"
            role="radio"
            :aria-checked="block === b.id"
            :class="{ on: block === b.id }"
            @click="block = b.id"
          >
            {{ b.name }}
          </button>
        </div>
        <label class="field">
          <span>具体在哪里（可不填）</span>
          <input v-model="place" type="text" maxlength="16" placeholder="例如：一教走廊" />
        </label>
      </li>

      <li>
        <h2>录一段声音</h2>
        <div class="chips" role="radiogroup" aria-label="声音来源">
          <button class="chip" type="button" role="radio" :aria-checked="source === 'mic'" :class="{ on: source === 'mic' }" @click="source = 'mic'">用麦克风录</button>
          <button class="chip" type="button" role="radio" :aria-checked="source === 'example'" :class="{ on: source === 'example' }" @click="source = 'example'">先选一段示例声音</button>
        </div>

        <div v-if="source === 'mic'" class="mic">
          <button v-if="!recording" class="btn" type="button" @click="startRec">开始录音，最长 10 秒</button>
          <button v-else class="btn" type="button" @click="stopRec">停止录音</button>
          <p v-if="recording" class="rec" role="status">正在录音……</p>
          <p v-if="micError" class="err" role="alert">{{ micError }}</p>
          <div v-if="micSrc" class="after"><PlayButton :sound="preview" /><span class="muted small">录好了，点播放听一遍。不满意可以重录。</span></div>
        </div>

        <div v-else class="example">
          <div class="chips" role="radiogroup" aria-label="示例声音">
            <button v-for="(label, key) in LABELS" :key="key" class="chip" type="button" role="radio" :aria-checked="recipe === key" :class="{ on: recipe === key }" @click="recipe = key">{{ label }}</button>
          </div>
          <div class="after"><PlayButton :sound="preview" /><span class="muted small">示例声音是浏览器合成的，会带“示例”标记。</span></div>
        </div>
      </li>

      <li>
        <h2>这段声音给你什么感觉</h2>
        <div class="chips" role="radiogroup" aria-label="心情">
          <button v-for="m in MOODS" :key="m" class="chip" type="button" role="radio" :aria-checked="mood === m" :class="{ on: mood === m }" @click="mood = m">{{ m }}</button>
        </div>
        <label class="field">
          <span>给它起个名字（可不填，最多 12 字）</span>
          <input v-model="title" type="text" maxlength="12" placeholder="例如：下课的走廊" />
        </label>
        <label class="field">
          <span>写一句话（可不填，最多 60 字）</span>
          <textarea v-model="story" rows="2" maxlength="60" placeholder="当时发生了什么？"></textarea>
        </label>
      </li>

      <li>
        <h2>留下它</h2>
        <label v-if="source === 'mic'" class="agree">
          <input v-model="agreed" type="checkbox" />
          <span>这段声音是我自己录的。</span>
        </label>
        <p class="muted small keep">现在只存在这台设备上，别人看不到。后端接上以后，这里会变成所有人都能听到。</p>
        <button class="btn" type="submit" :disabled="busy">留下这段声音</button>
        <ul v-if="errors.length" class="errors" role="alert">
          <li v-for="e in errors" :key="e">{{ e }}</li>
        </ul>
      </li>
    </ol>
  </form>
</template>

<style scoped>
.intro {
  margin-top: 0.4rem;
}

.steps {
  max-width: 40rem;
  margin-top: 1.5rem;
}

ol {
  display: grid;
  gap: 2rem;
  counter-reset: step;
}

ol > li {
  position: relative;
  display: grid;
  gap: 0.8rem;
  padding-left: 3rem;
  counter-increment: step;
}

ol > li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: -0.1rem;
  width: 2.1rem;
  height: 2.1rem;
  display: grid;
  place-items: center;
  border: 2px solid var(--ink);
  border-radius: 50%;
  font-family: var(--font-num);
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1;
}

h2 {
  font-size: var(--t-1);
}

.mic,
.example {
  display: grid;
  gap: 0.7rem;
}

.after {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
}

.rec {
  color: var(--accent);
}

.err,
.errors {
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--accent);
  background: var(--panel);
}

.errors {
  display: grid;
  gap: 0.2rem;
}

.agree {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.agree input {
  width: 22px;
  height: 22px;
  accent-color: var(--accent);
}

.keep {
  max-width: 30em;
}
</style>
