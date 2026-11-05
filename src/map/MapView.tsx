import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Bancal, Camino, Ruta } from '../db/db'
import type { LatLon } from '../lib/geo'
import type { Fix } from '../ui/position'
import { COMARCAS } from '../domain/comarcas'
import { osmLines, type OsmNet } from '../domain/osm'
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

const CAR_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>'

const COMARCAS_BOUNDS = L.latLngBounds(COMARCAS.flatMap((c) => c.anillos.flat()))
/** La red de OSM se dibuja a partir de este zoom */
const RED_ZOOM = 14

export interface MapViewProps {
  className?: string
  capa: Capa
  bancales?: Bancal[]
  caminos?: Camino[]
  rutas?: Ruta[]
  /** Red de pistas y sendas de OpenStreetMap */
  red?: OsmNet | null
  /** Ruta destacada (la que se está siguiendo) */
  route?: LatLon[] | null
  /** Línea en edición (grabando o dibujando) */
  draft?: LatLon[] | null
  coche?: LatLon | null
  /** Destino que no es un bancal (punto del mapa) */
  punto?: LatLon | null
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
  onCocheClick?: () => void
  onLongPress?: (p: LatLon) => void
  onTap?: (p: LatLon) => void
  onMove?: (center: LatLon, zoom: number) => void
  onUserPan?: () => void
}

export function MapView(props: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layers = useRef<{
    tiles: L.Layer[]
    comarcas: L.LayerGroup
    red: L.LayerGroup
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
      red: L.layerGroup([], { pane: pane('red', 390) }),
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
    // El contenedor puede cambiar de tamaño (barra de pestañas, hojas)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el.current!)
    return () => {
      ro.disconnect()
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

  // Red de OSM: tres líneas múltiples en un lienzo, solo con zoom suficiente
  useEffect(() => {
    const ls = layers.current
    const map = mapRef.current
    if (!ls || !map) return
    ls.red.clearLayers()
    if (!props.red) {
      map.removeLayer(ls.red)
      return
    }
    const lines = osmLines(props.red)
    const renderer = L.canvas({ pane: 'red', padding: 0.3 })
    const base = { pane: 'red', renderer, interactive: false, lineCap: 'round' as const, lineJoin: 'round' as const, smoothFactor: 1.5 }
    L.polyline(lines[2], { ...base, color: '#ffffff', weight: 2.5, opacity: 0.55 }).addTo(ls.red)
    L.polyline(lines[1], { ...base, color: '#ffffff', weight: 2, opacity: 0.45 }).addTo(ls.red)
    L.polyline(lines[0], { ...base, color: '#fff0b8', weight: 2, opacity: 0.75, dashArray: '5 5' }).addTo(ls.red)
    const sync = () => {
      if (map.getZoom() >= RED_ZOOM) ls.red.addTo(map)
      else map.removeLayer(ls.red)
    }
    sync()
    map.on('zoomend', sync)
    return () => {
      map.off('zoomend', sync)
    }
  }, [props.red])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.caminos.clearLayers()
    for (const c of props.caminos ?? []) {
      const dash = c.tipo === 'senda' ? '7 7' : c.tipo === 'atajo' ? '2 7' : undefined
      L.polyline(c.puntos, { pane: 'caminos', color: '#1c1f15', weight: 7, opacity: 0.4, interactive: false }).addTo(ls.caminos)
      L.polyline(c.puntos, { pane: 'caminos', color: '#ffe680', weight: 3.5, opacity: 1, dashArray: dash, lineCap: 'round', interactive: false }).addTo(ls.caminos)
    }
  }, [props.caminos])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.rutas.clearLayers()
    for (const r of props.rutas ?? []) {
      L.polyline(r.puntos, { pane: 'rutas', color: '#c5e07e', weight: 3.5, opacity: 0.95, dashArray: '1 7', lineCap: 'round', interactive: false }).addTo(ls.rutas)
    }
  }, [props.rutas])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.route.clearLayers()
    if (props.route && props.route.length > 1) {
      L.polyline(props.route, { pane: 'route', color: '#ffffff', weight: 10, opacity: 0.95, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(ls.route)
      L.polyline(props.route, { pane: 'route', color: '#e0531b', weight: 5.5, opacity: 1, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(ls.route)
    }
  }, [props.route])

  useEffect(() => {
    const ls = layers.current
    if (!ls) return
    ls.draft.clearLayers()
    const d = props.draft
    if (d && d.length) {
      if (d.length > 1) {
        L.polyline(d, { pane: 'draft', color: '#1c1f15', weight: 8, opacity: 0.45, interactive: false }).addTo(ls.draft)
        L.polyline(d, { pane: 'draft', color: '#ff9a3c', weight: 4, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(ls.draft)
      }
      for (const p of [d[0], d[d.length - 1]]) L.circleMarker(p, { pane: 'draft', radius: 5, color: '#1c1f15', weight: 2, fillColor: '#ff9a3c', fillOpacity: 1, interactive: false }).addTo(ls.draft)
    }
  }, [props.draft])

  const cocheKey = props.coche ? props.coche.join(',') : ''
  const puntoKey = props.punto ? props.punto.join(',') : ''
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
      if (props.coche) {
        const m = L.marker(props.coche, { pane: 'bancales', keyboard: false, icon: L.divIcon({ className: 'pin-wrap', iconSize: [0, 0], html: `<div class="car-pin">${CAR_SVG}</div>` }) })
        m.on('click', () => cb.current.onCocheClick?.())
        m.addTo(ls.bancales)
      }
      if (props.punto) {
        L.marker(props.punto, { pane: 'bancales', interactive: false, icon: bancalIcon({ id: 'punto', nombre: 'Destino', color: '#e0531b' } as Bancal, true, true) }).addTo(ls.bancales)
      }
    }
    draw()
    map.on('zoomend', draw)
    return () => {
      map.off('zoomend', draw)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bancales, props.selectedId, cocheKey, puntoKey])

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
