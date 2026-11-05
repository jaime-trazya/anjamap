/** Utilidades geográficas. Las coordenadas son siempre [lat, lon] en grados. */
export type LatLon = [number, number]

const R = 6371008.8 // radio medio de la Tierra (m)
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Distancia en metros (haversine) */
export function distance(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0])
  const dLon = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Rumbo inicial de a hacia b, en grados desde el norte (0-360) */
export function bearing(a: LatLon, b: LatLon): number {
  const φ1 = rad(a[0])
  const φ2 = rad(b[0])
  const Δλ = rad(b[1] - a[1])
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Normaliza un ángulo a (-180, 180] */
export function angleDiff(a: number): number {
  let d = ((a % 360) + 360) % 360
  if (d > 180) d -= 360
  return d
}

export function pathLength(pts: LatLon[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += distance(pts[i - 1], pts[i])
  return s
}

/** Proyección local en metros alrededor de una referencia (suficiente para unos km) */
export interface XY {
  x: number
  y: number
}
export function toXY(p: LatLon, ref: LatLon): XY {
  return { x: rad(p[1] - ref[1]) * R * Math.cos(rad(ref[0])), y: rad(p[0] - ref[0]) * R }
}
export function fromXY(q: XY, ref: LatLon): LatLon {
  return [ref[0] + deg(q.y / R), ref[1] + deg(q.x / (R * Math.cos(rad(ref[0]))))]
}

/** Punto más cercano a p en el segmento ab (en plano local) */
export function closestOnSegmentXY(p: XY, a: XY, b: XY): { t: number; q: XY; d: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const q = { x: a.x + t * dx, y: a.y + t * dy }
  return { t, q, d: Math.hypot(p.x - q.x, p.y - q.y) }
}

export interface PathHit {
  /** Índice del segmento (entre pts[i] y pts[i+1]) */
  i: number
  t: number
  point: LatLon
  /** Distancia del punto al recorrido (m) */
  dist: number
  /** Metros recorridos desde el inicio hasta el punto */
  along: number
}

/** Punto más cercano a p sobre un recorrido. `minAlong` ignora la parte ya recorrida. */
export function closestOnPath(p: LatLon, pts: LatLon[], minAlong = -Infinity): PathHit | null {
  if (!pts.length) return null
  if (pts.length === 1) return { i: 0, t: 0, point: pts[0], dist: distance(p, pts[0]), along: 0 }
  const P = toXY(p, p)
  let best: PathHit | null = null
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = distance(pts[i], pts[i + 1])
    if (acc + segLen >= minAlong) {
      const r = closestOnSegmentXY(P, toXY(pts[i], p), toXY(pts[i + 1], p))
      const along = acc + r.t * segLen
      if (along >= minAlong && (!best || r.d < best.dist)) best = { i, t: r.t, point: fromXY(r.q, p), dist: r.d, along }
    }
    acc += segLen
  }
  return best
}

/** Punto situado a `m` metros desde el inicio del recorrido */
export function pointAlong(pts: LatLon[], m: number): LatLon {
  if (!pts.length) throw new Error('recorrido vacío')
  if (m <= 0) return pts[0]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const d = distance(pts[i - 1], pts[i])
    if (acc + d >= m) {
      const t = d === 0 ? 0 : (m - acc) / d
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]
    }
    acc += d
  }
  return pts[pts.length - 1]
}

/** Simplificación Douglas-Peucker (tolerancia en metros) */
export function simplify(pts: LatLon[], tol = 2): LatLon[] {
  if (pts.length < 3) return pts.slice()
  const ref = pts[0]
  const xy = pts.map((p) => toXY(p, ref))
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let maxD = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = closestOnSegmentXY(xy[i], xy[a], xy[b]).d
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (idx >= 0 && maxD > tol) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

export function bboxOf(pts: LatLon[]): [LatLon, LatLon] | null {
  if (!pts.length) return null
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity
  for (const [la, lo] of pts) {
    s = Math.min(s, la)
    n = Math.max(n, la)
    w = Math.min(w, lo)
    e = Math.max(e, lo)
  }
  return [[s, w], [n, e]]
}

export function pointInRing(p: LatLon, ring: LatLon[]): boolean {
  const [y, x] = p
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** "8 m", "240 m", "1,2 km" */
export function formatDistance(m: number): string {
  if (!isFinite(m)) return '—'
  if (m < 10) return `${Math.max(0, Math.round(m))} m`
  if (m < 1000) return `${Math.round(m / 5) * 5} m`
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`
  return `${Math.round(m / 1000)} km`
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
export function cardinal(b: number): string {
  return DIRS[Math.round((((b % 360) + 360) % 360) / 45) % 8]
}

/** Coordenadas legibles: 39.09712, -0.69034 */
export function formatCoord(p: LatLon): string {
  return `${p[0].toFixed(5)}, ${p[1].toFixed(5)}`
}

/** Tiempo andando aproximado (4 km/h por el campo) */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / (4000 / 60)))
}
