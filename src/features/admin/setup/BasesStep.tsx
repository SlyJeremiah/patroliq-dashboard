import clsx from 'clsx'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useApuBases, useDeleteApuBase, useSaveApuBase, useUsers } from '@/api/hooks'
import type { ApuBase, Area } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap, type MapPoint } from '@/components/map/AreaMap'
import { Banner, Button, EmptyState, ErrorState, Icon, TextInput } from '@/components/ui'
import { SECTOR_COLORS, nextBaseCode, parseLatLon } from '../adminLogic'
import { pointInBoundary } from '../geometry'
import { ConfirmModal, Skeleton } from '../parts'
import { BottomMetric, MapChip, ReadOnlyNote, StepLayout } from './StepLayout'

interface Draft {
  id?: string
  code: string
  name: string
  call_sign: string
  lat: string
  lon: string
}

const fieldMsg = (e: ApiError | null, k: string) => {
  const v = e?.fields?.[k]
  return Array.isArray(v) ? String(v[0]) : null
}

export function BasesStep({ area }: { area: Area }) {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const canEdit = hasRole('org_admin')
  const basesQ = useApuBases(area.id)
  const rangersQ = useUsers({ role: 'ranger' })
  const save = useSaveApuBase()
  const del = useDeleteApuBase()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [placing, setPlacing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<ApuBase | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const bases = useMemo(() => [...(basesQ.data ?? [])].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })), [basesQ.data])
  const rangersAt = useMemo(() => {
    const m: Record<string, number> = {}
    for (const u of rangersQ.data ?? []) if (u.is_active && u.apu_base_id) m[u.apu_base_id] = (m[u.apu_base_id] ?? 0) + 1
    return m
  }, [rangersQ.data])
  const totalRangers = bases.reduce((s, b) => s + (rangersAt[b.id] ?? 0), 0)

  const draftPoint = draft ? parseLatLon(draft.lat, draft.lon) : null
  const draftOutside = draftPoint ? !pointInBoundary([draftPoint.lon, draftPoint.lat], area.boundary) : false
  const saveErr = save.error instanceof ApiError ? save.error : null

  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPlacing(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing])

  const startAdd = () => {
    save.reset()
    setDraft({ code: nextBaseCode(bases.map((b) => b.code)), name: '', call_sign: '', lat: '', lon: '' })
    setPlacing(true)
    setSelected(null)
  }
  const startEdit = (b: ApuBase, move = false) => {
    save.reset()
    setMenuFor(null)
    setSelected(b.id)
    setDraft({ id: b.id, code: b.code, name: b.name, call_sign: b.call_sign ?? '', lat: b.location.coordinates[1].toFixed(5), lon: b.location.coordinates[0].toFixed(5) })
    setPlacing(move)
  }
  const cancel = () => {
    setDraft(null)
    setPlacing(false)
    save.reset()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft || !draftPoint || !draft.name.trim() || !draft.code.trim()) return
    save.mutate(
      {
        id: draft.id,
        area_id: area.id,
        code: draft.code.trim(),
        name: draft.name.trim(),
        call_sign: draft.call_sign.trim(),
        location: { type: 'Point', coordinates: [Number(draftPoint.lon.toFixed(6)), Number(draftPoint.lat.toFixed(6))] },
      },
      {
        onSuccess: (b) => {
          setDraft(null)
          setPlacing(false)
          setSelected(b.id)
        },
      },
    )
  }

  const points: MapPoint[] = [
    ...bases
      .filter((b) => b.id !== draft?.id)
      .map((b) => ({ id: b.id, kind: 'base' as const, lat: b.location.coordinates[1], lon: b.location.coordinates[0], color: '#102C26', label: `${b.code} · ${b.name}` })),
    ...(draft && draftPoint
      ? [{ id: 'draft', kind: 'base' as const, lat: draftPoint.lat, lon: draftPoint.lon, color: '#C0392B', label: `${draft.code}${draftOutside ? ' · outside boundary' : ' · draft'}` }]
      : []),
  ]

  const noBoundary = !area.boundary

  const left = (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 font-semibold text-ink">APU bases</h2>
          <p className="text-small text-ink-3">{bases.length} placed · {totalRangers} rangers based</p>
        </div>
        {canEdit && (
          <Button kind="secondary" icon="add" onClick={startAdd} disabled={noBoundary || (!!draft && !draft.id)}>Add APU base</Button>
        )}
      </div>

      {!canEdit && <ReadOnlyNote>Only organisation administrators can add or move APU bases.</ReadOnlyNote>}
      {noBoundary && (
        <Banner tone="warning" title="Boundary required" action={<Button kind="ghost" size="sm" onClick={() => navigate(`/areas/${area.id}/setup/boundary`)}>Set boundary</Button>}>
          Bases must lie inside the area boundary, so add the boundary first.
        </Banner>
      )}
      {placing && draft && (
        <div className="flex items-start gap-2.5 rounded-lg border-l-4 border-info bg-info-bg px-3.5 py-3 text-small text-ink-2">
          <Icon name="location_on" size={20} className="text-info" />
          <span>
            <b className="text-ink">{draft.id ? `Moving ${draft.code}.` : `Placing ${draft.code}.`}</b> Click inside the boundary. Press Esc to stop placing.
          </span>
        </div>
      )}

      {basesQ.isError ? (
        <ErrorState error={basesQ.error} onRetry={() => void basesQ.refetch()} />
      ) : basesQ.isLoading ? (
        <Skeleton className="h-40" />
      ) : bases.length === 0 && !draft ? (
        <div className="rounded-lg border border-line">
          <EmptyState icon="cabin" title="No APU bases yet" text="Place at least one Anti-Poaching Unit base inside the boundary. Sectors are formed around the nearest base." />
        </div>
      ) : (
        <ul className="overflow-visible rounded-lg border border-line">
          {bases.map((b, i) => {
            const editing = draft?.id === b.id
            return (
              <li
                key={b.id}
                className={clsx('relative flex items-center gap-3 py-3 pr-2 pl-4', i > 0 && 'border-t border-line', (selected === b.id || editing) && 'bg-mint/60')}
              >
                <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => setSelected(b.id)}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="mono shrink-0 font-medium whitespace-nowrap text-ink">{b.code}</span>
                    <span className="truncate text-body font-semibold text-ink">{b.name}</span>
                  </span>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="mono shrink-0 whitespace-nowrap text-ink-2">{b.location.coordinates[1].toFixed(4)}, {b.location.coordinates[0].toFixed(4)}</span>
                    {b.call_sign && <span className="truncate text-[12px] text-ink-3">· {b.call_sign}</span>}
                  </span>
                </button>
                <span className="flex w-14 flex-col items-center">
                  <span className="text-h3 leading-5 font-bold text-ink">{rangersAt[b.id] ?? 0}</span>
                  <span className="text-[11px] text-ink-3">rangers</span>
                </span>
                {canEdit && (
                  <div className="relative">
                    <button
                      type="button"
                      aria-label={`Actions for ${b.code}`}
                      aria-haspopup="menu"
                      aria-expanded={menuFor === b.id}
                      onClick={() => setMenuFor(menuFor === b.id ? null : b.id)}
                      className="flex h-11 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-black/5"
                    >
                      <Icon name="more_vert" size={20} />
                    </button>
                    {menuFor === b.id && (
                      <div role="menu" className="absolute top-10 right-0 z-20 w-48 overflow-hidden rounded-lg bg-white py-1 shadow-pop">
                        <button role="menuitem" className="flex h-11 w-full items-center gap-3 px-4 text-small hover:bg-mint" onClick={() => startEdit(b)}>
                          <Icon name="edit" size={18} /> Edit details
                        </button>
                        <button role="menuitem" className="flex h-11 w-full items-center gap-3 px-4 text-small hover:bg-mint" onClick={() => startEdit(b, true)}>
                          <Icon name="open_with" size={18} /> Move on map
                        </button>
                        <button role="menuitem" className="flex h-11 w-full items-center gap-3 px-4 text-small text-danger hover:bg-danger-bg" onClick={() => { setMenuFor(null); del.reset(); setToDelete(b) }}>
                          <Icon name="delete" size={18} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {draft && canEdit && (
        <form onSubmit={submit} className={clsx('flex flex-col gap-3 rounded-lg border-[1.5px] p-4', draftOutside || saveErr?.code === 'outside_boundary' ? 'border-danger bg-danger-bg/40' : 'border-forest')}>
          <div className="flex items-center gap-2">
            <span className="text-body font-semibold text-ink">{draft.id ? `Edit ${draft.code}` : 'New APU base'}</span>
            <span className="inline-flex h-[22px] items-center rounded-full bg-grey px-2.5 text-[11px] font-bold tracking-[0.06em] text-white uppercase">{draft.id ? 'Editing' : 'Draft'}</span>
            <span className="flex-1" />
            <Button type="button" kind={placing ? 'primary' : 'secondary'} size="sm" icon="my_location" onClick={() => setPlacing((v) => !v)}>
              {placing ? 'Placing…' : 'Pick on map'}
            </Button>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Code</span>
              <TextInput mono value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} invalid={!draft.code.trim() || !!fieldMsg(saveErr, 'code')} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Name</span>
              <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Chipoli Gate" autoFocus={!draft.id} />
            </label>
          </div>
          {fieldMsg(saveErr, 'code') && <p className="text-[12px] text-danger">{fieldMsg(saveErr, 'code')}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Radio call sign</span>
            <TextInput value={draft.call_sign} onChange={(e) => setDraft({ ...draft, call_sign: e.target.value })} placeholder="e.g. Tango Four" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Latitude</span>
              <TextInput mono inputMode="decimal" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} placeholder="-17.46110" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Longitude</span>
              <TextInput mono inputMode="decimal" value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: e.target.value })} placeholder="30.99020" />
            </label>
          </div>
          {draftOutside && (
            <p className="flex items-center gap-1.5 text-small text-danger"><Icon name="error" size={17} /> Point is outside the area boundary</p>
          )}
          {saveErr && !fieldMsg(saveErr, 'code') && !(draftOutside && saveErr.code === 'outside_boundary') && (
            <Banner tone="danger" title={saveErr.code === 'outside_boundary' ? 'Point is outside the area boundary' : saveErr.code === 'boundary_required' ? 'Boundary required' : 'Base not saved'}>
              {saveErr.code === 'outside_boundary'
                ? 'The server rejected this location. Pick a point inside the dashed boundary.'
                : saveErr.code === 'boundary_required'
                  ? 'Add the area boundary before placing bases.'
                  : saveErr.message}
            </Banner>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" kind="ghost" onClick={cancel}>Cancel</Button>
            <Button type="submit" icon="check" loading={save.isPending} disabled={!draftPoint || draftOutside || !draft.name.trim() || !draft.code.trim()}>
              {draft.id ? 'Save base' : 'Add base'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )

  const mapEl = (
    <AreaMap
      className={clsx('h-full w-full', placing && '[&_canvas]:!cursor-crosshair')}
      boundary={area.boundary}
      points={points}
      selectedPointId={selected}
      onPointClick={(p) => p.id !== 'draft' && setSelected(p.id)}
      onMapClick={
        placing && draft
          ? ({ lat, lon }) => {
              setDraft({ ...draft, lat: lat.toFixed(5), lon: lon.toFixed(5) })
              save.reset()
              if (pointInBoundary([lon, lat], area.boundary)) setPlacing(false)
            }
          : undefined
      }
    >
      <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
        <MapChip icon="cabin">{bases.length} APU base{bases.length === 1 ? '' : 's'} · {area.name}</MapChip>
        {placing && <MapChip icon="ads_click">Click inside the boundary</MapChip>}
        {draft && draftOutside && <MapChip tone="danger" icon="error">{draft.code} · outside boundary</MapChip>}
      </div>
    </AreaMap>
  )

  const bottom = (
    <>
      <BottomMetric label="APU bases" value={`${bases.length} saved${draft && !draft.id ? ' · 1 draft' : ''}`} />
      <BottomMetric label="Rangers based" value={totalRangers} />
      <span className="flex items-center gap-1.5 text-small text-ink-2">
        <Icon name="info" size={17} className="text-info" />
        Bases outside the boundary are not saved
      </span>
      <span className="flex-1" />
      <Button kind="secondary" icon="arrow_back" onClick={() => navigate(`/areas/${area.id}/setup/boundary`)}>Back</Button>
      <Button icon="arrow_forward" disabled={bases.length === 0} onClick={() => navigate(`/areas/${area.id}/setup/grid`)}>Continue to grid</Button>
    </>
  )

  const delErr = del.error instanceof ApiError ? del.error : null

  return (
    <>
      <StepLayout left={left} map={mapEl} bottom={bottom} />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete ${toDelete?.code} ${toDelete?.name}?`}
        confirmLabel="Delete base"
        danger
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(toDelete.id, {
            onSuccess: () => {
              qc.invalidateQueries({ queryKey: qk.area(area.id) })
              setToDelete(null)
              if (selected === toDelete.id) setSelected(null)
            },
          })
        }
        error={delErr && <Banner tone="danger">{delErr.status === 409 ? 'Teams or patrol records still reference this base. Move its teams to another base first.' : delErr.message}</Banner>}
      >
        <p>Rangers stop receiving this base on their next sync. Regenerate the GRTS grid afterwards so sectors are recalculated from the remaining bases.</p>
        {toDelete && (rangersAt[toDelete.id] ?? 0) > 0 && (
          <Banner tone="warning">{rangersAt[toDelete.id]} rangers are based at {toDelete.code}. Reassign them to another base.</Banner>
        )}
      </ConfirmModal>
    </>
  )
}
