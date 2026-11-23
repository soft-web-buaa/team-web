<template>
  <div class="veil" aria-hidden="true" />
</template>

<style scoped>
.veil {
  position: absolute;
  inset: 0;
  z-index: 450;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--sky-top) 20%, transparent) 0%,
      transparent 34%,
      transparent 68%,
      color-mix(in srgb, var(--sky-bottom) 14%, transparent) 100%
    );
  transition: background 0.8s ease, opacity 0.8s ease;
}

.veil::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 180px rgba(10, 18, 24, 0.28);
}

:global(.app[data-slot='night']) .veil {
  opacity: 0.96;
  background:
    linear-gradient(180deg, rgba(8, 15, 26, 0.48) 0%, rgba(10, 18, 30, 0.08) 36%, rgba(10, 20, 34, 0.42) 100%);
}

:global(.app[data-slot='dawn']) .veil {
  background:
    linear-gradient(180deg, rgba(46, 58, 89, 0.3) 0%, rgba(232, 168, 124, 0.06) 38%, rgba(232, 168, 124, 0.16) 100%);
}
</style>
