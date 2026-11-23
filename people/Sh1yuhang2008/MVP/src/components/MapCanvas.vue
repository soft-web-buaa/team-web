<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { useRoute, useRouter } from 'vue-router'
import { useSoundStore } from '@/stores/sound'
import { useTimeStore } from '@/stores/time'
import { CATEGORY_MAP } from '@/data/sounds'
import campusMap from '@/assets/campus-plan.jpg'
import type { Sound } from '@/types'

const MAP_W = 1361
const MAP_H = 1320
const MAP_BOUNDS = L.latLngBounds([0, 0], [MAP_H, MAP_W])

const el = ref<HTMLDivElement | null>(null)
const store = useSoundStore()
const time = useTimeStore()
const route = useRoute()
const router = useRouter()

let map: L.Map | null = null
let markers: L.LayerGroup | null = null

function markerHtml(sound: Sound): string {
  const color = CATEGORY_MAP[sound.category].color
  return `
    <button class="sm" style="--c:${color}" aria-label="${sound.title}" type="button">
      <span class="sm__pulse"></span>
      <span class="sm__dot"></span>
    </button>
  `
}

function renderMarkers() {
  if (!map || !markers) return
  markers.clearLayers()
  const activeId = typeof route.params.id === 'string' ? route.params.id : ''

  for (const sound of store.filtered) {
    const active = sound.id === activeId
    const dim = sound.slot !== time.slot
    const icon = L.divIcon({
      className: `sound-marker${active ? ' is-active' : ''}${dim ? ' is-dim' : ''}`,
      html: markerHtml(sound),
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    })

    const marker = L.marker([MAP_H - sound.y, sound.x], {
      icon,
      title: `${sound.title} · ${sound.timeLabel}`,
      keyboard: true,
      riseOnHover: true,
    })

    marker.on('click', () => {
      void router.push(`/sound/${sound.id}`)
    })
    marker.bindTooltip(`${sound.title} · ${sound.timeLabel}`, {
      direction: 'top',
      offset: [0, -16],
      className: 'marker-tip',
      opacity: 1,
    })
    if (active) marker.setZIndexOffset(800)
    marker.addTo(markers)
  }
}

onMounted(async () => {
  await nextTick()
  if (!el.value) return

  map = L.map(el.value, {
    crs: L.CRS.Simple,
    zoomControl: false,
    attributionControl: false,
    minZoom: -1.8,
    maxZoom: 1.2,
    zoomSnap: 0.1,
    zoomDelta: 0.25,
    maxBounds: MAP_BOUNDS.pad(0.05),
    maxBoundsViscosity: 1,
    preferCanvas: true,
  })

  L.imageOverlay(campusMap, MAP_BOUNDS, {
    className: 'campus-image',
    interactive: false,
  }).addTo(map)

  if (window.innerWidth < 720) {
    map.setView([500, 880], -0.6)
  } else {
    map.setView([MAP_H / 2 + 50, MAP_W / 2], 0)
  }

  L.control.zoom({ position: 'bottomleft' }).addTo(map)
  markers = L.layerGroup().addTo(map)
  renderMarkers()

  map.on('click', () => {
    if (route.params.id) void router.push('/sound')
  })

  window.setTimeout(() => map?.invalidateSize(), 80)
})

watch(
  () => [store.category, time.slot, route.params.id],
  () => renderMarkers(),
)

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markers = null
})
</script>

<template>
  <div
    ref="el"
    class="map-canvas"
    aria-label="北京航空航天大学学院路校区平面图"
  />
</template>
