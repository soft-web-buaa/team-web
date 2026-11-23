<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="nf">
    <h1 class="page-title">没有这个页面</h1>
    <p class="lead muted">网址可能写错了，或者这个页面还没做。</p>
    <p><RouterLink class="btn" to="/">回到首页</RouterLink></p>
  </section>
</template>

<style scoped>
.nf {
  display: grid;
  gap: 1rem;
  padding-block: 3rem;
}
</style>
