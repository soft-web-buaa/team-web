<script setup>
// 说话之前先选入学年份。这是整个社区层唯一的"身份"：不实名，也不是完全匿名，
// 大家看到的是"2023 级的人"。选了以后在这台设备上记住，可以随时换或清除。
import { state, setMe, resetMe } from '../lib/store.js';
import { COHORTS, cohortLabel } from '../data/community.js';
import { say } from '../lib/toast.js';

defineProps({ why: { type: String, default: '先告诉我们你是哪一级的，不用实名。' } });
const emit = defineEmits(['picked']);

function pick(c) {
  try {
    setMe(c);
    emit('picked', c);
  } catch (e) {
    say(e.message, 'warn');
  }
}
function change() {
  try {
    resetMe();
  } catch (e) {
    say(e.message, 'warn');
  }
}
</script>

<template>
  <div v-if="!state.me" class="gate">
    <p>{{ why }}</p>
    <div class="chips" role="group" aria-label="入学年份">
      <button v-for="c in COHORTS" :key="c" class="chip" type="button" @click="pick(c)">
        {{ cohortLabel(c) }}
      </button>
    </div>
  </div>
  <div v-else class="speak">
    <p class="who small muted">
      你以 {{ cohortLabel(state.me.cohort) }} 的身份说话。
      <button class="link" type="button" @click="change">换一个</button>
    </p>
    <slot />
  </div>
</template>

<style scoped>
.gate {
  display: grid;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border: 1px dashed var(--line-strong);
  border-radius: 12px;
}

.speak {
  display: grid;
  gap: 0.7rem;
}
</style>
