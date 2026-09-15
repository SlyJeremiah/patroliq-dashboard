// MapLibre helpers for area setup: generic GeoJSON overlays and the polygon drawing tool (used through AreaMap `onReady`).
import type { GeoJSONSource, LayerSpecification, Map as MlMap, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import { useEffect, useMemo, useRef } from 'react'
import { closeRing, nearestVertex, type LngLat } from './geometry'

/** Loosely typed layer description (MapLibre validates expressions at runtime). */
export interface OverlayLayer {
  id: string
  type: 'fill' | 'line' | 'circle' | 'symbol'
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
  filter?: unknown
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

/** Adds a GeoJSON source + layers to the map while mounted and keeps the data in sync. */
export function useGeoOverlay(map: MlMap | null, id: string, data: FeatureCollection | null, layers: OverlayLayer[]) {
  const layersRef = useRef(layers)
  layersRef.current = layers

  useEffect(() => {
    if (!map) return
    safe(() => {
      if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY })
      for (const l of layersRef.current) {
        if (!map.getLayer(l.id)) map.addLayer({ ...l, source: id } as unknown as LayerSpecification)
      }
    })
    return () => {
      safe(() => {
        for (const l of layersRef.current) if (map.getLayer(l.id)) map.removeLayer(l.id)
        if (map.getSource(id)) map.removeSource(id)
      })
    }
  }, [map, id])

  useEffect(() => {
    if (!map) return
    safe(() => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data ?? EMPTY))
  }, [map, id, data])
}

export interface DrawOptions {
  active: boolean
  vertices: LngLat[]
  closed: boolean
  onChange: (vertices: LngLat[]) => void
  onClosedChange: (closed: boolean) => void
}

export function drawFeatures(vertices: LngLat[], closed: boolean): FeatureCollection {
  const features: Feature[] = []
  if (vertices.length >= 3) {
    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [closeRing(vertices)] }, properties: { kind: 'fill', closed } })
  }
  if (vertices.length >= 2) {
    const coords = closed ? closeRing(vertices) : vertices
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { kind: 'line' } })
  }
  vertices.forEach((v, i) => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: v },
      properties: { kind: 'vertex', index: i, first: i === 0 && !closed && vertices.length >= 3 },
    })
  })
  return { type: 'FeatureCollection', features }
}

export const DRAW_LAYERS: OverlayLayer[] = [
  { id: 'admin-draw-fill', type: 'fill', filter: ['==', ['get', 'kind'], 'fill'], paint: { 'fill-color': '#52B788', 'fill-opacity': ['case', ['get', 'closed'], 0.22, 0.1] } },
  { id: 'admin-draw-line', type: 'line', filter: ['==', ['get', 'kind'], 'line'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#102C26', 'line-width': 3 } },
  {
    id: 'admin-draw-vertex', type: 'circle', filter: ['==', ['get', 'kind'], 'vertex'],
    paint: {
      'circle-radius': ['case', ['get', 'first'], 8, 6],
      'circle-color': ['case', ['get', 'first'], '#52B788', '#FFFFFF'],
      'circle-stroke-color': '#102C26',
      'circle-stroke-width': 2.5,
    },
  },
]

/**
 * Polygon drawing on a MapLibre map: click adds a vertex, drag moves one, right-click or Backspace removes the last,
 * double-click (or clicking the first vertex) closes the outline.
 */
export function usePolygonDraw(map: MlMap | null, opts: DrawOptions) {
  const ref = useRef(opts)
  ref.current = opts

  const data = useMemo(() => (opts.active ? drawFeatures(opts.vertices, opts.closed) : null), [opts.active, opts.vertices, opts.closed])
  useGeoOverlay(map, 'admin-draw', data, DRAW_LAYERS)

  useEffect(() => {
    if (!map || !opts.active) return
    let dragIndex = -1
    let justDragged = false
    const canvas = map.getCanvas()

    const vertexAt = (e: MapMouseEvent): number => {
      const projected = ref.current.vertices.map((v) => map.project(v))
      return nearestVertex(projected, e.point.x, e.point.y, 10)
    }

    const onDown = (e: MapLayerMouseEvent | MapMouseEvent) => {
      if ((e.originalEvent as MouseEvent).button !== 0) return
      const i = vertexAt(e)
      if (i < 0) return
      e.preventDefault()
      dragIndex = i
      map.dragPan.disable()
      canvas.style.cursor = 'grabbing'
    }
    const onMove = (e: MapMouseEvent) => {
      if (dragIndex >= 0) {
        const next = ref.current.vertices.slice()
        next[dragIndex] = [e.lngLat.lng, e.lngLat.lat]
        ref.current.onChange(next)
        return
      }
      canvas.style.cursor = vertexAt(e) >= 0 ? 'move' : ref.current.closed ? '' : 'crosshair'
    }
    const onUp = () => {
      if (dragIndex < 0) return
      dragIndex = -1
      justDragged = true
      map.dragPan.enable()
      canvas.style.cursor = ''
    }
    const onClick = (e: MapMouseEvent) => {
      if (justDragged) {
        justDragged = false
        return
      }
      const { vertices, closed } = ref.current
      if (closed) return
      const hit = vertexAt(e)
      if (hit === 0 && vertices.length >= 3) {
        ref.current.onClosedChange(true)
        return
      }
      if (hit >= 0 && hit === vertices.length - 1) return // second click of a double-click
      ref.current.onChange([...vertices, [e.lngLat.lng, e.lngLat.lat]])
    }
    const onDbl = (e: MapMouseEvent) => {
      e.preventDefault()
      if (!ref.current.closed && ref.current.vertices.length >= 3) ref.current.onClosedChange(true)
    }
    const removeLast = () => {
      const { vertices, closed } = ref.current
      if (!vertices.length) return
      if (closed) ref.current.onClosedChange(false)
      ref.current.onChange(vertices.slice(0, -1))
    }
    const onContext = (e: MapMouseEvent) => {
      e.preventDefault()
      removeLast()
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        removeLast()
      }
    }

    map.doubleClickZoom.disable()
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    map.on('click', onClick)
    map.on('dblclick', onDbl)
    map.on('contextmenu', onContext)
    window.addEventListener('keydown', onKey)
    canvas.style.cursor = 'crosshair'
    return () => {
      safe(() => {
        map.off('mousedown', onDown)
        map.off('mousemove', onMove)
        map.off('mouseup', onUp)
        map.off('click', onClick)
        map.off('dblclick', onDbl)
        map.off('contextmenu', onContext)
        map.doubleClickZoom.enable()
        map.dragPan.enable()
        canvas.style.cursor = ''
      })
      window.removeEventListener('keydown', onKey)
    }
  }, [map, opts.active])
}
