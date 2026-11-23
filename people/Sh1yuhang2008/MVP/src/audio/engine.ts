import { ref } from 'vue'
import type { DaySlot, Motif } from '@/types'
import { SLOTS } from '@/themes'

class SoundEngine {
  readonly muted = ref(false)

  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ambientGain: GainNode | null = null
  private ambientSrc: AudioBufferSourceNode | null = null
  private drone: OscillatorNode | null = null
  private droneGain: GainNode | null = null
  private motifNodes: AudioScheduledSourceNode[] = []
  private noiseBuffer: AudioBuffer | null = null
  private ambientOn = false

  unlock() {
    const ctx = this.ensure()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    const ctx = new Ctor()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = this.muted.value ? 0 : 0.9
    master.connect(ctx.destination)
    this.master = master
    return ctx
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const length = Math.floor(ctx.sampleRate * 3)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.2
    }
    this.noiseBuffer = buffer
    return buffer
  }

  startAmbient(slot: DaySlot) {
    const ctx = this.ensure()
    if (!ctx || !this.master) return

    if (!this.ambientOn) {
      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.connect(this.master)

      const src = ctx.createBufferSource()
      src.buffer = this.getNoise(ctx)
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 520
      src.connect(lp).connect(gain)
      src.start()

      const drone = ctx.createOscillator()
      drone.type = 'sine'
      drone.frequency.value = SLOTS[slot].drone
      const dg = ctx.createGain()
      dg.gain.value = 0
      drone.connect(dg).connect(this.master)
      drone.start()

      this.ambientSrc = src
      this.ambientGain = gain
      this.drone = drone
      this.droneGain = dg
      this.ambientOn = true
    }

    const t = ctx.currentTime
    this.ambientGain?.gain.setTargetAtTime(0.05, t, 0.5)
    this.droneGain?.gain.setTargetAtTime(0.016, t, 0.6)
    this.setSlot(slot)
  }

  setSlot(slot: DaySlot) {
    if (!this.ctx || !this.drone) return
    this.drone.frequency.setTargetAtTime(SLOTS[slot].drone, this.ctx.currentTime, 0.9)
  }

  stopAmbient() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.ambientGain?.gain.setTargetAtTime(0.0001, t, 0.25)
    this.droneGain?.gain.setTargetAtTime(0.0001, t, 0.25)
  }

  playMotif(motif: Motif) {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    this.stopMotifs()

    const t0 = ctx.currentTime + 0.04
    for (let i = 0; i < motif.notes.length; i += 1) {
      const at = t0 + i * motif.step
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = motif.type
      osc.frequency.setValueAtTime(motif.notes[i], at)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + motif.decay)
      osc.connect(gain).connect(this.master)
      osc.start(at)
      osc.stop(at + motif.decay + 0.05)
      this.motifNodes.push(osc)
    }

    if (motif.noise) {
      const src = ctx.createBufferSource()
      src.buffer = this.getNoise(ctx)
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = 900
      band.Q.value = 0.7
      const gain = ctx.createGain()
      const dur = Math.max(0.5, motif.noise * 1.3)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.1 * motif.noise, t0 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      src.connect(band).connect(gain).connect(this.master)
      src.start(t0)
      src.stop(t0 + dur + 0.05)
      this.motifNodes.push(src)
    }
  }

  stopMotifs() {
    for (const node of this.motifNodes) {
      try {
        node.stop()
      } catch {
        /* already stopped */
      }
    }
    this.motifNodes = []
  }

  setMuted(value: boolean) {
    this.muted.value = value
    if (!this.ctx || !this.master) return
    this.master.gain.setTargetAtTime(value ? 0.0001 : 0.9, this.ctx.currentTime, 0.04)
  }
}

export const engine = new SoundEngine()
