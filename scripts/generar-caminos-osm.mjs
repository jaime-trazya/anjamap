/**
 * Genera public/caminos-osm.json: la red de pistas, sendas y calles de OpenStreetMap
 * de la Canal de Navarrés y La Costera, ya preparada como grafo para calcular rutas.
 *
 *   node scripts/generar-caminos-osm.mjs            # descarga de Overpass y procesa
 *   node scripts/generar-caminos-osm.mjs raw.json   # procesa una descarga ya hecha
 *
 * Formato (enteros = grados × 1e5, cada lista en diferencias respecto al valor anterior):
 *   n: [lat, lon, lat, lon, ...]               cruces y extremos (nodos del grafo)
 *   e: [a, b, tipo, k, dlat, dlon, ...]        tramos entre dos nodos con k puntos intermedios
 *                                              (a y b en diferencias; puntos relativos al anterior, empezando en a)
 *   tipo: 0 = pista o senda, 1 = calle o camino asfaltado, 2 = carretera
 * Datos © colaboradores de OpenStreetMap, ODbL.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const RELACIONES = [1691747, 1691752]
const TIPOS = {
  track: 0, path: 0, footway: 0, bridleway: 0, cycleway: 0, steps: 0, pedestrian: 0,
  unclassified: 1, residential: 1, service: 1, living_street: 1, road: 1,
  tertiary: 2, secondary: 2,
}
const TOL = 2.5 // metros, simplificación
const S = 1e5

async function descargar() {
  const q = `[out:json][timeout:240];(${RELACIONES.map((r) => `area(${3600000000 + r});`).join('')})->.a;way(area.a)["highway"~"^(${Object.keys(TIPOS).join('|')})$"];out body;>;out skel qt;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'anjamap-build/1.0 (github.com/jaime-trazya/anjamap)', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  return res.json()
}

const data = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : await descargar()
const pos = new Map()
for (const e of data.elements) if (e.type === 'node') pos.set(e.id, [e.lat, e.lon])
const ways = data.elements.filter(
  (e) => e.type === 'way' && e.tags?.highway in TIPOS && !['no', 'private'].includes(e.tags.access) && e.tags.area !== 'yes',
)

// Nodos usados por más de una vía o extremos: son cruces
const uso = new Map()
for (const w of ways) {
  w.nodes.forEach((n, i) => uso.set(n, (uso.get(n) ?? 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)))
}

const xy = (p, ref) => [(p[1] - ref[1]) * 111320 * Math.cos((ref[0] * Math.PI) / 180), (p[0] - ref[0]) * 110574]
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
function simplify(pts) {
  if (pts.length < 3) return pts
  const ref = pts[0]
  const P = pts.map((p) => xy(p, ref))
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const st = [[0, pts.length - 1]]
  while (st.length) {
    const [i, j] = st.pop()
    let m = -1, md = TOL
    for (let k = i + 1; k < j; k++) {
      const d = segDist(P[k], P[i], P[j])
      if (d > md) { md = d; m = k }
    }
    if (m >= 0) { keep[m] = 1; st.push([i, m], [m, j]) }
  }
  return pts.filter((_, i) => keep[i])
}

const nodeIdx = new Map()
const nodes = []
const idx = (id) => {
  if (!nodeIdx.has(id)) { nodeIdx.set(id, nodes.length); nodes.push(pos.get(id)) }
  return nodeIdx.get(id)
}
const edges = []
const visto = new Set()
for (const w of ways) {
  const tipo = TIPOS[w.tags.highway]
  const ns = w.nodes.filter((n) => pos.has(n))
  let start = 0
  for (let i = 1; i < ns.length; i++) {
    if (i === ns.length - 1 || uso.get(ns[i]) > 1) {
      const tramo = ns.slice(start, i + 1)
      start = i
      if (tramo.length < 2 || tramo[0] === tramo[tramo.length - 1] && tramo.length < 4) continue
      const key = `${tramo[0]}-${tramo[tramo.length - 1]}-${tramo.length}`
      if (visto.has(key)) continue
      visto.add(key)
      const geo = simplify(tramo.map((n) => pos.get(n)))
      edges.push({ a: idx(tramo[0]), b: idx(tramo[tramo.length - 1]), tipo, mid: geo.slice(1, -1) })
    }
  }
}

const q = (v) => Math.round(v * S)
const n = []
let pl = 0, po = 0
for (const [la, lo] of nodes) { n.push(q(la) - pl, q(lo) - po); pl = q(la); po = q(lo) }
const e = []
let pa = 0, pb = 0
for (const ed of edges) {
  e.push(ed.a - pa, ed.b - pb, ed.tipo, ed.mid.length)
  pa = ed.a; pb = ed.b
  let [la, lo] = nodes[ed.a].map(q)
  for (const p of ed.mid) { e.push(q(p[0]) - la, q(p[1]) - lo); la = q(p[0]); lo = q(p[1]) }
}
const out = { v: 1, fuente: '© colaboradores de OpenStreetMap (ODbL)', fecha: new Date().toISOString().slice(0, 10), n, e }
writeFileSync(new URL('../public/caminos-osm.json', import.meta.url), JSON.stringify(out))
const pts = edges.reduce((s, x) => s + x.mid.length, 0)
console.log(`${ways.length} vías → ${nodes.length} nodos, ${edges.length} tramos, ${pts} puntos intermedios`)
