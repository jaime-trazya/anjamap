/**
 * Filtro de posición para navegar con más exactitud.
 *
 * - Suaviza cada lectura según su precisión (un filtro de Kalman sencillo: cuanto peor es la lectura, menos mueve
 *   la posición), así la flecha y el punto azul no bailan cuando estás parado.
 * - Descarta saltos imposibles para el transporte elegido (rebotes del GPS entre edificios o barrancos). Si se
 *   repiten tres veces seguidas, se aceptan: el que estaba mal era el filtro.
 * - Calcula una velocidad y un rumbo fiables a partir del movimiento real, no de una sola lectura.
 */
import { bearing, distance, type LatLon } from '../lib/geo'
import type { Transporte } from '../db/db'

/** Velocidad máxima creíble (m/s) para cada transporte, con margen */
export const MAX_SPEED: Record<Transporte, number> = { pie: 4, bici: 15, patinete: 12, coche: 45 }
/** A partir de cuántos metros fuera de la ruta se considera desvío */
export const OFF_ROUTE_BASE: Record<Transporte, number> = { pie: 25, bici: 30, patinete: 30, coche: 40 }

export interface RawFix {
  p: LatLon
  acc: number
  t: number
  speed: number | null
  heading: number | null
}

export interface TrackFix {
  p: LatLon
  /** Precisión estimada tras el filtro (m) */
  acc: number
  t: number
  /** m/s */
  speed: number
  /** Rumbo de marcha (grados) o null si estás casi parado */
  heading: number | null
  /** La última lectura se ha descartado por ser un salto imposible */
  rejected: boolean
}

export class PositionFilter {
  private state: TrackFix | null = null
  private rejects = 0
  private lastRawT = -1
  constructor(private maxSpeed: number) {}

  setMaxSpeed(v: number) {
    this.maxSpeed = v
  }

  push(f: RawFix): TrackFix {
    const s = this.state
    if (f.t === this.lastRawT && s) return s
    this.lastRawT = f.t
    if (!s || f.t - s.t > 60000) return (this.state = { p: f.p, acc: f.acc, t: f.t, speed: f.speed ?? 0, heading: f.heading, rejected: false })

    const dt = Math.max(0.2, (f.t - s.t) / 1000)
    const jump = distance(s.p, f.p)
    // Salto imposible: más lejos de lo que permite la velocidad máxima más el error de ambas lecturas
    if (jump > this.maxSpeed * dt + s.acc + f.acc + 8 && this.rejects < 2) {
      this.rejects++
      return (this.state = { ...s, rejected: true })
    }
    this.rejects = 0
    // Las lecturas muy malas cuando ya hay una buena apenas mueven la posición
    const q = this.maxSpeed * 0.6 * dt
    const P = s.acc * s.acc + q * q
    const R = f.acc * f.acc
    const k = P / (P + R)
    const p: LatLon = [s.p[0] + k * (f.p[0] - s.p[0]), s.p[1] + k * (f.p[1] - s.p[1])]
    const acc = Math.sqrt((1 - k) * P)

    const moved = distance(s.p, p)
    const measured = f.speed !== null && f.speed >= 0 && isFinite(f.speed) ? f.speed : moved / dt
    const speed = s.speed * 0.4 + Math.min(measured, this.maxSpeed) * 0.6
    let heading = s.heading
    if (f.heading !== null && f.speed !== null && f.speed > 1) heading = f.heading
    else if (moved > Math.max(2, acc * 0.5)) heading = bearing(s.p, p)
    if (speed < 0.4) heading = s.heading
    return (this.state = { p, acc, t: f.t, speed, heading, rejected: false })
  }
}

/**
 * Apunta el recorrido que vas haciendo: solo lecturas buenas, posteriores a `desde`, y separadas
 * al menos unos metros (más cuanto peor es la precisión) para no llenar la línea de ruido.
 * `push` devuelve la misma lista si no ha añadido nada.
 */
export class TrailRecorder {
  points: LatLon[] = []
  private lastT = -1
  constructor(private desde: number, private maxAcc = 25) {}

  push(f: Pick<TrackFix, 'p' | 'acc' | 't' | 'rejected'>): LatLon[] {
    if (f.t === this.lastT || f.rejected || f.acc > this.maxAcc || f.t < this.desde - 1000) return this.points
    this.lastT = f.t
    const last = this.points[this.points.length - 1]
    if (last && distance(last, f.p) < Math.max(4, f.acc / 3)) return this.points
    this.points = [...this.points, f.p]
    return this.points
  }
}

/** Parte una grabación en tramos por los cortes (índices donde empieza un tramo nuevo); descarta los de un solo punto */
export function tramos(puntos: LatLon[], cortes: number[] = []): LatLon[][] {
  const out: LatLon[][] = []
  let start = 0
  for (const c of [...cortes].sort((a, b) => a - b)) {
    out.push(puntos.slice(start, c))
    start = c
  }
  out.push(puntos.slice(start))
  return out.filter((t) => t.length >= 2)
}
