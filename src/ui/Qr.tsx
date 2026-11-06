import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { Sheet } from './components'
import { navigate } from './router'
import { rutaDeQr } from './qrUtil'

/** Código QR dibujado como SVG (sin HTML externo) */
export function QrCode({ text, size = 240 }: { text: string; size?: number }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    const rects: string[] = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) rects.push(`M${c + 2} ${r + 2}h1v1h-1z`)
    return { n: n + 4, d: rects.join('') }
  }, [text])
  return (
    <svg className="qr" viewBox={`0 0 ${cells.n} ${cells.n}`} width={size} height={size} role="img" aria-label="Código QR" shapeRendering="crispEdges">
      <rect width={cells.n} height={cells.n} fill="#fff" />
      <path d={cells.d} fill="#000" />
    </svg>
  )
}

/** Muestra el QR de un enlace: se escanea con la cámara del otro móvil y abre Anjamap para guardar el sitio */
export function QrSheet({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="qr-wrap"><QrCode text={text} /></div>
      <p className="meta">Que la otra persona lo enfoque con la cámara del móvil (o con «Escanear código QR» en Anjamap) y pulse el enlace: se abrirá el sitio para guardarlo.</p>
    </Sheet>
  )
}

interface Detector {
  detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector

/** Escanear con la cámara un QR de Anjamap (Chrome en Android; en iPhone se usa la cámara del sistema) */
export function QrScanner({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [msg, setMsg] = useState('Enfoca el código QR del sitio')
  useEffect(() => {
    let stream: MediaStream | null = null
    let alive = true
    let timer = 0
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
    const detector = new Ctor({ formats: ['qr_code'] })
    const scan = async () => {
      if (!alive || !video.current) return
      try {
        const found = await detector.detect(video.current)
        for (const f of found) {
          const ruta = rutaDeQr(f.rawValue)
          if (ruta) {
            alive = false
            onClose()
            navigate(ruta)
            return
          }
          setMsg('Ese código no es de un sitio de Anjamap')
        }
      } catch {
        /* fotograma no listo: se reintenta */
      }
      timer = window.setTimeout(() => void scan(), 300)
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        stream = s
        if (!alive || !video.current) return s.getTracks().forEach((t) => t.stop())
        video.current.srcObject = s
        await video.current.play().catch(() => undefined)
        void scan()
      })
      .catch(() => setMsg('Permite la cámara para escanear el código'))
    return () => {
      alive = false
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onClose])
  return (
    <Sheet title="Escanear código QR" onClose={onClose}>
      <video ref={video} className="qr-video" playsInline muted />
      <p className="meta" role="status">{msg}</p>
    </Sheet>
  )
}
