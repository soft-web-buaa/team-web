import type { Scene } from '@/types'

/**
 * 环境声景合成器：用 Web Audio API 现场合成不同场景的声音，
 * 让示例唱片无需外部音频文件即可播放。
 */
export class AmbientPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private sources: AudioScheduledSourceNode[] = []
  private timers: number[] = []
  private tickTimer: number | null = null
  private scene: Scene
  private duration: number
  private offset = 0
  private startedAt = 0
  private _playing = false

  onTick?: (progress: number) => void
  onEnd?: () => void

  constructor(scene: Scene, duration: number) {
    this.scene = scene
    this.duration = Math.max(duration, 1)
  }

  get playing() {
    return this._playing
  }

  private ensure() {
    if (this.ctx) return
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(this.ctx.destination)
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf
  }

  private note(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', sweepTo?: number) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + Math.min(0.03, dur / 4))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private burst(dur: number, cutoff: number, vol: number, hp = false) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = this.ctx.createBiquadFilter()
    f.type = hp ? 'highpass' : 'lowpass'
    f.frequency.value = cutoff
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + dur * 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  private continuous() {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    const g = ctx.createGain()
    const s = this.scene

    if (s === 'wind' || s === 'leaves' || s === 'night') {
      lp.frequency.value = s === 'wind' ? 480 : s === 'leaves' ? 1100 : 260
      g.gain.value = s === 'wind' ? 0.16 : s === 'leaves' ? 0.05 : 0.035
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.12
      const lg = ctx.createGain()
      lg.gain.value = s === 'wind' ? 260 : 400
      lfo.connect(lg)
      lg.connect(lp.frequency)
      lfo.start()
      this.sources.push(lfo)
    } else if (s === 'rain' || s === 'fountain') {
      lp.frequency.value = s === 'rain' ? 2600 : 1800
      g.gain.value = s === 'rain' ? 0.11 : 0.08
    } else if (s === 'canteen' || s === 'chatter') {
      lp.frequency.value = 780
      g.gain.value = 0.075
    } else if (s === 'library') {
      lp.frequency.value = 220
      g.gain.value = 0.03
    } else if (s === 'gym') {
      lp.frequency.value = 320
      g.gain.value = 0.045
    } else {
      lp.frequency.value = 900
      g.gain.value = 0.02
    }
    src.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    src.start()
    this.sources.push(src)

    if (s === 'library' || s === 'night' || s === 'music') {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = s === 'music' ? 220 : s === 'night' ? 110 : 165
      const og = ctx.createGain()
      og.gain.value = s === 'music' ? 0.035 : 0.022
      o.connect(og)
      og.connect(this.master)
      o.start()
      this.sources.push(o)
    }
  }

  private scheduleEvents() {
    const add = (fn: () => void, ms: number) => {
      const id = window.setInterval(fn, ms)
      this.timers.push(id)
    }
    const s = this.scene
    if (s === 'birds') {
      add(() => {
        const base = 1800 + Math.random() * 1800
        this.note(base, 0.14, 0.06, 'sine', base * 1.5)
        window.setTimeout(() => this.note(base * 1.1, 0.1, 0.045, 'sine', base * 0.8), 130)
      }, 900)
    } else if (s === 'footsteps') {
      add(() => { this.burst(0.09, 320, 0.16); window.setTimeout(() => this.burst(0.07, 280, 0.11), 240) }, 720)
    } else if (s === 'gym') {
      add(() => { this.burst(0.12, 260, 0.2); if (Math.random() > 0.7) this.note(1600, 0.12, 0.03, 'square', 1200) }, 640)
    } else if (s === 'fountain') {
      add(() => this.note(500 + Math.random() * 900, 0.09, 0.035, 'sine', 200), 280)
    } else if (s === 'night') {
      add(() => this.note(4200 + Math.random() * 1200, 0.05, 0.018, 'sine'), 420)
    } else if (s === 'canteen' || s === 'chatter') {
      add(() => this.note(130 + Math.random() * 160, 0.5, 0.02, 'triangle', 100), 480)
    } else if (s === 'leaves') {
      add(() => this.burst(0.35, 1600, 0.035), 1600)
    } else if (s === 'music') {
      const scale = [220, 277, 330, 440, 330, 277]
      let i = 0
      add(() => { this.note(scale[i % scale.length], 0.55, 0.05, 'sine'); i++ }, 480)
    }
  }

  async play() {
    if (this._playing) return
    this.ensure()
    await this.ctx!.resume()
    this.clearNodes()
    this.continuous()
    this.scheduleEvents()
    this.startedAt = performance.now()
    this._playing = true
    const m = this.master!
    m.gain.cancelScheduledValues(this.ctx!.currentTime)
    m.gain.setValueAtTime(0.0001, this.ctx!.currentTime)
    m.gain.exponentialRampToValueAtTime(0.9, this.ctx!.currentTime + 0.3)

    this.tickTimer = window.setInterval(() => {
      const elapsed = this.offset + (performance.now() - this.startedAt) / 1000
      const p = Math.min(elapsed / this.duration, 1)
      this.onTick?.(p)
      if (p >= 1) {
        this.onEnd?.()
        this.stop()
      }
    }, 120)
  }

  pause() {
    if (!this._playing) return
    this.offset += (performance.now() - this.startedAt) / 1000
    if (this.offset >= this.duration) this.offset = 0
    this._playing = false
    this.clearNodes()
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.setValueAtTime(0.0001, this.ctx.currentTime)
    }
  }

  stop() {
    this._playing = false
    this.offset = 0
    this.clearNodes()
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.setValueAtTime(0.0001, this.ctx.currentTime)
    }
  }

  destroy() {
    this.stop()
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
  }

  private clearNodes() {
    this.sources.forEach(s => { try { s.stop() } catch { /* already stopped */ } })
    this.sources = []
    this.timers.forEach(t => window.clearInterval(t))
    this.timers = []
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }
}

export const SCENE_LABEL: Record<Scene, string> = {
  birds: '鸟鸣', wind: '风声', rain: '雨声', canteen: '人声嘈杂', footsteps: '脚步',
  library: '翻书低语', gym: '运动回响', night: '夜虫', fountain: '水声',
  leaves: '树叶', chatter: '交谈', music: '乐声',
}
