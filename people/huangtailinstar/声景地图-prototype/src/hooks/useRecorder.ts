import { useCallback, useEffect, useRef, useState } from 'react'

/** 麦克风录音 Hook：支持真实录音，失败时优雅降级 */
export function useRecorder(maxSeconds = 30) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const start = useCallback(async () => {
    setError(null)
    setSeconds(0)
    setAudioUrl(undefined)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('浏览器不支持录音')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      recorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        if (blob.size > 0) setAudioUrl(URL.createObjectURL(blob))
        cleanup()
      }
      mr.start()
      setRecording(true)
      timerRef.current = window.setInterval(() => {
        setSeconds(s => {
          if (s + 1 >= maxSeconds) { stop(); return maxSeconds }
          return s + 1
        })
      }, 1000)
    } catch {
      setError('未能获取麦克风权限，可跳过录音，系统将为你生成一段示例声景。')
      setRecording(false)
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSeconds, cleanup])

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setRecording(false)
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const reset = useCallback(() => {
    stop()
    setSeconds(0)
    setAudioUrl(undefined)
    setError(null)
  }, [stop])

  return { recording, seconds, audioUrl, error, start, stop, reset }
}
