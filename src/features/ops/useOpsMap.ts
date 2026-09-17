// Map layer builders shared by the Command Dashboard, Live Operations and SOS panel.
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Feature, FeatureCollection, LineString } from 'geojson'
import maplibregl, { type Map as MlMap } from 'maplibre-gl'
import { api } from '@/api/client'
import { LIVE_REFRESH_MS, qk, useApuBases, useAreaRisk, useCells, useObservations } from '@/api/hooks'
import type { AlertItem, Observation, RangerLive, TrackFeature } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import type { HeatPoint, MapCell, MapPoint } from '@/components/map/AreaMap'
import { pointLatLon } from '@/components/map/AreaMap'
import { severityColor } from '@/components/ui'
import { rangerStatusColor } from '@/lib/format'
import { alertTitle, initials, isSafety, observationCategoryCounts, observationKey, observationPoints, observationSince, trackCandidates, type ObservationPeriod } from './opsLogic'

/**
 * Local workaround: maplibre-gl.css (unlayered) sets `.maplibregl-map{position:relative}`, which beats Tailwind's layered
 * `absolute inset-0` on AreaMap's inner container and collapses the map to 0 px height. Also, AreaMap's renderMarker replaces
 * the marker element's className on every update (dropping `.maplibregl-marker{position:absolute;top:0;left:0}`), so
 * markers fall into normal flow and drift after the first refresh. Add to AreaMap's className.
 */
export const MAP_FILL = '[&>.maplibregl-map]:!absolute [&_.piq-marker]:!absolute [&_.piq-marker]:top-0 [&_.piq-marker]:left-0'

export const SATELLITE_CONFIGURED = !!(import.meta.env.VITE_SATELLITE_TILES as string | undefined)

/** Zoom buttons like the designs (bottom-right). Pass as AreaMap `onReady`. */
export function addMapControls(map: MlMap) {
  if (map.getContainer().querySelector('.maplibregl-ctrl-zoom-in')) return
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
}

/** GRTS grid cells (risk-tinted when high/critical), risk heatmap points, APU base markers, cell label lookup. */
export function useAreaLayers(areaId: string | null) {
  const { hasModule } = useAuth()
  const aiRisk = hasModule('ai_risk')
  const cellsQ = useCells(areaId)
  const riskQ = useAreaRisk(aiRisk ? areaId : null)
  const basesQ = useApuBases(areaId ?? undefined)

  return useMemo(() => {
    const riskById = new Map((riskQ.data?.cells ?? []).map((c) => [c.cell_id, c]))
    const labelById = new Map<string, string>()
    const cells: MapCell[] = (cellsQ.data?.features ?? []).map((f) => {
      const id = (f.properties?.id ?? f.id) as string
      labelById.set(id, f.properties.label)
      const level = riskById.get(id)?.level
      return { id, label: f.properties.label, geometry: f.geometry, status: level === 'high' || level === 'critical' ? level : 'grid' }
    })
    const heat: HeatPoint[] = (riskQ.data?.cells ?? []).flatMap((c) => {
      const p = pointLatLon(c.centroid)
      return p ? [{ ...p, weight: Math.max(0, Math.min(1, c.score / 10)) }] : []
    })
    const bases: MapPoint[] = (basesQ.data ?? []).flatMap((b) => {
      const p = pointLatLon(b.location)
      return p ? [{ id: b.id, kind: 'base' as const, color: '#102C26', label: b.code, ...p }] : []
    })
    return {
      cells,
      heat,
      bases,
      aiRisk,
      riskCount: { high: (riskQ.data?.cells ?? []).filter((c) => c.level === 'high').length, critical: (riskQ.data?.cells ?? []).filter((c) => c.level === 'critical').length },
      cellLabel: (id?: string | null) => (id ? labelById.get(id) : undefined),
      loading: cellsQ.isLoading,
    }
  }, [cellsQ.data, cellsQ.isLoading, riskQ.data, basesQ.data, aiRisk])
}

export function rangerPoints(rangers: readonly RangerLive[], opts: { dimOthers?: string | null } = {}): MapPoint[] {
  return rangers.flatMap((r) => {
    if (!r.last_position) return []
    return [{
      id: r.id,
      kind: 'ranger' as const,
      lat: r.last_position.lat,
      lon: r.last_position.lon,
      color: opts.dimOthers && opts.dimOthers !== r.id ? '#6C757D' : rangerStatusColor[r.status] ?? '#6C757D',
      label: initials(r.full_name),
      pulse: r.status === 'sos' ? ('sos' as const) : r.status === 'active' ? ('active' as const) : undefined,
      dashed: r.status === 'offline',
    }]
  })
}

export function alertPins(alerts: readonly AlertItem[]): MapPoint[] {
  return alerts.flatMap((a) =>
    a.lat == null || a.lon == null
      ? []
      : [{ id: a.id, kind: 'pin' as const, lat: a.lat, lon: a.lon, color: isSafety(a) ? '#C0392B' : severityColor[a.severity], label: `${alertTitle(a)}, ${a.severity}`, radius: a.severity === 'critical' ? 17 : 14 }],
  )
}

/** Cap on observation markers drawn at once (HTML markers). */
export const OBSERVATION_LIMIT = 500

/** Observations layer for the selected area and period (polled every 30 s while enabled). */
export function useObservationLayer(areaId: string | null, opts: { enabled: boolean; period: ObservationPeriod }) {
  const since = observationSince(opts.period)
  const q = useObservations({ area_id: areaId, since, limit: OBSERVATION_LIMIT }, { enabled: opts.enabled && !!areaId })
  const data = opts.enabled ? q.data : undefined
  return useMemo(() => {
    const observations: Observation[] = data ?? []
    const byKey = new Map(observations.map((o) => [observationKey(o), o]))
    return {
      observations,
      points: observationPoints(observations),
      categories: observationCategoryCounts(observations),
      find: (key?: string | null) => (key ? byKey.get(key) : undefined),
      loading: opts.enabled && q.isLoading,
      error: opts.enabled ? q.error : null,
      truncated: observations.length >= OBSERVATION_LIMIT,
    }
  }, [data, opts.enabled, q.isLoading, q.error])
}

/** Current-patrol tracks for up to `cap` rangers (SOS/active first). Tracks without geometry are skipped. */
export function usePatrolTracks(rangers: readonly RangerLive[] | undefined, opts: { cap?: number; enabled?: boolean; highlightRangerId?: string | null } = {}) {
  const { cap = 15, enabled = true, highlightRangerId } = opts
  const ids = useMemo(() => (enabled ? trackCandidates(rangers ?? [], cap) : []), [rangers, cap, enabled])
  const results = useQueries({
    queries: ids.map((uuid) => ({
      queryKey: qk.track(uuid),
      queryFn: () => api.get<TrackFeature>(`patrols/${uuid}/track/`),
      refetchInterval: LIVE_REFRESH_MS,
      staleTime: 20_000,
    })),
  })
  const datas = results.map((r) => r.data)
  const key = datas.map((d) => (d ? `${d.properties?.ranger_id}:${d.properties?.distance_m}:${d.geometry?.coordinates?.length ?? 0}` : '-')).join('|')
  return useMemo<FeatureCollection<LineString>>(() => {
    const features: Feature<LineString>[] = []
    for (const d of datas) {
      if (!d?.geometry || d.geometry.coordinates.length < 2) continue
      const highlighted = highlightRangerId && d.properties.ranger_id === highlightRangerId
      features.push({ type: 'Feature', geometry: d.geometry, properties: { ranger_id: d.properties.ranger_id, color: highlighted ? '#52B788' : '#F7E7CE' } })
    }
    return { type: 'FeatureCollection', features }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, highlightRangerId])
}
