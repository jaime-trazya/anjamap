import type { Bancal, Settings } from '../db/db'
import type { LatLon } from '../lib/geo'

/** A dónde se navega: un bancal, el coche o un punto cualquiera del mapa */
export interface Destino {
  tipo: 'bancal' | 'coche' | 'punto'
  nombre: string
  p: LatLon
  color: string
  bancal?: Bancal
}

export function resolverDestino(id: string, params: URLSearchParams, bancales: Bancal[], coche: Settings['coche']): Destino | null {
  if (id === 'coche') return coche ? { tipo: 'coche', nombre: 'El coche', p: [coche.lat, coche.lon], color: '#1c1f15' } : null
  if (id === 'punto') {
    const lat = Number(params.get('lat'))
    const lon = Number(params.get('lon'))
    if (!isFinite(lat) || !isFinite(lon) || !params.get('lat') || !params.get('lon')) return null
    return { tipo: 'punto', nombre: params.get('n') || 'Punto del mapa', p: [lat, lon], color: '#e0531b' }
  }
  const b = bancales.find((x) => x.id === id)
  return b ? { tipo: 'bancal', nombre: b.nombre, p: [b.lat, b.lon], color: b.color, bancal: b } : null
}

/** Ruta de navegación hasta un punto del mapa */
export function irAPunto(p: LatLon, nombre?: string): string {
  return `/ir/punto?lat=${p[0].toFixed(6)}&lon=${p[1].toFixed(6)}${nombre ? `&n=${encodeURIComponent(nombre)}` : ''}`
}

/** Misma navegación con otra forma de ir (recomendada, directa o una ruta guardada) */
export function conModo(id: string, params: URLSearchParams, modo: string): string {
  const q = new URLSearchParams(params)
  if (modo === 'recomendada') q.delete('ruta')
  else q.set('ruta', modo)
  const s = q.toString()
  return `/ir/${id}${s ? `?${s}` : ''}`
}

/** Enlace para pasar un bancal a otro móvil (al abrirlo, Anjamap ofrece guardarlo) */
export function enlaceBancal(b: Pick<Bancal, 'nombre' | 'lat' | 'lon' | 'finca' | 'color'>): string {
  const q = new URLSearchParams({ n: b.nombre, lat: b.lat.toFixed(6), lon: b.lon.toFixed(6) })
  if (b.finca) q.set('f', b.finca)
  q.set('c', b.color)
  return `${location.origin}${location.pathname}#/compartido?${q}`
}
