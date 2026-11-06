import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, CloudDownload, HardDrive, Import, Smartphone } from 'lucide-react'
import { db, DEFAULT_SETTINGS, setSetting } from '../db/db'
import { COMARCAS } from '../domain/comarcas'
import { routeEndpoint } from '../domain/routing'
import { AVG_TILE_BYTES, borrarTeselas, cancelarDescarga, espacio, formatBytes, hasCacheApi } from '../map/tiles'
import { useData } from '../ui/useData'
import { descargarComarca, descargarDetalle, zonaId, NIVELES, tilesComarca, tilesDetalle, useDescarga, type Nivel } from '../ui/offline'
import { desbloquearVoz, hablar } from '../ui/voz'
import { useToast } from '../ui/toast'
import { Segmented, Switch } from '../ui/components'
import { useAction } from '../ui/useAction'
import { TransferSheet } from '../ui/TransferSheet'
import { TransportPicker } from '../ui/TransportPicker'

export function SettingsScreen() {
  const { settings, bancales, caminos, rutas } = useData()
  const fotoCount = useLiveQuery(() => db.fotos.count()) ?? 0
  const toast = useToast()
  const { busy, run } = useAction()
  const [transfer, setTransfer] = useState(false)
  const [server, setServer] = useState(settings.servidorRutas)
  return <main className="screen">
    <div className="head"><div><div className="eyebrow">Anjamap</div><h1 className="title">Ajustes</h1></div></div>
    <div className="section"><h2>Navegación</h2></div>
    <section className="card stack">
      <div className="field"><span className="field-label">Transporte habitual</span><TransportPicker value={settings.transporte} onChange={(value) => void setSetting('transporte', value)} /></div>
      <div className="check-row"><div className="grow"><div>Indicaciones por voz</div><p className="meta">Lee el siguiente giro mientras sigues la ruta.</p></div><Switch label="Indicaciones por voz" checked={settings.voz} onChange={(value) => { desbloquearVoz(); if (value) hablar('Indicaciones por voz activadas'); void setSetting('voz', value) }} /></div>
      <div className="check-row"><div className="grow"><div>Girar el mapa hacia donde vas</div><p className="meta">Al navegar, lo que tienes delante queda arriba. Si mueves el mapa con el dedo, vuelve al norte.</p></div><Switch label="Girar el mapa hacia donde vas" checked={settings.mapaGira} onChange={(value) => void setSetting('mapaGira', value)} /></div>
      <div className="check-row"><div className="grow"><div>Preferir rutas sin peajes</div><p className="meta">En coche. Se avisará si la ruta aún incluye alguno.</p></div><Switch label="Preferir rutas sin peajes" checked={settings.evitarPeajes} onChange={(value) => void setSetting('evitarPeajes', value)} /></div>
      <div className="check-row"><div className="grow"><div>Preferir rutas sin autopistas</div><p className="meta">En coche. Puede ser necesario usarlas para llegar.</p></div><Switch label="Preferir rutas sin autopistas" checked={settings.evitarAutopistas} onChange={(value) => void setSetting('evitarAutopistas', value)} /></div>
      <label className="field"><span>Velocidad de referencia del patinete</span><select className="select" value={settings.velocidadPatinete} onChange={(e) => void setSetting('velocidadPatinete', Number(e.target.value))}>{[10, 15, 20, 25].map((v) => <option key={v} value={v}>{v} km/h</option>)}</select></label>
      <p className="meta">A pie, coche y bici usan perfiles distintos. Patinete ofrece una ruta orientativa de bicicleta con preferencia por pendientes suaves y vías ciclistas; no verifica las restricciones específicas de VMP.</p>
      <p className="meta">Para calcular y recalcular hace falta conexión. Una ruta ya calculada puede seguirse al perder cobertura. Los tiempos son estimaciones, sin tráfico en directo.</p>
    </section>
    <div className="section"><h2>Bancales y fotos</h2></div>
    <section className="card flush list"><button className="list-item" onClick={() => setTransfer(true)}><span className="tile sm none"><Import size={19} /></span><div className="grow"><div className="primary-line">Importar, exportar y enviar</div><div className="secondary-line">Archivo completo con fotos o GPX</div></div><ChevronRight size={18} /></button></section>
    <p className="meta">{bancales.length} bancales · {fotoCount} fotos · {caminos.length} caminos · {rutas.length} rutas. Se guardan en este dispositivo. Haz una copia para pasarlos a otra persona o cambiar de móvil.</p>
    <div className="section"><h2>Mapa y apariencia</h2></div>
    <section className="card stack">
      <div className="field"><span className="field-label">Mapa</span><Segmented label="Capa del mapa" value={settings.capa} onChange={(v) => void setSetting('capa', v)} options={[{ value: 'mapa', label: 'Calles' }, { value: 'satelite', label: 'Satélite' }]} /></div>
      <div className="field"><span className="field-label">Apariencia</span><Segmented label="Apariencia" value={settings.tema} onChange={(v) => void setSetting('tema', v)} options={[{ value: 'sistema', label: 'Automático' }, { value: 'claro', label: 'Claro' }, { value: 'oscuro', label: 'Oscuro' }]} /></div>
      <div className="check-row"><div className="grow"><div>Guardar detalle del bancal</div><p className="meta">Descarga automáticamente el satélite de sus alrededores al añadirlo.</p></div><Switch label="Detalle automático" checked={settings.autoDetalle} onChange={(v) => void setSetting('autoDetalle', v)} /></div>
      <div className="check-row"><div className="grow"><div>Red local de caminos</div><p className="meta">Para orientación a pie sin conexión en la Canal de Navarrés y La Costera.</p></div><Switch label="Caminos de OpenStreetMap" checked={settings.caminosOsm} onChange={(v) => void setSetting('caminosOsm', v)} /></div>
    </section>
    <OfflineSection />
    <details className="card stack"><summary>Servidor de rutas</summary><p className="meta">Se envían tu posición y el destino a este servicio para calcular el recorrido. El servidor público es de demostración y puede limitar peticiones. Para un uso estable puedes configurar un servidor Valhalla propio con CORS.</p>
      <label className="field"><span>Dirección del servidor</span><input className="input" type="url" value={server} onChange={(e) => setServer(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
      <button className="btn block" disabled={busy} onClick={() => void run(async () => { routeEndpoint(server); await setSetting('servidorRutas', server.trim()); toast.show('Servidor de rutas guardado') })}>Guardar servidor</button>
      <button className="btn block" onClick={() => { setServer(DEFAULT_SETTINGS.servidorRutas); void setSetting('servidorRutas', DEFAULT_SETTINGS.servidorRutas) }}>Usar servidor público</button>
    </details>
    <a className="btn block" href="#/ajustes/instalar"><Smartphone size={19} /> Instalar en el móvil</a>
    <p className="meta">Mapas: © Instituto Geográfico Nacional (PNOA, IGN). Rutas y caminos: © colaboradores de OpenStreetMap · motor Valhalla.</p>
    {transfer && <TransferSheet onClose={() => setTransfer(false)} />}
  </main>
}

function OfflineSection() {
  const { bancales, caminos, settings } = useData()
  const toast = useToast()
  const d = useDescarga()
  const zonas = useLiveQuery(() => db.zonas.toArray()) ?? []
  const [uso, setUso] = useState<{ usado: number; cuota: number } | null>(null)
  const descargando = d?.estado === 'descargando'

  useEffect(() => {
    void espacio().then(setUso)
  }, [d?.estado, zonas.length])

  const lanzar = async (fn: () => Promise<{ estado: string; fallos: number; hechas: number; total: number }>, aviso: string) => {
    if (!navigator.onLine) {
      toast.show('Necesitas conexión (mejor wifi) para descargar')
      return
    }
    try {
      const r = await fn()
      if (r.estado === 'error') toast.show('No se ha podido guardar el mapa. Revisa el espacio disponible y vuelve a intentarlo.')
      else if (r.estado === 'terminada') toast.show(r.fallos ? `Descarga incompleta: ${r.hechas} de ${r.total} imágenes. Vuelve a descargar para completar las que faltan.` : aviso)
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
    if (ok) await lanzar(() => descargarComarca(id, nivel, settings.capa), `${c.nombre} disponible sin conexión`)
  }

  const nDetalle = useMemo(() => tilesDetalle(bancales, caminos).length, [bancales, caminos])

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
          const hecho = (['detallado', 'basico'] as Nivel[]).find((n) => zonas.some((z) => z.id === zonaId(`${c.id}-${n}`, settings.capa) && z.guardadas === z.total))
          const parcial = zonas.find((z) => (['detallado', 'basico'] as Nivel[]).some((n) => z.id === zonaId(`${c.id}-${n}`, settings.capa)) && z.guardadas < z.total)
          return (
            <div key={c.id} className="list-item" style={{ flexWrap: 'wrap' }}>
              <span className="tile sm" style={{ '--c': 'var(--olive)' } as React.CSSProperties}>
                <CloudDownload size={16} />
              </span>
              <div className="grow">
                <div className="primary-line">{c.nombre}</div>
                <div className="secondary-line">{hecho ? `Guardada · nivel ${NIVELES[hecho].nombre.toLowerCase()}` : parcial ? `Incompleta · ${parcial.guardadas} de ${parcial.total} imágenes` : 'No descargada'}</div>
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
          <button className="btn small primary" disabled={descargando || !nDetalle} onClick={() => void lanzar(() => descargarDetalle(bancales, caminos, settings.capa), 'Detalle guardado')}>
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
