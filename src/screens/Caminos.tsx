import { useState } from 'react'
import { ChevronRight, FileUp, Footprints, Map as MapIcon, PenLine, Route as RouteIcon, Waypoints } from 'lucide-react'
import { importBackup } from '../db/db'
import { formatDistance, pathLength } from '../lib/geo'
import { parseGpx, type GpxData } from '../domain/gpx'
import { gpxABackup } from '../domain/transfer'
import { useData } from '../ui/useData'
import { navigate } from '../ui/router'
import { pickFile } from '../ui/files'
import { useToast } from '../ui/toast'
import { Empty, Segmented, Sheet, Switch } from '../ui/components'
import { useAction } from '../ui/useAction'

const TIPO_LABEL = { pista: 'Pista', senda: 'Senda', atajo: 'Atajo' } as const

export function CaminosScreen() {
  const { caminos, rutas, bancales, settings, osm } = useData()
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
      <div className="head">
        <div>
          <div className="eyebrow">La ruta recomendada va por aquí</div>
          <h1 className="title">Caminos</h1>
        </div>
      </div>

      <section className="card row" style={{ alignItems: 'flex-start' }}>
        <span className="tile" style={{ '--c': 'var(--olive)' } as React.CSSProperties}>
          <MapIcon size={20} />
        </span>
        <div className="grow">
          <div style={{ fontWeight: 700 }}>Pistas y sendas de OpenStreetMap</div>
          <p className="small muted">
            {!settings.caminosOsm
              ? 'Desactivadas en Ajustes: solo se usan tus caminos.'
              : osm.estado === 'listo' && osm.net
                ? `${osm.net.edges.length.toLocaleString('es-ES')} tramos de la Canal de Navarrés y La Costera ya cargados, también sin conexión. Añade aquí los caminos que falten o los atajos que solo conoces tú.`
                : osm.estado === 'error'
                  ? 'No se han podido cargar. Vuelve a abrir la app con conexión.'
                  : 'Cargando…'}
          </p>
        </div>
      </section>

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
                  <span className="tile sm" style={{ '--c': '#a7801a' } as React.CSSProperties}>
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
            <Empty title="Sin caminos propios">
              Graba o dibuja las sendas y atajos que no salen en el mapa (entre bancales, por la acequia…). Se unen solos a las pistas de OpenStreetMap.
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
                  <span className="tile sm" style={{ '--c': b?.color ?? 'var(--olive)' } as React.CSSProperties}>
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

      {gpx && <GpxImport file={gpx.name} data={gpx.data} onClose={() => setGpx(null)} />}
    </main>
  )
}

function GpxImport({ file, data, onClose }: { file: string; data: GpxData; onClose: () => void }) {
  const toast = useToast()
  const { busy, run: execute } = useAction()
  const [conPuntos, setConPuntos] = useState(true)
  const run = async () => {
    // Ids sacados del contenido: importar el mismo GPX otra vez no duplica nada
    const copia = gpxABackup({ tracks: data.tracks, waypoints: conPuntos ? data.waypoints : [] })
    const { repetidos } = await importBackup(copia, 'fusionar')
    const nuevos = copia.bancales.length - repetidos
    toast.show(`Importados ${copia.caminos.length} caminos${nuevos ? ` y ${nuevos} bancales` : ''}${repetidos ? ` · ${repetidos} ya los tenías` : ''}`)
    onClose()
  }
  return (
    <Sheet
      title="Importar GPX"
      onClose={onClose}
      footer={
        <button className="btn primary block" disabled={busy || (!data.tracks.length && (!conPuntos || !data.waypoints.length))} onClick={() => void execute(run)}>
          {busy ? 'Importando…' : 'Importar'}
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
