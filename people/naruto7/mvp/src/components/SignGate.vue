<script setup>
// 落款：说话之前问一次，年级、学院、名字（可以是昵称）三项都可以不填。
// 学刻声的口径；现在没有任何验证，填什么由用户自己负责。选完记在这台设备上，可以随时改。
// 这里用 div 而不是 form：它会被放进别的表单里，表单不能嵌套。
import { ref, useId } from 'vue';
import { state, setMe } from '../lib/store.js';
import { COHORTS, cohortLabel, signature } from '../data/community.js';
import { DEPTS } from '../data/depts.js';
import { say } from '../lib/toast.js';

defineProps({ why: { type: String, default: '想落个款吗？' } });
const emit = defineEmits(['picked']);

const listId = useId();
const editing = ref(false);
const cohort = ref('');
const dept = ref('');
const name = ref('');
const error = ref('');

function startEdit() {
  const m = state.me || {};
  cohort.value = m.cohort || '';
  dept.value = m.dept || '';
  name.value = m.name || '';
  error.value = '';
  editing.value = true;
}

function done(fields, tell) {
  error.value = '';
  try {
    setMe(fields);
  } catch (e) {
    error.value = e.message || '没有保存，再试一次。';
    return;
  }
  editing.value = false;
  if (tell) say(tell);
  emit('picked', state.me);
}

const save = () => done({ cohort: cohort.value, dept: dept.value, name: name.value }, editing.value ? '已保存落款' : '');
const skip = () => done({}, '');
</script>

<template>
  <div v-if="!state.me || editing" class="gate" role="group" aria-label="落款">
    <p>{{ editing ? '改落款' : why }}</p>
    <p class="muted small">
      年级、学院、名字都可以不填，名字可以用昵称。填了的会显示在你说的话旁边。现在没有验证，请不要冒用别人。
    </p>
    <div class="chips" role="group" aria-label="年级">
      <button
        v-for="c in COHORTS"
        :key="c"
        class="chip"
        type="button"
        :aria-pressed="cohort === c"
        @click="cohort = cohort === c ? '' : c"
      >
        {{ cohortLabel(c) }}
      </button>
    </div>
    <label class="field">
      <span>学院（可不填，可以直接输入）</span>
      <input v-model="dept" type="text" maxlength="24" :list="listId" autocomplete="off" @keydown.enter.prevent="save" />
    </label>
    <datalist :id="listId">
      <option v-for="d in DEPTS" :key="d" :value="d" />
    </datalist>
    <label class="field">
      <span>名字或昵称（可不填）</span>
      <input v-model="name" type="text" maxlength="16" autocomplete="off" @keydown.enter.prevent="save" />
    </label>
    <p v-if="error" class="err" role="alert">{{ error }}</p>
    <div class="row">
      <button class="btn small" type="button" @click="save">{{ editing ? '保存落款' : '用这个落款说话' }}</button>
      <button v-if="!editing" class="btn ghost small" type="button" @click="skip">不落款，直接说</button>
      <button v-else class="btn ghost small" type="button" @click="editing = false">取消</button>
    </div>
  </div>

  <div v-else class="speak">
    <p class="who small muted">
      你的落款：{{ signature(state.me) }}。
      <button class="link" type="button" @click="startEdit">改落款</button>
    </p>
    <slot />
  </div>
</template>

<style scoped>
.gate {
  display: grid;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  border: 1px dashed var(--line-strong);
  border-radius: 12px;
}

.speak {
  display: grid;
  gap: 0.7rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.err {
  padding: 0.5rem 0.8rem;
  border-left: 4px solid var(--accent);
  background: var(--panel);
}
</style>
