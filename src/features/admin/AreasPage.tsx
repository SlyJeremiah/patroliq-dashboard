import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useApuBases, useAreas, useTeams, useUpdateArea, useUsers } from '@/api/hooks'
import type { ApuBase, Area, Team, User } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { useAuth } from '@/auth/AuthContext'
import { Banner, Button, EmptyState, ErrorState, Icon, ProgressBar } from '@/components/ui'
import { fmt } from '@/lib/format'
import { AddAreaModal } from './AddAreaModal'
import { SECTOR_COLORS, SETUP_STEPS, areaTypeLabel, formatKm2, licenceModulesLabel, seatUsage, setupProgress } from './adminLogic'
import { AreaStatusBadge, AreaThumb, ConfirmModal, OutlineTag, Skeleton, StepCircle } from './parts'

const SOURCE_LABEL: Record<string, string> = { shapefile: 'shapefile', geojson: 'GeoJSON', kml: 'KML', drawn: 'drawn on map' }

export function AreasPage() {
  const { hasRole, organisation } = useAuth()
  const isAdmin = hasRole('org_admin')
  const areasQ = useAreas()
  const basesQ = useApuBases(null)
  const teamsQ = useTeams()
  const usersQ = useUsers()
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const areas = areasQ.data ?? []
  const live = areas.filter((a) => a.status !== 'archived')
  const archived = areas.filter((a) => a.status === 'archived')

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-end gap-4 px-6 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-h1 font-bold text-ink">Conservation Areas</h1>
          <p className="mt-0.5 text-body text-ink-2">
            Parks, conservancies and concessions {organisation?.name ?? 'your organisation'} patrols. Each area has its own boundary, APU bases and GRTS grid.
          </p>
        </div>
        {isAdmin && <Button icon="add" onClick={() => setAdding(true)} className="h-12 px-5">Add area</Button>}
      </div>

      <div className="flex flex-col gap-5 px-6 pb-8">
        <LicenceStrip areas={areas} users={usersQ.data} />

        {areasQ.isError ? (
          <ErrorState error={areasQ.error} onRetry={() => void areasQ.refetch()} />
        ) : areasQ.isLoading ? (
          <div className="grid grid-cols-2 gap-5">
            <Skeleton className="h-[560px]" />
            <Skeleton className="h-[560px]" />
          </div>
        ) : live.length === 0 ? (
          <div className="rounded-xl bg-white shadow-card">
            <EmptyState
              icon="fence"
              title="No conservation areas yet"
              text={isAdmin ? 'Add the first park, conservancy or concession, then upload its boundary shapefile or draw it on the map.' : 'Your organisation administrator sets up areas.'}
              action={isAdmin && <Button icon="add" onClick={() => setAdding(true)}>Add area</Button>}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {live.map((a) => (
              <AreaCard key={a.id} area={a} bases={(basesQ.data ?? []).filter((b) => b.area_id === a.id)} teams={(teamsQ.data ?? []).filter((t) => t.area_id === a.id)} users={usersQ.data ?? []} />
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <section className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              aria-expanded={showArchived}
              className="flex h-11 items-center gap-2 self-start rounded-lg px-2 text-small font-semibold text-ink-2 hover:bg-black/5"
            >
              <Icon name={showArchived ? 'expand_less' : 'expand_more'} size={20} />
              Archived areas ({archived.length})
            </button>
            {showArchived && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {archived.map((a) => (
                  <AreaCard key={a.id} area={a} bases={(basesQ.data ?? []).filter((b) => b.area_id === a.id)} teams={[]} users={[]} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      <AddAreaModal open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function LicenceStrip({ areas, users }: { areas: Area[]; users?: User[] }) {
  const { licence, organisation } = useAuth()
  if (!licence) return null
  const seats = seatUsage(users ?? [])
  const usedAreas = areas.filter((a) => a.status !== 'archived').length
  const cells: { label: string; used: number | null; max?: number | null; unit: string }[] = [
    { label: 'Areas', used: usedAreas, max: licence.max_areas, unit: 'areas' },
    { label: 'Ranger seats', used: users ? seats.rangers : null, max: licence.max_rangers, unit: 'rangers' },
    { label: 'Manager seats', used: users ? seats.managers : null, max: licence.max_managers, unit: 'managers' },
  ]
  return (
    <section aria-label="Licence usage" className="flex items-stretch rounded-xl bg-white px-5 py-4 shadow-card">
      <div className="flex w-[240px] shrink-0 items-center gap-3 pr-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-mint text-mid-green"><Icon name="badge" size={22} /></span>
        <div className="flex flex-col">
          <span className="text-body font-semibold text-ink">{fmt.titleCase(licence.plan)} licence</span>
          <span className="text-small text-ink-3">{organisation?.code} · {licenceModulesLabel(licence)}</span>
        </div>
      </div>
      {cells.map((c) => {
        const ratio = c.max && c.used != null ? c.used / c.max : 0
        const full = c.max != null && c.used != null && c.used >= c.max
        return (
          <div key={c.label} className="flex flex-1 flex-col justify-center gap-1 border-l border-line px-5">
            <span className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{c.label}</span>
            <span className="flex items-baseline gap-1.5">
              <span className={clsx('text-[22px] leading-7 font-bold', full ? 'text-danger' : 'text-ink')}>{c.used ?? '—'}</span>
              <span className="text-small text-ink-2">{c.max != null ? `of ${c.max} ${c.unit}` : `${c.unit} · unlimited`}</span>
            </span>
            <ProgressBar value={ratio} color={full ? '#C0392B' : ratio > 0.85 ? '#E67E22' : '#2D6A4F'} />
          </div>
        )
      })}
      <div className="flex flex-1 flex-col justify-center gap-0.5 border-l border-line pl-5">
        <span className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Expires</span>
        <span className="text-body font-semibold text-ink">{fmt.date(licence.expires_at)}</span>
        <span className="flex items-center gap-1 text-[12px] text-ink-3"><Icon name="lock" size={13} /> Managed by zrGISsolutions</span>
      </div>
    </section>
  )
}

function AreaCard({ area, bases, teams, users }: { area: Area; bases: ApuBase[]; teams: Team[]; users: User[] }) {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const { setAreaId } = useArea()
  const isAdmin = hasRole('org_admin')
  const update = useUpdateArea()
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState<'archive' | 'restore' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { setup, done, next } = setupProgress(area)
  const complete = next === null
  const archived = area.status === 'archived'

  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menu])

  const rangersAt = useMemo(() => {
    const m: Record<string, number> = {}
    for (const u of users) if (u.role === 'ranger' && u.is_active && u.apu_base_id) m[u.apu_base_id] = (m[u.apu_base_id] ?? 0) + 1
    return m
  }, [users])

  const sortedBases = [...bases].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  const updateErr = update.error instanceof ApiError ? update.error : null

  const doStatus = (status: 'archived' | 'draft') =>
    update.mutate({ id: area.id, status }, { onSuccess: () => setConfirm(null) })

  const stats = [
    { value: area.boundary ? formatKm2(area.area_km2).replace(' km²', '') : '—', unit: area.boundary ? 'km²' : '', label: area.boundary ? 'area' : 'no boundary yet' },
    { value: String(area.apu_base_count ?? bases.length), unit: '', label: 'APU bases' },
    { value: area.cell_count ? String(area.cell_count) : '—', unit: '', label: area.cell_count ? 'GRTS cells' : 'no grid yet' },
    { value: String(area.team_count ?? teams.length), unit: '', label: 'teams' },
  ]

  return (
    <article className={clsx('flex flex-col rounded-xl bg-white p-6 shadow-card', archived && 'opacity-80')} aria-label={area.name}>
      <div className="flex gap-5">
        <AreaThumb area={area} bases={bases} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 truncate text-h2 font-semibold text-ink" title={area.name}>{area.name}</h2>
            {isAdmin && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  aria-label={`More actions for ${area.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  onClick={() => setMenu((v) => !v)}
                  className="-mt-2 -mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-black/5"
                >
                  <Icon name="more_vert" size={22} />
                </button>
                {menu && (
                  <div role="menu" className="absolute top-10 right-0 z-20 w-56 overflow-hidden rounded-lg bg-white py-1 shadow-pop">
                    {!archived && (
                      <button role="menuitem" className="flex h-11 w-full items-center gap-3 px-4 text-left text-small hover:bg-mint" onClick={() => navigate(`/areas/${area.id}/setup/boundary`)}>
                        <Icon name="edit" size={18} /> Edit setup
                      </button>
                    )}
                    {archived ? (
                      <button role="menuitem" className="flex h-11 w-full items-center gap-3 px-4 text-left text-small hover:bg-mint" onClick={() => { setMenu(false); setConfirm('restore') }}>
                        <Icon name="unarchive" size={18} /> Restore as draft
                      </button>
                    ) : (
                      <button role="menuitem" className="flex h-11 w-full items-center gap-3 px-4 text-left text-small text-danger hover:bg-danger-bg" onClick={() => { setMenu(false); setConfirm('archive') }}>
                        <Icon name="archive" size={18} /> Archive area
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="mt-1 truncate text-body text-ink-2">{area.client_name || 'No client name'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AreaStatusBadge status={area.status} />
            <OutlineTag>{areaTypeLabel(area.area_type)}</OutlineTag>
          </div>
          <div className="flex-1" />
          <p className="mt-3 flex items-center gap-1.5 text-small text-ink-3">
            {area.status === 'active' ? (
              <>
                <Icon name="history" size={15} />
                Boundary {area.boundary_source === 'drawn' ? 'drawn on map' : area.boundary_source ? `from ${SOURCE_LABEL[area.boundary_source] ?? area.boundary_source}` : 'saved'} · updated {fmt.date(area.updated_at)}
              </>
            ) : archived ? (
              <><Icon name="archive" size={15} /> Archived · rangers no longer receive this area</>
            ) : (
              <><Icon name="info" size={15} /> Rangers do not receive draft areas</>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 border-y border-line py-3">
        {stats.map((s, i) => (
          <div key={s.label} className={clsx('flex flex-col px-5', i > 0 && 'border-l border-line')}>
            <span className="text-[22px] leading-7 font-bold text-ink">
              {s.value}
              {s.unit && <span className="ml-1 text-[18px]">{s.unit}</span>}
            </span>
            <span className="text-small text-ink-2">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="min-h-[220px] flex-1 pt-5">
        {complete && !archived ? (
          <>
            <div className="flex items-center">
              <span className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase flex-1">APU bases</span>
              <span className="text-[12px] text-ink-3">Sectors by nearest base</span>
            </div>
            <ul className="mt-2">
              {sortedBases.map((b, i) => {
                const baseTeams = teams.filter((t) => t.apu_base_id === b.id)
                return (
                  <li key={b.id} className={clsx('flex items-center gap-4 py-2.5', i > 0 && 'border-t border-line-soft')}>
                    <span className="h-7 w-[3px] rounded-full" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                    <span className="mono w-14 font-medium text-ink">{b.code}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-semibold text-ink">{b.name}</span>
                      <span className="truncate text-small text-ink-3">{baseTeams.length ? baseTeams.map((t) => t.name).join(' · ') : 'No team yet'}</span>
                    </span>
                    <span className="text-small text-ink-2">{rangersAt[b.id] ?? 0} rangers</span>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Setup</span>
              <span className="text-small font-semibold text-ink">{done} of 4</span>
              <ProgressBar value={done / 4} className="flex-1" />
            </div>
            <ol className="mt-2">
              {SETUP_STEPS.map((s, i) => {
                const state = setup[s.key] ? 'done' : s.key === next ? 'current' : 'todo'
                return (
                  <li key={s.key} className={clsx('flex items-center gap-3 py-2', i > 0 && 'border-t border-line-soft')}>
                    <StepCircle n={i + 1} state={state === 'current' ? 'todo' : state} size={26} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-semibold text-ink">{s.label}</span>
                      <span className="truncate text-small text-ink-3">{setup[s.key] ? stepDoneText(s.key, area) : s.hint}</span>
                    </span>
                    {state === 'current' && !archived && <span className="text-[12px] font-bold tracking-[0.06em] text-mid-green uppercase">Next</span>}
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {archived ? (
          isAdmin && <Button kind="secondary" icon="unarchive" onClick={() => setConfirm('restore')}>Restore as draft</Button>
        ) : complete || area.status === 'active' ? (
          <>
            <Button
              kind="secondary"
              icon="map"
              disabled={area.status !== 'active'}
              title={area.status !== 'active' ? 'Activate the area to open it on the operations map' : undefined}
              onClick={() => {
                setAreaId(area.id)
                navigate('/')
              }}
            >
              Open map
            </Button>
            <Button kind="secondary" icon="group" onClick={() => navigate(`/areas/${area.id}/setup/teams`)}>Assign teams</Button>
            <span className="flex-1" />
            {isAdmin && (
              <Button kind="ghost" icon={area.status === 'active' ? 'edit' : 'arrow_forward'} onClick={() => navigate(`/areas/${area.id}/setup/${next ?? 'boundary'}`)}>
                {area.status === 'active' ? 'Edit setup' : 'Activate'}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button icon="arrow_forward" onClick={() => navigate(`/areas/${area.id}/setup/${next ?? 'boundary'}`)}>
              {isAdmin ? 'Continue setup' : 'View setup'}
            </Button>
            <span className="flex-1" />
            {isAdmin && <Button kind="ghost" icon="archive" onClick={() => setConfirm('archive')}>Archive draft</Button>}
          </>
        )}
      </div>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => { setConfirm(null); update.reset() }}
        title={confirm === 'archive' ? `Archive ${area.name}?` : `Restore ${area.name}?`}
        confirmLabel={confirm === 'archive' ? 'Archive area' : 'Restore as draft'}
        danger={confirm === 'archive'}
        loading={update.isPending}
        onConfirm={() => doStatus(confirm === 'archive' ? 'archived' : 'draft')}
        error={
          updateErr && (
            <Banner tone={updateErr.code === 'licence_area_limit' ? 'warning' : 'danger'} title={updateErr.code === 'licence_area_limit' ? 'Area limit reached' : undefined}>
              {updateErr.code === 'licence_area_limit' ? 'Archive another area first, or ask zrGISsolutions to raise the area limit.' : updateErr.message}
            </Banner>
          )
        }
      >
        {confirm === 'archive' ? (
          <p>Rangers stop receiving this area on their next sync. Patrol history, boundary, bases and grid are kept, and archived areas do not count toward the licence area limit.</p>
        ) : (
          <p>The area returns as a draft with its boundary, bases and grid. Activate it again when it is ready for rangers.</p>
        )}
      </ConfirmModal>
    </article>
  )
}

function stepDoneText(key: string, area: Area): string {
  switch (key) {
    case 'boundary':
      return `${area.boundary_source ? `${fmt.titleCase(SOURCE_LABEL[area.boundary_source] ?? area.boundary_source)} · ` : ''}${formatKm2(area.area_km2)}`
    case 'bases':
      return `${area.apu_base_count ?? 0} placed`
    case 'grid':
      return `${area.cell_count ?? 0} cells · ${area.sector_count ?? 0} sectors`
    default:
      return `${area.team_count ?? 0} teams`
  }
}
