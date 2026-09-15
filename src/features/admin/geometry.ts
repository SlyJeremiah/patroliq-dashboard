// Pure polygon/geometry helpers for area setup (boundary drawing, point-in-boundary checks, thumbnails).
import turfArea from '@turf/area'
import type { MultiPolygon, Polygon, Position } from 'geojson'

/** [lon, lat] in WGS84. */
export type LngLat = [number, number]
export type Boundary = Polygon | MultiPolygon

const EPS = 1e-12

function same(a: Position, b: Position): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS
}

/** Returns a closed ring (first vertex repeated at the end). Empty input stays empty. */
export function closeRing(vertices: Position[]): LngLat[] {
  const v = vertices.map((p) => [p[0], p[1]] as LngLat)
  if (v.length === 0) return v
  if (!same(v[0], v[v.length - 1])) v.push([v[0][0], v[0][1]])
  return v
}

/** Removes the closing duplicate vertex of a ring, if present. */
export function openRing(ring: Position[]): LngLat[] {
  const v = ring.map((p) => [p[0], p[1]] as LngLat)
  if (v.length > 1 && same(v[0], v[v.length - 1])) v.pop()
  return v
}

function orient(a: Position, b: Position, c: Position): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  return Math.abs(v) < EPS ? 0 : v > 0 ? 1 : -1
}

function onSegment(a: Position, b: Position, p: Position): boolean {
  return Math.min(a[0], b[0]) - EPS <= p[0] && p[0] <= Math.max(a[0], b[0]) + EPS && Math.min(a[1], b[1]) - EPS <= p[1] && p[1] <= Math.max(a[1], b[1]) + EPS
}

/** True when segments ab and cd share at least one point (including touching and collinear overlap). */
export function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(a, b, c)) return true
  if (o2 === 0 && onSegment(a, b, d)) return true
  if (o3 === 0 && onSegment(c, d, a)) return true
  if (o4 === 0 && onSegment(c, d, b)) return true
  return false
}

/**
 * Whether the polygon formed by the (open or closed) vertex list crosses itself.
 * Adjacent edges share a vertex and are not counted; repeated vertices count as an intersection.
 */
export function isSelfIntersecting(vertices: Position[]): boolean {
  const v = openRing(vertices)
  const n = v.length
  if (n < 4) {
    // A triangle cannot self-intersect unless vertices repeat or are collinear.
    if (n === 3) return orient(v[0], v[1], v[2]) === 0
    return false
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) if (same(v[i], v[j])) return true
  }
  for (let i = 0; i < n; i++) {
    const a = v[i]
    const b = v[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges (they share a vertex): j === i+1, and the wrap-around pair (last edge with first edge).
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      const c = v[j]
      const d = v[(j + 1) % n]
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  return false
}

/** Polygon from drawn vertices (open list). Null when fewer than 3 vertices. */
export function polygonFromVertices(vertices: Position[]): Polygon | null {
  const open = openRing(vertices)
  if (open.length < 3) return null
  return { type: 'Polygon', coordinates: [closeRing(open)] }
}

/** Geodesic area in km² (turf). */
export function areaKm2(geom: Boundary | null | undefined): number {
  if (!geom) return 0
  return turfArea(geom) / 1_000_000
}

/** Great-circle distance in metres. */
export function haversineM(a: Position, b: Position): number {
  const R = 6_371_008.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Perimeter in km of all outer rings (holes excluded). */
export function perimeterKm(geom: Boundary | null | undefined): number {
  if (!geom) return 0
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let m = 0
  for (const p of polys) {
    const ring = closeRing(p[0] ?? [])
    for (let i = 1; i < ring.length; i++) m += haversineM(ring[i - 1], ring[i])
  }
  return m / 1000
}

/** Ray-casting point-in-ring (boundary points count as inside). */
export function pointInRing(pt: Position, ring: Position[]): boolean {
  const r = openRing(ring)
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]
    const b = r[j]
    if (orient(a, b, pt) === 0 && onSegment(a, b, pt)) return true
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** Point inside a Polygon/MultiPolygon (inside an outer ring and not inside one of its holes). */
export function pointInBoundary(pt: Position, geom: Boundary | null | undefined): boolean {
  if (!geom) return false
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  return polys.some((rings) => rings.length > 0 && pointInRing(pt, rings[0]) && !rings.slice(1).some((h) => pointInRing(pt, h)))
}

/** Outer ring (open vertex list) of the largest polygon — used to edit an existing boundary. */
export function outerRingVertices(geom: Boundary | null | undefined): LngLat[] {
  if (!geom) return []
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let best: Position[] | null = null
  let bestArea = -1
  for (const p of polys) {
    if (!p[0]) continue
    const a = turfArea({ type: 'Polygon', coordinates: [p[0]] })
    if (a > bestArea) {
      bestArea = a
      best = p[0]
    }
  }
  return best ? openRing(best) : []
}

/** Human-readable validation of a drawn outline. */
export function validateOutline(vertices: Position[]): { enoughVertices: boolean; selfIntersects: boolean; ok: boolean } {
  const enoughVertices = openRing(vertices).length >= 3
  const selfIntersects = enoughVertices && isSelfIntersecting(vertices)
  return { enoughVertices, selfIntersects, ok: enoughVertices && !selfIntersects }
}

/**
 * SVG path data for a boundary fitted into a width×height box (equirectangular with cos(lat) correction, north up).
 * Returns '' for an empty geometry.
 */
export function boundarySvgPath(geom: Boundary | null | undefined, width: number, height: number, pad = 8): string {
  const project = svgProjector(geom, width, height, pad)
  if (!geom || !project) return ''
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const pt = (p: Position) => {
    const [x, y] = project(p)
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return polys
    .flatMap((rings) => rings.map((ring) => `M${openRing(ring).map(pt).join('L')}Z`))
    .join('')
}

/** Projection used by `boundarySvgPath` (so points such as APU bases can be drawn on the same thumbnail). Null when empty. */
export function svgProjector(geom: Boundary | null | undefined, width: number, height: number, pad = 8): ((p: Position) => [number, number]) | null {
  if (!geom) return null
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const all = polys.flatMap((p) => p.flat())
  if (!all.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of all) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
  const w = Math.max((maxX - minX) * k, 1e-9)
  const h = Math.max(maxY - minY, 1e-9)
  const scale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h)
  const ox = (width - w * scale) / 2
  const oy = (height - h * scale) / 2
  return ([x, y]: Position) => [ox + (x - minX) * k * scale, oy + (maxY - y) * scale]
}

/** Nearest vertex index within `tolerancePx` of a screen point, given projected vertices. */
export function nearestVertex(projected: { x: number; y: number }[], x: number, y: number, tolerancePx = 10): number {
  let best = -1
  let bestD = tolerancePx * tolerancePx
  projected.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d <= bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
