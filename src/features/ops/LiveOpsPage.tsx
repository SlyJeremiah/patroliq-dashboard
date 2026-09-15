// Live Operations (`/live`) — App Flow 9.1, LiveOpsMap.png.
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Map as MlMap } from 'maplibre-gl'
import { useAlerts, usePositionHistory, useRangers, useTeams } from '@/api/hooks'
import type { RangerLive, RangerStatus } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap, type MapPoint } from '@/components/map/AreaMap'
import { EmptyState, ErrorState, Icon, IconButton, Select, Spinner, TextInput, Toggle } from '@/components/ui'
import { fmt, rangerStatusColor } from '@/lib/format'
import { useSosAlarm } from './alarm'
import {
  STATUS_LABEL, alarmAlerts, filterRangers, initials, interpolateAt, isSafety, lastSeen, mergeAlerts, openSosAlerts, sortAlerts, sortRangers,
  statusCounts, toTimed, trailUntil,
} from './opsLogic'
import { RangerStatusLabel, UrgentSosBanner } from './parts'
import { RangerDetailPanel } from './RangerDetail'
import { MAP_FILL, SATELLITE_CONFIGURED, addMapControls, alertPins, rangerPoints, useAreaLayers, usePatrolTracks } from './useOpsMap'

const STATUSES: RangerStatus[] = ['active', 'paused', 'offline', 'sos']
const DAY_MS = 24 * 3600_000

interface LayerState {
  rangers: boolean
  pins: boolean
  tracks: boolean
  heat: boolean
  grts: boolean
  satellite: boolean
}

const DEFAULT_LAYERS: LayerState = { rangers: true, pins: true, tracks: true, heat: true, grts: true, satellite: false }

export function LiveOpsPage() {
  const { areaId, area } = useArea()
  const { hasModule } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const selected = params.get('ranger')

  const rangersQ = useRangers(areaId)
  const teamsQ = useTeams(areaId ?? undefined)
  const activeQ = useAlerts({ status: 'active', area_id: areaId })
  const ackQ = useAlerts({ status: 'acknowledged', area_id: areaId })
  const layersData = useAreaLayers(areaId)

  const [search, setSearch] = useState('')
  const [teamId, setTeamId] = useState('')
  const [statuses, setStatuses] = useState<RangerStatus[]>([])
  const [alertType, setAlertType] = useState<'all' | 'safety' | 'threat'>('all')
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [routeShown, setRouteShown] = useState(true)
  const mapRef = useRef<MlMap | null>(null)

  const alerts = useMemo(() => sortAlerts(mergeAlerts(ackQ.data, activeQ.data)), [activeQ.data, ackQ.data])
  const sos = useMemo(() => openSosAlerts(alerts), [alerts])
  const alarm = useSosAlarm(alarmAlerts(alerts).length > 0)

  const rangers = useMemo(() => rangersQ.data ?? [], [rangersQ.data])
  const counts = statusCounts(rangers)
  const visible = useMemo(() => sortRangers(filterRangers(rangers, { search, teamId: teamId || undefined, statuses })), [rangers, search, teamId, statuses])
  const tracks = usePatrolTracks(visible, { enabled: layers.tracks, highlightRangerId: routeShown ? selected : null })
  const replay = useReplay(selected)

  const pins = useMemo(() => (layers.pins ? alertPins(alerts.filter((a) => alertType === 'all' || (alertType === 'safety') === isSafety(a))) : []), [alerts, alertType, layers.pins])
  const points = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = [...layersData.bases, ...pins]
    if (layers.rangers) pts.push(...rangerPoints(visible))
    if (replay.position) {
      pts.push({ id: `replay-${selected}`, kind: 'ranger', lat: replay.position.lat, lon: replay.position.lon, color: '#52B788', label: `Replay ${fmt.time(new Date(replay.t!).toISOString())}` })
    }
    return pts
  }, [layersData.bases, pins, layers.rangers, visible, replay.position, replay.t, selected])

  const select = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('ranger', id)
    else next.delete('ranger')
    setParams(next, { replace: true })
    setRouteShown(true)
  }

  const focus = (r: RangerLive) => {
    select(r.id)
    const map = mapRef.current
    if (map && r.last_position) map.easeTo({ center: [r.last_position.lon, r.last_position.lat], zoom: Math.max(map.getZoom(), 13), duration: 600 })
  }

  const resetFilters = () => {
    setSearch('')
    setTeamId('')
    setStatuses([])
    setAlertType('all')
    setLayers(DEFAULT_LAYERS)
  }

  const setLayer = (k: keyof LayerState) => (v: boolean) => setLayers((l) => ({ ...l, [k]: v }))
  const selectedRanger = rangers.find((r) => r.id === selected)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Live operations{area ? ` — ${area.name}` : ''}</h1>
      <UrgentSosBanner alerts={sos} alarm={alarm} cellLabel={layersData.cellLabel} />
      <div className="flex min-h-0 flex-1">
        <AreaMap
          className={`min-w-0 flex-1 ${MAP_FILL}`}
          boundary={area?.boundary}
          cells={layersData.cells}
          showCells={hasModule('grts') && layers.grts}
          heat={layersData.heat}
          showHeat={layersData.aiRisk && layers.heat}
          tracks={layers.tracks ? tracks : undefined}
          route={replay.active ? replay.trail : undefined}
          points={points}
          selectedPointId={selected}
          satellite={layers.satellite}
          onPointClick={(p) => {
            if (p.kind === 'ranger' && !p.id.startsWith('replay-')) select(p.id)
            else if (p.kind === 'pin') navigate(`/alerts/${p.id}`)
          }}
          onReady={(m) => {
            mapRef.current = m
            addMapControls(m)
          }}
        >
          {/* Filters */}
          <div className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-120px)] w-[272px] flex-col rounded-xl bg-white shadow-pop">
            <div className="flex h-14 shrink-0 items-center gap-2 pr-1.5 pl-4">
              <Icon name="filter_alt" size={20} />
              <h2 className="flex-1 text-h3 font-semibold text-ink">Filters</h2>
              <button type="button" onClick={resetFilters} className="h-11 rounded-lg px-2 text-small font-semibold text-mid-green hover:bg-black/5">Reset</button>
              <IconButton icon={filtersOpen ? 'expand_less' : 'expand_more'} label={filtersOpen ? 'Collapse filters' : 'Expand filters'} onClick={() => setFiltersOpen((v) => !v)} />
            </div>
            {filtersOpen && (
              <div className="scroll-thin flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Ranger</span>
                  <div className="relative">
                    <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
                    <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${rangers.length} rangers`} className="!h-11 pl-9" aria-label="Search rangers" />
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Team</span>
                  <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="!h-11" aria-label="Team">
                    <option value="">All teams</option>
                    {(teamsQ.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </label>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Status</legend>
                  <div className="grid grid-cols-2 gap-1.5">
                    {STATUSES.map((s) => {
                      const on = statuses.includes(s)
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setStatuses((v) => (on ? v.filter((x) => x !== s) : [...v, s]))}
                          className={clsx('flex h-10 items-center gap-2 rounded-lg border px-2.5 text-small font-semibold', on ? 'border-forest bg-mint text-forest' : 'border-line text-ink-2 hover:bg-cream-tint')}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: rangerStatusColor[s], outline: s === 'offline' ? '1.5px dashed #6C757D' : undefined, outlineOffset: 1 }} />
                          <span className="flex-1 text-left">{STATUS_LABEL[s]}</span>
                          <span className="text-[12px] text-ink-3">{counts[s]}</span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Alert type</span>
                  <Select value={alertType} onChange={(e) => setAlertType(e.target.value as typeof alertType)} className="!h-11" aria-label="Alert type">
                    <option value="all">All alert types · {alerts.length} open</option>
                    <option value="safety">Safety (SOS) · {alerts.filter(isSafety).length}</option>
                    <option value="threat">Threats · {alerts.filter((a) => !isSafety(a)).length}</option>
                  </Select>
                </label>
                <div className="flex flex-col gap-3 border-t border-line pt-3">
                  <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Layers</span>
                  <Toggle label="Ranger positions" checked={layers.rangers} onChange={setLayer('rangers')} />
                  <Toggle label="Threat pins" checked={layers.pins} onChange={setLayer('pins')} />
                  <Toggle label="Patrol tracks" checked={layers.tracks} onChange={setLayer('tracks')} />
                  {layersData.aiRisk && <Toggle label="Risk heatmap" checked={layers.heat} onChange={setLayer('heat')} />}
                  {hasModule('grts') && <Toggle label="GRTS grid" checked={layers.grts} onChange={setLayer('grts')} />}
                  {hasModule('collars') && <Toggle label="Animal collars" description="No collar feed connected" checked={false} onChange={() => undefined} disabled />}
                  {SATELLITE_CONFIGURED && <Toggle label="Satellite imagery" checked={layers.satellite} onChange={setLayer('satellite')} />}
                </div>
              </div>
            )}
          </div>

          {/* Status counts */}
          <div className="absolute top-4 left-1/2 z-10 ml-[68px] flex h-10 -translate-x-1/2 items-center gap-4 rounded-full bg-forest/92 px-4 text-[13px] font-semibold text-cream shadow-pop" aria-label="Ranger status counts">
            {STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="h-3 w-3 rounded-full" style={{ background: rangerStatusColor[s], border: `2px ${s === 'offline' ? 'dashed' : 'solid'} #fff` }} />
                {STATUS_LABEL[s]} {counts[s]}
              </span>
            ))}
          </div>

          {selectedRanger && <ReplayBar replay={replay} ranger={selectedRanger} />}
        </AreaMap>

        {selected ? (
          <RangerDetailPanel
            key={selected}
            rangerId={selected}
            areaId={areaId}
            onClose={() => select(null)}
            routeShown={routeShown}
            onToggleRoute={() => setRouteShown((v) => !v)}
          />
        ) : (
          <aside aria-label="Rangers" className="flex w-[360px] shrink-0 flex-col border-l border-line bg-white">
            <header className="flex h-14 shrink-0 items-center gap-2.5 bg-forest px-5 text-cream">
              <Icon name="badge" size={22} />
              <h2 className="flex-1 text-h3 font-semibold">Rangers ({visible.length}{visible.length !== rangers.length ? ` of ${rangers.length}` : ''})</h2>
            </header>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              {rangersQ.isLoading ? (
                <div className="flex justify-center py-10 text-forest"><Spinner size={22} /></div>
              ) : rangersQ.error ? (
                <div className="p-4"><ErrorState error={rangersQ.error} onRetry={() => void rangersQ.refetch()} /></div>
              ) : visible.length === 0 ? (
                <EmptyState icon="person_off" title={rangers.length ? 'No rangers match the filters' : 'No rangers in this area'} text={rangers.length ? undefined : 'Assign rangers to a team in this area to track them here.'} />
              ) : (
                <ul>
                  {visible.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => focus(r)} className="flex min-h-[64px] w-full items-center gap-3 border-b border-line-soft px-5 py-2 text-left hover:bg-cream-tint">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white" style={{ background: rangerStatusColor[r.status], outline: r.status === 'offline' ? '2px dashed #ADB5BD' : undefined, outlineOffset: 2 }}>
                          {initials(r.full_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-ink">{r.full_name}</span>
                          <span className="block truncate text-[12px] text-ink-3">{[r.team_name, r.apu_base_code].filter(Boolean).join(' · ') || 'No team'}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <RangerStatusLabel status={r.status} className="!text-[12px]" />
                          <span className="text-[11px] whitespace-nowrap text-ink-3">{lastSeen(r) ? `${r.last_position ? 'Seen' : 'Synced'} ${fmt.ago(lastSeen(r))}` : 'Never seen'}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ 24 h replay

function useReplay(rangerId: string | null) {
  const history = usePositionHistory({ ranger_id: rangerId ?? undefined })
  const points = useMemo(() => toTimed(history.data ?? []), [history.data])
  const end = history.dataUpdatedAt || Date.now()
  const start = end - DAY_MS
  const [t, setT] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setT(null)
    setPlaying(false)
  }, [rangerId])

  useEffect(() => {
    if (!playing || !points.length) return
    const first = points[0]!.t
    const last = points[points.length - 1]!.t
    const step = Math.max(30_000, (last - first) / 150)
    const timer = setInterval(() => {
      setT((cur) => {
        const next = (cur ?? first) + step
        if (next >= last) {
          setPlaying(false)
          return last
        }
        return next
      })
    }, 120)
    return () => clearInterval(timer)
  }, [playing, points])

  const active = t !== null && points.length > 0
  const position = active ? interpolateAt(points, t) : null
  return {
    loading: history.isLoading,
    error: history.error,
    points,
    start,
    end,
    t,
    active,
    playing,
    position: position && position.index >= 0 ? position : null,
    trail: active ? trailUntil(points, t) : undefined,
    play: () => {
      if (!points.length) return
      const last = points[points.length - 1]!.t
      if (t === null || t >= last || t < points[0]!.t) setT(points[0]!.t)
      setPlaying(true)
    },
    pause: () => setPlaying(false),
    scrub: (v: number) => {
      setPlaying(false)
      setT(v)
    },
    live: () => {
      setPlaying(false)
      setT(null)
    },
  }
}

type Replay = ReturnType<typeof useReplay>

function ReplayBar({ replay, ranger }: { replay: Replay; ranger: RangerLive }) {
  const { start, end, points } = replay
  const ticks = Array.from({ length: 9 }, (_, i) => start + (i * DAY_MS) / 8)
  const shown = replay.t ?? end
  const pct = (v: number) => `${((v - start) / (end - start)) * 100}%`
  const covered = points.length ? { left: pct(points[0]!.t), width: `calc(${pct(points[points.length - 1]!.t)} - ${pct(points[0]!.t)})` } : null
  return (
    <div className="absolute right-4 bottom-4 left-4 z-10 mr-14 flex h-[76px] items-center gap-4 rounded-xl bg-forest/95 px-4 text-cream shadow-pop">
      <button
        type="button"
        onClick={replay.playing ? replay.pause : replay.play}
        disabled={!points.length}
        aria-label={replay.playing ? 'Pause replay' : 'Play 24 hour replay'}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream text-forest disabled:opacity-40"
      >
        <Icon name={replay.playing ? 'pause' : 'play_arrow'} size={28} fill />
      </button>
      <div className="w-[120px] shrink-0 leading-tight">
        <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-cream/65">Replay · 24 h</p>
        <p className="font-mono text-[22px] font-medium" aria-live="polite">{replay.active ? fmt.time(new Date(shown).toISOString()) : 'Live'}</p>
        <p className="truncate text-[11px] text-cream/65">{replay.active ? fmt.dayTime(new Date(shown).toISOString()).replace(/, \d\d:\d\d$/, '') : ranger.full_name}</p>
      </div>
      <div className="relative min-w-0 flex-1">
        {replay.loading ? (
          <p className="flex items-center gap-2 text-small text-cream/80"><Spinner size={14} /> Loading position history</p>
        ) : replay.error ? (
          <p className="text-small text-cream/80">Position history did not load.</p>
        ) : !points.length ? (
          <p className="text-small text-cream/80">No GPS positions from {ranger.full_name} in the last 24 hours.</p>
        ) : (
          <>
            <div className="relative h-5">
              <div className="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded-full bg-cream/15" />
              {covered && <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-emerald/70" style={covered} />}
              <input
                type="range"
                min={start}
                max={end}
                step={60_000}
                value={shown}
                onChange={(e) => replay.scrub(Number(e.target.value))}
                aria-label="Replay time"
                aria-valuetext={fmt.dayTime(new Date(shown).toISOString())}
                className="piq-range absolute inset-0 w-full cursor-pointer appearance-none bg-transparent"
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] text-cream/60" aria-hidden>
              {ticks.map((tk) => <span key={tk}>{fmt.time(new Date(tk).toISOString())}</span>)}
            </div>
            <style>{`
              .piq-range::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:10px;background:#F7E7CE;border:3px solid #52B788;box-shadow:0 0 0 4px rgba(82,183,136,.3)}
              .piq-range::-moz-range-thumb{width:16px;height:16px;border-radius:10px;background:#F7E7CE;border:3px solid #52B788}
              .piq-range:focus-visible{outline:2px solid #52B788;outline-offset:4px;border-radius:8px}
            `}</style>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={replay.live}
        aria-pressed={!replay.active}
        className={clsx('flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-[14px] font-bold', replay.active ? 'border-cream/30 text-cream hover:bg-cream/10' : 'border-emerald text-cream')}
      >
        <span className="h-2 w-2 rounded-full bg-success" />
        NOW {fmt.time(new Date(end).toISOString())}
      </button>
    </div>
  )
}
