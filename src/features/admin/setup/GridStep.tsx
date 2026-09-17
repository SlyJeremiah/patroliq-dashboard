import clsx from 'clsx'
import type { Map as MlMap } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useApuBases, useCells, useGenerateGrid, useSectors } from '@/api/hooks'
import type { Area, CellCollection } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap } from '@/components/map/AreaMap'
import { Banner, Button, Icon, Spinner, TextInput } from '@/components/ui'
import { CELL_SIZES, SECTOR_COLORS, countBy, formatCellSize } from '../adminLogic'
import { useGeoOverlay } from '../mapTools'
import { ConfirmModal } from '../parts'
import { BottomMetric, MapChip, ReadOnlyNote, StepLayout } from './StepLayout'

const GRID_LAYERS = [
  { id: 'admin-grid-fill', type: 'fill' as const, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.38 } },
  { id: 'admin-grid-line', type: 'line' as const, paint: { 'line-color': '#FFFFFF', 'line-width': 0.8, 'line-opacity': 0.85 } },
]

interface Preview {
  size: number
  cells: CellCollection
  cellsCreated: number
  sectorsCreated: number
}

export function GridStep({ area }: { area: Area }) {
  const navigate = useNavigate()
  const { hasRole, hasModule } = useAuth()
  const canEdit = hasRole('org_admin')
  const grtsOn = hasModule('grts')
  const basesQ = useApuBases(area.id)
  const cellsQ = useCells(area.id)
  const sectorsQ = useSectors(area.id)
  const gen = useGenerateGrid()
  const [map, setMap] = useState<MlMap | null>(null)
  const savedSize = area.grid_cell_size_m ?? 1000
  const [size, setSize] = useState<number>(savedSize)
  const [custom, setCustom] = useState(!CELL_SIZES.includes(savedSize))
  const [customText, setCustomText] = useState(String(savedSize))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmForce, setConfirmForce] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const bases = useMemo(() => [...(basesQ.data ?? [])].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })), [basesQ.data])
  const colorForBase = useMemo(() => {
    const m: Record<string, string> = {}
    bases.forEach((b, i) => (m[b.id] = SECTOR_COLORS[i % SECTOR_COLORS.length]))
    return m
  }, [bases])
  const baseForSector = useMemo(() => {
    const m: Record<string, string | null | undefined> = {}
    for (const s of sectorsQ.data ?? []) m[s.id] = s.apu_base_id
    return m
  }, [sectorsQ.data])

  const showing: 'preview' | 'saved' | 'none' = preview ? 'preview' : (cellsQ.data?.features.length ?? 0) > 0 ? 'saved' : 'none'
  const features = showing === 'preview' ? preview!.cells.features : showing === 'saved' ? cellsQ.data!.features : []
  const baseOf = (f: CellCollection['features'][number]) =>
    showing === 'preview' ? ((f.properties as unknown as { apu_base_id?: string | null }).apu_base_id ?? null) : f.properties.sector_id ? baseForSector[f.properties.sector_id] ?? null : null

  const overlay = useMemo<FeatureCollection | null>(() => {
    if (!features.length) return null
    return {
      type: 'FeatureCollection',
      features: features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { color: colorForBase[baseOf(f) ?? ''] ?? '#6C757D', label: f.properties.label } })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, colorForBase, baseForSector, showing])
  useGeoOverlay(map, 'admin-grid', overlay, GRID_LAYERS)

  const perBase = countBy(features, baseOf)
  const labels = features.map((f) => f.properties.label).sort()
  const genErr = gen.error instanceof ApiError ? gen.error : null

  const sizeValid = Number.isInteger(size) && size >= 100 && size <= 20000
  const canRun = canEdit && grtsOn && !!area.boundary && sizeValid

  const runPreview = () => {
    setSavedMsg(null)
    gen.mutate(
      { areaId: area.id, cellSizeM: size, dryRun: true },
      { onSuccess: (r) => r.cells && setPreview({ size, cells: r.cells, cellsCreated: r.cells_created, sectorsCreated: r.sectors_created }) },
    )
  }
  const runGenerate = (force = false) => {
    setSavedMsg(null)
    gen.mutate(
      { areaId: area.id, cellSizeM: size, force },
      {
        onSuccess: (r) => {
          setPreview(null)
          setConfirmForce(false)
          setSavedMsg(`Grid saved: ${r.cells_created} cells in ${r.sectors_created} sectors.`)
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'grid_in_use') setConfirmForce(true)
          else setConfirmForce(false)
        },
      },
    )
  }

  const chooseSize = (v: number | 'custom') => {
    setPreview(null)
    gen.reset()
    if (v === 'custom') {
      setCustom(true)
      setSize(Number(customText) || 0)
    } else {
      setCustom(false)
      setSize(v)
    }
  }

  const left = (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-baseline gap-3">
        <h2 className="flex-1 text-h2 font-semibold text-ink">GRTS grid</h2>
        <span className="text-[12px] text-ink-3">Hexagonal cells clipped to the boundary</span>
      </div>
      {!canEdit && <ReadOnlyNote>Only organisation administrators can generate the grid.</ReadOnlyNote>}
      {!grtsOn && <Banner tone="warning" title="GRTS module not in your licence">Grid generation needs the GRTS module. Ask zrGISsolutions to enable it.</Banner>}
      {!area.boundary && (
        <Banner tone="warning" title="Boundary required" action={<Button kind="ghost" size="sm" onClick={() => navigate(`/areas/${area.id}/setup/boundary`)}>Set boundary</Button>}>
          The grid is clipped to the boundary.
        </Banner>
      )}
      {area.boundary && bases.length === 0 && !basesQ.isLoading && (
        <Banner tone="info" title="No APU bases yet">Cells are grouped into sectors by nearest base. Place bases first for useful sectors.</Banner>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Cell size</span>
        <div className="grid grid-cols-4 overflow-hidden rounded-lg border-[1.5px] border-[#CFC6B4]" role="radiogroup" aria-label="Cell size">
          {[...CELL_SIZES, 'custom' as const].map((v, i) => {
            const on = v === 'custom' ? custom : !custom && size === v
            return (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!canEdit}
                onClick={() => chooseSize(v)}
                className={clsx('flex h-12 items-center justify-center gap-1 text-body', i > 0 && 'border-l-[1.5px] border-[#CFC6B4]', on ? 'bg-forest font-semibold text-cream' : 'bg-white text-ink hover:bg-mint')}
              >
                {on && <Icon name="check" size={16} />}
                {v === 'custom' ? 'Custom' : formatCellSize(v)}
              </button>
            )
          })}
        </div>
        {custom && (
          <label className="flex items-center gap-3">
            <TextInput
              mono
              type="number"
              min={100}
              max={20000}
              step={50}
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value)
                setSize(Number(e.target.value))
                setPreview(null)
              }}
              className="w-36"
              aria-label="Custom cell size in metres"
              invalid={!sizeValid}
            />
            <span className="text-small text-ink-2">metres (100 – 20 000)</span>
          </label>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-readonly px-4 py-3">
        <div className="min-w-0 flex-1">
          {showing === 'preview' ? (
            <>
              <p className="text-body font-semibold text-ink">{preview!.cellsCreated} cells · {preview!.sectorsCreated} sectors</p>
              <p className="text-small text-ink-3">Preview at {formatCellSize(preview!.size)} · not saved · {labels[0]} to {labels[labels.length - 1]}</p>
            </>
          ) : showing === 'saved' ? (
            <>
              <p className="text-body font-semibold text-ink">{area.cell_count ?? features.length} cells · {area.sector_count ?? sectorsQ.data?.length ?? 0} sectors</p>
              <p className="text-small text-ink-3">Saved grid · {formatCellSize(savedSize)} · {labels[0]} to {labels[labels.length - 1]}</p>
            </>
          ) : cellsQ.isLoading ? (
            <p className="flex items-center gap-2 text-small text-ink-3"><Spinner size={14} /> Loading grid…</p>
          ) : (
            <>
              <p className="text-body font-semibold text-ink">No grid yet</p>
              <p className="text-small text-ink-3">Preview a cell size, then generate.</p>
            </>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <Button kind="secondary" icon="visibility" className="flex-1" onClick={runPreview} disabled={!canRun} loading={gen.isPending && gen.variables?.dryRun}>
            Preview
          </Button>
          <Button icon="grid_on" className="flex-1" onClick={() => runGenerate(false)} disabled={!canRun} loading={gen.isPending && !gen.variables?.dryRun}>
            {showing === 'none' ? 'Generate grid' : 'Save grid'}
          </Button>
        </div>
      )}

      {savedMsg && <Banner tone="success">{savedMsg}</Banner>}
      {genErr && genErr.code !== 'grid_in_use' && (
        <Banner tone="danger" title={genErr.code === 'grid_too_large' ? 'Too many cells' : genErr.code === 'grid_empty' ? 'No cells fit' : 'Grid not generated'}>
          {genErr.code === 'grid_too_large'
            ? 'This cell size makes the grid too large for the area. Choose a larger cell size.'
            : genErr.code === 'grid_empty'
              ? 'No cells fit inside the boundary at this size. Choose a smaller cell size.'
              : genErr.code === 'boundary_required'
                ? 'Add the area boundary first.'
                : genErr.message}
        </Banner>
      )}
      {(area.cell_count ?? 0) > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border-l-4 border-amber bg-warn-bg px-3.5 py-3 text-small text-ink-2">
          <Icon name="lock" size={18} className="text-amber" />
          <span>Regenerating is blocked once patrol data references cells. Review the preview before saving; forcing it reassigns observations and tracks to the new cells.</span>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-center">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase flex-1">Sectors · nearest base</span>
          <span className="text-[12px] text-ink-3">{showing === 'preview' ? 'preview' : showing === 'saved' ? 'saved' : ''}</span>
        </div>
        {bases.length === 0 ? (
          <p className="text-small text-ink-3">No bases placed.</p>
        ) : (
          <ul className="flex flex-col">
            {bases.map((b) => (
              <li key={b.id} className="flex h-10 items-center gap-3 border-b border-line-soft last:border-0">
                <span className="h-3.5 w-3.5 rounded-[3px]" style={{ background: colorForBase[b.id] }} aria-hidden />
                <span className="flex-1 text-small text-ink">Sector · <span className="mono">{b.code}</span> {b.name}</span>
                <span className="mono text-ink-2">{perBase[b.id] ?? 0} cells</span>
              </li>
            ))}
            {(perBase[''] ?? 0) > 0 && (
              <li className="flex h-10 items-center gap-3">
                <span className="h-3.5 w-3.5 rounded-[3px] bg-grey" aria-hidden />
                <span className="flex-1 text-small text-ink">No sector</span>
                <span className="mono text-ink-2">{perBase['']} cells</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )

  const mapEl = (
    <AreaMap
      className="h-full w-full"
      boundary={area.boundary}
      points={bases.map((b) => ({ id: b.id, kind: 'base' as const, lat: b.location.coordinates[1], lon: b.location.coordinates[0], color: '#102C26', label: `${b.code} · ${b.name}` }))}
      onReady={setMap}
    >
      <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
        <MapChip icon="grid_on">
          {showing === 'preview'
            ? `Grid preview · ${formatCellSize(preview!.size)} · not saved`
            : showing === 'saved'
              ? `Saved grid · ${formatCellSize(savedSize)} · ${features.length} cells`
              : 'No grid yet'}
        </MapChip>
      </div>
      {features.length > 0 && bases.length > 0 && (
        <div className="absolute right-4 bottom-10 z-10 rounded-lg bg-forest/92 px-3.5 py-2.5 text-[12px] text-cream shadow-pop">
          <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-cream/70 uppercase">Sectors · nearest base</p>
          {bases.map((b) => (
            <p key={b.id} className="flex items-center gap-2 py-0.5">
              <span className="h-3 w-3 rounded-[2px]" style={{ background: colorForBase[b.id] }} />
              <span className="flex-1">{b.code}</span>
              <span className="mono ml-6 !text-[12px]">{perBase[b.id] ?? 0} cells</span>
            </p>
          ))}
        </div>
      )}
    </AreaMap>
  )

  const bottom = (
    <>
      <BottomMetric label="APU bases" value={bases.length} />
      <BottomMetric label="Grid" value={showing === 'none' ? '—' : `${features.length} cells · ${formatCellSize(showing === 'preview' ? preview!.size : savedSize)}`} />
      <BottomMetric label="Sectors" value={showing === 'none' ? '—' : `${Object.keys(perBase).filter((k) => k).length} · by nearest base`} />
      {showing === 'preview' && (
        <span className="flex items-center gap-1.5 text-small text-ink-2"><Icon name="info" size={17} className="text-info" /> Preview is not saved</span>
      )}
      <span className="flex-1" />
      <Button kind="secondary" icon="arrow_back" onClick={() => navigate(`/areas/${area.id}/setup/bases`)}>Back</Button>
      <Button icon="arrow_forward" disabled={(area.cell_count ?? 0) === 0 && showing !== 'saved'} onClick={() => navigate(`/areas/${area.id}/setup/teams`)}>
        Continue to teams
      </Button>
    </>
  )

  return (
    <>
      <StepLayout left={left} map={mapEl} bottom={bottom} />
      <ConfirmModal
        open={confirmForce}
        onClose={() => { setConfirmForce(false); gen.reset() }}
        title="Grid is in use"
        confirmLabel="Regenerate and reassign data"
        danger
        loading={gen.isPending}
        onConfirm={() => runGenerate(true)}
      >
        <p>Patrol tracks and observations already reference the current grid of {area.cell_count} cells.</p>
        <p>
          Regenerating at {formatCellSize(size)} replaces every cell. Existing observations and track points are reassigned to the new cells, and
          assignments or coverage history tied to old cell labels will no longer match.
        </p>
      </ConfirmModal>
    </>
  )
}
