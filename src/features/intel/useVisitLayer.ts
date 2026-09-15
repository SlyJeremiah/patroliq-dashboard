import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { useEffect } from 'react'
import type { FeatureCollection, Point, Polygon } from 'geojson'

export interface VisitCell {
  id: string
  geometry: Polygon
  centroid: [number, number] | null
  visits: number
  intensity: number
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
export const VISIT_RAMP = ['#E9ECEF', '#B7E4C7', '#52B788', '#1B4332'] as const

/**
 * Adds a sequential "visit intensity" fill and optional visit-count labels to an AreaMap instance
 * (feature-specific layers through AreaMap `onReady`, drawn beneath the clickable GRTS cells).
 */
export function useVisitLayer(map: MlMap | null, cells: VisitCell[], opts: { fill: boolean; labels: boolean }) {
  useEffect(() => {
    if (!map) return
    if (!map.getSource('cov-visits')) {
      map.addSource('cov-visits', { type: 'geojson', data: EMPTY })
      map.addSource('cov-visit-points', { type: 'geojson', data: EMPTY })
      const before = map.getLayer('cells-fill') ? 'cells-fill' : undefined
      map.addLayer(
        {
          id: 'cov-visits-fill',
          type: 'fill',
          source: 'cov-visits',
          paint: {
            'fill-color': ['interpolate', ['linear'], ['get', 'intensity'], 0, VISIT_RAMP[0], 0.01, VISIT_RAMP[1], 0.5, VISIT_RAMP[2], 1, VISIT_RAMP[3]],
            'fill-opacity': ['case', ['==', ['get', 'visits'], 0], 0.35, 0.72],
          },
        },
        before,
      )
      map.addLayer({
        id: 'cov-visits-label',
        type: 'symbol',
        source: 'cov-visit-points',
        minzoom: 11,
        layout: { 'text-field': ['to-string', ['get', 'visits']], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false },
        paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(16,44,38,0.95)', 'text-halo-width': 1.6 },
      })
    }
  }, [map])

  useEffect(() => {
    if (!map || !map.getSource('cov-visits')) return
    ;(map.getSource('cov-visits') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: opts.fill ? cells.map((c) => ({ type: 'Feature', geometry: c.geometry, properties: { id: c.id, visits: c.visits, intensity: c.intensity } })) : [],
    })
    ;(map.getSource('cov-visit-points') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: opts.labels
        ? cells.filter((c) => c.centroid).map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c.centroid! } as Point, properties: { visits: c.visits } }))
        : [],
    })
  }, [map, cells, opts.fill, opts.labels])
}
