import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MlMap, type MapMouseEvent } from 'maplibre-gl'
import bbox from '@turf/bbox'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Feature, FeatureCollection, Geometry, LineString, MultiPolygon, Point, Polygon } from 'geojson'
import { Icon } from '@/components/ui'

/** Colours from Design Doc 5.4 (GRTS overlay, ranger dots, heatmap ramp). */
export const CELL_STYLE: Record<string, { stroke: string; fill: string; opacity: number }> = {
  assigned: { stroke: '#1A6496', fill: '#1A6496', opacity: 0.15 },
  surveyed: { stroke: '#27AE60', fill: '#27AE60', opacity: 0.15 },
  complete: { stroke: '#27AE60', fill: '#27AE60', opacity: 0.28 },
  partial: { stroke: '#E67E22', fill: '#E67E22', opacity: 0.2 },
  pending: { stroke: '#2D6A4F', fill: '#2D6A4F', opacity: 0.08 },
  never: { stroke: '#C0392B', fill: '#C0392B', opacity: 0.18 },
  high: { stroke: '#C0392B', fill: '#C0392B', opacity: 0.2 },
  critical: { stroke: '#C0392B', fill: '#C0392B', opacity: 0.32 },
  medium: { stroke: '#E67E22', fill: '#E67E22', opacity: 0.18 },
  low: { stroke: '#27AE60', fill: '#27AE60', opacity: 0.1 },
  none: { stroke: '#6C757D', fill: '#6C757D', opacity: 0.06 },
  grid: { stroke: '#F7E7CE', fill: '#000000', opacity: 0 },
}

export interface MapCell {
  id: string
  label: string
  geometry: Polygon
  /** Key of CELL_STYLE */
  status: string
}

export interface MapPoint {
  id: string
  lat: number
  lon: number
  color: string
  /** px radius */
  radius?: number
  label?: string
  kind: 'ranger' | 'pin' | 'base' | 'collar' | 'observation'
  /** Material Symbols glyph (observation markers). */
  icon?: string
  pulse?: 'active' | 'sos'
  dashed?: boolean
}

export interface HeatPoint {
  lat: number
  lon: number
  weight: number
}

export interface AreaMapProps {
  boundary?: Polygon | MultiPolygon | null
  cells?: MapCell[]
  showCells?: boolean
  showCellLabels?: boolean
  heat?: HeatPoint[]
  showHeat?: boolean
  tracks?: FeatureCollection<LineString>
  route?: [number, number][]
  points?: MapPoint[]
  selectedCellId?: string | null
  selectedPointId?: string | null
  satellite?: boolean
  /** Fit to these bounds when they change (defaults to the boundary). */
  fitTo?: Geometry | null
  onCellClick?: (cellId: string) => void
  onPointClick?: (point: MapPoint) => void
  onMapClick?: (lngLat: { lat: number; lon: number }) => void
  /** Called once the map is ready — for feature-specific layers (drawing tools etc.). */
  onReady?: (map: MlMap) => void
  className?: string
  children?: ReactNode
  interactive?: boolean
}

const STYLE_URL = (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) || 'https://tiles.openfreemap.org/styles/liberty'
const SAT_TILES = import.meta.env.VITE_SATELLITE_TILES as string | undefined
const SAT_ATTR = (import.meta.env.VITE_SATELLITE_ATTRIBUTION as string | undefined) ?? ''

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

function fc<G extends Geometry>(features: Feature<G>[]): FeatureCollection<G> {
  return { type: 'FeatureCollection', features }
}

/**
 * MapLibre map for the command centre: area boundary, GRTS cells, risk heatmap, patrol tracks, route, rangers, pins and APU bases.
 * HTML markers are used for points so SOS/active pulses and initials render crisply; polygons/lines/heat are GL layers.
 */
export function AreaMap(props: AreaMapProps) {
  const { className, children, interactive = true } = props
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const markers = useRef(new Map<string, maplibregl.Marker>())
  const [ready, setReady] = useState(false)
  const fittedFor = useRef<string | null>(null)
  const handlers = useRef(props)
  handlers.current = props

  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [30.95, -17.5],
      zoom: 10,
      attributionControl: { compact: true },
      interactive,
    })
    mapRef.current = map
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.on('load', () => {
      if (SAT_TILES) {
        map.addSource('satellite', { type: 'raster', tiles: [SAT_TILES], tileSize: 256, attribution: SAT_ATTR })
        map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } })
      }
      for (const id of ['boundary', 'cells', 'heat', 'tracks', 'route']) map.addSource(id, { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'heat', type: 'heatmap', source: 'heat',
        paint: {
          'heatmap-weight': ['get', 'w'],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 18, 12, 50, 15, 120],
          'heatmap-opacity': 0.5,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.25, '#27AE60', 0.6, '#E67E22', 0.9, '#C0392B'],
        },
      })
      map.addLayer({ id: 'cells-fill', type: 'fill', source: 'cells', paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'opacity'] } })
      map.addLayer({
        id: 'cells-line', type: 'line', source: 'cells',
        paint: { 'line-color': ['get', 'stroke'], 'line-width': ['case', ['boolean', ['get', 'selected'], false], 3, 1.2], 'line-opacity': ['get', 'lineOpacity'] },
      })
      map.addLayer({
        id: 'cells-label', type: 'symbol', source: 'cells', minzoom: 12,
        layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-anchor': 'top-left', 'text-offset': [0.3, 0.3], visibility: 'none' },
        paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(10,26,20,0.9)', 'text-halo-width': 1.5 },
      })
      map.addLayer({ id: 'boundary-fill', type: 'fill', source: 'boundary', paint: { 'fill-color': '#102C26', 'fill-opacity': 0.06 } })
      map.addLayer({ id: 'boundary-line', type: 'line', source: 'boundary', paint: { 'line-color': '#102C26', 'line-width': 2.5, 'line-dasharray': [3, 2] } })
      map.addLayer({ id: 'tracks', type: 'line', source: 'tracks', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['coalesce', ['get', 'color'], '#F7E7CE'], 'line-width': 3, 'line-opacity': 0.95 } })
      map.addLayer({ id: 'tracks-casing', type: 'line', source: 'tracks', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#102C26', 'line-width': 5, 'line-opacity': 0.35 } }, 'tracks')
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#52B788', 'line-width': 4, 'line-dasharray': [2, 1.5] } })

      map.on('click', 'cells-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined
        if (id && handlers.current.onCellClick) {
          e.preventDefault()
          handlers.current.onCellClick(id)
        }
      })
      map.on('click', (e: MapMouseEvent) => {
        if (e.defaultPrevented) return
        handlers.current.onMapClick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng })
      })
      map.on('mouseenter', 'cells-fill', () => {
        if (handlers.current.onCellClick) map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'cells-fill', () => {
        map.getCanvas().style.cursor = ''
      })
      setReady(true)
      handlers.current.onReady?.(map)
    })
    return () => {
      markers.current.forEach((m) => m.remove())
      markers.current.clear()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const map = ready ? mapRef.current : null

  useEffect(() => {
    if (!map) return
    ;(map.getSource('boundary') as GeoJSONSource).setData(props.boundary ? fc([{ type: 'Feature', geometry: props.boundary, properties: {} }]) : EMPTY)
  }, [map, props.boundary])

  useEffect(() => {
    if (!map) return
    const features = (props.showCells === false ? [] : props.cells ?? []).map((c) => {
      const s = CELL_STYLE[c.status] ?? CELL_STYLE.grid
      const selected = c.id === props.selectedCellId
      return {
        type: 'Feature' as const,
        geometry: c.geometry,
        properties: { id: c.id, label: c.label, stroke: s.stroke, fill: s.fill, opacity: selected ? Math.max(0.3, s.opacity) : s.opacity, lineOpacity: c.status === 'grid' ? 0.35 : 1, selected },
      }
    })
    ;(map.getSource('cells') as GeoJSONSource).setData(fc(features))
    map.setLayoutProperty('cells-label', 'visibility', props.showCellLabels ? 'visible' : 'none')
  }, [map, props.cells, props.showCells, props.selectedCellId, props.showCellLabels])

  useEffect(() => {
    if (!map) return
    const pts = props.showHeat ? props.heat ?? [] : []
    ;(map.getSource('heat') as GeoJSONSource).setData(
      fc(pts.map((p) => ({ type: 'Feature' as const, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } as Point, properties: { w: p.weight } }))),
    )
  }, [map, props.heat, props.showHeat])

  useEffect(() => {
    if (!map) return
    ;(map.getSource('tracks') as GeoJSONSource).setData(props.tracks ?? EMPTY)
  }, [map, props.tracks])

  useEffect(() => {
    if (!map) return
    const r = props.route
    ;(map.getSource('route') as GeoJSONSource).setData(
      r && r.length > 1 ? fc([{ type: 'Feature', geometry: { type: 'LineString', coordinates: r.map(([lat, lon]) => [lon, lat]) }, properties: {} }]) : EMPTY,
    )
  }, [map, props.route])

  useEffect(() => {
    if (!map) return
    if (map.getLayer('satellite')) map.setLayoutProperty('satellite', 'visibility', props.satellite ? 'visible' : 'none')
  }, [map, props.satellite])

  // Points as HTML markers.
  useEffect(() => {
    if (!map) return
    const seen = new Set<string>()
    for (const p of props.points ?? []) {
      const key = `${p.kind}:${p.id}`
      seen.add(key)
      const el = markers.current.get(key)?.getElement() ?? document.createElement('button')
      renderMarker(el, p, p.id === props.selectedPointId)
      el.onclick = (ev) => {
        ev.stopPropagation()
        handlers.current.onPointClick?.(p)
      }
      const existing = markers.current.get(key)
      if (existing) existing.setLngLat([p.lon, p.lat])
      else markers.current.set(key, new maplibregl.Marker({ element: el, anchor: p.kind === 'pin' ? 'bottom' : 'center' }).setLngLat([p.lon, p.lat]).addTo(map))
    }
    for (const [key, m] of markers.current) {
      if (!seen.has(key)) {
        m.remove()
        markers.current.delete(key)
      }
    }
  }, [map, props.points, props.selectedPointId])

  // Fit to the area (once per area/geometry) or to an explicit target.
  useEffect(() => {
    if (!map) return
    const target = props.fitTo ?? props.boundary
    if (!target) return
    const key = JSON.stringify(target).slice(0, 200) + JSON.stringify(target).length
    if (fittedFor.current === key) return
    fittedFor.current = key
    const b = bbox(target) as [number, number, number, number]
    if (b.every(Number.isFinite)) map.fitBounds(b as LngLatBoundsLike, { padding: 48, duration: 0, maxZoom: 15 })
  }, [map, props.fitTo, props.boundary])

  return (
    // Keep a caller's `absolute`/`fixed` positioning; an inline `relative` would override it and collapse the map to 0 px.
    <div className={className} style={/\b(absolute|fixed)\b/.test(className ?? '') ? undefined : { position: 'relative' }}>
      {/* Inline position: MapLibre adds .maplibregl-map { position: relative } which would otherwise collapse the container. */}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {children}
    </div>
  )
}

function renderMarker(el: HTMLElement, p: MapPoint, selected: boolean) {
  // Never reset className/cssText: MapLibre keeps its own classes and the positioning transform on this element.
  el.classList.add('piq-marker')
  el.setAttribute('aria-label', p.label ?? p.kind)
  Object.assign(el.style, { background: 'none', border: '0', padding: '0', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' })
  if (p.kind === 'ranger') {
    const ring = selected ? 'box-shadow:0 0 0 4px rgba(82,183,136,0.55),0 2px 6px rgba(0,0,0,0.3);' : 'box-shadow:0 2px 6px rgba(0,0,0,0.3);'
    const anim = p.pulse === 'sos' ? 'animation:piq-sos 0.8s infinite;' : p.pulse === 'active' ? 'animation:piq-pulse 3s infinite;' : ''
    el.innerHTML = `<span style="width:24px;height:24px;border-radius:12px;background:${p.color};border:2px ${p.dashed ? 'dashed' : 'solid'} #fff;${ring}${anim}display:flex;align-items:center;justify-content:center"><span style="width:9px;height:9px;border-radius:5px;background:rgba(255,255,255,.6)"></span></span>${
      p.label ? `<span style="margin-top:2px;font:700 10px Inter,sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.8)">${escapeHtml(p.label)}</span>` : ''
    }`
  } else if (p.kind === 'base') {
    el.innerHTML = `<span style="width:30px;height:30px;border-radius:8px;background:#102C26;border:2px solid #F7E7CE;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.45)"><span class="icon" style="font-size:18px;color:#F7E7CE">cabin</span></span>${
      p.label ? `<span style="margin-top:2px;font:700 11px Inter,sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 3px rgba(10,26,20,.95),0 1px 2px rgba(10,26,20,.95)">${escapeHtml(p.label)}</span>` : ''
    }`
  } else if (p.kind === 'observation') {
    const ring = selected ? 'box-shadow:0 0 0 4px rgba(82,183,136,0.6),0 1px 4px rgba(0,0,0,.45);' : 'box-shadow:0 1px 4px rgba(0,0,0,.45);'
    el.innerHTML = `<span style="width:20px;height:20px;border-radius:10px;background:${p.color};border:2px solid #fff;${ring}display:flex;align-items:center;justify-content:center">${
      p.icon ? `<span class="icon" style="font-size:12px;width:12px;height:12px;color:#fff">${escapeHtml(p.icon)}</span>` : ''
    }</span>`
    el.title = p.label ?? 'Observation'
  } else if (p.kind === 'collar') {
    el.innerHTML = `<span style="width:26px;height:26px;border-radius:13px;background:#F7E7CE;border:2px solid ${p.color};display:flex;align-items:center;justify-content:center"><span class="icon" style="font-size:15px;color:${p.color}">pets</span></span>`
  } else {
    const r = p.radius ?? 16
    el.innerHTML = `<svg width="${r * 2}" height="${r * 2.5}" viewBox="0 0 32 40" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))${selected ? ';transform:scale(1.15)' : ''}"><path d="M16 39C16 39 2 25 2 15.5A14 14 0 0 1 30 15.5C30 25 16 39 16 39Z" fill="${p.color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15.5" r="5" fill="#fff"/></svg>`
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Top-right vertical layer toggles (Heat / GRTS / Collars / Satellite). */
export function LayerToggles({ layers }: { layers: { key: string; icon: string; label: string; on: boolean; onToggle: () => void; disabled?: boolean; hint?: string }[] }) {
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-0.5 rounded-xl bg-forest/92 p-1 shadow-pop">
      {layers.map((l) => (
        <button
          key={l.key}
          type="button"
          onClick={l.onToggle}
          disabled={l.disabled}
          aria-pressed={l.on}
          title={l.hint ?? l.label}
          className={`flex h-13 w-13 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-semibold ${
            l.on ? 'bg-emerald/15 text-emerald shadow-[inset_0_0_0_2px_#52B788]' : 'text-cream disabled:text-cream/40'
          }`}
        >
          <Icon name={l.icon} size={20} />
          {l.label}
        </button>
      ))}
    </div>
  )
}

export function MapLegend({ items, className }: { items: { color: string; label: string; dashed?: boolean; square?: boolean }[]; className?: string }) {
  return (
    <div className={`absolute bottom-10 left-4 z-10 flex flex-col gap-1.5 rounded-lg bg-forest/92 px-3 py-2.5 text-[12px] text-cream ${className ?? ''}`}>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2">
          <span
            className={i.square ? 'h-3 w-3 rounded-[2px]' : 'h-3.5 w-3.5 rounded-full'}
            style={{ background: i.color, border: `2px ${i.dashed ? 'dashed' : 'solid'} #fff` }}
          />
          {i.label}
        </div>
      ))}
    </div>
  )
}

/** Centroid (lat, lon) of a Point geometry. */
export function pointLatLon(p?: Point | null): { lat: number; lon: number } | null {
  if (!p) return null
  return { lat: p.coordinates[1], lon: p.coordinates[0] }
}
