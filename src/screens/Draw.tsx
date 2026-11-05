import { useState } from 'react'
import { Check, Plus, Undo2, X } from 'lucide-react'
import { MapView } from '../map/MapView'
import { addCamino, addRuta, db, type TipoCamino } from '../db/db'
import { formatDistance, pathLength, type LatLon } from '../lib/geo'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { back, navigate, routeParams } from '../ui/router'
import { useToast } from '../ui/toast'
import { Segmented, Sheet } from '../ui/components'
import { TIPOS } from '../domain/constants'

type Modo = 'camino' | 'ruta' | 'bancal' | 'mover'

/**
 * Dibujar sobre el mapa con una cruz en el centro: se mueve el mapa y se pulsa «Añadir punto»
 * (más preciso con el dedo que tocar el punto). También vale tocar el mapa.
 */
export function DrawScreen({ route }: { route: string }) {
  const params = routeParams(route)
  const modo = (['camino', 'ruta', 'bancal', 'mover'].includes(params.get('tipo') ?? '') ? params.get('tipo') : 'camino') as Modo
  const bancalId = params.get('bancal')
  const { bancales, caminos, rutas, settings } = useData()
  const { fix } = usePosition()
  const editor = useEditor()
  const toast = useToast()
  const bancal = bancalId ? bancales.find((b) => b.id === bancalId) : undefined
  const [initial] = useState(() => {
    if (bancal) return { center: [bancal.lat, bancal.lon] as LatLon, zoom: 18 }
    if (settings.vista) return { center: [settings.vista.lat, settings.vista.lon] as LatLon, zoom: Math.max(settings.vista.zoom, 16) }
    if (fix) return { center: fix.p, zoom: 17 }
    return null
  })
  const [center, setCenter] = useState<LatLon | null>(initial?.center ?? null)
  const [pts, setPts] = useState<LatLon[]>([])
  const [finishing, setFinishing] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipoCamino, setTipoCamino] = useState<TipoCamino>('pista')
  const isLine = modo === 'camino' || modo === 'ruta'

  const titulo = modo === 'camino' ? 'Dibujar camino' : modo === 'ruta' ? `Ruta a ${bancal?.nombre ?? 'bancal'}` : modo === 'mover' ? `Mover ${bancal?.nombre ?? 'bancal'}` : 'Marcar bancal'
  const ayuda = isLine ? 'Mueve el mapa y pulsa + en cada curva. También puedes tocar el mapa.' : 'Mueve el mapa hasta que la cruz quede sobre el bancal.'

  const salir = () => back(bancal ? `/bancal/${bancal.id}` : modo === 'bancal' ? '/' : '/caminos')

  const confirmarPunto = async () => {
    if (!center) return
    if (modo === 'bancal') {
      editor.openBancal(undefined, { point: center, precision: null })
      navigate('/', true)
    } else if (modo === 'mover' && bancal) {
      await db.bancales.update(bancal.id, { lat: center[0], lon: center[1], precision: null, actualizado: Date.now() })
      toast.show('Posición actualizada')
      navigate(`/bancal/${bancal.id}`, true)
    }
  }

  const guardar = async () => {
    if (modo === 'ruta' && bancal) {
      await addRuta({ nombre: nombre.trim() || `Ruta a ${bancal.nombre}`, bancalId: bancal.id, puntos: pts, origen: 'dibujado' })
      toast.show('Ruta guardada')
      navigate(`/bancal/${bancal.id}`, true)
    } else {
      const id = await addCamino({ nombre: nombre.trim() || `Camino ${caminos.length + 1}`, tipo: tipoCamino, puntos: pts, origen: 'dibujado' })
      toast.show('Camino guardado')
      navigate(`/camino/${id}`, true)
    }
  }

  // Una ruta dibujada empieza donde quieras y termina en el bancal: se añade solo al terminar
  const draft = modo === 'ruta' && bancal && pts.length ? [...pts, ...(center ? [center] : [])] : isLine ? [...pts, ...(center && pts.length ? [center] : [])] : null

  return (
    <div className="nav-screen">
      <header className="nav-head">
        <button className="icon-btn plain" aria-label="Cancelar" onClick={salir}>
          <X size={24} />
        </button>
        <div className="grow" style={{ textAlign: 'center', minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 600 }}>{titulo}</div>
          <div className="meta">{isLine ? `${pts.length} puntos · ${formatDistance(pathLength(pts))}` : ' '}</div>
        </div>
        <span style={{ width: 44 }} />
      </header>

      <div className="draw-map">
        <MapView
          capa={settings.capa}
          bancales={bancal ? [bancal] : bancales}
          caminos={caminos}
          rutas={modo === 'ruta' && bancal ? rutas.filter((r) => r.bancalId === bancal.id) : undefined}
          draft={draft}
          user={fix}
          initial={initial}
          selectedId={bancal?.id}
          onMove={(c) => setCenter(c)}
          onTap={isLine ? (p) => setPts((x) => [...x, p]) : undefined}
        />
        <div className="crosshair" aria-hidden />
      </div>

      <section className="rec-panel">
        <p className="meta">{ayuda}</p>
        {isLine ? (
          <div className="row">
            <button className="icon-btn" aria-label="Deshacer" disabled={!pts.length} onClick={() => setPts((x) => x.slice(0, -1))}>
              <Undo2 size={20} />
            </button>
            <button className="btn block" disabled={!center} onClick={() => center && setPts((x) => [...x, center])}>
              <Plus size={18} /> Añadir punto
            </button>
            <button
              className="btn primary"
              disabled={pts.length < (modo === 'ruta' ? 1 : 2)}
              onClick={() => {
                if (modo === 'ruta' && bancal) setPts((x) => [...x, [bancal.lat, bancal.lon]])
                setFinishing(true)
              }}
            >
              <Check size={18} /> Terminar
            </button>
          </div>
        ) : (
          <div className="row">
            {fix && (
              <button className="btn" onClick={() => setCenter(fix.p)} title="Usar mi posición GPS">
                Mi posición
              </button>
            )}
            <button className="btn primary block" disabled={!center} onClick={() => void confirmarPunto()}>
              <Check size={18} /> {modo === 'mover' ? 'Mover aquí' : 'Bancal aquí'}
            </button>
          </div>
        )}
      </section>

      {finishing && (
        <Sheet
          title={modo === 'ruta' ? 'Guardar ruta' : 'Guardar camino'}
          onClose={() => {
            if (modo === 'ruta') setPts((x) => x.slice(0, -1))
            setFinishing(false)
          }}
          footer={
            <button className="btn primary block" onClick={() => void guardar()}>
              Guardar
            </button>
          }
        >
          <p className="muted small">{formatDistance(pathLength(pts))}</p>
          <label className="field">
            <span>Nombre</span>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={modo === 'ruta' ? 'Por la acequia' : 'Pista del barranco'} />
          </label>
          {modo === 'camino' && <Segmented value={tipoCamino} onChange={setTipoCamino} options={TIPOS} label="Tipo de camino" />}
        </Sheet>
      )}
    </div>
  )
}
