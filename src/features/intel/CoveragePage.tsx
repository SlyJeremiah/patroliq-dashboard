import clsx from 'clsx'
import type { Map as MlMap } from 'maplibre-gl'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { downloadFile } from '@/api/client'
import { useCells, useCoverage } from '@/api/hooks'
import type { Coverage as CoverageData, CoverageCell } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap, CELL_STYLE, type MapCell } from '@/components/map/AreaMap'
import { Banner, Button, EmptyState, Icon, Segmented, Select, Toggle } from '@/components/ui'
import { fmt, todayIso } from '@/lib/format'
import { CoverageCellPanel, STATUS_LABEL } from './CoverageCellPanel'
import { cellCenter, monthLabel, monthOptions, sectorRows, shortSectorName, statusCounts, UNDER_SURVEYED_GAP, UNDER_SURVEYED_MIN, visitIntensity, type SectorRow } from './intelLogic'
import { QueryProblem, Skeleton } from './intelParts'
import { useVisitLayer, VISIT_RAMP, type VisitCell } from './useVisitLayer'

type Mode = 'status' | 'visits'
/** Additive v1.3 keys not yet in types.ts. */
type CoverageWire = CoverageData & { season_start?: string | null }
const STATUSES: CoverageCell['status'][] = ['complete', 'partial', 'pending', 'never']

export function CoveragePage() {
  const { hasModule } = useAuth()
  const { areaId, loading } = useArea()
  if (!hasModule('grts')) {
    return <EmptyState icon="extension_off" title="GRTS survey module is not enabled" text="The grts module is not part of your organisation's licence. Contact zrGISsolutions to enable it." />
  }
  if (!areaId) {
    return loading ? <Skeleton className="m-6 flex-1" /> : <EmptyState icon="fence" title="No conservation area yet" text="Coverage appears once an area has a GRTS grid and patrols." />
  }
  return <Coverage key={areaId} areaId={areaId} />
}

function Coverage({ areaId }: { areaId: string }) {
  const { area } = useArea()
  const { hasRole } = useAuth()
  const canManage = hasRole('org_admin', 'manager')
  const [params, setParams] = useSearchParams()
  const today = todayIso()
  const months = useMemo(() => monthOptions(today, 12), [today])
  const month = params.get('month') || months[0].value
  const setMonth = (m: string) => {
    const next = new URLSearchParams(params)
    if (m === months[0].value) next.delete('month')
    else next.set('month', m)
    setParams(next, { replace: true })
  }

  const coverage = useCoverage(areaId, month === months[0].value ? undefined : month)
  const cells = useCells(areaId)
  const [mode, setMode] = useState<Mode>('status')
  const [counts, setCounts] = useState(true)
  const [sectorId, setSectorId] = useState<string | null>(null)
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
  const [map, setMap] = useState<MlMap | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const cov = coverage.data as CoverageWire | undefined
  const target = cov?.visit_target ?? 1
  const byId = useMemo(() => new Map((cov?.cells ?? []).map((c) => [c.cell_id, c])), [cov])
  const sectors = useMemo(() => (cov ? sectorRows(cov) : []), [cov])
  const sectorName = (id?: string | null) => sectors.find((s) => s.id === id)?.name

  const geo = useMemo(
    () =>
      (cells.data?.features ?? []).map((f) => ({
        id: f.properties.id,
        label: f.properties.label,
        sector: f.properties.sector_id,
        geometry: f.geometry,
        center: cellCenter(f.geometry, (f.properties as { centroid?: { coordinates: number[] } }).centroid),
      })),
    [cells.data],
  )
  const inScope = (sector?: string | null) => !sectorId || sector === sectorId

  const mapCells = useMemo<MapCell[]>(
    () =>
      geo.map((g) => ({
        id: g.id,
        label: g.label,
        geometry: g.geometry,
        status: !inScope(g.sector) ? 'grid' : mode === 'visits' ? 'grid' : byId.get(g.id)?.status ?? 'none',
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geo, byId, mode, sectorId],
  )
  const visitCells = useMemo<VisitCell[]>(
    () =>
      geo
        .filter((g) => inScope(g.sector))
        .map((g) => {
          const visits = byId.get(g.id)?.visits ?? 0
          return { id: g.id, geometry: g.geometry, centroid: g.center, visits, intensity: visitIntensity(visits, target) }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geo, byId, target, sectorId],
  )
  useVisitLayer(map, visitCells, { fill: mode === 'visits', labels: counts })

  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const scopeCounts = statusCounts((cov?.cells ?? []).filter((c) => inScope(c.sector_id)))

  const exportCsv = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await downloadFile(`areas/${areaId}/coverage/export/`, { month }, `coverage-${month}.csv`)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'The export did not download.')
    } finally {
      setExporting(false)
    }
  }

  if (coverage.isError) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-h1 font-bold text-ink">GRTS coverage</h1>
        <QueryProblem error={coverage.error} onRetry={() => void coverage.refetch()} what="GRTS coverage" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">GRTS coverage · {monthLabel(month)}</h1>
      {/* Sector cards */}
      <div className="scroll-thin flex shrink-0 overflow-x-auto border-b border-[#EDE4D3] bg-cream-tint">
        {coverage.isLoading
          ? [0, 1, 2].map((i) => <div key={i} className="flex-1 px-4 py-3"><Skeleton className="h-16" /></div>)
          : sectors.map((s, i) => <SectorCard key={s.id} s={s} first={i === 0} active={sectorId === s.id} onClick={() => setSectorId((v) => (v === s.id ? null : s.id))} />)}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Map column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 px-4 py-3">
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'status', label: 'Survey status', icon: 'grid_on' },
                { value: 'visits', label: 'Visit intensity', icon: 'water_drop' },
              ]}
            />
            <div className="w-48">
              <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-11">
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </div>
            <div className="flex-1" />
            {canManage && (
              <Button icon="download" onClick={() => void exportCsv()} loading={exporting} disabled={!cov}>
                Export CSV
              </Button>
            )}
          </div>
          {exportError && <div className="px-4 pb-2"><Banner tone="danger" title="Export failed">{exportError}</Banner></div>}
          <div className="relative min-h-0 flex-1 bg-[#DCE3D5]">
            <AreaMap
              className="absolute inset-0"
              boundary={area?.boundary}
              cells={mapCells}
              selectedCellId={selectedId}
              onCellClick={setSelectedId}
              onReady={setMap}
            />
            {sectorId && (
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-forest/92 py-1 pr-1 pl-3 text-small font-semibold text-cream shadow-pop">
                {shortSectorName(sectorName(sectorId) ?? '')}
                <button type="button" onClick={() => setSectorId(null)} className="flex h-9 items-center gap-1 rounded-md px-2 text-[12px] text-emerald hover:bg-cream/10">
                  <Icon name="close" size={16} /> Show all
                </button>
              </div>
            )}
          </div>
          <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-white px-4 py-2 text-small text-ink-2">
            {mode === 'status' ? (
              STATUSES.map((st) => (
                <span key={st} className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-[3px] border-2" style={{ borderColor: CELL_STYLE[st].stroke, background: `${CELL_STYLE[st].fill}${Math.round(Math.min(1, CELL_STYLE[st].opacity * 2.4) * 255).toString(16).padStart(2, '0')}` }} />
                  {STATUS_LABEL[st]}
                  <span className="text-ink-3">
                    {st === 'complete' ? `(${target}+ visits)` : st === 'partial' ? `(1–${Math.max(1, target - 1)})` : st === 'pending' ? '(0, visited before)' : ''} · {scopeCounts[st]}
                  </span>
                </span>
              ))
            ) : (
              <span className="flex items-center gap-2">
                <span>0 visits</span>
                <span className="h-3 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${VISIT_RAMP.join(',')})` }} />
                <span>{target}+ visits (target)</span>
              </span>
            )}
            <span className="flex-1" />
            <Toggle checked={counts} onChange={setCounts} label="Visit counts" description="Visits this month, shown when zoomed in" />
          </div>
        </div>

        {/* Right column */}
        <aside className="scroll-thin flex w-[392px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-canvas p-4" aria-label="Coverage statistics">
          <div className="grid grid-cols-2 gap-3">
            {coverage.isLoading || !cov ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px]" />)
            ) : (
              <>
                <StatCard label="Reserve coverage" value={fmt.pct(cov.coverage_pct)} sub={`${Math.round(cov.coverage_pct * cov.cells.length)} of ${cov.cells.length} cells complete`} />
                <StatCard
                  label="Season coverage"
                  value={fmt.pct(cov.season_coverage_pct)}
                  sub={`visited since ${cov.season_start ? monthLabel(cov.season_start, 'MMM yyyy') : 'season start'}`}
                />
                <StatCard label="Never surveyed" value={cov.never_surveyed} tone={cov.never_surveyed > 0 ? 'danger' : undefined} sub="cells with no visit yet" />
                <StatCard label="Visits per cell" value={cov.mean_visits.toFixed(1)} sub={`mean · target ${cov.visit_target} a month`} />
              </>
            )}
          </div>
          {selected ? (
            <CoverageCellPanel
              key={selected.cell_id}
              areaId={areaId}
              cell={selected}
              month={month}
              target={target}
              sectorName={sectorName(selected.sector_id)}
              canAssign={canManage}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D9CFBD] px-6 py-8 text-center">
              <Icon name="touch_app" size={28} className="text-mid-green" />
              <p className="text-body font-semibold text-ink">Select a cell on the map</p>
              <p className="text-small text-ink-3">See its visits against the target of {target}, the last visit and this month's observations.</p>
            </div>
          )}
          {cov && cov.cells.length === 0 && <Banner tone="info">This area has no GRTS grid yet. Generate one in area setup.</Banner>}
        </aside>
      </div>
    </div>
  )
}

function SectorCard({ s, first, active, onClick }: { s: SectorRow; first: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={s.underSurveyed ? `Under-surveyed: below ${Math.round(UNDER_SURVEYED_MIN * 100)}% complete or ${Math.round(UNDER_SURVEYED_GAP * 100)} points below the reserve` : 'Show this sector on the map'}
      className={clsx(
        'flex min-w-[240px] flex-1 flex-col gap-1 px-4 pt-3 pb-3 text-left transition-colors',
        !first && 'border-l border-[#EDE4D3]',
        s.underSurveyed ? 'bg-danger-bg/45 hover:bg-danger-bg/70' : 'hover:bg-mint/40',
        active && 'shadow-[inset_0_-3px_0_#102C26]',
      )}
    >
      <span className="flex items-center gap-2">
        <span className={clsx('text-label font-semibold tracking-[0.06em] uppercase text-ink-3 truncate', s.underSurveyed && '!text-danger')}>{shortSectorName(s.name)}</span>
        <span className="flex-1" />
        {s.underSurveyed && <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold tracking-[0.05em] text-white uppercase">Under-surveyed</span>}
      </span>
      <span className="flex items-baseline gap-2">
        <span className={clsx('text-[22px] leading-7 font-bold', s.underSurveyed ? 'text-danger' : 'text-forest')}>{fmt.pct(s.pct)}</span>
        <span className="text-small text-ink-3">{s.complete} of {s.cells} cells complete</span>
      </span>
      <span className="flex h-1.5 overflow-hidden rounded-full bg-[#E9DFCB]" aria-hidden="true">
        <span style={{ width: `${(s.complete / Math.max(1, s.cells)) * 100}%`, background: CELL_STYLE.complete.fill }} />
        <span style={{ width: `${(s.partial / Math.max(1, s.cells)) * 100}%`, background: CELL_STYLE.partial.fill, opacity: 0.8 }} />
      </span>
      <span className="text-[12px] text-ink-3">{s.partial} partial · {s.pending} pending · {s.never} never</span>
    </button>
  )
}

function StatCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub: string; tone?: 'danger' }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-card">
      <p className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">{label}</p>
      <p className={clsx('text-[28px] leading-9 font-bold', tone === 'danger' ? 'text-danger' : 'text-ink')}>{value}</p>
      <p className="text-small text-ink-3">{sub}</p>
    </div>
  )
}
