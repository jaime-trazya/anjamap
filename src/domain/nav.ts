/**
 * Seguimiento de una ruta mientras se anda: hacia dónde apuntar la flecha y cuánto falta.
 */
import { bearing, closestOnPath, distance, pathLength, pointAlong, type LatLon } from '../lib/geo'

/** Si te separas más de esto de la ruta, la flecha te devuelve a ella */
export const OFF_ROUTE = 35
/** Metros por delante sobre la ruta a los que apunta la flecha */
export const LOOKAHEAD = 18
/** Radio de llegada al bancal */
export const ARRIVE = 12

export interface NavState {
  /** Punto al que apunta la flecha */
  target: LatLon
  /** Rumbo desde la posición actual hasta target */
  bearing: number
  /** Metros que faltan hasta el bancal siguiendo la ruta */
  remaining: number
  /** Metros en línea recta hasta el bancal */
  straight: number
  /** Metros ya recorridos sobre la ruta */
  along: number
  offRoute: boolean
  arrived: boolean
  /** Tu posición pegada a la ruta (la del GPS si estás fuera) */
  snapped: LatLon
  /** Metros entre tu posición y la ruta */
  routeDist: number
}

/**
 * Calcula el estado de navegación. `lastAlong` evita que, en rutas que vuelven sobre sí mismas,
 * el seguimiento salte hacia atrás. `offRouteAt` es la distancia a partir de la cual cuenta como desvío
 * y `ahead`, los metros por delante a los que apunta la flecha (más cuanto más rápido vas).
 */
export function navigate(pos: LatLon, route: LatLon[], dest: LatLon, lastAlong = 0, accuracy = 10, offRouteAt = OFF_ROUTE, ahead = LOOKAHEAD): NavState {
  const straight = distance(pos, dest)
  const arrived = straight <= Math.max(ARRIVE, Math.min(accuracy, 25))
  const total = pathLength(route)
  if (route.length < 2 || arrived) {
    return { target: dest, bearing: bearing(pos, dest), remaining: straight, straight, along: total, offRoute: false, arrived, snapped: pos, routeDist: 0 }
  }
  let hit = closestOnPath(pos, route, lastAlong - 30)
  const global = closestOnPath(pos, route)
  if (!hit || (global && hit.dist > offRouteAt && global.dist < hit.dist)) hit = global
  if (!hit) return { target: dest, bearing: bearing(pos, dest), remaining: straight, straight, along: 0, offRoute: false, arrived, snapped: pos, routeDist: straight }

  const offRoute = hit.dist > offRouteAt
  const look = Math.max(ahead, Math.min(accuracy, 30))
  const target = offRoute ? hit.point : pointAlong(route, hit.along + look)
  const remaining = hit.dist + (total - hit.along)
  // Pegar el punto a la ruta solo si la separación cabe en el error del GPS
  const snapped = !offRoute && hit.dist <= Math.max(12, accuracy * 1.2) ? hit.point : pos
  return { target, bearing: bearing(pos, target), remaining, straight, along: hit.along, offRoute, arrived, snapped, routeDist: hit.dist }
}

/**
 * Seguimiento continuo: recuerda lo avanzado (solo crece) y solo da por desviado tras varias lecturas
 * seguidas fuera de la ruta, así un rebote del GPS no dispara avisos ni recálculos.
 */
export class RouteTracker {
  private key = ''
  private route: LatLon[] | null = null
  private along = 0
  private offCount = 0
  update(key: string, route: LatLon[], pos: LatLon, dest: LatLon, acc: number, offRouteBase: number, speed = 0, confirm = 3): NavState {
    if (key !== this.key) {
      this.key = key
      this.along = 0
      this.offCount = 0
    }
    if (route !== this.route) {
      // Ruta recalculada: empieza en tu posición
      if (this.route) this.along = 0
      this.route = route
    }
    const threshold = Math.max(offRouteBase, acc * 1.5)
    const s = navigate(pos, route, dest, this.along, acc, threshold, Math.max(LOOKAHEAD, speed * 4))
    this.offCount = s.offRoute ? this.offCount + 1 : 0
    if (!s.offRoute) this.along = Math.max(this.along, s.along)
    return s.offRoute && this.offCount < confirm ? { ...s, offRoute: false } : s
  }
}

/** Añade el bancal al final de una ruta guardada si no termina justo en él */
export function routeToDest(points: LatLon[], dest: LatLon): LatLon[] {
  if (!points.length) return [dest]
  return distance(points[points.length - 1], dest) > 5 ? [...points, dest] : points
}

/** Siguiente indicación por delante de donde vas (`along` = metros recorridos sobre la ruta) */
export function nextStep<T extends { along: number }>(steps: T[], along: number): { paso: T; dist: number } | null {
  for (const p of steps) if (p.along > along + 3) return { paso: p, dist: p.along - along }
  return null
}
