import { useState } from 'react'
import { ChevronRight, FileUp, Footprints, PenLine, Route as RouteIcon, Waypoints } from 'lucide-react'
import { db, uid, type Bancal, type Camino } from '../db/db'
import { formatDistance, pathLength, simplify } from '../lib/geo'
import { parseGpx, type GpxData } from '../domain/gpx'
import { useData } from '../ui/useData'
import { navigate } from '../ui/router'
import { pickFile } from '../ui/files'
import { useToast } from '../ui/toast'
import { Empty, Segmented, Sheet, Switch } from '../ui/components'
import { COLORES } from '../domain/constants'

const TIPO_LABEL = { pista: 'Pista', senda: 'Senda', atajo: 'Atajo' } as const

export function CaminosScreen() {
  const { caminos, rutas, bancales } = useData()
  const [tab, setTab] = useState<'caminos' | 'rutas'>('caminos')
  const [gpx, setGpx] = useState<{ name: string; data: GpxData } | null>(null)
  const toast = useToast()

  const importar = async () => {
    const f = await pickFile('.gpx,application/gpx+xml,application/xml,text/xml')
    if (!f) return
    try {
      const data = parseGpx(await f.text())
      if (!data.tracks.length && !data.waypoints.length) throw new Error('El archivo no tiene caminos ni puntos')
      setGpx({ name: f.name, data })
    } catch (e) {
      toast.show((e as Error).message)
    }
  }

  return (
    <main className="screen">
      <div className="title-row">
        <div>
          <h1 className="title">Caminos</h1>
          <div className="title-sub">La ruta recomendada va por estos caminos</div>
        </div>
      </div>

      <div className="actions three">
        <button className="action" onClick={() => navigate('/grabar?tipo=camino')}>
          <Footprints size={22} />
          Grabar andando
        </button>
        <button className="action" onClick={() => navigate('/dibujar?tipo=camino')}>
          <PenLine size={22} />
          Dibujar
        </button>
        <button className="action" onClick={() => void importar()}>
          <FileUp size={22} />
          Importar GPX
        </button>
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        label="Ver"
        options={[
          { value: 'caminos', label: `Caminos (${caminos.length})` },
          { value: 'rutas', label: `Rutas guardadas (${rutas.length})` },
        ]}
      />

      {tab === 'caminos' ? (
        caminos.length ? (
          <section className="card flush list">
            {[...caminos]
              .sort((a, b) => b.creado - a.creado)
              .map((c) => (
                <a key={c.id} className="list-item tap" href={`#/camino/${c.id}`}>
                  <span className="tile sm" style={{ '--c': '#8a6d1d' } as React.CSSProperties}>
                    <Waypoints size={16} />
                  </span>
                  <div className="grow">
                    <div className="primary-line ellipsis">{c.nombre}</div>
                    <div className="secondary-line">
                      {TIPO_LABEL[c.tipo]} · {formatDistance(pathLength(c.puntos))}
                    </div>
                  </div>
                  <ChevronRight size={18} className="chev" />
                </a>
              ))}
          </section>
        ) : (
          <section className="card">
            <Empty title="Sin caminos todavía">
              Graba las pistas y sendas por las que vas a los bancales, o dibújalas sobre el satélite. Con ellas la app recomienda por dónde ir en vez de en línea recta.
            </Empty>
          </section>
        )
      ) : rutas.length ? (
        <section className="card flush list">
          {[...rutas]
            .sort((a, b) => b.creado - a.creado)
            .map((r) => {
              const b = bancales.find((x) => x.id === r.bancalId)
              return (
                <a key={r.id} className="list-item tap" href={`#/ruta/${r.id}`}>
                  <span className="tile sm" style={{ '--c': b?.color ?? '#5b7f1f' } as React.CSSProperties}>
                    <RouteIcon size={16} />
                  </span>
                  <div className="grow">
                    <div className="primary-line ellipsis">{r.nombre}</div>
                    <div className="secondary-line ellipsis">
                      a {b?.nombre ?? '—'} · {formatDistance(pathLength(r.puntos))}
                    </div>
                  </div>
                  <ChevronRight size={18} className="chev" />
                </a>
              )
            })}
        </section>
      ) : (
        <section className="card">
          <Empty title="Sin rutas guardadas">Las rutas se guardan desde la ficha de cada bancal: grábalas andando o dibújalas.</Empty>
        </section>
      )}

      {gpx && <GpxImport file={gpx.name} data={gpx.data} bancalesCount={bancales.length} onClose={() => setGpx(null)} />}
    </main>
  )
}

function GpxImport({ file, data, bancalesCount, onClose }: { file: string; data: GpxData; bancalesCount: number; onClose: () => void }) {
  const toast = useToast()
  const [conPuntos, setConPuntos] = useState(true)
  const run = async () => {
    const now = Date.now()
    const caminos: Camino[] = data.tracks.map((t) => ({ id: uid(), nombre: t.name, tipo: 'senda', puntos: simplify(t.points, 1.5), origen: 'gpx', creado: now }))
    const bancales: Bancal[] = conPuntos
      ? data.waypoints.map((w, i) => ({
          id: uid(),
          nombre: w.name || `Bancal ${bancalesCount + i + 1}`,
          nota: w.desc,
          lat: w.point[0],
          lon: w.point[1],
          precision: null,
          color: COLORES[0].color,
          creado: now,
          actualizado: now,
        }))
      : []
    await db.transaction('rw', db.caminos, db.bancales, async () => {
      await db.caminos.bulkAdd(caminos)
      await db.bancales.bulkAdd(bancales)
    })
    toast.show(`Importados ${caminos.length} caminos${bancales.length ? ` y ${bancales.length} bancales` : ''}`)
    onClose()
  }
  return (
    <Sheet
      title="Importar GPX"
      onClose={onClose}
      footer={
        <button className="btn primary block" onClick={() => void run()}>
          Importar
        </button>
      }
    >
      <p className="muted small">{file}</p>
      <section className="card stack" style={{ gap: 8 }}>
        <div className="row between">
          <span>Caminos</span>
          <strong>{data.tracks.length}</strong>
        </div>
        <div className="row between">
          <span>Puntos</span>
          <strong>{data.waypoints.length}</strong>
        </div>
      </section>
      {data.waypoints.length > 0 && (
        <div className="check-row">
          <span className="grow">Añadir los puntos como bancales</span>
          <Switch checked={conPuntos} onChange={setConPuntos} label="Añadir los puntos como bancales" />
        </div>
      )}
    </Sheet>
  )
}
