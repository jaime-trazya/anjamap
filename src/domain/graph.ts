/**
 * Red de caminos y cálculo de la ruta recomendada.
 *
 * La red junta dos fuentes:
 * - las pistas, sendas y calles de OpenStreetMap (ya vienen unidas en los cruces);
 * - los caminos propios (grabados, dibujados o de GPX), que son líneas sueltas: si cruzan otro camino se crea
 *   un nodo en el cruce, y si un extremo queda a menos de SNAP metros de otro camino, se engancha.
 *
 * La ruta recomendada es la de menor "coste" (A*): los metros por camino cuentan 1 (algo más por carretera) y los
 * metros campo a través, desde donde estás hasta el camino y del camino al bancal, cuentan OFFROAD veces, porque
 * cruzar bancales con márgenes y piedra es más lento. Además se sacan las indicaciones de giro en los cruces.
 */
import { angleDiff, distance, fromXY, toXY, type LatLon, type XY } from '../lib/geo'
import type { OsmNet } from './osm'

export const SNAP = 12
export const OFFROAD = 2.5
/** Coste por metro de OSM según el tipo: pista o senda, calle, carretera */
const W_OSM = [1, 1.05, 1.3]
/** Lado de la celda del índice espacial (m) */
const CELL = 60
/** Hasta dónde se busca un camino desde tu posición o desde el bancal (m) */
const MAX_REACH = 1500

export interface Graph {
  ref: LatLon
  x: Float64Array
  y: Float64Array
  /** Tramos: extremos, longitud real y peso */
  ea: Int32Array
  eb: Int32Array
  el: Float64Array
  ew: Float64Array
  /** Lista de adyacencia compacta: vecinos del nodo n en adj[off[n]..off[n+1]) con su tramo en adjE */
  off: Int32Array
  adj: Int32Array
  adjE: Int32Array
  /** Número de tramos que salen de cada nodo */
  deg: Uint16Array
  grid: Map<number, number[]>
}

interface Seg {
  a: number
  b: number
  w: number
  /** Línea propia a la que pertenece (-1 si es de OSM) */
  line: number
  /** Metros desde el inicio de su línea */
  along: number
  len: number
  splits: { t: number; n: number }[] | null
}

interface Hit {
  j: number
  t: number
  q: XY
  d: number
}

const cellKey = (cx: number, cy: number) => cx * 2097152 + cy

function segIntersect(p: XY, p2: XY, q: XY, q2: XY): { t: number; u: number } | null {
  const rx = p2.x - p.x, ry = p2.y - p.y
  const sx = q2.x - q.x, sy = q2.y - q.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-9) return null
  const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den
  const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null
  return { t, u }
}

function closestT(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const L = dx * dx + dy * dy
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L))
  const qx = ax + t * dx, qy = ay + t * dy
  return { t, q: { x: qx, y: qy }, d: Math.hypot(px - qx, py - qy) }
}

/** Celdas que toca el rectángulo de un segmento */
function forCells(ax: number, ay: number, bx: number, by: number, pad: number, fn: (k: number) => void) {
  const x0 = Math.floor((Math.min(ax, bx) - pad) / CELL), x1 = Math.floor((Math.max(ax, bx) + pad) / CELL)
  const y0 = Math.floor((Math.min(ay, by) - pad) / CELL), y1 = Math.floor((Math.max(ay, by) + pad) / CELL)
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) fn(cellKey(cx, cy))
}

/**
 * Construye la red. `lines` son los caminos propios; `base`, la red de OpenStreetMap (opcional).
 */
export function buildGraph(lines: LatLon[][], base: OsmNet | null = null, snap = SNAP): Graph | null {
  const valid = lines.filter((l) => l.length >= 2)
  if (!valid.length && !base?.edges.length) return null
  const ref: LatLon = valid[0]?.[0] ?? base!.nodes[0]
  const xs: number[] = []
  const ys: number[] = []
  const nodeXY = (x: number, y: number) => {
    xs.push(x)
    ys.push(y)
    return xs.length - 1
  }
  const node = (p: LatLon) => {
    const q = toXY(p, ref)
    return nodeXY(q.x, q.y)
  }
  const segs: Seg[] = []
  const addSeg = (a: number, b: number, w: number, line: number, along: number) => {
    const len = Math.hypot(xs[b] - xs[a], ys[b] - ys[a])
    segs.push({ a, b, w, line, along, len, splits: null })
    return len
  }
  const split = (s: Seg, t: number, n: number) => (s.splits ??= []).push({ t, n })

  // 1) Red de OSM: ya está unida en los cruces
  const osmIds: number[] = []
  const osmDeg = new Map<number, number>()
  if (base) {
    for (const p of base.nodes) osmIds.push(node(p))
    for (const e of base.edges) {
      osmDeg.set(e.a, (osmDeg.get(e.a) ?? 0) + 1)
      osmDeg.set(e.b, (osmDeg.get(e.b) ?? 0) + 1)
      let prev = osmIds[e.a]
      for (const p of e.mid) {
        const n = node(p)
        addSeg(prev, n, W_OSM[e.tipo], -1, 0)
        prev = n
      }
      addSeg(prev, osmIds[e.b], W_OSM[e.tipo], -1, 0)
    }
  }
  const nBase = segs.length
  const grid = new Map<number, number[]>()
  const addToGrid = (i: number) => {
    const s = segs[i]
    forCells(xs[s.a], ys[s.a], xs[s.b], ys[s.b], 0, (k) => {
      const c = grid.get(k)
      if (c) c.push(i)
      else grid.set(k, [i])
    })
  }
  for (let i = 0; i < nBase; i++) addToGrid(i)

  // 2) Caminos propios
  const ends: { line: number; n: number; along: number }[] = []
  valid.forEach((line, li) => {
    const ids = line.map(node)
    let acc = 0
    for (let i = 0; i < ids.length - 1; i++) acc += addSeg(ids[i], ids[i + 1], 1, li, acc)
    ends.push({ line: li, n: ids[0], along: 0 }, { line: li, n: ids[ids.length - 1], along: acc })
  })

  // 3) Cruces de los caminos propios con todo lo demás
  for (let i = nBase; i < segs.length; i++) {
    const A = segs[i]
    const cand = new Set<number>()
    forCells(xs[A.a], ys[A.a], xs[A.b], ys[A.b], 0, (k) => grid.get(k)?.forEach((j) => cand.add(j)))
    for (const j of cand) {
      const B = segs[j]
      if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue
      const hit = segIntersect({ x: xs[A.a], y: ys[A.a] }, { x: xs[A.b], y: ys[A.b] }, { x: xs[B.a], y: ys[B.a] }, { x: xs[B.b], y: ys[B.b] })
      if (!hit) continue
      const n = nodeXY(xs[A.a] + (xs[A.b] - xs[A.a]) * hit.t, ys[A.a] + (ys[A.b] - ys[A.a]) * hit.t)
      split(A, hit.t, n)
      split(B, hit.u, n)
    }
    addToGrid(i)
  }

  // 4) Extremos sueltos que quedan cerca de otro camino
  const extra: [number, number][] = []
  const nearestSeg = (n: number, ok: (s: Seg, j: number) => boolean): Hit | null => {
    let best: Hit | null = null
    const seen = new Set<number>()
    forCells(xs[n], ys[n], xs[n], ys[n], snap, (k) => {
      for (const j of grid.get(k) ?? []) {
        if (seen.has(j)) continue
        seen.add(j)
        const s = segs[j]
        if (s.a === n || s.b === n || !ok(s, j)) continue
        const r = closestT(xs[n], ys[n], xs[s.a], ys[s.a], xs[s.b], ys[s.b])
        if (r.d <= snap && (!best || r.d < best.d)) best = { j, ...r }
      }
    })
    return best
  }
  const attach = (n: number, hit: Hit | null) => {
    if (!hit) return
    const s = segs[hit.j]
    // Si cae casi en un vértice que ya existe, se engancha a ese vértice
    const pts = [{ t: 0, n: s.a }, { t: 1, n: s.b }, ...(s.splits ?? [])]
    const near = pts.find((x) => Math.abs(x.t - hit.t) * s.len < 1)
    let target: number
    if (near) target = near.n
    else {
      target = nodeXY(hit.q.x, hit.q.y)
      split(s, hit.t, target)
    }
    if (target !== n) extra.push([n, target])
  }
  for (const e of ends) {
    attach(
      e.n,
      nearestSeg(e.n, (s) => {
        // En la misma línea solo se engancha a tramos lejanos (recorridos que vuelven al inicio)
        if (s.line !== e.line) return true
        return Math.abs(s.along - e.along) >= snap * 3 && Math.abs(s.along + s.len - e.along) >= snap * 3
      }),
    )
  }
  if (base && valid.length) {
    for (const [k, d] of osmDeg) if (d === 1) attach(osmIds[k], nearestSeg(osmIds[k], (_s, j) => j >= nBase))
  }

  // 5) Tramos definitivos
  const ea: number[] = [], eb: number[] = [], el: number[] = [], ew: number[] = []
  const push = (a: number, b: number, w: number) => {
    if (a === b) return
    ea.push(a)
    eb.push(b)
    el.push(Math.hypot(xs[a] - xs[b], ys[a] - ys[b]))
    ew.push(w)
  }
  for (const s of segs) {
    if (!s.splits) {
      push(s.a, s.b, s.w)
      continue
    }
    const sp = [{ t: 0, n: s.a }, ...s.splits.sort((p, q) => p.t - q.t), { t: 1, n: s.b }]
    for (let i = 0; i < sp.length - 1; i++) push(sp[i].n, sp[i + 1].n, s.w)
  }
  for (const [a, b] of extra) push(a, b, 1)

  const N = xs.length
  const E = ea.length
  const deg = new Uint16Array(N)
  for (let i = 0; i < E; i++) {
    deg[ea[i]]++
    deg[eb[i]]++
  }
  const off = new Int32Array(N + 1)
  for (let n = 0; n < N; n++) off[n + 1] = off[n] + deg[n]
  const fill = off.slice(0, N)
  const adj = new Int32Array(2 * E)
  const adjE = new Int32Array(2 * E)
  for (let i = 0; i < E; i++) {
    adj[fill[ea[i]]] = eb[i]
    adjE[fill[ea[i]]++] = i
    adj[fill[eb[i]]] = ea[i]
    adjE[fill[eb[i]]++] = i
  }
  const x = Float64Array.from(xs)
  const y = Float64Array.from(ys)
  const g: Graph = { ref, x, y, ea: Int32Array.from(ea), eb: Int32Array.from(eb), el: Float64Array.from(el), ew: Float64Array.from(ew), off, adj, adjE, deg, grid: new Map() }
  for (let i = 0; i < E; i++) {
    forCells(x[ea[i]], y[ea[i]], x[eb[i]], y[eb[i]], 0, (k) => {
      const c = g.grid.get(k)
      if (c) c.push(i)
      else g.grid.set(k, [i])
    })
  }
  return g
}

interface Cand {
  e: number
  t: number
  q: XY
  d: number
}

/** Tramos más cercanos a un punto: el mejor y los que quedan a poca distancia más (máx. 6) */
export function nearEdges(g: Graph, p: XY, maxR = MAX_REACH, margin = 25): Cand[] {
  const cx = Math.floor(p.x / CELL)
  const cy = Math.floor(p.y / CELL)
  const seen = new Set<number>()
  const found: Cand[] = []
  let best = Infinity
  const rings = Math.ceil(maxR / CELL)
  for (let r = 0; r <= rings; r++) {
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue
        const c = g.grid.get(cellKey(cx + i, cy + j))
        if (!c) continue
        for (const e of c) {
          if (seen.has(e)) continue
          seen.add(e)
          const a = g.ea[e], b = g.eb[e]
          const h = closestT(p.x, p.y, g.x[a], g.y[a], g.x[b], g.y[b])
          if (h.d > maxR) continue
          found.push({ e, ...h })
          if (h.d < best) best = h.d
        }
      }
    // Todo lo que falte por mirar está al menos a r celdas
    if (best + margin <= r * CELL) break
  }
  return found
    .filter((c) => c.d <= best + margin)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6)
}

class Heap {
  private k: number[] = []
  private v: number[] = []
  get size() {
    return this.k.length
  }
  push(key: number, val: number) {
    const { k, v } = this
    k.push(key)
    v.push(val)
    let i = k.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= k[i]) break
      ;[k[p], k[i]] = [k[i], k[p]]
      ;[v[p], v[i]] = [v[i], v[p]]
      i = p
    }
  }
  pop(): [number, number] {
    const { k, v } = this
    const top: [number, number] = [k[0], v[0]]
    const lk = k.pop()!
    const lv = v.pop()!
    if (k.length) {
      k[0] = lk
      v[0] = lv
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < k.length && k[l] < k[m]) m = l
        if (r < k.length && k[r] < k[m]) m = r
        if (m === i) break
        ;[k[m], k[i]] = [k[i], k[m]]
        ;[v[m], v[i]] = [v[i], v[m]]
        i = m
      }
    }
    return top
  }
}

export type Giro = 'izquierda' | 'derecha' | 'izquierda-cerrada' | 'derecha-cerrada' | 'coger' | 'dejar'

export interface Paso {
  /** Metros desde el inicio de la ruta */
  along: number
  giro: Giro
  /** Dónde está el cruce */
  p: LatLon
}

export interface RouteResult {
  kind: 'caminos' | 'directa'
  points: LatLon[]
  /** Metros totales */
  length: number
  /** Metros por camino */
  onPath: number
  /** Metros campo a través */
  offPath: number
  cost: number
  /** Indicaciones en los cruces */
  steps: Paso[]
}

export function directRoute(from: LatLon, to: LatLon, offroad = OFFROAD): RouteResult {
  const d = distance(from, to)
  return { kind: 'directa', points: [from, to], length: d, onPath: 0, offPath: d, cost: d * offroad, steps: [] }
}

/** Ruta por la red de caminos. Devuelve null si no hay caminos a mano. */
export function pathRoute(g: Graph | null, from: LatLon, to: LatLon, offroad = OFFROAD): RouteResult | null {
  if (!g || !g.ea.length) return null
  const P = toXY(from, g.ref)
  const T = toXY(to, g.ref)
  const sc = nearEdges(g, P)
  const tc = nearEdges(g, T)
  if (!sc.length || !tc.length) return null

  const N = g.x.length
  const S = N
  const E = N + 1
  const cost = (e: number, frac: number) => g.el[e] * frac * g.ew[e]

  // De los tramos cercanos al bancal, a E (el bancal)
  const toE = new Map<number, { c: number; k: number }>()
  for (let k = 0; k < tc.length; k++) {
    const c = tc[k]
    for (const [n, frac] of [[g.ea[c.e], c.t], [g.eb[c.e], 1 - c.t]] as const) {
      const v = c.d * offroad + cost(c.e, frac)
      const prev = toE.get(n)
      if (!prev || v < prev.c) toE.set(n, { c: v, k })
    }
  }

  const gs = new Float64Array(N + 2).fill(Infinity)
  const prev = new Int32Array(N + 2).fill(-1)
  const sVia = new Map<number, number>()
  let eVia = -1
  let direct: { s: number; t: number } | null = null
  const h = (n: number) => (n === E ? 0 : n === S ? Math.hypot(P.x - T.x, P.y - T.y) : Math.hypot(g.x[n] - T.x, g.y[n] - T.y))
  const heap = new Heap()
  gs[S] = 0
  heap.push(h(S), S)
  const relax = (u: number, v: number, c: number) => {
    const nd = gs[u] + c
    if (nd < gs[v]) {
      gs[v] = nd
      prev[v] = u
      heap.push(nd + h(v), v)
      return true
    }
    return false
  }
  while (heap.size) {
    const [f, u] = heap.pop()
    if (u === E) break
    if (f - h(u) > gs[u] + 1e-6) continue
    if (u === S) {
      // De tu posición a los extremos de los tramos cercanos
      for (let k = 0; k < sc.length; k++) {
        const c = sc[k]
        if (relax(S, g.ea[c.e], c.d * offroad + cost(c.e, c.t))) sVia.set(g.ea[c.e], k)
        if (relax(S, g.eb[c.e], c.d * offroad + cost(c.e, 1 - c.t))) sVia.set(g.eb[c.e], k)
        // Entrada y salida en el mismo tramo
        for (let j = 0; j < tc.length; j++) {
          if (tc[j].e !== c.e) continue
          if (relax(S, E, c.d * offroad + cost(c.e, Math.abs(c.t - tc[j].t)) + tc[j].d * offroad)) direct = { s: k, t: j }
        }
      }
      continue
    }
    for (let i = g.off[u]; i < g.off[u + 1]; i++) relax(u, g.adj[i], cost(g.adjE[i], 1))
    const te = toE.get(u)
    if (te && relax(u, E, te.c)) eVia = te.k
  }
  if (gs[E] === Infinity) return null

  // Reconstruir
  let sCand: Cand, tCand: Cand
  const chain: number[] = []
  if (prev[E] === S && direct) {
    sCand = sc[direct.s]
    tCand = tc[direct.t]
  } else {
    for (let u = prev[E]; u !== S && u !== -1; u = prev[u]) chain.push(u)
    chain.reverse()
    sCand = sc[sVia.get(chain[0])!]
    tCand = tc[eVia]
  }
  const xy: XY[] = [P, sCand.q, ...chain.map((n) => ({ x: g.x[n], y: g.y[n] })), tCand.q, T]
  const junction = [false, false, ...chain.map((n) => g.deg[n] >= 3), false, false]
  // Quitar puntos repetidos (p. ej. si ya estás sobre el camino)
  const pts: XY[] = []
  const jn: boolean[] = []
  xy.forEach((q, i) => {
    if (i && Math.hypot(q.x - pts[pts.length - 1].x, q.y - pts[pts.length - 1].y) < 0.5) {
      jn[jn.length - 1] ||= junction[i]
      return
    }
    pts.push(q)
    jn.push(junction[i])
  })
  const acc = [0]
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const length = acc[acc.length - 1]
  const offPath = sCand.d + tCand.d
  const steps = turnSteps(pts, acc, jn, sCand.d, length - tCand.d).map((x) => ({ along: x.along, giro: x.giro, p: fromXY(x.q, g.ref) }))
  if (sCand.d > 25) steps.unshift({ along: sCand.d, giro: 'coger', p: fromXY(sCand.q, g.ref) })
  if (tCand.d > 25) steps.push({ along: length - tCand.d, giro: 'dejar', p: fromXY(tCand.q, g.ref) })
  return {
    kind: 'caminos',
    points: pts.map((q) => fromXY(q, g.ref)),
    length,
    onPath: length - offPath,
    offPath,
    cost: gs[E],
    steps,
  }
}

function xyAlong(pts: XY[], acc: number[], m: number): XY {
  if (m <= 0) return pts[0]
  for (let i = 1; i < pts.length; i++) {
    if (acc[i] >= m) {
      const d = acc[i] - acc[i - 1]
      const t = d ? (m - acc[i - 1]) / d : 0
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
    }
  }
  return pts[pts.length - 1]
}

const headingXY = (a: XY, b: XY) => (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI

/** Giros en los cruces: compara el rumbo 15 m antes y 15 m después de cada cruce del tramo por camino */
function turnSteps(pts: XY[], acc: number[], jn: boolean[], enter: number, leave: number) {
  const out: { along: number; giro: Giro; q: XY }[] = []
  for (let i = 1; i < pts.length - 1; i++) {
    const a = acc[i]
    if (!jn[i] || a <= enter + 1 || a >= leave - 1) continue
    const before = xyAlong(pts, acc, Math.max(enter, a - 15))
    const after = xyAlong(pts, acc, Math.min(leave, a + 15))
    if (Math.hypot(before.x - pts[i].x, before.y - pts[i].y) < 3 || Math.hypot(after.x - pts[i].x, after.y - pts[i].y) < 3) continue
    const turn = angleDiff(headingXY(pts[i], after) - headingXY(before, pts[i]))
    if (Math.abs(turn) < 30) continue
    // Dos cruces seguidos a menos de 8 m cuentan como uno
    if (out.length && a - out[out.length - 1].along < 8) continue
    const giro: Giro = turn > 0 ? (turn > 110 ? 'derecha-cerrada' : 'derecha') : turn < -110 ? 'izquierda-cerrada' : 'izquierda'
    out.push({ along: a, giro, q: pts[i] })
  }
  return out
}

/** Ruta recomendada: por caminos si compensa frente a ir en línea recta campo a través */
export function recommend(g: Graph | null, from: LatLon, to: LatLon, offroad = OFFROAD): RouteResult {
  const direct = directRoute(from, to, offroad)
  const viaPaths = pathRoute(g, from, to, offroad)
  return viaPaths && viaPaths.cost < direct.cost ? viaPaths : direct
}

/** Texto de una indicación */
export function giroTexto(p: Giro): string {
  switch (p) {
    case 'izquierda':
      return 'Gira a la izquierda'
    case 'derecha':
      return 'Gira a la derecha'
    case 'izquierda-cerrada':
      return 'Gira cerrado a la izquierda'
    case 'derecha-cerrada':
      return 'Gira cerrado a la derecha'
    case 'coger':
      return 'Sal al camino'
    case 'dejar':
      return 'Deja el camino'
  }
}
