// Command Dashboard (`/`) — Design Doc 8.3, CommandDashboard.png.
import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAlerts, useRangers, useSummary, useTeams } from '@/api/hooks'
import type { AlertItem, RangerStatus } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap, LayerToggles, MapLegend, type MapPoint } from '@/components/map/AreaMap'
import { EmptyState, ErrorState, Icon, IconButton, Spinner, StatsRow } from '@/components/ui'
import { fmt, rangerStatusColor } from '@/lib/format'
import { useSosAlarm } from './alarm'
import { alarmAlerts, chipCounts, isSafety, matchesChip, mergeAlerts, openSosAlerts, sortAlerts, statusCounts, type AlertChip } from './opsLogic'
import { AlertCard, ChipMenu, UrgentSosBanner, useAcknowledge } from './parts'
import { RangerDetailPanel } from './RangerDetail'
import { MAP_FILL, SATELLITE_CONFIGURED, addMapControls, alertPins, rangerPoints, useAreaLayers, usePatrolTracks } from './useOpsMap'

export function CommandDashboardPage() {
  const { areaId, area, loading: areaLoading } = useArea()
  const { hasModule } = useAuth()
  const navigate = useNavigate()

  const summary = useSummary(areaId)
  const rangersQ = useRangers(areaId)
  const teamsQ = useTeams(areaId ?? undefined)
  const activeQ = useAlerts({ status: 'active', area_id: areaId })
  const ackQ = useAlerts({ status: 'acknowledged', area_id: areaId })
  const layers = useAreaLayers(areaId)

  const [rangerFilter, setRangerFilter] = useState<'all' | RangerStatus>('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [alertTypeFilter, setAlertTypeFilter] = useState<'all' | 'safety' | 'threat' | 'none'>('all')
  const [heat, setHeat] = useState(true)
  const [grts, setGrts] = useState(true)
  const [satellite, setSatellite] = useState(false)
  const [chip, setChip] = useState<AlertChip>('all')
  const [panelOpen, setPanelOpen] = useState(true)
  const [selectedRanger, setSelectedRanger] = useState<string | null>(null)
  const [routeFor, setRouteFor] = useState<string | null>(null)
  const { acknowledge, pendingId, error: ackError, clearError } = useAcknowledge()

  const alerts = useMemo(() => sortAlerts(mergeAlerts(ackQ.data, activeQ.data)), [activeQ.data, ackQ.data])
  const sos = useMemo(() => openSosAlerts(alerts), [alerts])
  const alarm = useSosAlarm(alarmAlerts(alerts).length > 0)
  const unacknowledged = alerts.filter((a) => a.status === 'active').length

  const rangers = useMemo(() => rangersQ.data ?? [], [rangersQ.data])
  const visibleRangers = useMemo(
    () => rangers.filter((r) => (rangerFilter === 'all' || r.status === rangerFilter) && (teamFilter === 'all' || r.team_id === teamFilter)),
    [rangers, rangerFilter, teamFilter],
  )
  const counts = statusCounts(rangers)
  const tracks = usePatrolTracks(visibleRangers, { highlightRangerId: routeFor })

  const mapAlerts = useMemo(
    () => alerts.filter((a) => alertTypeFilter !== 'none' && (alertTypeFilter === 'all' || (alertTypeFilter === 'safety') === isSafety(a))),
    [alerts, alertTypeFilter],
  )
  const points = useMemo<MapPoint[]>(
    () => [...layers.bases, ...alertPins(mapAlerts), ...rangerPoints(visibleRangers)],
    [layers.bases, mapAlerts, visibleRangers],
  )
  const panelAlerts = alerts.filter((a) => matchesChip(a, chip))
  const cc = chipCounts(alerts)

  const onPoint = (p: MapPoint) => {
    if (p.kind === 'ranger') {
      setSelectedRanger(p.id)
      setRouteFor(null)
    } else if (p.kind === 'pin') navigate(`/alerts/${p.id}`)
  }

  if (!areaLoading && !areaId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState icon="fence" title="No conservation area yet" text="Set up an area with a boundary, APU bases and a GRTS grid to see live operations." action={<Link className="font-semibold text-mid-green underline" to="/areas">Go to Areas & bases</Link>} />
      </div>
    )
  }

  const s = summary.data
  const grtsModule = hasModule('grts')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Command Dashboard{area ? ` — ${area.name}` : ''}</h1>
      <UrgentSosBanner alerts={sos} alarm={alarm} cellLabel={layers.cellLabel} />
      <StatsRow
        items={[
          { label: 'Active rangers', value: s ? s.rangers_active : '—', sub: s ? `of ${s.rangers_total} rangers` : undefined },
          { label: 'Open alerts', value: s ? s.open_alerts : '—', sub: s ? `${s.critical_alerts} critical` : undefined, tone: s && s.critical_alerts > 0 ? 'danger' : 'default' },
          { label: 'Sync rate', value: s ? fmt.pct(s.sync_rate_24h) : '—', sub: 'last 24 h' },
          ...(grtsModule ? [{ label: 'GRTS coverage', value: s ? fmt.pct(s.grts_coverage_month) : '—', sub: 'this month' }] : []),
        ]}
      />
      {summary.error && <div className="px-4 pt-2"><ErrorState error={summary.error} onRetry={() => void summary.refetch()} /></div>}
      <div className="flex min-h-0 flex-1">
        <AreaMap
          className={`min-w-0 flex-1 ${MAP_FILL}`}
          boundary={area?.boundary}
          cells={layers.cells}
          showCells={grtsModule && grts}
          heat={layers.heat}
          showHeat={layers.aiRisk && heat}
          tracks={tracks}
          points={points}
          selectedPointId={selectedRanger}
          satellite={satellite}
          onPointClick={onPoint}
          onReady={addMapControls}
        >
          <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 pr-24">
            <ChipMenu
              dark
              icon="group"
              label="Rangers"
              value={rangerFilter}
              onChange={(v) => setRangerFilter(v as typeof rangerFilter)}
              options={[
                { value: 'all', label: `All rangers · ${counts.total}` },
                { value: 'active', label: `Active · ${counts.active}` },
                { value: 'paused', label: `Paused · ${counts.paused}` },
                { value: 'offline', label: `Offline · ${counts.offline}` },
                { value: 'sos', label: `SOS · ${counts.sos}` },
              ]}
            />
            <ChipMenu
              dark
              icon="groups"
              label="Team"
              value={teamFilter}
              onChange={setTeamFilter}
              options={[{ value: 'all', label: 'All teams' }, ...(teamsQ.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
            />
            <ChipMenu
              dark
              icon="filter_alt"
              label="Alert type"
              value={alertTypeFilter}
              onChange={(v) => setAlertTypeFilter(v as typeof alertTypeFilter)}
              options={[
                { value: 'all', label: 'Alert type · all' },
                { value: 'safety', label: 'Safety (SOS) only' },
                { value: 'threat', label: 'Threats only' },
                { value: 'none', label: 'Hide alert pins' },
              ]}
            />
          </div>
          <LayerToggles
            layers={[
              ...(layers.aiRisk ? [{ key: 'heat', icon: 'local_fire_department', label: 'Heat', on: heat, onToggle: () => setHeat((v) => !v) }] : []),
              ...(grtsModule ? [{ key: 'grts', icon: 'grid_on', label: 'GRTS', on: grts, onToggle: () => setGrts((v) => !v) }] : []),
              ...(hasModule('collars') ? [{ key: 'collars', icon: 'pets', label: 'Collars', on: false, onToggle: () => undefined, disabled: true, hint: 'No collar feed connected' }] : []),
              ...(SATELLITE_CONFIGURED ? [{ key: 'sat', icon: 'satellite_alt', label: 'Sat', on: satellite, onToggle: () => setSatellite((v) => !v) }] : []),
            ]}
          />
          <MapLegend
            items={[
              { color: rangerStatusColor.active, label: `Active · ${counts.active}` },
              { color: rangerStatusColor.paused, label: `Paused · ${counts.paused}` },
              { color: rangerStatusColor.offline, label: `Offline · ${counts.offline}`, dashed: true },
              { color: rangerStatusColor.sos, label: `SOS · ${counts.sos}` },
              ...(grtsModule && grts && layers.aiRisk && layers.riskCount.high + layers.riskCount.critical > 0
                ? [{ color: '#C0392B', label: `High-risk cells · ${layers.riskCount.high + layers.riskCount.critical}`, square: true }]
                : []),
            ]}
          />
          {rangersQ.isLoading && (
            <div className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-forest/92 px-4 py-2 text-small text-cream">
              <Spinner size={14} /> Loading ranger positions
            </div>
          )}
          {!rangersQ.isLoading && rangers.length > 0 && !rangers.some((r) => r.last_position) && (
            <div className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-full bg-forest/92 px-4 py-2 text-small text-cream">No ranger has sent a position yet</div>
          )}
          {!panelOpen && !selectedRanger && (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="absolute top-[300px] right-4 z-10 flex h-11 items-center gap-2 rounded-full bg-white px-4 text-small font-semibold text-ink shadow-pop"
            >
              <Icon name="notifications" size={18} />
              Active alerts ({alerts.length})
              {unacknowledged > 0 && <span className="rounded-full bg-danger px-2 text-[11px] font-bold text-white">{unacknowledged} new</span>}
            </button>
          )}
        </AreaMap>

        {selectedRanger ? (
          <RangerDetailPanel
            rangerId={selectedRanger}
            areaId={areaId}
            onClose={() => {
              setSelectedRanger(null)
              setRouteFor(null)
            }}
            routeShown={routeFor === selectedRanger}
            onToggleRoute={() => setRouteFor((v) => (v === selectedRanger ? null : selectedRanger))}
          />
        ) : (
          panelOpen && (
            <aside aria-label="Active alerts" className="flex w-[360px] shrink-0 flex-col border-l border-line bg-canvas">
              <header className="flex h-14 shrink-0 items-center gap-2.5 bg-forest pr-2 pl-5 text-cream">
                <Icon name="notifications" size={22} />
                <h2 className="flex-1 text-h3 font-semibold">Active alerts ({alerts.length})</h2>
                {unacknowledged > 0 && <span className="rounded-full bg-danger px-2.5 py-0.5 text-[12px] font-bold text-white">{unacknowledged} new</span>}
                <IconButton icon="close" label="Hide alerts panel" onClick={() => setPanelOpen(false)} className="text-cream hover:bg-cream/10" />
              </header>
              <div className="grid shrink-0 grid-cols-[0.8fr_1.1fr_0.9fr_1fr] gap-1.5 px-4 pt-3 pb-2.5" role="group" aria-label="Filter alerts">
                {(
                  [
                    ['all', 'All'],
                    ['critical', 'Critical'],
                    ['high', 'High'],
                    ['safety', 'Safety'],
                  ] as [AlertChip, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={chip === k}
                    onClick={() => setChip(k)}
                    className={clsx(
                      'inline-flex h-11 items-center justify-center gap-1 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors',
                      chip === k ? 'border-forest bg-forest text-cream' : 'border-[#DDD5C5] bg-white text-ink-2 hover:bg-mint',
                    )}
                  >
                    {label} · {cc[k]}
                  </button>
                ))}
              </div>
              {ackError && (
                <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2 text-small text-[#8a2a20]">
                  <Icon name="error" size={18} />
                  <span className="flex-1">{ackError}</span>
                  <button type="button" onClick={clearError} aria-label="Dismiss" className="text-[#8a2a20]"><Icon name="close" size={16} /></button>
                </div>
              )}
              <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-4">
                {activeQ.isLoading ? (
                  <AlertSkeleton />
                ) : activeQ.error ? (
                  <ErrorState error={activeQ.error} onRetry={() => void activeQ.refetch()} />
                ) : panelAlerts.length === 0 ? (
                  <EmptyState icon="verified_user" title={alerts.length ? 'No alerts match this filter' : 'No open alerts'} text={alerts.length ? undefined : 'Threat reports and SOS alerts from rangers appear here as soon as they sync.'} />
                ) : (
                  panelAlerts.map((a: AlertItem) => (
                    <AlertCard key={a.id} alert={a} cellLabel={layers.cellLabel(a.cell_id)} onAcknowledge={() => acknowledge(a.id)} acknowledging={pendingId === a.id} />
                  ))
                )}
                <Link to="/alerts" className={clsx('mt-1 inline-flex h-11 items-center justify-center gap-1 rounded-lg text-small font-semibold text-mid-green hover:bg-black/5')}>
                  All alerts and history
                  <Icon name="arrow_forward" size={16} />
                </Link>
              </div>
            </aside>
          )
        )}
      </div>
    </div>
  )
}

function AlertSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[112px] animate-pulse rounded-lg bg-white/70" />
      ))}
    </>
  )
}
