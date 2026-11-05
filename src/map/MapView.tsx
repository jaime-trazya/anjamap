import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Bancal, Camino, Ruta } from '../db/db'
import type { LatLon } from '../lib/geo'
import type { Fix } from '../ui/position'
import { COMARCAS } from '../domain/comarcas'
import { CAPAS, getTile, type Capa } from './tiles'

/** Capa de teselas que lee primero de la caché del dispositivo (funciona sin conexión) */
class CachedTileLayer extends L.TileLayer {
  private capa: Capa
  constructor(capa: Capa, opts: L.TileLayerOptions) {
    super('', opts)
    this.capa = capa
  }
  /** Cada tesela 1 px más grande: evita las rayas finas entre teselas con zoom fraccionario */
  _initTile(tile: HTMLElement) {
    ;(L.GridLayer.prototype as unknown as { _initTile(t: HTMLElement): void })._initTile.call(this, tile)
    const s = this.getTileSize()
    tile.style.width = `${s.x + 1}px`
    tile.style.height = `${s.y + 1}px`
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const img = document.createElement('img')
    img.alt = ''
    img.setAttribute('role', 'presentation')
    img.decoding = 'async'
    const url = CAPAS[this.capa].url(coords.z, coords.x, coords.y)
    void getTile(url).then((blob) => {
      if (!blob) {
        img.style.visibility = 'hidden'
        done(new Error('sin tesela'), img)
        return
      }
      const u = URL.createObjectURL(blob)
      img.onload = () => {
        URL.revokeObjectURL(u)
        done(undefined, img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(u)
        img.style.visibility = 'hidden'
        done(new Error('tesela dañada'), img)
      }
      img.src = u
    })
    return img
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function bancalIcon(b: Bancal, selected: boolean, showLabel: boolean) {
  return L.divIcon({
    className: 'pin-wrap',
    iconSize: [0, 0],
    html: `<div class="pin ${selected ? 'sel' : ''}" style="--c:${esc(b.color)}"><span class="pin-dot"></span>${showLabel ? `<span class="pin-label">${esc(b.nombre)}</span>` : ''}</div>`,
  })
}

const COMARCAS_BOUNDS = L.latLngBounds(COMARCAS.flatMap((c) => c.anillos.flat()))

export interface MapViewProps {
  className?: string
  capa: Capa
  bancales?: Bancal[]
  caminos?: Camino[]
  rutas?: Ruta[]
  /** Ruta destacada (la que se está siguiendo) */
  route?: LatLon[] | null
  /** Línea en edición (grabando o dibujando) */
  draft?: LatLon[] | null
  user?: Fix | null
  heading?: number | null
  follow?: boolean
  /** Encuadra estos puntos cuando cambia `fitKey` */
  fit?: LatLon[] | null
  fitKey?: string
  initial?: { center: LatLon; zoom: number } | null
  selectedId?: string | null
  showComarcas?: boolean
  interactive?: boolean
  onBancalClick?: (b: Bancal) => void
  onCaminoClick?: (c: Camino) => void
  onLongPress?: (p: LatLon) => void
  onTap?: (p: LatLon) => void
  onMove?: (center: LatLon, zoom: number) => void
  onUserPan?: () => void
  onReady?: (map: L.Map | null) => void
}

export function MapView(props: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layers = useRef<{
    tiles: L.Layer[]
    comarcas: L.LayerGroup
    caminos: L.LayerGroup
    rutas: L.LayerGroup
    route: L.LayerGroup
    draft: L.LayerGroup
    bancales: L.LayerGroup
    user: L.LayerGroup
  } | null>(null)
  const cb = useRef(props)
  useEffect(() => {
    cb.current = props
  })

  // Crear el mapa una vez
  useEffect(() => {
    const interactive = props.interactive !== false
    const map = L.map(el.current!, {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 21,
      minZoom: 9,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: false,
      keyboard: interactive,
      tapHold: true,
      zoomSnap: 0.5,
    })
    map.attributionControl.setPrefix(false)
    if (props.initial) map.setView(props.initial.center, props.initial.zoom)
    else map.fitBounds(COMARCAS_BOUNDS, { padding: [10, 10] })

    const pane = (name: string, z: number) => {
      map.createPane(name).style.zIndex = String(z)
      return name
    }
    layers.current = {
      tiles: [],
      comarcas: L.layerGroup([], { pane: pane('comarcas', 380) }).addTo(map),
      caminos: L.layerGroup([], { pane: pane('caminos', 400) }).addTo(map),
      rutas: L.layerGroup([], { pane: pane('rutas', 410) }).addTo(map),
      route: L.layerGroup([], { pane: pane('route', 420) }).addTo(map),
      draft: L.layerGroup([], { pane: pane('draft', 430) }).addTo(map),
      bancales: L.layerGroup([], { pane: pane('bancales', 600) }).addTo(map),
      user: L.layerGroup([], { pane: pane('user', 650) }).addTo(map),
    }
    map.on('contextmenu', (e: L.LeafletMouseEvent) => cb.current.onLongPress?.([e.latlng.lat, e.latlng.lng]))
    map.on('click', (e: L.LeafletMouseEvent) => cb.current.onTap?.([e.latlng.lat, e.latlng.lng]))
    map.on('dragstart', () => cb.current.onUserPan?.())
    map.on('moveend', () => {
      const c = map.getCenter()
      cb.current.onMove?.([c.lat, c.lng], map.getZoom())
    })
    mapRef.current = map
    cb.current.onReady?.(map)
    // El contenedor puede cambiar de tamaño (barra de pestañas, hojas)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el.current!)
    return () => {
      ro.disconnect()
      cb.current.onReady?.(null)
      map.remove()
      mapRef.current = null
      layers.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Teselas: una capa de poco detalle debajo (zoom 16) para que, sin conexión, nunca quede en blanco
  useEffect(() => {
    const map = mapRef.current
    const ls = layers.current
    if (!map || !ls) return
    ls.tiles.forEach((t) => map.removeLayer(t))
    const def = CAPAS[props.capa]
    const low = new CachedTileLayer(props.capa, { maxNativeZoom: 16, maxZoom: 21, attribution: def.atribucion, keepBuffer: 3 })
    const high = new CachedTileLayer(props.capa, { maxNativeZoom: def.maxNative, maxZoom: 21, minZoom: 17, keepBuffer: 2 })
    low.addTo(map)
    high.addTo(map)
    ls.tiles = [low, high]
  }, [props.capa])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.comarcas.clearLayers()
    if (props.showComarcas) {
      for (const c of COMARCAS) {
        L.polygon(c.anillos, { pane: 'comarcas', color: '#ffffff', weight: 2, opacity: 0.7, fill: false, dashArray: '2 6', interactive: false }).addTo(ls.comarcas)
      }
    }
  }, [props.showComarcas])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.caminos.clearLayers()
    for (const c of props.caminos ?? []) {
      const dash = c.tipo === 'senda' ? '7 7' : c.tipo === 'atajo' ? '2 7' : undefined
      L.polyline(c.puntos, { pane: 'caminos', color: '#1b1d1f', weight: 7, opacity: 0.35, interactive: false }).addTo(ls.caminos)
      const line = L.polyline(c.puntos, { pane: 'caminos', color: '#fff3c4', weight: 3.5, opacity: 0.95, dashArray: dash, lineCap: 'round' })
      if (cb.current.onCaminoClick) line.on('click', () => cb.current.onCaminoClick?.(c))
      line.addTo(ls.caminos)
    }
  }, [props.caminos])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.rutas.clearLayers()
    for (const r of props.rutas ?? []) {
      L.polyline(r.puntos, { pane: 'rutas', color: '#b9d97a', weight: 3, opacity: 0.85, dashArray: '1 6', lineCap: 'round', interactive: false }).addTo(ls.rutas)
    }
  }, [props.rutas])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.route.clearLayers()
    if (props.route && props.route.length > 1) {
      L.polyline(props.route, { pane: 'route', color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }).addTo(ls.route)
      L.polyline(props.route, { pane: 'route', color: '#5b7f1f', weight: 5, opacity: 1, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(ls.route)
    }
  }, [props.route])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.draft.clearLayers()
    const d = props.draft
    if (d && d.length) {
      if (d.length > 1) {
        L.polyline(d, { pane: 'draft', color: '#1b1d1f', weight: 8, opacity: 0.4, interactive: false }).addTo(ls.draft)
        L.polyline(d, { pane: 'draft', color: '#ffb547', weight: 4, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(ls.draft)
      }
      for (const p of [d[0], d[d.length - 1]]) L.circleMarker(p, { pane: 'draft', radius: 5, color: '#1b1d1f', weight: 2, fillColor: '#ffb547', fillOpacity: 1, interactive: false }).addTo(ls.draft)
    }
  }, [props.draft])

  useEffect(() => {
    const ls = layers.current
    const map = mapRef.current
    if (!ls || !map) return
    const draw = () => {
      ls.bancales.clearLayers()
      const showLabel = map.getZoom() >= 16
      for (const b of props.bancales ?? []) {
        const m = L.marker([b.lat, b.lon], { pane: 'bancales', icon: bancalIcon(b, b.id === props.selectedId, showLabel || b.id === props.selectedId), keyboard: false })
        m.on('click', () => cb.current.onBancalClick?.(b))
        m.addTo(ls.bancales)
      }
    }
    draw()
    map.on('zoomend', draw)
    return () => {
      map.off('zoomend', draw)
    }
  }, [props.bancales, props.selectedId])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.user.clearLayers()
    const u = props.user
    if (!u) return
    L.circle(u.p, { pane: 'user', radius: u.acc, color: '#2f7cf6', weight: 1, opacity: 0.5, fillOpacity: 0.12, interactive: false }).addTo(ls.user)
    const cone = props.heading !== null && props.heading !== undefined ? `<span class="me-cone" style="transform:rotate(${props.heading}deg)"></span>` : ''
    L.marker(u.p, { pane: 'user', interactive: false, keyboard: false, icon: L.divIcon({ className: 'pin-wrap', iconSize: [0, 0], html: `<div class="me">${cone}<span class="me-dot"></span></div>` }) }).addTo(ls.user)
  }, [props.user, props.heading])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.follow || !props.user) return
    map.panTo(props.user.p, { animate: true, duration: 0.4 })
  }, [props.follow, props.user])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.fit?.length) return
    if (props.fit.length === 1) map.setView(props.fit[0], Math.max(map.getZoom(), 17))
    else map.fitBounds(L.latLngBounds(props.fit), { padding: [40, 40], maxZoom: 18 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey])

  return <div ref={el} className={`map ${props.className ?? ''}`} />
}
