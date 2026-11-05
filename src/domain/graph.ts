/**
 * Red de caminos y cálculo de la ruta recomendada.
 *
 * Los caminos son líneas sueltas (grabadas andando, dibujadas o importadas de GPX). Aquí se unen en un grafo:
 * - cada vértice es un nodo y cada tramo recto entre nodos, una arista;
 * - si dos caminos se cruzan se crea un nodo en el cruce;
 * - si el extremo de un camino queda a menos de SNAP metros de otro, se enganchan.
 * La ruta recomendada es la de menor "coste": los metros por camino cuentan 1 y los metros campo a través
 * (desde donde estás hasta el camino, y del camino al bancal) cuentan OFFROAD veces, porque cruzar bancales
 * con márgenes y piedra es más lento.
 */
import { closestOnSegmentXY, distance, fromXY, toXY, type LatLon, type XY } from '../lib/geo'

export const SNAP = 12
export const OFFROAD = 2.5

export interface Edge {
  a: number
  b: number
  len: number
}

export interface Graph {
  ref: LatLon
  nodes: XY[]
  edges: Edge[]
  adj: { to: number; len: number }[][]
}

interface Seg {
  line: number
  a: XY
  b: XY
  /** Nodos sobre el segmento con su posición t (0-1) */
  splits: { t: number; n: number }[]
}

function segIntersect(p: XY, p2: XY, q: XY, q2: XY): { t: number; u: number } | null {
  const r = { x: p2.x - p.x, y: p2.y - p.y }
  const s = { x: q2.x - q.x, y: q2.y - q.y }
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den
  const u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null
  return { t, u }
}

export function buildGraph(lines: LatLon[][], snap = SNAP): Graph | null {
  const valid = lines.filter((l) => l.length >= 2)
  if (!valid.length) return null
  const ref = valid[0][0]
  const nodes: XY[] = []
  const segs: Seg[] = []
  const lineNodes: number[][] = []
  const extra: Edge[] = []

  valid.forEach((line, li) => {
    const ids = line.map((p) => nodes.push(toXY(p, ref)) - 1)
    lineNodes.push(ids)
    for (let i = 0; i < ids.length - 1; i++) {
      segs.push({ line: li, a: nodes[ids[i]], b: nodes[ids[i + 1]], splits: [{ t: 0, n: ids[i] }, { t: 1, n: ids[i + 1] }] })
    }
  })

  // 1) Cruces entre segmentos
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i]
      const B = segs[j]
      // Segmentos contiguos de la misma línea comparten extremo: no es un cruce
      if (A.line === B.line && (A.splits[1].n === B.splits[0].n || A.splits[0].n === B.splits[1].n)) continue
      const hit = segIntersect(A.a, A.b, B.a, B.b)
      if (!hit) continue
      const n = nodes.push({ x: A.a.x + (A.b.x - A.a.x) * hit.t, y: A.a.y + (A.b.y - A.a.y) * hit.t }) - 1
      A.splits.push({ t: hit.t, n })
      B.splits.push({ t: hit.u, n })
    }
  }

  // Metros acumulados de cada vértice dentro de su línea
  const along = lineNodes.map((ids) => {
    const acc = [0]
    for (let i = 1; i < ids.length; i++) acc.push(acc[i - 1] + Math.hypot(nodes[ids[i]].x - nodes[ids[i - 1]].x, nodes[ids[i]].y - nodes[ids[i - 1]].y))
    return acc
  })

  // 2) Extremos de cada línea cerca de otras líneas (o de otra parte de la misma)
  lineNodes.forEach((ids, li) => {
    for (const end of [ids[0], ids[ids.length - 1]]) {
      const p = nodes[end]
      let best: { seg: Seg; t: number; q: XY; d: number } | null = null
      for (const s of segs) {
        if (s.splits.some((x) => x.n === end)) continue
        // En la misma línea solo se engancha a tramos lejanos (recorridos que vuelven al inicio)
        if (s.line === li) {
          const k = ids.indexOf(s.splits[0].n)
          const kEnd = ids.indexOf(end)
          if (Math.abs(along[li][k] - along[li][kEnd]) < snap * 3 || Math.abs(along[li][k + 1] - along[li][kEnd]) < snap * 3) continue
        }
        const r = closestOnSegmentXY(p, s.a, s.b)
        if (r.d <= snap && (!best || r.d < best.d)) best = { seg: s, ...r }
      }
      if (!best) continue
      const segLen = Math.hypot(best.seg.b.x - best.seg.a.x, best.seg.b.y - best.seg.a.y)
      // Si cae casi en un vértice existente, se engancha a ese vértice
      const near = best.seg.splits.find((x) => Math.abs(x.t - best!.t) * segLen < 1)
      let target: number
      if (near) target = near.n
      else {
        target = nodes.push(best.q) - 1
        best.seg.splits.push({ t: best.t, n: target })
      }
      if (target !== end) extra.push({ a: end, b: target, len: Math.hypot(nodes[end].x - nodes[target].x, nodes[end].y - nodes[target].y) })
    }
  })

  const edges: Edge[] = []
  for (const s of segs) {
    const sp = [...s.splits].sort((x, y) => x.t - y.t)
    for (let i = 0; i < sp.length - 1; i++) {
      const a = sp[i].n
      const b = sp[i + 1].n
      if (a === b) continue
      edges.push({ a, b, len: Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) })
    }
  }
  edges.push(...extra)
  const adj: Graph['adj'] = nodes.map(() => [])
  for (const e of edges) {
    adj[e.a].push({ to: e.b, len: e.len })
    adj[e.b].push({ to: e.a, len: e.len })
  }
  return { ref, nodes, edges, adj }
}

/** Arista más cercana a un punto */
function nearestEdge(g: Graph, p: XY): { e: Edge; t: number; q: XY; d: number } | null {
  let best: { e: Edge; t: number; q: XY; d: number } | null = null
  for (const e of g.edges) {
    const r = closestOnSegmentXY(p, g.nodes[e.a], g.nodes[e.b])
    if (!best || r.d < best.d) best = { e, ...r }
  }
  return best
}

class Heap {
  private h: [number, number][] = []
  get size() {
    return this.h.length
  }
  push(v: [number, number]) {
    const h = this.h
    h.push(v)
    let i = h.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (h[p][0] <= h[i][0]) break
      ;[h[p], h[i]] = [h[i], h[p]]
      i = p
    }
  }
  pop(): [number, number] {
    const h = this.h
    const top = h[0]
    const last = h.pop()!
    if (h.length) {
      h[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < h.length && h[l][0] < h[m][0]) m = l
        if (r < h.length && h[r][0] < h[m][0]) m = r
        if (m === i) break
        ;[h[m], h[i]] = [h[i], h[m]]
        i = m
      }
    }
    return top
  }
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
}

export function directRoute(from: LatLon, to: LatLon, offroad = OFFROAD): RouteResult {
  const d = distance(from, to)
  return { kind: 'directa', points: [from, to], length: d, onPath: 0, offPath: d, cost: d * offroad }
}

/** Ruta por la red de caminos. Devuelve null si no hay caminos. */
export function pathRoute(g: Graph | null, from: LatLon, to: LatLon, offroad = OFFROAD): RouteResult | null {
  if (!g || !g.edges.length) return null
  const P = toXY(from, g.ref)
  const T = toXY(to, g.ref)
  const s = nearestEdge(g, P)
  const t = nearestEdge(g, T)
  if (!s || !t) return null

  // Nodos virtuales: S (entrada a la red) = n, T (salida) = n + 1
  const n = g.nodes.length
  const S = n
  const E = n + 1
  const extraAdj = new Map<number, { to: number; len: number }[]>()
  const link = (a: number, b: number, len: number) => {
    const add = (x: number, y: number) => {
      if (!extraAdj.has(x)) extraAdj.set(x, [])
      extraAdj.get(x)!.push({ to: y, len })
    }
    add(a, b)
    add(b, a)
  }
  link(S, s.e.a, s.t * s.e.len)
  link(S, s.e.b, (1 - s.t) * s.e.len)
  link(E, t.e.a, t.t * t.e.len)
  link(E, t.e.b, (1 - t.t) * t.e.len)
  if (s.e === t.e) link(S, E, Math.abs(s.t - t.t) * s.e.len)

  const dist = new Map<number, number>([[S, 0]])
  const prev = new Map<number, number>()
  const heap = new Heap()
  heap.push([0, S])
  while (heap.size) {
    const [d, u] = heap.pop()
    if (u === E) break
    if (d > (dist.get(u) ?? Infinity)) continue
    const out = [...(u < n ? g.adj[u] : []), ...(extraAdj.get(u) ?? [])]
    for (const { to, len } of out) {
      const nd = d + len
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd)
        prev.set(to, u)
        heap.push([nd, to])
      }
    }
  }
  const onPath = dist.get(E)
  if (onPath === undefined) return null

  const chain: XY[] = []
  for (let u: number | undefined = E; u !== undefined; u = prev.get(u)) {
    chain.push(u === S ? s.q : u === E ? t.q : g.nodes[u])
  }
  chain.reverse()
  const mid = chain.map((q) => fromXY(q, g.ref))
  const points: LatLon[] = [from, ...mid, to]
  // Quita puntos repetidos (p. ej. si ya estás sobre el camino)
  const clean = points.filter((p, i) => i === 0 || distance(p, points[i - 1]) > 0.5)
  const offPath = s.d + t.d
  return { kind: 'caminos', points: clean, length: onPath + offPath, onPath, offPath, cost: onPath + offPath * offroad }
}

/** Ruta recomendada: por caminos si compensa frente a ir en línea recta campo a través */
export function recommend(g: Graph | null, from: LatLon, to: LatLon, offroad = OFFROAD): RouteResult {
  const direct = directRoute(from, to, offroad)
  const viaPaths = pathRoute(g, from, to, offroad)
  return viaPaths && viaPaths.cost < direct.cost ? viaPaths : direct
}
