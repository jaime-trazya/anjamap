import { useState } from 'react'
import { ChevronLeft, Copy, Download, Footprints, Move, Navigation, PenLine, Pencil, Share2 } from 'lucide-react'
import { MapView } from '../map/MapView'
import { formatCoord, formatDistance, pathLength, type LatLon } from '../lib/geo'
import { enlaceBancal } from '../ui/destino'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { back, navigate } from '../ui/router'
import { useToast } from '../ui/toast'
import { BackBar, Empty } from '../ui/components'
import { PhotoGallery } from '../ui/PhotoGallery'
import { TransferSheet } from '../ui/TransferSheet'
import { TransportPicker } from '../ui/TransportPicker'
import { setSetting } from '../db/db'

export function BancalDetail({ id }: { id: string }) {
  const { bancales, rutas, caminos, settings } = useData()
  const { fix } = usePosition()
  const editor = useEditor()
  const toast = useToast()
  const [transfer, setTransfer] = useState(false)
  const b = bancales.find((x) => x.id === id)
  const propias = rutas.filter((r) => r.bancalId === id)
  if (!b) return <main className="screen sub"><BackBar label="Bancales" fallback="/bancales" /><Empty title="Este bancal ya no existe" /></main>
  const dest: LatLon = [b.lat, b.lon]
  const copiar = async (text: string, message: string) => {
    try { await navigator.clipboard.writeText(text); toast.show(message) } catch { toast.show(text, { duration: 10000 }) }
  }
  const compartir = async () => {
    const url = enlaceBancal(b)
    if (navigator.share) {
      try { await navigator.share({ title: b.nombre, text: b.nombre, url }); return } catch (error) { if (error instanceof Error && error.name === 'AbortError') return }
    }
    await copiar(url, 'Enlace copiado')
  }
  return <main className="screen sub">
    <div className="map-hero">
      <MapView capa={settings.capa} bancales={[b]} caminos={caminos} rutas={propias} user={fix} selectedId={id} initial={{ center: dest, zoom: 17 }} />
      <button className="icon-btn float hero-back" aria-label="Atrás" onClick={() => back('/bancales')}><ChevronLeft size={26} /></button>
      <div className="hero-right"><button className="icon-btn float" aria-label="Editar bancal" onClick={() => editor.openBancal(id)}><Pencil size={20} /></button></div>
    </div>
    <div>{b.finca && <div className="eyebrow">{b.finca}</div>}<h1 className="title">{b.nombre}</h1><p className="meta num" style={{ marginTop: 6 }}>{formatCoord(dest)} · {b.precision !== null ? `GPS ±${b.precision} m` : 'Marcado en el mapa'}</p></div>
    <TransportPicker value={settings.transporte} onChange={(value) => void setSetting('transporte', value)} />
    <button className="go-btn" onClick={() => navigate(`/ir/${id}`)}><span className="go-icon"><Navigation size={26} /></span><div className="grow"><strong>Cómo llegar</strong><span>Calcular ruta desde tu posición</span></div></button>
    <div className="actions">
      <button className="action" onClick={() => void compartir()}><Share2 size={22} /> Enviar enlace</button>
      <button className="action" onClick={() => setTransfer(true)}><Download size={22} /> Enviar con fotos</button>
      <button className="action" onClick={() => navigate(`/dibujar?tipo=mover&bancal=${id}`)}><Move size={22} /> Mover</button>
      <button className="action" onClick={() => void copiar(formatCoord(dest), 'Coordenadas copiadas')}><Copy size={22} /> Coordenadas</button>
    </div>
    {b.nota && <section className="card"><p style={{ whiteSpace: 'pre-wrap' }}>{b.nota}</p></section>}
    <PhotoGallery bancalId={id} />
    <div className="section"><h2>Accesos y rutas propias</h2></div>
    <section className="card flush list">
      {propias.map((r) => <a key={r.id} className="list-item tap" href={`#/ruta/${r.id}`}><div className="grow"><div className="primary-line">{r.nombre}</div><div className="secondary-line">{formatDistance(pathLength(r.puntos))} · recorrido guardado a pie</div></div></a>)}
      <button className="list-item" onClick={() => navigate(`/grabar?tipo=ruta&bancal=${id}`)}><Footprints size={19} /><span className="grow primary-line">Grabar el acceso andando</span></button>
      <button className="list-item" onClick={() => navigate(`/dibujar?tipo=ruta&bancal=${id}`)}><PenLine size={19} /><span className="grow primary-line">Dibujar un acceso</span></button>
    </section>
    {transfer && <TransferSheet ids={[id]} onClose={() => setTransfer(false)} />}
  </main>
}
