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
}

/**
 * Calcula el estado de navegación. `lastAlong` evita que, en rutas que vuelven sobre sí mismas,
 * el seguimiento salte hacia atrás.
 */
export function navigate(pos: LatLon, route: LatLon[], dest: LatLon, lastAlong = 0, accuracy = 10): NavState {
  const straight = distance(pos, dest)
  const arrived = straight <= Math.max(ARRIVE, Math.min(accuracy, 25))
  const total = pathLength(route)
  if (route.length < 2 || arrived) {
    return { target: dest, bearing: bearing(pos, dest), remaining: straight, straight, along: total, offRoute: false, arrived }
  }
  let hit = closestOnPath(pos, route, lastAlong - 30)
  const global = closestOnPath(pos, route)
  if (!hit || (global && hit.dist > OFF_ROUTE && global.dist < hit.dist)) hit = global
  if (!hit) return { target: dest, bearing: bearing(pos, dest), remaining: straight, straight, along: 0, offRoute: false, arrived }

  const offRoute = hit.dist > OFF_ROUTE
  const ahead = Math.max(LOOKAHEAD, Math.min(accuracy, 30))
  const target = offRoute ? hit.point : pointAlong(route, hit.along + ahead)
  const remaining = hit.dist + (total - hit.along)
  return { target, bearing: bearing(pos, target), remaining, straight, along: hit.along, offRoute, arrived }
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
