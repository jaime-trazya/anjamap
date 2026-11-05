import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, CloudDownload, Download, FileDown, HardDrive, Smartphone, Upload } from 'lucide-react'
import { db, exportBackup, importBackup, setSetting, validateBackup, type Backup } from '../db/db'
import { COMARCAS } from '../domain/comarcas'
import { toGpx } from '../domain/gpx'
import { AVG_TILE_BYTES, borrarTeselas, cancelarDescarga, espacio, formatBytes, hasCacheApi } from '../map/tiles'
import { useData } from '../ui/useData'
import { descargarComarca, descargarDetalle, NIVELES, tilesComarca, tilesDetalle, useDescarga, type Nivel } from '../ui/offline'
import { pickFile, saveFile, today } from '../ui/files'
import { useToast } from '../ui/toast'
import { Segmented, Sheet, Switch } from '../ui/components'

export function SettingsScreen() {
  const { settings, bancales, caminos, rutas, diario, osm } = useData()
  const toast = useToast()
  const [restore, setRestore] = useState<Backup | null>(null)

  const exportar = async () => {
    const b = await exportBackup()
    await saveFile(`copia-anjamap-${today()}.json`, JSON.stringify(b), 'application/json')
  }
  const importar = async () => {
    const f = await pickFile('application/json,.json')
    if (!f) return
    try {
      setRestore(validateBackup(JSON.parse(await f.text())))
    } catch (e) {
      toast.show((e as Error).message.startsWith('Unexpected') ? 'El archivo no es una copia válida' : (e as Error).message)
    }
  }
  const exportarGpx = () => {
    void saveFile(
      `anjamap-${today()}.gpx`,
      toGpx({
        waypoints: bancales.map((b) => ({ name: b.nombre, point: [b.lat, b.lon], desc: [b.finca, b.nota].filter(Boolean).join(' · ') || undefined })),
        tracks: [...caminos.map((c) => ({ name: c.nombre, points: c.puntos })), ...rutas.map((r) => ({ name: r.nombre, points: r.puntos }))],
      }),
      'application/gpx+xml',
    )
  }

  return (
    <main className="screen">
      <div className="head">
        <div>
          <div className="eyebrow">Anjamap</div>
          <h1 className="title">Ajustes</h1>
        </div>
      </div>

      <OfflineSection />

      <div className="section">
        <h2>Mapa</h2>
      </div>
      <section className="card stack">
        <div className="field">
          <span className="field-label">Capa</span>
          <Segmented
            value={settings.capa}
            onChange={(v) => void setSetting('capa', v)}
            options={[
              { value: 'satelite', label: 'Satélite' },
              { value: 'mapa', label: 'Mapa' },
            ]}
            label="Capa del mapa"
          />
        </div>
        <div className="check-row">
          <div className="grow">
            <div>Caminos de OpenStreetMap</div>
            <div className="meta">
              {osm.estado === 'listo' && osm.net
                ? `${osm.net.edges.length.toLocaleString('es-ES')} tramos de pistas, sendas y calles de las dos comarcas para recomendar rutas.`
                : osm.estado === 'cargando'
                  ? 'Cargando…'
                  : osm.estado === 'error'
                    ? 'No se han podido cargar.'
                    : 'Desactivados: solo se usan tus caminos.'}
            </div>
          </div>
          <Switch checked={settings.caminosOsm} onChange={(v) => void setSetting('caminosOsm', v)} label="Caminos de OpenStreetMap" />
        </div>
        <div className="check-row">
          <div className="grow">
            <div>Detalle automático</div>
            <div className="meta">Al guardar un bancal con conexión, baja el satélite con máximo detalle de sus alrededores.</div>
          </div>
          <Switch checked={settings.autoDetalle} onChange={(v) => void setSetting('autoDetalle', v)} label="Detalle automático" />
        </div>
        <div className="field">
          <span className="field-label">Apariencia</span>
          <Segmented
            value={settings.tema}
            onChange={(v) => void setSetting('tema', v)}
            options={[
              { value: 'sistema', label: 'Automático' },
              { value: 'claro', label: 'Claro' },
              { value: 'oscuro', label: 'Oscuro' },
            ]}
            label="Apariencia"
          />
        </div>
      </section>

      <div className="section">
        <h2>Tus datos</h2>
      </div>
      <section className="card flush list">
        <button className="list-item" onClick={() => void exportar()}>
          <span className="tile sm none">
            <Download size={16} />
          </span>
          <div className="grow">
            <div className="primary-line">Hacer copia de seguridad</div>
            <div className="secondary-line">Guárdala en iCloud Drive o Google Drive</div>
          </div>
        </button>
        <button className="list-item" onClick={() => void importar()}>
          <span className="tile sm none">
            <Upload size={16} />
          </span>
          <div className="grow primary-line">Restaurar copia</div>
        </button>
        <button className="list-item" onClick={exportarGpx}>
          <span className="tile sm none">
            <FileDown size={16} />
          </span>
          <div className="grow">
            <div className="primary-line">Exportar todo a GPX</div>
            <div className="secondary-line">Para abrirlo en Google Earth, Wikiloc u otro GPS</div>
          </div>
        </button>
        <a className="list-item tap" href="#/ajustes/instalar">
          <span className="tile sm none">
            <Smartphone size={16} />
          </span>
          <div className="grow primary-line">Instalar en el móvil</div>
          <ChevronRight size={18} className="chev" />
        </a>
      </section>
      <p className="meta" style={{ padding: '0 4px' }}>
        {bancales.length} bancales · {caminos.length} caminos · {rutas.length} rutas · {diario.length} apuntes. Todo se guarda solo en este teléfono, sin servidor ni cuentas.
      </p>

      <div className="section">
        <h2>Fuentes</h2>
      </div>
      <section className="card stack" style={{ gap: 6 }}>
        <p className="small muted">Imagen de satélite: PNOA cedido por © Instituto Geográfico Nacional (CC BY 4.0). Mapa base: © Instituto Geográfico Nacional.</p>
        <p className="small muted">
          Pistas, sendas y límites de las comarcas: © colaboradores de OpenStreetMap (ODbL)
          {osm.net?.fecha ? `, datos del ${new Date(osm.net.fecha).toLocaleDateString('es-ES')}` : ''}.
        </p>
      </section>

      {restore && (
        <Sheet title="Restaurar copia" onClose={() => setRestore(null)}>
          <p className="muted">
            La copia del {new Date(restore.fecha).toLocaleDateString('es-ES')} tiene {restore.bancales.length} bancales, {restore.caminos.length} caminos, {restore.rutas.length} rutas y {restore.diario?.length ?? 0} apuntes.
          </p>
          <button
            className="btn primary block"
            onClick={async () => {
              await importBackup(restore, 'fusionar')
              setRestore(null)
              toast.show('Copia añadida')
            }}
          >
            Añadir a lo que tengo
          </button>
          <button
            className="btn danger block"
            onClick={async () => {
              const ok = await toast.confirm({ title: '¿Reemplazar todo?', message: 'Se borrarán los bancales, caminos, rutas y apuntes actuales y se pondrán los de la copia.', confirmLabel: 'Reemplazar', danger: true })
              if (!ok) return
              await importBackup(restore, 'reemplazar')
              setRestore(null)
              toast.show('Copia restaurada')
            }}
          >
            Reemplazar todo
          </button>
        </Sheet>
      )}
    </main>
  )
}

function OfflineSection() {
  const { bancales, caminos } = useData()
  const toast = useToast()
  const d = useDescarga()
  const zonas = useLiveQuery(() => db.zonas.toArray()) ?? []
  const [uso, setUso] = useState<{ usado: number; cuota: number } | null>(null)
  const descargando = d?.estado === 'descargando'

  useEffect(() => {
    void espacio().then(setUso)
  }, [d?.estado, zonas.length])

  const lanzar = async (fn: () => Promise<{ estado: string; fallos: number }>, aviso: string) => {
    if (!navigator.onLine) {
      toast.show('Necesitas conexión (mejor wifi) para descargar')
      return
    }
    try {
      const r = await fn()
      if (r.estado === 'terminada') toast.show(r.fallos ? `${aviso} (${r.fallos} teselas sin imagen)` : aviso)
    } catch (e) {
      toast.show((e as Error).message)
    }
  }

  const pedirComarca = async (id: string, nivel: Nivel) => {
    const n = tilesComarca(id, nivel).length
    const c = COMARCAS.find((x) => x.id === id)!
    const ok = await toast.confirm({
      title: `Descargar ${c.nombre}`,
      message: `Nivel ${NIVELES[nivel].nombre.toLowerCase()}: ${n.toLocaleString('es-ES')} teselas, unos ${formatBytes(n * AVG_TILE_BYTES)}. Hazlo con wifi y la app abierta; puedes seguir usándola mientras.`,
      confirmLabel: 'Descargar',
    })
    if (ok) await lanzar(() => descargarComarca(id, nivel), `${c.nombre} disponible sin conexión`)
  }

  const nDetalle = tilesDetalle(bancales, caminos).length

  if (!hasCacheApi()) {
    return (
      <section className="card">
        <p className="muted small">Este navegador no permite guardar mapas sin conexión. Abre la app en Safari (iPhone) o Chrome (Android).</p>
      </section>
    )
  }

  return (
    <>
      <div className="section">
        <h2>Mapa sin conexión</h2>
      </div>
      {d && (descargando || d.estado !== 'terminada') && (
        <section className="card stack" style={{ gap: 10 }}>
          <div className="row between">
            <strong className="ellipsis">{d.nombre}</strong>
            <span className="small muted num">{Math.floor(((d.hechas + d.fallos) / Math.max(1, d.total)) * 100)} %</span>
          </div>
          <div className="track">
            <i style={{ width: `${((d.hechas + d.fallos) / Math.max(1, d.total)) * 100}%` }} />
          </div>
          <div className="row between">
            <span className="meta num">
              {d.hechas.toLocaleString('es-ES')} de {d.total.toLocaleString('es-ES')}
              {d.estado === 'cancelada' ? ' · cancelada' : d.estado === 'error' ? ' · error' : ''}
            </span>
            {descargando && (
              <button className="btn small" onClick={cancelarDescarga}>
                Cancelar
              </button>
            )}
          </div>
        </section>
      )}
      <section className="card flush list">
        {COMARCAS.map((c) => {
          const hecho = (['detallado', 'basico'] as Nivel[]).find((n) => zonas.some((z) => z.id === `${c.id}-${n}`))
          return (
            <div key={c.id} className="list-item" style={{ flexWrap: 'wrap' }}>
              <span className="tile sm" style={{ '--c': 'var(--olive)' } as React.CSSProperties}>
                <CloudDownload size={16} />
              </span>
              <div className="grow">
                <div className="primary-line">{c.nombre}</div>
                <div className="secondary-line">{hecho ? `Guardada · nivel ${NIVELES[hecho].nombre.toLowerCase()}` : 'No descargada'}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {(Object.keys(NIVELES) as Nivel[]).map((n) => (
                  <button key={n} className={`btn small ${hecho === n ? '' : n === 'detallado' ? 'primary' : ''}`} disabled={descargando} onClick={() => void pedirComarca(c.id, n)}>
                    {NIVELES[n].nombre}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        <div className="list-item" style={{ flexWrap: 'wrap' }}>
          <span className="tile sm" style={{ '--c': '#b07d12' } as React.CSSProperties}>
            <CloudDownload size={16} />
          </span>
          <div className="grow">
            <div className="primary-line">Máximo detalle en tus bancales</div>
            <div className="secondary-line">
              {nDetalle ? `250 m alrededor de cada bancal y a lo largo de los caminos · ~${formatBytes(nDetalle * AVG_TILE_BYTES)}` : 'Guarda algún bancal o camino primero'}
            </div>
          </div>
          <button className="btn small primary" disabled={descargando || !nDetalle} onClick={() => void lanzar(() => descargarDetalle(bancales, caminos), 'Detalle guardado')}>
            Descargar
          </button>
        </div>
      </section>
      <section className="card stack" style={{ gap: 8 }}>
        <div className="row">
          <HardDrive size={18} className="muted" />
          <span className="grow small">{uso ? `Ocupado en este teléfono: ${formatBytes(uso.usado)}` : 'Espacio ocupado: desconocido'}</span>
          <button
            className="btn small danger"
            disabled={descargando}
            onClick={async () => {
              const ok = await toast.confirm({ title: '¿Borrar los mapas guardados?', message: 'Tus bancales, caminos y rutas no se tocan. Sin conexión el mapa se verá en blanco hasta que vuelvas a descargarlo.', confirmLabel: 'Borrar mapas', danger: true })
              if (!ok) return
              await borrarTeselas()
              await db.zonas.clear()
              setUso(await espacio())
              toast.show('Mapas borrados')
            }}
          >
            Borrar mapas
          </button>
        </div>
        <p className="meta">Sin conexión, la flecha y la distancia funcionan siempre: el GPS no necesita datos. Lo que se descarga es la imagen del mapa. Todo lo que ves con conexión también se guarda.</p>
      </section>
    </>
  )
}
