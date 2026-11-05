import { useState } from 'react'
import { Download, Navigation, Trash2 } from 'lucide-react'
import { MapView } from '../map/MapView'
import { db, type TipoCamino } from '../db/db'
import { formatDistance, pathLength } from '../lib/geo'
import { toGpx } from '../domain/gpx'
import { useData } from '../ui/useData'
import { navigate } from '../ui/router'
import { saveFile } from '../ui/files'
import { useToast } from '../ui/toast'
import { BackBar, Empty, Segmented } from '../ui/components'
import { TIPOS } from '../domain/constants'

/** Ficha de un camino (/camino/:id) o de una ruta guardada (/ruta/:id) */
export function LineDetail({ kind, id }: { kind: 'camino' | 'ruta'; id: string }) {
  const { caminos, rutas, bancales, settings } = useData()
  const toast = useToast()
  const item = kind === 'camino' ? caminos.find((c) => c.id === id) : rutas.find((r) => r.id === id)
  const bancal = kind === 'ruta' && item ? bancales.find((b) => b.id === (item as { bancalId: string }).bancalId) : undefined
  const [nombre, setNombre] = useState(item?.nombre ?? '')
  const backTo = bancal ? `/bancal/${bancal.id}` : '/caminos'

  if (!item) {
    return (
      <main className="screen sub">
        <BackBar label="Caminos" fallback="/caminos" />
        <Empty title="Ya no existe" />
      </main>
    )
  }
  const table = kind === 'camino' ? db.caminos : db.rutas

  const rename = async () => {
    const n = nombre.trim()
    if (n && n !== item.nombre) await table.update(item.id, { nombre: n })
  }
  const remove = async () => {
    if (!(await toast.confirm({ title: `¿Borrar «${item.nombre}»?`, confirmLabel: 'Borrar', danger: true }))) return
    await table.delete(item.id)
    navigate(backTo, true)
  }
  const exportar = () => {
    const safe = item.nombre.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || kind
    void saveFile(`${safe}.gpx`, toGpx({ tracks: [{ name: item.nombre, points: item.puntos }], waypoints: bancal ? [{ name: bancal.nombre, point: [bancal.lat, bancal.lon] }] : [] }), 'application/gpx+xml')
  }

  return (
    <main className="screen sub">
      <BackBar label={bancal ? bancal.nombre : 'Caminos'} fallback={backTo} />
      <h1 className="title">{item.nombre}</h1>
      <div className="title-sub" style={{ marginTop: -10 }}>
        {formatDistance(pathLength(item.puntos))} · {item.puntos.length} puntos · {item.origen === 'grabado' ? 'grabado andando' : item.origen === 'gpx' ? 'importado de GPX' : 'dibujado'}
      </div>

      <section className="card flush">
        <div className="map-mini tall">
          <MapView
            capa={settings.capa}
            bancales={bancal ? [bancal] : []}
            caminos={kind === 'camino' ? caminos : []}
            route={item.puntos}
            selectedId={bancal?.id}
            fit={item.puntos}
            fitKey={item.id}
            initial={{ center: item.puntos[0], zoom: 17 }}
          />
        </div>
      </section>

      {bancal && (
        <button className="btn accent block big" onClick={() => navigate(`/ir/${bancal.id}?ruta=${item.id}`)}>
          <Navigation size={20} /> Seguir esta ruta
        </button>
      )}

      <section className="card stack">
        <label className="field">
          <span>Nombre</span>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => void rename()} />
        </label>
        {kind === 'camino' && (
          <div className="field">
            <span className="field-label">Tipo</span>
            <Segmented value={(item as { tipo: TipoCamino }).tipo} onChange={(t) => void db.caminos.update(item.id, { tipo: t })} options={TIPOS} label="Tipo de camino" />
          </div>
        )}
      </section>

      <div className="row">
        <button className="btn block" onClick={exportar}>
          <Download size={18} /> Exportar GPX
        </button>
        <button className="btn danger block" onClick={() => void remove()}>
          <Trash2 size={18} /> Borrar
        </button>
      </div>
    </main>
  )
}
