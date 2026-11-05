import { useRef, useState } from 'react'
import { ChevronRight, Layers, LocateFixed, Navigation, Plus } from 'lucide-react'
import { MapView } from '../map/MapView'
import { setSetting, type Bancal } from '../db/db'
import { bearing, cardinal, distance, formatDistance, type LatLon } from '../lib/geo'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { navigate } from '../ui/router'
import { MiniArrow, Sheet } from '../ui/components'

export function MapScreen() {
  const { bancales, caminos, rutas, settings } = useData()
  const editor = useEditor()
  const { fix, error } = usePosition()
  const [follow, setFollow] = useState(false)
  const [sel, setSel] = useState<Bancal | null>(null)
  const [press, setPress] = useState<LatLon | null>(null)
  const saveTimer = useRef<number>(0)
  const [initial] = useState(() => (settings.vista ? { center: [settings.vista.lat, settings.vista.lon] as LatLon, zoom: settings.vista.zoom } : null))
  // Primera vez sin vista guardada: encuadra los bancales
  const [fit, setFit] = useState<LatLon[] | null>(() => (!initial && bancales.length ? bancales.map((b) => [b.lat, b.lon] as LatLon) : null))
  const [fitKey, setFitKey] = useState(() => (fit ? 'inicio' : ''))

  const selected = sel ? (bancales.find((b) => b.id === sel.id) ?? null) : null

  const locate = () => {
    if (!fix) return
    setFit([fix.p])
    setFitKey(String(Date.now()))
    setFollow(true)
  }

  return (
    <div className="map-screen">
      <MapView
        capa={settings.capa}
        bancales={bancales}
        caminos={caminos}
        rutas={rutas}
        user={fix}
        follow={follow}
        fit={fit}
        fitKey={fitKey}
        initial={initial}
        selectedId={selected?.id}
        showComarcas
        onBancalClick={(b) => setSel(b)}
        onLongPress={(p) => setPress(p)}
        onTap={() => setSel(null)}
        onUserPan={() => setFollow(false)}
        onMove={(c, z) => {
          window.clearTimeout(saveTimer.current)
          saveTimer.current = window.setTimeout(() => void setSetting('vista', { lat: c[0], lon: c[1], zoom: z }), 800)
        }}
      />

      <div className="map-top">
        <div className="map-brand">
          <strong>Anjamap</strong>
          <span className={`gps-dot ${fix ? (fix.acc <= 15 ? 'ok' : 'meh') : 'off'}`} />
          <span className="meta">{error === 'denegado' ? 'Sin permiso de ubicación' : fix ? `GPS ±${Math.round(fix.acc)} m` : 'Buscando GPS…'}</span>
        </div>
        <button
          className="icon-btn map-btn"
          aria-label={settings.capa === 'satelite' ? 'Ver mapa' : 'Ver satélite'}
          onClick={() => void setSetting('capa', settings.capa === 'satelite' ? 'mapa' : 'satelite')}
        >
          <Layers size={20} />
        </button>
      </div>

      <div className="map-fabs">
        <button className={`icon-btn map-btn ${follow ? 'on' : ''}`} aria-label="Centrar en mi posición" disabled={!fix} onClick={locate}>
          <LocateFixed size={21} />
        </button>
        <button className="fab" aria-label="Añadir" onClick={() => editor.openAdd()}>
          <Plus size={26} />
        </button>
      </div>

      {!bancales.length && !selected && (
        <div className="map-card">
          <strong>Guarda tu primer bancal</strong>
          <p className="small muted">Ve hasta el bancal y pulsa <b>+</b> → «Guardar bancal aquí». También puedes mantener pulsado el mapa para marcarlo.</p>
        </div>
      )}

      {selected && (
        <div className="map-card">
          <div className="row">
            <span className="tile" style={{ '--c': selected.color } as React.CSSProperties}>
              {fix ? <MiniArrow deg={bearing(fix.p, [selected.lat, selected.lon])} size={18} /> : <Navigation size={18} />}
            </span>
            <button className="grow" style={{ textAlign: 'left' }} onClick={() => navigate(`/bancal/${selected.id}`)}>
              <div className="primary-line ellipsis">{selected.nombre}</div>
              <div className="small muted ellipsis">
                {fix ? `${formatDistance(distance(fix.p, [selected.lat, selected.lon]))} al ${cardinal(bearing(fix.p, [selected.lat, selected.lon]))}` : (selected.finca ?? 'Sin GPS')}
                {fix && selected.finca ? ` · ${selected.finca}` : ''}
              </div>
            </button>
            <button className="icon-btn plain" aria-label="Ver ficha" onClick={() => navigate(`/bancal/${selected.id}`)}>
              <ChevronRight size={20} />
            </button>
          </div>
          <button className="btn accent block" onClick={() => navigate(`/ir/${selected.id}`)}>
            <Navigation size={18} /> Ir al bancal
          </button>
        </div>
      )}

      {press && (
        <Sheet
          title="Punto del mapa"
          onClose={() => setPress(null)}
          footer={
            <button
              className="btn primary block"
              onClick={() => {
                const p = press
                setPress(null)
                editor.openBancal(undefined, { point: p, precision: null })
              }}
            >
              Nuevo bancal aquí
            </button>
          }
        >
          <p className="muted small">
            {press[0].toFixed(5)}, {press[1].toFixed(5)}
            {fix ? ` · a ${formatDistance(distance(fix.p, press))} de ti` : ''}
          </p>
        </Sheet>
      )}
    </div>
  )
}
