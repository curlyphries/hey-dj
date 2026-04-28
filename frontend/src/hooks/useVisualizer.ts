import { useEffect, useRef, useCallback, useState } from 'react'

export type VisualizerMode = 'bars' | 'waveform'

export function useVisualizer(
  audioRef: React.RefObject<HTMLAudioElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  mode: VisualizerMode,
  active: boolean
) {
  const animRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  // Tracks whether the analyser has been wired — triggers the draw effect to rerun
  const [ready, setReady] = useState(false)

  const setup = useCallback(() => {
    if (!audioRef.current) return
    // Resume if context exists but was suspended (browser autoplay policy)
    if (ctxRef.current) {
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
      return
    }
    try {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const source = ctx.createMediaElementSource(audioRef.current)
      source.connect(analyser)
      analyser.connect(ctx.destination)
      ctxRef.current = ctx
      analyserRef.current = analyser
      sourceRef.current = source
      setReady(true)
    } catch (_) {}
  }, [audioRef])

  useEffect(() => {
    if (!active || !ready || !canvasRef.current || !analyserRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const analyser = analyserRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animRef.current = requestAnimationFrame(draw)
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      if (mode === 'bars') {
        analyser.getByteFrequencyData(dataArray)
        const barW = (W / bufferLength) * 2.5
        let x = 0
        for (let i = 0; i < bufferLength; i++) {
          const barH = (dataArray[i] / 255) * H
          const hue = (i / bufferLength) * 60 + 260
          ctx.fillStyle = `hsla(${hue}, 80%, 65%, 0.9)`
          ctx.fillRect(x, H - barH, barW - 1, barH)
          x += barW + 1
        }
      } else {
        analyser.getByteTimeDomainData(dataArray)
        ctx.strokeStyle = '#a78bfa'
        ctx.lineWidth = 2
        ctx.beginPath()
        const sliceW = W / bufferLength
        let x = 0
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128
          const y = (v * H) / 2
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          x += sliceW
        }
        ctx.lineTo(W, H / 2)
        ctx.stroke()
      }
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [active, ready, mode, canvasRef])

  return { setup }
}
