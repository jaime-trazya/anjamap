import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

interface Reconocimiento {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type Ctor = new () => Reconocimiento

const ctor = (): Ctor | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Buscar hablando: dice el nombre del sitio y se escribe en el buscador.
 * Solo aparece si el navegador lo permite (Chrome en Android y Safari en iPhone lo tienen; necesita conexión).
 */
export function MicButton({ onText }: { onText: (texto: string) => void }) {
  const [escuchando, setEscuchando] = useState(false)
  const [fallo, setFallo] = useState('')
  const rec = useRef<Reconocimiento | null>(null)
  useEffect(() => () => rec.current?.abort(), [])
  const C = ctor()
  if (!C) return null
  const empezar = () => {
    if (escuchando) {
      rec.current?.abort()
      return
    }
    const r = new C()
    r.lang = 'es-ES'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript?.trim()
      if (t) onText(t.replace(/[.¿?¡!]+$/g, ''))
    }
    r.onerror = (e) => setFallo(e.error === 'not-allowed' ? 'Permite el micrófono para buscar hablando' : e.error === 'no-speech' ? 'No te he oído, prueba otra vez' : 'No se ha podido escuchar')
    r.onend = () => setEscuchando(false)
    rec.current = r
    setFallo('')
    setEscuchando(true)
    try {
      r.start()
    } catch {
      setEscuchando(false)
    }
  }
  return (
    <button type="button" className={`icon-btn plain mic-btn ${escuchando ? 'on' : ''}`} aria-label={escuchando ? 'Dejar de escuchar' : 'Buscar hablando'} aria-pressed={escuchando} title={fallo || undefined} onClick={empezar}>
      {fallo && !escuchando ? <MicOff size={20} /> : <Mic size={20} />}
    </button>
  )
}
