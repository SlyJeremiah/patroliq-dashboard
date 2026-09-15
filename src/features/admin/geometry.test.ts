import { describe, expect, it } from 'vitest'
import type { MultiPolygon, Polygon } from 'geojson'
import {
  areaKm2, boundarySvgPath, closeRing, isSelfIntersecting, nearestVertex, openRing, outerRingVertices, perimeterKm,
  pointInBoundary, polygonFromVertices, segmentsIntersect, svgProjector, validateOutline,
} from './geometry'

// ~1.06 km × 1.1 km square near Mazowe (lon/lat)
const square: [number, number][] = [[30.9, -17.5], [30.91, -17.5], [30.91, -17.49], [30.9, -17.49]]

describe('ring helpers', () => {
  it('closes an open ring once', () => {
    const closed = closeRing(square)
    expect(closed).toHaveLength(5)
    expect(closed[4]).toEqual(closed[0])
    expect(closeRing(closed)).toHaveLength(5)
    expect(closeRing([])).toEqual([])
  })

  it('opens a closed ring', () => {
    expect(openRing(closeRing(square))).toEqual(square)
    expect(openRing(square)).toEqual(square)
  })

  it('builds a polygon only from 3+ vertices', () => {
    expect(polygonFromVertices(square.slice(0, 2))).toBeNull()
    const p = polygonFromVertices(square)!
    expect(p.type).toBe('Polygon')
    expect(p.coordinates[0]).toHaveLength(5)
  })
})

describe('self-intersection', () => {
  it('detects crossing segments', () => {
    expect(segmentsIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true)
    expect(segmentsIntersect([0, 0], [1, 0], [0, 1], [1, 1])).toBe(false)
  })

  it('accepts a simple square and rejects a bow-tie', () => {
    expect(isSelfIntersecting(square)).toBe(false)
    expect(isSelfIntersecting(closeRing(square))).toBe(false)
    const bowTie: [number, number][] = [[0, 0], [1, 1], [1, 0], [0, 1]]
    expect(isSelfIntersecting(bowTie)).toBe(true)
  })

  it('treats repeated vertices and collinear triangles as invalid', () => {
    expect(isSelfIntersecting([[0, 0], [1, 0], [1, 1], [1, 0]])).toBe(true)
    expect(isSelfIntersecting([[0, 0], [1, 0], [2, 0]])).toBe(true)
  })

  it('validates an outline', () => {
    expect(validateOutline(square.slice(0, 2))).toEqual({ enoughVertices: false, selfIntersects: false, ok: false })
    expect(validateOutline(square).ok).toBe(true)
    expect(validateOutline([[0, 0], [1, 1], [1, 0], [0, 1]]).selfIntersects).toBe(true)
  })
})

describe('measurements', () => {
  it('computes geodesic area and perimeter', () => {
    const p = polygonFromVertices(square)!
    const km2 = areaKm2(p)
    expect(km2).toBeGreaterThan(1.1)
    expect(km2).toBeLessThan(1.25)
    const km = perimeterKm(p)
    expect(km).toBeGreaterThan(4.2)
    expect(km).toBeLessThan(4.4)
    expect(areaKm2(null)).toBe(0)
  })
})

describe('point in boundary', () => {
  const holed: Polygon = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
  }
  it('handles holes, edges and multipolygons', () => {
    expect(pointInBoundary([1, 1], holed)).toBe(true)
    expect(pointInBoundary([5, 5], holed)).toBe(false)
    expect(pointInBoundary([0, 5], holed)).toBe(true)
    expect(pointInBoundary([11, 5], holed)).toBe(false)
    const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [holed.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 20]]]] }
    expect(pointInBoundary([28, 22], multi)).toBe(true)
    expect(pointInBoundary([15, 15], multi)).toBe(false)
    expect(pointInBoundary([1, 1], null)).toBe(false)
  })

  it('picks the largest outer ring for editing', () => {
    const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]]] }
    expect(outerRingVertices(multi)).toHaveLength(4)
    expect(outerRingVertices(null)).toEqual([])
  })
})

describe('thumbnail + hit testing', () => {
  it('fits the boundary in the box', () => {
    const p = polygonFromVertices(square)!
    const d = boundarySvgPath(p, 100, 100, 10)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    const project = svgProjector(p, 100, 100, 10)!
    for (const v of square) {
      const [x, y] = project(v)
      expect(x).toBeGreaterThanOrEqual(9.9)
      expect(x).toBeLessThanOrEqual(90.1)
      expect(y).toBeGreaterThanOrEqual(9.9)
      expect(y).toBeLessThanOrEqual(90.1)
    }
    // north up: the northern vertex has the smaller y
    expect(project([30.9, -17.49])[1]).toBeLessThan(project([30.9, -17.5])[1])
    expect(boundarySvgPath(null, 10, 10)).toBe('')
  })

  it('finds the nearest vertex within tolerance', () => {
    const pts = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 22, y: 1 }]
    expect(nearestVertex(pts, 21, 1, 5)).toBe(2)
    expect(nearestVertex(pts, 50, 50, 5)).toBe(-1)
  })
})
