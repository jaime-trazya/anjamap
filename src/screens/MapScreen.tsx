import { useEffect, useMemo, useRef, useState } from 'react'
import { Car, ChevronRight, Layers, LocateFixed, MapPinPlus, Navigation, Plus, Search } from 'lucide-react'
import { MapView } from '../map/MapView'
import { setSetting, type Bancal } from '../db/db'
import { bearing, cardinal, distance, formatDistance, walkMinutes, type LatLon } from '../lib/geo'
import { hace } from '../lib/fecha'
import { useData } from '../ui/useData'
import { usePosition } from '../ui/position'
import { useEditor } from '../ui/editor'
import { navigate } from '../ui/router'
import { useToast } from '../ui/toast'
import { irAPunto } from '../ui/destino'
import { MiniArrow, Sheet } from '../ui/components'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function MapScreen() {
  const { bancales, caminos, rutas, settings, osm } = useData()
  const editor = useEditor()
  const toast = useToast()
  const { fix, error } = usePosition()
  const [follow, setFollow] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [press, setPress] = useState<LatLon | null>(null)
  const [buscar, setBuscar] = useState(false)
  const [cocheSheet, setCocheSheet] = useState(false)
  const saveTimer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])
  const [initial] = useState(() => (settings.vista ? { center: [settings.vista.lat, settings.vista.lon] as LatLon, zoom: settings.vista.zoom } : null))
  // Primera vez sin vista guardada: encuadra los bancales
  const [fit, setFit] = useState<LatLon[] | null>(() => (!initial && bancales.length ? bancales.map((b) => [b.lat, b.lon] as LatLon) : null))
  const [fitKey, setFitKey] = useState(() => (fit ? 'inicio' : ''))
  const encuadrar = (pts: LatLon[]) => {
    setFit(pts)
    setFitKey(String(Date.now()))
  }

  const selected = selId ? (bancales.find((b) => b.id === selId) ?? null) : null
  const coche: LatLon | null = settings.coche ? [settings.coche.lat, settings.coche.lon] : null

  const locate = () => {
    if (!fix) return
    encuadrar([fix.p])
    setFollow(true)
  }
  const elegir = (b: Bancal) => {
    setSelId(b.id)
    setFollow(false)
    encuadrar([[b.lat, b.lon]])
  }
  const aparcar = (p: LatLon) => {
    void setSetting('coche', { lat: p[0], lon: p[1], t: Date.now() })
    toast.show('Coche guardado aquí')
  }

  const gps = error === 'denegado' ? { cls: 'off', txt: 'Sin permiso' } : fix ? { cls: fix.acc <= 15 ? 'ok' : 'meh', txt: `±${Math.round(fix.acc)} m` } : { cls: '', txt: 'GPS…' }

  return (
    <div className="map-screen">
      <MapView
        capa={settings.capa}
        bancales={bancales}
        caminos={caminos}
        rutas={rutas}
        red={osm.net}
        coche={coche}
        user={fix}
        follow={follow}
        fit={fit}
        fitKey={fitKey}
        initial={initial}
        selectedId={selected?.id}
        showComarcas
        onBancalClick={(b) => setSelId(b.id)}
        onCocheClick={() => setCocheSheet(true)}
        onLongPress={(p) => setPress(p)}
        onTap={() => setSelId(null)}
        onUserPan={() => setFollow(false)}
        onMove={(c, z) => {
          window.clearTimeout(saveTimer.current)
          saveTimer.current = window.setTimeout(() => void setSetting('vista', { lat: c[0], lon: c[1], zoom: z }), 800)
        }}
      />

      <div className="map-top">
        <button className="map-search float" onClick={() => setBuscar(true)}>
          <Search size={20} />
          <span className="grow ellipsis">{bancales.length ? 'Buscar bancal' : 'Anjamap'}</span>
          <span className="gps-chip">
            <span className={`gps-dot ${gps.cls}`} />
            {gps.txt}
          </span>
        </button>
      </div>
      <div className="map-side">
        <button className="icon-btn float" aria-label={settings.capa === 'satelite' ? 'Ver mapa' : 'Ver satélite'} onClick={() => void setSetting('capa', settings.capa === 'satelite' ? 'mapa' : 'satelite')}>
          <Layers size={22} />
        </button>
        <button className={`icon-btn float ${follow ? 'on' : ''}`} aria-label="Centrar en mi posición" aria-pressed={follow} disabled={!fix} onClick={locate}>
          <LocateFixed size={22} />
        </button>
      </div>

      <div className="map-bottom">
        {selected ? (
          <div className="map-card float">
            <button className="row" style={{ textAlign: 'left', gap: 12 }} onClick={() => navigate(`/bancal/${selected.id}`)}>
              <span className="tile solid" style={{ '--c': selected.color } as React.CSSProperties}>
                {fix ? <MiniArrow deg={bearing(fix.p, [selected.lat, selected.lon])} size={20} /> : <Navigation size={18} />}
              </span>
              <div className="grow">
                <h3 className="ellipsis">{selected.nombre}</h3>
                <div className="small muted ellipsis">
                  {[selected.finca, selected.olivos ? `${selected.olivos} olivos` : null].filter(Boolean).join(' · ') || 'Ver ficha'}
                </div>
              </div>
              <ChevronRight size={22} className="chev" />
            </button>
            <button className="go-btn" onClick={() => navigate(`/ir/${selected.id}`)}>
              <span className="go-icon">
                <Navigation size={24} />
              </span>
              <div className="grow">
                <strong>Ir al bancal</strong>
                <span>{fix ? `${formatDistance(distance(fix.p, [selected.lat, selected.lon]))} al ${cardinal(bearing(fix.p, [selected.lat, selected.lon]))} · ≈ ${walkMinutes(distance(fix.p, [selected.lat, selected.lon]) * 1.3)} min` : 'Esperando al GPS'}</span>
              </div>
            </button>
          </div>
        ) : !bancales.length ? (
          <div className="map-card float">
            <h3>Guarda tu primer bancal</h3>
            <p className="small muted">
              Ve hasta el bancal y pulsa <b>+</b> → «Guardar bancal aquí». Desde casa, mantén pulsado el mapa encima del bancal.
            </p>
          </div>
        ) : null}
        <div className="map-bottom-row">
          {coche && !selected ? (
            <button className="car-chip float" onClick={() => setCocheSheet(true)}>
              <Car size={20} />
              {fix ? formatDistance(distance(fix.p, coche)) : 'Coche'}
            </button>
          ) : (
            <span />
          )}
          {!selected && (
            <button className="fab" aria-label="Añadir" onClick={() => editor.openAdd()}>
              <Plus size={28} />
            </button>
          )}
        </div>
      </div>

      {buscar && (
        <BuscarSheet
          bancales={bancales}
          pos={fix?.p ?? null}
          onClose={() => setBuscar(false)}
          onPick={(b) => {
            setBuscar(false)
            elegir(b)
          }}
        />
      )}

      {press && (
        <Sheet title="Punto del mapa" onClose={() => setPress(null)}>
          <p className="muted small num">
            {press[0].toFixed(5)}, {press[1].toFixed(5)}
            {fix ? ` · a ${formatDistance(distance(fix.p, press))} de ti` : ''}
          </p>
          <button
            className="go-btn"
            onClick={() => {
              const p = press
              setPress(null)
              navigate(irAPunto(p))
            }}
          >
            <span className="go-icon">
              <Navigation size={24} />
            </span>
            <div className="grow">
              <strong>Ir aquí</strong>
              <span>Sin guardarlo como bancal</span>
            </div>
          </button>
          <section className="card flush list">
            <button
              className="list-item"
              onClick={() => {
                const p = press
                setPress(null)
                editor.openBancal(undefined, { point: p, precision: null })
              }}
            >
              <span className="tile sm none">
                <MapPinPlus size={18} />
              </span>
              <div className="grow primary-line">Nuevo bancal aquí</div>
            </button>
            <button
              className="list-item"
              onClick={() => {
                aparcar(press)
                setPress(null)
              }}
            >
              <span className="tile sm none">
                <Car size={18} />
              </span>
              <div className="grow primary-line">Dejar el coche aquí</div>
            </button>
          </section>
        </Sheet>
      )}

      {cocheSheet && coche && settings.coche && (
        <Sheet title="El coche" onClose={() => setCocheSheet(false)}>
          <p className="muted small">
            Aparcado {hace(settings.coche.t)} a las {new Date(settings.coche.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            {fix ? ` · a ${formatDistance(distance(fix.p, coche))}` : ''}
          </p>
          <button
            className="go-btn"
            onClick={() => {
              setCocheSheet(false)
              navigate('/ir/coche')
            }}
          >
            <span className="go-icon">
              <Car size={24} />
            </span>
            <div className="grow">
              <strong>Volver al coche</strong>
              <span>{fix ? `≈ ${walkMinutes(distance(fix.p, coche) * 1.3)} min andando` : 'Esperando al GPS'}</span>
            </div>
          </button>
          <div className="row">
            <button
              className="btn block"
              disabled={!fix}
              onClick={() => {
                if (fix) aparcar(fix.p)
                setCocheSheet(false)
              }}
            >
              Está aquí
            </button>
            <button
              className="btn danger block"
              onClick={() => {
                void setSetting('coche', null)
                setCocheSheet(false)
              }}
            >
              Quitar
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function BuscarSheet({ bancales, pos, onClose, onPick }: { bancales: Bancal[]; pos: LatLon | null; onClose: () => void; onPick: (b: Bancal) => void }) {
  const [q, setQ] = useState('')
  const items = useMemo(() => {
    const list = bancales
      .filter((b) => !q || norm(`${b.nombre} ${b.finca ?? ''} ${b.variedad ?? ''} ${b.nota ?? ''}`).includes(norm(q)))
      .map((b) => ({ b, d: pos ? distance(pos, [b.lat, b.lon]) : null }))
    if (pos) list.sort((x, y) => x.d! - y.d!)
    return list
  }, [bancales, q, pos])
  return (
    <Sheet title="Buscar" onClose={onClose} full>
      <div className="search">
        <Search size={19} />
        <input className="input" type="search" aria-label="Buscar bancal" autoFocus placeholder="Nombre, finca, variedad…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {items.length ? (
        <section className="card flush list">
          {items.map(({ b, d }) => (
            <button key={b.id} className="list-item" onClick={() => onPick(b)}>
              <span className="tile sm solid" style={{ '--c': b.color } as React.CSSProperties}>
                {pos ? <MiniArrow deg={bearing(pos, [b.lat, b.lon])} size={16} /> : null}
              </span>
              <div className="grow">
                <div className="primary-line ellipsis">{b.nombre}</div>
                {b.finca && <div className="secondary-line ellipsis">{b.finca}</div>}
              </div>
              {d !== null && <span className="trail num small muted">{formatDistance(d)}</span>}
            </button>
          ))}
        </section>
      ) : (
        <p className="empty">{bancales.length ? `Nada coincide con «${q}»` : 'Aún no hay bancales'}</p>
      )}
    </Sheet>
  )
}
