import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import maplibregl, { type Map as MlMap } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAlerts, useAreaRisk, useCells, useRiskTrend, useSectors, useSummary } from '@/api/hooks'
import type { AlertItem } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap, type HeatPoint, type MapCell } from '@/components/map/AreaMap'
import { EmptyState, Icon, Panel, Select, SeverityBadge, severityColor } from '@/components/ui'
import { fmt, todayIso } from '@/lib/format'
import {
  alertTitle, confidenceInfo, feedAlerts, previousDayCells, rankRiskCells, riskOverview, shiftDate, trendRows, type RankedCell,
} from './intelLogic'
import { Delta, QueryProblem, RiskLevelLegend, Skeleton, StatBlock } from './intelParts'
import { RiskCellDrawer } from './RiskCellDrawer'
import { RiskTrendChart } from './RiskTrendChart'

export function IntelligencePage() {
  const { hasModule } = useAuth()
  const { area, areaId, loading } = useArea()
  if (!hasModule('ai_risk')) {
    return <EmptyState icon="extension_off" title="AI risk intelligence is not enabled" text="The ai_risk module is not part of your organisation's licence. Contact zrGISsolutions to enable it." />
  }
  if (!areaId || !area) {
    return loading ? <PageSkeleton /> : <EmptyState icon="fence" title="No conservation area yet" text="Risk scores appear once an area has a boundary and a GRTS grid." />
  }
  return <Intelligence key={areaId} areaId={areaId} />
}

function PageSkeleton() {
  return (
    <div className="grid flex-1 grid-cols-3 gap-4 p-6">
      <Skeleton className="h-96" />
      <Skeleton className="h-96" />
      <Skeleton className="h-96" />
    </div>
  )
}

function Intelligence({ areaId }: { areaId: string }) {
  const { area } = useArea()
  const { hasRole } = useAuth()
  const isManager = hasRole('org_admin', 'manager')
  const [params, setParams] = useSearchParams()
  const today = todayIso()
  const date = params.get('date') || today
  const sectorId = params.get('sector') || ''
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const risk = useAreaRisk(areaId, date === today ? undefined : date)
  const prevRisk = useAreaRisk(risk.data ? areaId : null, risk.data ? shiftDate(risk.data.date, -1) : undefined)
  const trend = useRiskTrend(areaId, 30)
  const cells = useCells(areaId)
  const sectors = useSectors(areaId)
  const summary = useSummary(isManager ? areaId : undefined)

  // Selected cell lives in the URL (?cell=) so a view can be shared or reopened.
  const selectedId = params.get('cell')
  const setSelectedId = useCallback(
    (id: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('cell', id)
          else next.delete('cell')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const [heat, setHeat] = useState(true)
  const [showCells, setShowCells] = useState(true)
  const [map, setMap] = useState<MlMap | null>(null)

  const riskCells = useMemo(() => risk.data?.cells ?? [], [risk.data])
  const prevCells = previousDayCells(risk.data, prevRisk.data)
  const ranked = useMemo(() => rankRiskCells(riskCells, prevCells, { sectorId }), [riskCells, prevCells, sectorId])
  const overview = useMemo(() => riskOverview(riskCells, prevCells, sectorId), [riskCells, prevCells, sectorId])
  const sectorName = (id?: string | null) => sectors.data?.find((s) => s.id === id)?.name

  const byId = useMemo(() => new Map(riskCells.map((c) => [c.cell_id, c])), [riskCells])
  const mapCells = useMemo<MapCell[]>(
    () =>
      (cells.data?.features ?? [])
        .filter((f) => !sectorId || f.properties.sector_id === sectorId)
        .map((f) => ({ id: f.properties.id, label: f.properties.label, geometry: f.geometry, status: byId.get(f.properties.id)?.level ?? 'none' })),
    [cells.data, byId, sectorId],
  )
  const heatPoints = useMemo<HeatPoint[]>(
    () => riskCells.filter((c) => !sectorId || c.sector_id === sectorId).map((c) => ({ lon: c.centroid.coordinates[0], lat: c.centroid.coordinates[1], weight: c.score / 10 })),
    [riskCells, sectorId],
  )
  useRankMarkers(map, ranked, setSelectedId)

  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const prevById = useMemo(() => new Map((prevCells ?? []).map((c) => [c.cell_id, c.score])), [prevCells])
  const selectedDelta = selected && prevById.has(selected.cell_id) ? selected.score - prevById.get(selected.cell_id)! : null

  const scoredNote = risk.data
    ? risk.data.cells.length === 0
      ? 'No risk scores for this area yet'
      : `Scores for ${fmt.date(risk.data.date)}${risk.data.date !== date ? ` (latest before ${fmt.date(date)})` : ''} · ${risk.data.engine === 'ml' ? 'ML model' : 'heuristic engine'}`
    : null

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
        <h1 className="sr-only">Intelligence</h1>
        <DateFilter value={date} max={today} onChange={(v) => setParam('date', v === today ? '' : v)} />
        <div className="w-60">
          <Select aria-label="Sector" value={sectorId} onChange={(e) => setParam('sector', e.target.value)} className="h-11">
            <option value="">All sectors</option>
            {(sectors.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex-1" />
        {scoredNote && (
          <p className="flex items-center gap-1.5 text-small text-ink-3">
            <Icon name="published_with_changes" size={16} className="text-mid-green" />
            {scoredNote}
            {summary.data?.last_ranger_sync_at && <> · last ranger sync {fmt.dayTime(summary.data.last_ranger_sync_at)}</>}
          </p>
        )}
      </div>

      {risk.isError ? (
        <div className="px-6"><QueryProblem error={risk.error} onRetry={() => void risk.refetch()} what="AI risk intelligence" /></div>
      ) : (
        <div className="grid grid-cols-[minmax(340px,400px)_minmax(0,1fr)_minmax(290px,330px)] gap-4 px-6 pb-6">
          {/* Map */}
          <Panel title="Reserve risk map" actions={<span className="text-small text-ink-3">{overview.cells} GRTS cells</span>}>
            <div className="relative h-[228px] overflow-hidden rounded-lg bg-[#DCE3D5]">
              <AreaMap
                className="absolute inset-0"
                boundary={area?.boundary}
                cells={mapCells}
                showCells={showCells}
                heat={heatPoints}
                showHeat={heat}
                selectedCellId={selectedId}
                onCellClick={setSelectedId}
                onReady={setMap}
              />
              <div className="absolute top-2 right-2 z-10 flex gap-1 rounded-lg bg-forest/90 p-1">
                <MapToggle on={heat} onClick={() => setHeat((v) => !v)} icon="local_fire_department" label="Heat" />
                <MapToggle on={showCells} onClick={() => setShowCells((v) => !v)} icon="grid_on" label="Cells" />
              </div>
              {risk.isLoading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40"><Skeleton className="h-8 w-40" /></div>}
            </div>
            <RiskLevelLegend className="mt-3" />
            <div className="mt-3 flex gap-8 border-t border-line pt-2.5">
              <StatBlock
                value={overview.elevated}
                tone={overview.byLevel.critical > 0 ? 'danger' : 'default'}
                label={`high or critical · ${overview.byLevel.critical} critical`}
                sub={<Delta value={overview.elevatedDelta} digits={0} suffix=" vs previous day" />}
              />
              <StatBlock value={overview.mean?.toFixed(1) ?? '—'} label="mean cell score" sub={<Delta value={overview.meanDelta} suffix=" vs previous day" />} />
            </div>
          </Panel>

          {/* Top 5 */}
          <Panel title="Top 5 high-risk cells" actions={<span className="flex items-center gap-1 text-small text-ink-3"><Icon name="compare_arrows" size={16} />vs previous day</span>}>
            {risk.isLoading ? (
              <div className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : ranked.length === 0 ? (
              <EmptyState icon="grid_off" title="No scored cells" text={sectorId ? 'No cells in this sector have a score for this date.' : 'The risk engine has not scored this area for this date.'} />
            ) : (
              <ol className="flex flex-col gap-1.5">
                {ranked.map((r) => <TopCell key={r.cell.cell_id} item={r} selected={r.cell.cell_id === selectedId} onOpen={() => setSelectedId(r.cell.cell_id)} />)}
              </ol>
            )}
          </Panel>

          {/* Right column */}
          <div className="row-span-2 flex min-w-0 flex-col gap-4">
            <ConfidenceCard engine={risk.data?.engine} confidence={risk.data?.model_confidence} loading={risk.isLoading} />
            {isManager ? (
              <AlertFeed areaId={areaId} cellLabel={(id) => (id ? byId.get(id)?.label : undefined)} sectorCells={sectorId ? new Set(riskCells.filter((c) => c.sector_id === sectorId).map((c) => c.cell_id)) : null} />
            ) : (
              <Panel title="Alert feed">
                <p className="text-small text-ink-3">Alerts are shared with managers and administrators only. Risk scores on this page are read-only.</p>
              </Panel>
            )}
          </div>

          {/* Trend */}
          <Panel className="col-span-2" title="Risk trend · past 30 days" actions={<span className="text-small text-ink-3">Daily score, 0–10</span>}>
            <div className="h-[184px]">
              {trend.isLoading ? (
                <Skeleton className="h-full" />
              ) : trend.isError ? (
                <QueryProblem error={trend.error} onRetry={() => void trend.refetch()} what="Risk trend" />
              ) : trend.data && trend.data.some((p) => p.mean_score !== null) ? (
                <RiskTrendChart rows={trendRows(trend.data)} selectedDate={date !== today ? risk.data?.date : null} />
              ) : (
                <EmptyState icon="show_chart" title="No scores in the last 30 days" />
              )}
            </div>
          </Panel>
        </div>
      )}

      {selected && (
        <RiskCellDrawer
          areaId={areaId}
          cell={selected}
          date={risk.data?.date ?? date}
          delta={selectedDelta}
          sectorName={sectorName(selected.sector_id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

function DateFilter({ value, max, onChange }: { value: string; max: string; onChange: (v: string) => void }) {
  const isToday = value === max
  const input = useRef<HTMLInputElement>(null)
  const open = () => {
    const el = input.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={open}
          aria-label={`Risk date: ${fmt.date(value)}. Change date`}
          className="flex h-11 items-center gap-2.5 rounded-lg border-[1.5px] border-grey bg-white pr-3 pl-3.5 text-body text-ink hover:border-forest"
        >
          <Icon name="calendar_today" size={18} className="text-ink-2" />
          <span className="font-medium">{isToday ? 'Today · ' : ''}{format(parseISO(value), 'EEE d MMM yyyy')}</span>
          <Icon name="expand_more" size={20} className="text-ink-3" />
        </button>
        <input
          ref={input}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          max={max}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
        />
      </div>
      {!isToday && (
        <button type="button" onClick={() => onChange(max)} className="h-11 rounded-lg px-3 text-small font-semibold text-forest hover:bg-black/5">
          Back to today
        </button>
      )}
    </div>
  )
}

function MapToggle({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={clsx('flex h-11 min-w-11 flex-col items-center justify-center rounded-md px-1.5 text-[10px] font-semibold', on ? 'bg-emerald/20 text-emerald shadow-[inset_0_0_0_1.5px_#52B788]' : 'text-cream/80 hover:text-cream')}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  )
}

/** Numbered rank markers for the top cells, drawn on the map's own canvas container. */
function useRankMarkers(map: MlMap | null, ranked: RankedCell[], onClick: (id: string) => void) {
  useEffect(() => {
    if (!map) return
    const markers = ranked.map((r) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.textContent = String(r.rank)
      el.setAttribute('aria-label', `Rank ${r.rank}: ${r.cell.label}, score ${r.cell.score.toFixed(1)}`)
      el.style.cssText =
        'width:22px;height:22px;border-radius:5px;border:2px solid #fff;background:#102C26;color:#fff;font:700 12px Inter,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.45);cursor:pointer;padding:0'
      el.onclick = (e) => {
        e.stopPropagation()
        onClick(r.cell.cell_id)
      }
      return new maplibregl.Marker({ element: el }).setLngLat(r.cell.centroid.coordinates as [number, number]).addTo(map)
    })
    return () => markers.forEach((m) => m.remove())
  }, [map, ranked, onClick])
}

function TopCell({ item, selected, onOpen }: { item: RankedCell; selected: boolean; onOpen: () => void }) {
  const { cell, rank, delta, topFactors } = item
  const lead = rank === 1
  const maxPoints = Math.max(0.01, ...topFactors.map((f) => f.points))
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={clsx(
          'flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors hover:border-forest/40',
          lead && cell.level === 'critical' ? 'border-danger/50 bg-[#FDF1EF]' : 'border-line bg-white',
          selected && '!border-forest shadow-[inset_0_0_0_1px_#102C26]',
        )}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-forest text-[12px] font-bold text-white">{rank}</span>
          <span className="mono text-[15px] font-medium text-ink">{cell.label}</span>
          <SeverityBadge level={cell.level} />
          <span className="flex-1" />
          <Delta value={delta} />
          <span className="w-11 text-right text-[22px] leading-6 font-bold" style={{ color: severityColor[cell.level] }}>{cell.score.toFixed(1)}</span>
        </span>
        {lead ? (
          <span className="mt-1.5 flex flex-col gap-0.5 pl-8">
            {topFactors.map((f) => (
              <span key={f.key} className="grid grid-cols-[minmax(0,1fr)_72px_34px] items-center gap-2.5 text-small text-ink-2">
                <span className="truncate">{f.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-[#EFE3D6]">
                  <span className="block h-full rounded-full" style={{ width: `${(f.points / maxPoints) * 100}%`, background: severityColor[cell.level] }} />
                </span>
                <span className="mono text-right text-[12px] text-ink">+{f.points.toFixed(1)}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="mt-0.5 truncate pl-8 text-small text-ink-2">{topFactors.map((f) => f.label).join(' · ') || 'No elevated factors'}</span>
        )}
      </button>
    </li>
  )
}

function ConfidenceCard({ engine, confidence, loading }: { engine?: 'heuristic' | 'ml'; confidence?: 'low' | 'moderate' | 'high'; loading: boolean }) {
  if (loading || !engine || !confidence) {
    return <Panel title="AI model confidence"><Skeleton className="h-32" /></Panel>
  }
  const info = confidenceInfo(engine, confidence)
  return (
    <Panel title="AI model confidence">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-mint text-forest"><Icon name="psychology" size={24} /></span>
        <div className="flex flex-col">
          <span className="text-body font-semibold text-ink">{info.levelLabel} confidence</span>
          <span className="text-small text-ink-3">{info.phase} · {info.engineLabel}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5" role="meter" aria-valuemin={0} aria-valuemax={2} aria-valuenow={info.step} aria-label={`Model confidence ${info.levelLabel}`}>
        {['Low', 'Moderate', 'High'].map((l, i) => (
          <div key={l} className="flex flex-col gap-1">
            <span className={clsx('h-1.5 rounded-full', i <= info.step ? 'bg-info' : 'bg-[#E9DFCB]')} />
            <span className={clsx('text-caption', i === info.step ? 'font-semibold text-ink' : 'text-ink-3')}>{l}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-[18px] text-ink-2">{info.explanation}</p>
      {engine === 'heuristic' && (
        <p className="mt-2 border-t border-line pt-2 text-[12px] leading-[18px] text-ink-3">
          Phase 2 machine learning starts once six months of patrol data exist. Until then, scores are rules, not predictions.
        </p>
      )}
    </Panel>
  )
}

const ALERT_ICON: Record<string, string> = {
  panic: 'sos',
  dead_mans_switch: 'timer_off',
  snare: 'cable',
  poacher_camp: 'camping',
  carcass: 'skull',
  fence_cut: 'fence',
  gunshot: 'campaign',
  vehicle: 'directions_car',
}

function AlertFeed({ areaId, cellLabel, sectorCells }: { areaId: string; cellLabel: (id?: string | null) => string | undefined; sectorCells: Set<string> | null }) {
  const alerts = useAlerts({ area_id: areaId, limit: 50 })
  const items = feedAlerts(alerts.data ?? [], { cellIds: sectorCells, limit: 6 })
  return (
    <Panel title="Alert feed" actions={<Link to="/alerts" className="text-small font-semibold text-forest hover:underline">All alerts</Link>} className="min-h-0 flex-1">
      <p className="-mt-2 mb-2 text-caption text-ink-3">Open alerts · severity, then time</p>
      {alerts.isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : alerts.isError ? (
        <QueryProblem error={alerts.error} onRetry={() => void alerts.refetch()} what="Alerts" />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications_off" title="No open alerts" text={sectorCells ? 'Nothing open in this sector.' : 'Nothing needs attention in this area.'} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => <FeedItem key={a.id} alert={a} cell={a.cell_label ?? cellLabel(a.cell_id)} />)}
        </ul>
      )}
    </Panel>
  )
}

function FeedItem({ alert, cell }: { alert: AlertItem; cell?: string }) {
  const sameDay = alert.occurred_at.slice(0, 10) === todayIso()
  return (
    <li>
      <Link
        to={`/alerts/${alert.id}`}
        className="flex min-h-11 items-center gap-2.5 rounded-lg border border-line border-l-[3px] bg-white py-2 pr-2.5 pl-2.5 hover:bg-cream-tint"
        style={{ borderLeftColor: severityColor[alert.severity] }}
      >
        <Icon name={ALERT_ICON[alert.kind] ?? (alert.type === 'safety' ? 'sos' : 'report')} size={18} className="text-ink-2" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-small font-semibold text-ink">{alertTitle(alert)}</span>
          <span className="truncate text-[12px] text-ink-3">{[alert.ranger_name, cell, alert.status === 'acknowledged' ? 'acknowledged' : null].filter(Boolean).join(' · ') || '—'}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <SeverityBadge level={alert.severity} />
          <span className="mono text-[11px] text-ink-3">{sameDay ? fmt.time(alert.occurred_at) : format(parseISO(alert.occurred_at), 'd MMM HH:mm')}</span>
        </span>
      </Link>
    </li>
  )
}
