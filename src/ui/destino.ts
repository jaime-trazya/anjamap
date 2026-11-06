import type { Bancal, Settings, Transporte } from '../db/db'
import { isLatLon, type LatLon } from '../lib/geo'

/** A dónde se navega: un bancal, el coche o un punto cualquiera del mapa */
export interface Destino {
  tipo: 'bancal' | 'coche' | 'punto'
  nombre: string
  p: LatLon
  color: string
  bancal?: Bancal
  /** A qué parte del sitio se va: su aparcamiento (en coche), su entrada (a pie) o el punto guardado */
  etapa?: 'aparcamiento' | 'acceso' | 'sitio'
}

/** Punto al que navegar dentro de un sitio según el transporte */
export function puntoDeLlegada(b: Bancal, transporte?: Transporte): { p: LatLon; etapa: 'aparcamiento' | 'acceso' | 'sitio' } {
  if (transporte && transporte !== 'pie' && b.aparcamiento) return { p: [b.aparcamiento.lat, b.aparcamiento.lon], etapa: 'aparcamiento' }
  if (b.acceso) return { p: [b.acceso.lat, b.acceso.lon], etapa: 'acceso' }
  return { p: [b.lat, b.lon], etapa: 'sitio' }
}

export function resolverDestino(id: string, params: URLSearchParams, bancales: Bancal[], coche: Settings['coche'], transporte?: Transporte): Destino | null {
  if (id === 'coche') return coche ? { tipo: 'coche', nombre: 'El coche', p: [coche.lat, coche.lon], color: '#1c1f15' } : null
  if (id === 'punto') {
    const lat = Number(params.get('lat'))
    const lon = Number(params.get('lon'))
    if (!isLatLon([lat, lon]) || !params.get('lat')?.trim() || !params.get('lon')?.trim()) return null
    return { tipo: 'punto', nombre: params.get('n') || 'Punto del mapa', p: [lat, lon], color: '#e0531b' }
  }
  const b = bancales.find((x) => x.id === id)
  if (!b) return null
  const llegada = puntoDeLlegada(b, transporte)
  return { tipo: 'bancal', nombre: b.nombre, p: llegada.p, color: b.color, bancal: b, etapa: llegada.etapa }
}

/**
 * Lugar de una ruta planificada, codificado en la dirección:
 * `yo` (tu posición), `coche`, `b:<id>` (un sitio) o `p:lat,lon` (un punto del mapa).
 */
export function codigoLugar(l: { tipo: 'yo' } | { tipo: 'coche' } | { tipo: 'bancal'; id: string } | { tipo: 'punto'; p: LatLon }): string {
  if (l.tipo === 'bancal') return `b:${l.id}`
  if (l.tipo === 'punto') return `p:${l.p[0].toFixed(6)},${l.p[1].toFixed(6)}`
  return l.tipo
}

export interface Lugar {
  codigo: string
  nombre: string
  /** null = tu posición aún sin GPS */
  p: LatLon | null
  bancal?: Bancal
}

export function resolverLugar(codigo: string | null, bancales: Bancal[], coche: Settings['coche'], miPos: LatLon | null, transporte?: Transporte): Lugar | null {
  if (!codigo) return null
  if (codigo === 'yo') return { codigo, nombre: 'Tu ubicación', p: miPos }
  if (codigo === 'coche') return coche ? { codigo, nombre: 'El coche', p: [coche.lat, coche.lon] } : null
  if (codigo.startsWith('b:')) {
    const b = bancales.find((x) => x.id === codigo.slice(2))
    return b ? { codigo, nombre: b.nombre, p: puntoDeLlegada(b, transporte).p, bancal: b } : null
  }
  if (codigo.startsWith('p:')) {
    const p = leerCoordenadas(codigo.slice(2))
    return p ? { codigo, nombre: `Punto ${p[0].toFixed(4)}, ${p[1].toFixed(4)}`, p } : null
  }
  return null
}

/**
 * Coordenadas escritas o pegadas: «39.1234, -0.6789», «39,1234 -0,6789», enlaces de Google Maps (@lat,lon o q=lat,lon)
 * y grados, minutos y segundos (39°05'12.3"N 0°41'10.1"W).
 */
export function leerCoordenadas(texto: string): LatLon | null {
  const s = texto.trim()
  if (!s) return null
  const dms = [...s.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″]|'')?\s*([NSEWO])/gi)]
  if (dms.length === 2) {
    // Minutos y segundos tienen que ser menores de 60: «39°99′» es un error, no 40,65°
    const val = (m: RegExpMatchArray) => {
      const min = Number(m[2]), seg = Number(m[3].replace(',', '.'))
      if (min >= 60 || seg >= 60) return NaN
      const v = Number(m[1]) + min / 60 + seg / 3600
      return /[SWO]/i.test(m[4]) ? -v : v
    }
    const [a, b] = dms
    // Una latitud (N/S) y una longitud (E/W/O)
    if (/[NS]/i.test(a[4]) === /[NS]/i.test(b[4])) return null
    const p: LatLon = /[NS]/i.test(a[4]) ? [val(a), val(b)] : [val(b), val(a)]
    return isLatLon(p) ? p : null
  }
  const link = s.match(/[@=](-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
  const plain = link ?? s.match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/)
  if (!plain) return null
  const p: LatLon = [Number(plain[1].replace(',', '.')), Number(plain[2].replace(',', '.'))]
  return isLatLon(p) && (Math.abs(p[0]) > 0.0001 || Math.abs(p[1]) > 0.0001) ? p : null
}

/** Si se ha borrado la ruta elegida, la navegación sigue funcionando con la recomendada. */
export function resolverModo(modo: string | null, rutas: { id: string; bancalId: string }[], bancalId: string): string {
  if (modo === 'directa' || modo === 'recomendada') return modo
  return rutas.some((r) => r.id === modo && r.bancalId === bancalId) ? modo! : 'recomendada'
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

/**
 * Dirección para navegar a un lugar de ruta planificada, con las paradas que quedan detrás
 * (`siguientes`, en orden). null si el lugar no es navegable (tu propia ubicación).
 */
export function rutaNavegacion(codigo: string, siguientes: string[] = []): string | null {
  const resto = siguientes.length ? `siguientes=${encodeURIComponent(siguientes.join('|'))}` : ''
  if (codigo.startsWith('b:')) return `/ir/${codigo.slice(2)}${resto ? `?${resto}` : ''}`
  if (codigo === 'coche') return `/ir/coche${resto ? `?${resto}` : ''}`
  if (codigo.startsWith('p:')) {
    const p = leerCoordenadas(codigo.slice(2))
    return p ? `${irAPunto(p)}${resto ? `&${resto}` : ''}` : null
  }
  return null
}

/** Paradas pendientes guardadas en la dirección de navegación */
export function leerSiguientes(params: URLSearchParams): string[] {
  return (params.get('siguientes') ?? '').split('|').filter((c) => c === 'coche' || /^b:[\w-]+$/.test(c) || /^p:-?\d/.test(c)).slice(0, 20)
}
