<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ParticleMode } from '@/types'

const props = defineProps<{ mode: ParticleMode; accent: string }>()

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
  speed: number
}

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let width = 0
let height = 0
let particles: Particle[] = []
const reduce =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const n = Number.parseInt(value, 16)
  if (Number.isNaN(n)) return `rgba(240, 200, 160, ${alpha})`
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function build() {
  particles = []
  const count =
    props.mode === 'firefly' ? 34 : props.mode === 'mist' ? 22 : props.mode === 'heat' ? 26 : props.mode === 'bird' ? 9 : 0
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.24,
      vy: (Math.random() - 0.5) * 0.18,
      r: 1 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.6,
    })
  }
}

function resize() {
  const el = canvas.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  width = rect.width
  height = rect.height
  el.width = Math.floor(width * dpr)
  el.height = Math.floor(height * dpr)
  ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  build()
  draw(0)
}

function draw(now: number) {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  const t = now / 1000

  if (props.mode === 'mist') {
    for (const p of particles) {
      p.x += 0.08 + p.vx * 0.2
      p.y += Math.sin(t * 0.2 + p.phase) * 0.03
      if (p.x - 140 > width) p.x = -140
      const radius = 90 + p.r * 26
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
      gradient.addColorStop(0, rgba(props.accent, 0.07))
      gradient.addColorStop(1, rgba(props.accent, 0))
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (props.mode === 'heat') {
    ctx.lineWidth = 1
    for (const p of particles) {
      p.y -= 0.18 + p.speed * 0.22
      p.x += Math.sin(t * 0.6 + p.phase) * 0.18
      if (p.y < -40) {
        p.y = height + 30
        p.x = Math.random() * width
      }
      const alpha = 0.05 + Math.max(0, 1 - p.y / height) * 0.05
      ctx.strokeStyle = rgba(props.accent, alpha)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.bezierCurveTo(p.x + 5, p.y - 12, p.x - 5, p.y - 24, p.x + 2, p.y - 38)
      ctx.stroke()
    }
  }

  if (props.mode === 'bird') {
    ctx.lineWidth = 1.2
    ctx.strokeStyle = rgba(props.accent, 0.3)
    for (const p of particles) {
      p.x += 0.32 + p.speed * 0.4
      p.y -= 0.06 + p.speed * 0.04
      if (p.x > width + 30) {
        p.x = -30
        p.y = height * (0.15 + Math.random() * 0.5)
      }
      const wing = 4 + Math.sin(t * 3 + p.phase) * 1.6
      ctx.beginPath()
      ctx.moveTo(p.x - 6, p.y)
      ctx.quadraticCurveTo(p.x - 3, p.y - wing, p.x, p.y)
      ctx.quadraticCurveTo(p.x + 3, p.y - wing, p.x + 6, p.y)
      ctx.stroke()
    }
  }

  if (props.mode === 'firefly') {
    for (const p of particles) {
      p.x += Math.sin(t * 0.3 + p.phase) * 0.18
      p.y += Math.cos(t * 0.24 + p.phase) * 0.14
      if (p.x < -20) p.x = width + 20
      if (p.x > width + 20) p.x = -20
      if (p.y < -20) p.y = height + 20
      if (p.y > height + 20) p.y = -20
      const blink = 0.25 + Math.max(0, Math.sin(t * 1.2 + p.phase)) * 0.75
      ctx.shadowBlur = 14
      ctx.shadowColor = rgba(props.accent, 0.7)
      ctx.fillStyle = rgba(props.accent, 0.55 * blink)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * 0.9, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }
}

function loop(now: number) {
  draw(now)
  raf = requestAnimationFrame(loop)
}

function start() {
  cancelAnimationFrame(raf)
  if (!props.mode) {
    draw(0)
    return
  }
  if (reduce) {
    draw(0)
    return
  }
  raf = requestAnimationFrame(loop)
}

function onResize() {
  resize()
  start()
}

onMounted(() => {
  resize()
  start()
  window.addEventListener('resize', onResize)
})

watch(
  () => [props.mode, props.accent],
  () => {
    build()
    start()
  },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <canvas ref="canvas" class="particles" aria-hidden="true" />
</template>

<style scoped>
.particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 550;
  pointer-events: none;
}
</style>
