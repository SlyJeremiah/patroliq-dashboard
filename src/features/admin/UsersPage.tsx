import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '@/api/client'
import { useApuBases, useAreas, useDeactivateUser, useSaveUser, useTeams, useUsers } from '@/api/hooks'
import type { AuditEntry, Page, User } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { Avatar, Banner, Button, ErrorState, Icon, Select, StatusDot, TextInput } from '@/components/ui'
import { roleColor } from '@/lib/format'
import { ROLE_OPTIONS, USER_STATUS_META, filterUsers, lastLoginByActor, loginLabel, seatUsage, userStatus } from './adminLogic'
import { ConfirmModal, Skeleton } from './parts'
import { UserDrawer } from './UserDrawer'

const PAGE_SIZE = 10

function useLastLogins() {
  return useQuery({
    queryKey: ['audit', { action: 'auth.login', limit: 500, purpose: 'last-login' }],
    queryFn: async () => {
      const d = await api.get<AuditEntry[] | Page<AuditEntry>>('audit-log/', { action: 'auth.login', limit: 500 })
      return lastLoginByActor(Array.isArray(d) ? d : d.results)
    },
    staleTime: 60_000,
  })
}

export function RoleBadge({ role }: { role: User['role'] }) {
  const label = ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role
  const outline = role === 'researcher'
  return (
    <span
      className={clsx('inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold tracking-[0.06em] uppercase', outline ? 'border-[1.5px] border-grey text-ink-2' : 'text-white')}
      style={outline ? undefined : { background: roleColor[role] }}
    >
      {label}
    </span>
  )
}

export function UsersPage() {
  const { licence, user: me } = useAuth()
  const [params, setParams] = useSearchParams()
  const usersQ = useUsers()
  const loginsQ = useLastLogins()
  const areasQ = useAreas()
  const teamsQ = useTeams()
  const basesQ = useApuBases(null)
  const deactivate = useDeactivateUser()
  const reactivate = useSaveUser()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<User | null>(null)
  const [toDeactivate, setToDeactivate] = useState<User | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const drawerOpen = params.get('new') === '1' || !!editing
  const closeDrawer = () => {
    setEditing(null)
    if (params.get('new')) {
      params.delete('new')
      setParams(params, { replace: true })
    }
  }

  useEffect(() => {
    if (!menuFor) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuFor])

  const all = useMemo(() => usersQ.data ?? [], [usersQ.data])
  const rows = useMemo(() => filterUsers(all, { search, role, status }), [all, search, role, status])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const seats = seatUsage(all)
  const roleCounts = ROLE_OPTIONS.map((r) => ({ ...r, n: all.filter((u) => u.role === r.value).length }))
  const areaName = useMemo(() => Object.fromEntries((areasQ.data ?? []).map((a) => [a.id, a.name])), [areasQ.data])
  const teamName = useMemo(() => Object.fromEntries((teamsQ.data ?? []).map((t) => [t.id, t.name])), [teamsQ.data])
  const baseCode = useMemo(() => Object.fromEntries((basesQ.data ?? []).map((b) => [b.id, b.code])), [basesQ.data])

  useEffect(() => setPage(0), [search, role, status])

  const scope = (u: User) => {
    const parts: string[] = []
    if (u.role === 'ranger') {
      if (u.team_id) parts.push(teamName[u.team_id] ?? 'Team')
      if (u.apu_base_id) parts.push(baseCode[u.apu_base_id] ?? 'Base')
    }
    const areas = u.area_ids.map((id) => areaName[id]).filter(Boolean)
    if (areas.length) parts.push(areas.length > 1 ? `${areas.length} areas` : areas[0])
    else if (u.role !== 'ranger') parts.push('All areas')
    if (u.role === 'researcher' || u.role === 'viewer') parts.push('anonymised')
    return parts.join(' · ') || '—'
  }

  const deErr = deactivate.error instanceof ApiError ? deactivate.error : null
  const reErr = reactivate.error instanceof ApiError ? reactivate.error : null

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-end gap-4 px-6 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-h1 font-bold text-ink">Users</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-2">
            <span className="font-semibold text-ink">{all.length} accounts</span>
            {roleCounts.map((r) => (
              <span key={r.value} className="inline-flex items-center gap-1.5">
                <StatusDot color={roleColor[r.value]} /> {r.label} {r.n}
              </span>
            ))}
          </p>
        </div>
        <Button icon="person_add" className="h-12 px-5" onClick={() => setParams({ new: '1' })}>Add user</Button>
      </div>

      <div className="flex flex-col gap-4 px-6 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-[360px]">
            <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or Employee ID" aria-label="Search users" className="pl-11" />
          </div>
          <div className="w-[200px]">
            <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
              <option value="">All roles</option>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <div className="w-[220px]">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {Object.entries(USER_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
          <span className="flex-1" />
          {licence && (
            <div className="flex items-center gap-4 text-small text-ink-2">
              <SeatMeter label="Ranger seats" used={seats.rangers} max={licence.max_rangers} />
              <SeatMeter label="Manager seats" used={seats.managers} max={licence.max_managers} />
            </div>
          )}
        </div>

        {reErr && (
          <Banner tone={reErr.code === 'licence_seat_limit' ? 'warning' : 'danger'} title={reErr.code === 'licence_seat_limit' ? 'No seats left' : 'Could not reactivate'} action={<Button kind="ghost" size="sm" onClick={() => reactivate.reset()}>Dismiss</Button>}>
            {reErr.code === 'licence_seat_limit' ? 'Deactivate an unused account of the same seat type or ask zrGISsolutions to add seats.' : reErr.message}
          </Banner>
        )}

        <section className="rounded-xl bg-white shadow-card">
          {usersQ.isError ? (
            <div className="p-5"><ErrorState error={usersQ.error} onRetry={() => void usersQ.refetch()} /></div>
          ) : usersQ.isLoading ? (
            <div className="flex flex-col gap-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <caption className="sr-only">Organisation user accounts</caption>
                <thead>
                  <tr className="border-b border-line text-left text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">
                    <th scope="col" className="h-12 pl-5 font-semibold">Employee ID</th>
                    <th scope="col" className="font-semibold">Name</th>
                    <th scope="col" className="font-semibold">Role</th>
                    <th scope="col" className="font-semibold">Status</th>
                    <th scope="col" className="font-semibold">Last login</th>
                    <th scope="col" className="font-semibold">Areas / team</th>
                    <th scope="col" className="w-14"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-small text-ink-3">
                        {all.length ? 'No users match these filters.' : 'No users yet. Add the first account.'}
                      </td>
                    </tr>
                  )}
                  {visible.map((u) => {
                    const st = userStatus(u)
                    const meta = USER_STATUS_META[st]
                    const lastLogin = u.last_login ?? loginsQ.data?.[u.id]
                    return (
                      <tr key={u.id} className="h-[52px] border-b border-line-soft last:border-0 hover:bg-cream-tint">
                        <td className="mono pl-5 whitespace-nowrap text-ink-2">{u.employee_id ?? '—'}</td>
                        <td>
                          <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => setEditing(u)}>
                            <Avatar name={u.full_name} color={u.is_active ? roleColor[u.role] : '#ADB5BD'} size={32} />
                            <span className="flex flex-col">
                              <span className={clsx('text-body font-semibold hover:underline', u.is_active ? 'text-ink' : 'text-ink-3')}>{u.full_name}</span>
                              {u.email && <span className="text-[12px] text-ink-3">{u.email}</span>}
                            </span>
                          </button>
                        </td>
                        <td><RoleBadge role={u.role} /></td>
                        <td>
                          <span className="inline-flex items-center gap-2 text-small font-semibold whitespace-nowrap text-ink">
                            <StatusDot color={meta.color} /> {meta.label}
                          </span>
                        </td>
                        <td className="text-small whitespace-nowrap text-ink-2">{loginLabel(lastLogin)}</td>
                        <td className="max-w-[260px] truncate text-small text-ink-2" title={scope(u)}>{scope(u)}</td>
                        <td className="pr-3 text-right">
                          <div className="relative inline-block" ref={menuFor === u.id ? menuRef : undefined}>
                            <button
                              type="button"
                              aria-label={`Actions for ${u.full_name}`}
                              aria-haspopup="menu"
                              aria-expanded={menuFor === u.id}
                              onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}
                              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-black/5"
                            >
                              <Icon name="more_vert" size={20} />
                            </button>
                            {menuFor === u.id && (
                              <div role="menu" className="absolute top-10 right-0 z-20 w-52 overflow-hidden rounded-lg bg-white py-1 text-left shadow-pop">
                                <button role="menuitem" className="flex h-11 w-full items-center gap-3 px-4 text-small hover:bg-mint" onClick={() => { setMenuFor(null); setEditing(u) }}>
                                  <Icon name="edit" size={18} /> Edit
                                </button>
                                {u.is_active ? (
                                  <button
                                    role="menuitem"
                                    disabled={u.id === me?.id}
                                    title={u.id === me?.id ? 'You cannot deactivate your own account' : undefined}
                                    className="flex h-11 w-full items-center gap-3 px-4 text-small text-danger hover:bg-danger-bg disabled:text-disabled disabled:hover:bg-transparent"
                                    onClick={() => { setMenuFor(null); deactivate.reset(); setToDeactivate(u) }}
                                  >
                                    <Icon name="person_off" size={18} /> Deactivate
                                  </button>
                                ) : (
                                  <button role="menuitem" className="flex h-11 w-full items-center gap-3 px-4 text-small hover:bg-mint" onClick={() => { setMenuFor(null); reactivate.mutate({ id: u.id, is_active: true }) }}>
                                    <Icon name="person_check" size={18} /> Reactivate
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center gap-3 border-t border-line px-5 py-3">
            <Icon name="history" size={18} className="text-ink-3" />
            <span className="text-small text-ink-2">Every account change is written to the audit log.</span>
            <Link to="/audit" className="text-small font-semibold text-mid-green hover:underline">View audit log</Link>
            <span className="flex-1" />
            {rows.length > 0 && (
              <nav aria-label="Pagination" className="flex items-center gap-1">
                <span className="mr-3 text-small text-ink-3">{current * PAGE_SIZE + 1}–{Math.min(rows.length, (current + 1) * PAGE_SIZE)} of {rows.length}</span>
                <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)} className="flex h-11 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-black/5 disabled:text-disabled">
                  <Icon name="chevron_left" size={20} />
                </button>
                {Array.from({ length: pages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-current={i === current ? 'page' : undefined}
                    onClick={() => setPage(i)}
                    className={clsx('h-9 min-w-9 rounded-lg px-2 text-small font-semibold', i === current ? 'bg-forest text-cream' : 'text-ink-2 hover:bg-black/5')}
                  >
                    {i + 1}
                  </button>
                ))}
                <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="flex h-11 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-black/5 disabled:text-disabled">
                  <Icon name="chevron_right" size={20} />
                </button>
              </nav>
            )}
          </div>
        </section>
      </div>

      <UserDrawer open={drawerOpen} onClose={closeDrawer} user={editing} allUsers={all} />
      <ConfirmModal
        open={!!toDeactivate}
        onClose={() => setToDeactivate(null)}
        title={`Deactivate ${toDeactivate?.full_name}?`}
        confirmLabel="Deactivate"
        danger
        loading={deactivate.isPending}
        onConfirm={() => toDeactivate && deactivate.mutate(toDeactivate.id, { onSuccess: () => setToDeactivate(null) })}
        error={deErr && <Banner tone="danger">{deErr.code === 'cannot_deactivate_self' ? 'You cannot deactivate your own account.' : deErr.message}</Banner>}
      >
        <p>They are signed out on every device and can no longer sign in. Patrols and observations stay attributed to them, and the seat is freed.</p>
        <p>You can reactivate the account later if a seat is available.</p>
      </ConfirmModal>
    </div>
  )
}

function SeatMeter({ label, used, max }: { label: string; used: number; max?: number | null }) {
  const full = max != null && used >= max
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      <span className={clsx('font-semibold', full ? 'text-danger' : 'text-ink')}>
        {used}
        <span className="font-normal text-ink-3"> / {max ?? '∞'}</span>
      </span>
    </span>
  )
}
