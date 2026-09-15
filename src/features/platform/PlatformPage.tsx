// zrGISsolutions platform console: licensed organisations (design PlatformLicensees; spec §1, §5 Platform).
import clsx from 'clsx'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePlatformOrgs } from '@/api/hooks'
import { useAuth } from '@/auth/AuthContext'
import { Button, EmptyState, ErrorState, Icon, Select, Spinner } from '@/components/ui'
import { NewOrgModal } from './NewOrgModal'
import { OrgDrawer } from './OrgDrawer'
import { OrgMark, SeatBar, StatusBadge } from './parts'
import { useUsages, type PlatformOrg } from './platformApi'
import { graceDaysLeft, graceEndsAt, isExpired, licenceDate, modulesSummary, planLabel, suspensionCause, type OrgStatus, type Usage } from './platformLogic'

type StatusFilter = 'all' | OrgStatus | 'attention'

export function PlatformPage() {
  const { hasRole } = useAuth()
  const orgsQ = usePlatformOrgs()
  const orgs = useMemo(() => (orgsQ.data ?? []) as PlatformOrg[], [orgsQ.data])
  const usages = useUsages(useMemo(() => orgs.map((o) => o.id), [orgs]))
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [newOpen, setNewOpen] = useState(params.get('new') === '1')

  const selectedId = params.get('org')
  const focus = params.get('focus')
  const selected = orgs.find((o) => o.id === selectedId) ?? null

  const openOrg = useCallback(
    (id: string, focusOn?: 'term') => {
      setParams((p) => {
        const next = new URLSearchParams(p)
        next.set('org', id)
        if (focusOn) next.set('focus', focusOn)
        else next.delete('focus')
        next.delete('devtoken')
        return next
      }, { replace: true })
    },
    [setParams],
  )
  const closeOrg = useCallback(() => {
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.delete('org')
      next.delete('focus')
      return next
    }, { replace: true })
  }, [setParams])

  const counts = useMemo(() => {
    const c = { active: 0, grace: 0, suspended: 0, used: 0, licensed: 0, usageKnown: 0 }
    for (const o of orgs) {
      c[o.status] += 1
      c.licensed += o.licence?.max_rangers ?? 0
      const u = usages.byId[o.id]
      if (u) {
        c.used += u.rangers
        c.usageKnown += 1
      }
    }
    return c
  }, [orgs, usages.byId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orgs.filter((o) => {
      if (q && !o.name.toLowerCase().includes(q) && !o.code.toLowerCase().includes(q)) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'attention') return o.status !== 'active'
      return o.status === statusFilter
    })
  }, [orgs, search, statusFilter])

  const attention = useMemo(
    () => orgs.filter((o) => o.status !== 'active').sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'suspended' ? 1 : -1)),
    [orgs],
  )

  if (!hasRole('platform_admin')) {
    return <EmptyState icon="lock" title="Not available for your role" text="The platform console is for zrGISsolutions staff." />
  }

  const loading = orgsQ.isLoading
  const attentionCount = counts.grace + counts.suspended

  return (
    <div className="flex min-h-0 flex-1">
      <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-4 px-6 pt-5 pb-6">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-h1 font-bold text-ink">Licensed Organisations</h1>
              <p className="mt-0.5 text-[14px] text-ink-2">Each organisation is an isolated tenant with one active licence.</p>
            </div>
            <Button icon="add" onClick={() => setNewOpen(true)} className="mt-1 h-11 px-5">New organisation</Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Tile label="Organisations" value={loading ? '—' : orgs.length} sub={loading ? ' ' : `${counts.active + counts.grace} with access`} />
            <Tile
              label="Ranger seats"
              value={loading || usages.loading ? '—' : counts.used}
              sub={loading ? ' ' : `of ${counts.licensed} licensed${counts.usageKnown < orgs.length && !usages.loading ? ' · some usage unavailable' : ''}`}
            />
            <Tile
              label="Needs attention"
              value={loading ? '—' : attentionCount}
              tone={attentionCount > 0 ? 'danger' : undefined}
              sub={loading ? ' ' : attentionCount ? [counts.grace && `${counts.grace} in grace`, counts.suspended && `${counts.suspended} suspended`].filter(Boolean).join(' · ') : 'All licences active'}
            />
          </div>

          <div className="flex gap-3">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search organisation or code</span>
              <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organisation or code"
                className="h-12 w-full rounded-lg border-[1.5px] border-grey bg-white pr-3.5 pl-11 text-body text-ink outline-none placeholder:text-ink-3 focus:border-2 focus:border-forest"
              />
            </label>
            <div className="w-[200px]">
              <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="grace">Grace</option>
                <option value="suspended">Suspended</option>
                <option value="attention">Needs attention</option>
              </Select>
            </div>
          </div>

          <section className="overflow-hidden rounded-xl bg-white shadow-card" aria-label="Organisations">
            {loading ? (
              <div className="flex h-48 items-center justify-center gap-2 text-small text-ink-3"><Spinner className="text-forest" />Loading organisations…</div>
            ) : orgsQ.error ? (
              <div className="p-4"><ErrorState error={orgsQ.error} onRetry={() => orgsQ.refetch()} /></div>
            ) : orgs.length === 0 ? (
              <EmptyState icon="domain_add" title="No organisations yet" text="Create the first licensee to give its administrator access." action={<Button icon="add" onClick={() => setNewOpen(true)}>New organisation</Button>} />
            ) : filtered.length === 0 ? (
              <EmptyState icon="search_off" title="No organisations match" text="Try another name, code or status." action={<Button kind="ghost" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear filters</Button>} />
            ) : (
              <OrgTable orgs={filtered} usages={usages.byId} usageLoading={usages.loading} selectedId={selectedId} onOpen={(id) => openOrg(id)} />
            )}
          </section>

          {!loading && !orgsQ.error && orgs.length > 0 && (
            <section className="rounded-xl bg-white px-4 pt-3.5 pb-2 shadow-card" aria-label="Needs attention">
              <header className="flex items-baseline justify-between gap-3 pb-1">
                <h2 className="text-h3 font-semibold text-ink">Needs attention</h2>
                <span className="text-[12px] text-ink-3">Grace keeps sync working · SOS is always accepted</span>
              </header>
              {attention.length === 0 ? (
                <p className="flex items-center gap-2 py-3 text-small text-ink-2"><Icon name="check_circle" size={18} className="text-success" />Every organisation has an active licence.</p>
              ) : (
                <ul>
                  {attention.map((o, i) => <AttentionRow key={o.id} org={o} first={i === 0} onRenew={() => openOrg(o.id, 'term')} onOpen={() => openOrg(o.id)} />)}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {selectedId && (
        selected ? (
          <OrgDrawer key={selected.id} org={selected} usage={usages.byId[selected.id] ?? null} usageLoading={usages.loading && !usages.byId[selected.id]} focus={focus} onClose={closeOrg} />
        ) : (
          <aside className="flex h-full w-[500px] shrink-0 flex-col items-center justify-center border-l border-line bg-white">
            {loading ? <Spinner className="text-forest" /> : (
              <EmptyState icon="domain_disabled" title="Organisation not found" text="It may have been removed, or the link is incomplete." action={<Button kind="secondary" onClick={closeOrg}>Close</Button>} />
            )}
          </aside>
        )
      )}

      <NewOrgModal open={newOpen} existingCodes={orgs.map((o) => o.code)} onClose={() => setNewOpen(false)} onOpenOrg={(id) => openOrg(id)} />
    </div>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub: ReactNode; tone?: 'danger' }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-white px-4 py-3 shadow-card">
      <span className="text-label font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</span>
      <span className={clsx('text-[28px] leading-[34px] font-bold', tone === 'danger' ? 'text-danger' : 'text-forest')}>{value}</span>
      <span className="text-small text-ink-3">{sub}</span>
    </div>
  )
}

function OrgTable({ orgs, usages, usageLoading, selectedId, onOpen }: { orgs: PlatformOrg[]; usages: Record<string, Usage | null>; usageLoading: boolean; selectedId: string | null; onOpen: (id: string) => void }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            {['Organisation', 'Seats', 'Licence', 'Status'].map((h, i) => (
              <th key={h} scope="col" className={clsx('h-11 border-b border-line text-label font-semibold uppercase tracking-[0.06em] text-ink-3', i === 0 ? 'pr-3 pl-4' : 'px-3')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => {
            const u = usages[o.id]
            const l = o.licence
            const on = o.id === selectedId
            const suspended = o.status === 'suspended'
            const expired = isExpired(l?.expires_at)
            return (
              <tr
                key={o.id}
                tabIndex={0}
                aria-selected={on}
                onClick={() => onOpen(o.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(o.id) } }}
                className={clsx('cursor-pointer outline-none focus-visible:bg-cream-tint focus-visible:shadow-[inset_0_0_0_2px_#52B788]', on ? 'bg-mint shadow-[inset_4px_0_0_#102C26]' : 'hover:bg-cream-tint')}
              >
                <td className="h-[72px] border-b border-line-soft pr-3 pl-3">
                  <div className="flex items-center gap-3">
                    <OrgMark code={o.code} muted={suspended} />
                    <div className="min-w-0">
                      <p className={clsx('max-w-[220px] text-[14px] leading-[18px] font-semibold', suspended ? 'text-ink-2' : 'text-ink')}>{o.name}</p>
                      <p className="text-[12px] text-ink-2"><b className="font-semibold">{o.code}</b> · {planLabel(l?.plan)}</p>
                    </div>
                  </div>
                </td>
                <td className="border-b border-line-soft px-3">
                  {u ? (
                    <div className="flex w-[116px] flex-col gap-[5px]">
                      <span className="text-[13px] text-ink"><b className="font-bold">{u.rangers}</b> / {l?.max_rangers ?? 0} rangers</span>
                      <SeatBar used={u.rangers} limit={l?.max_rangers ?? 0} muted={suspended} />
                      <span className="text-[12px] text-ink-3">{u.areas} / {l?.max_areas ?? 0} areas</span>
                    </div>
                  ) : usageLoading ? (
                    <Spinner size={14} className="text-ink-3" />
                  ) : (
                    <span className="text-[12px] text-ink-3">Usage unavailable</span>
                  )}
                </td>
                <td className="border-b border-line-soft px-3">
                  {l ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[13px] whitespace-nowrap text-ink">{modulesSummary(l.modules)}</span>
                      <span className={clsx('text-[12px] whitespace-nowrap', expired ? (suspended ? 'font-semibold text-danger' : 'font-semibold text-[#A8561A]') : 'text-ink-2')}>
                        {expired ? 'Expired' : 'Expires'} {licenceDate(l.expires_at)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[13px] font-semibold text-danger">No licence</span>
                  )}
                </td>
                <td className="border-b border-line-soft px-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={o.status} />
                    <span className="text-[12px] whitespace-nowrap text-ink-3">{statusNote(o)}</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function statusNote(o: PlatformOrg): string {
  if (o.status === 'grace') {
    const left = graceDaysLeft(o.licence)
    if (left == null) return ''
    return left <= 0 ? 'Last day' : `${left} day${left === 1 ? '' : 's'} left`
  }
  if (o.status === 'suspended') {
    const cause = suspensionCause(o.status, o.licence)
    if (cause === 'expired') return `Since ${licenceDate(graceEndsAt(o.licence), { year: false })}`
    if (cause === 'no_licence') return 'No licence'
    return 'By zrGISsolutions'
  }
  return ''
}

function AttentionRow({ org, first, onRenew, onOpen }: { org: PlatformOrg; first: boolean; onRenew: () => void; onOpen: () => void }) {
  const grace = org.status === 'grace'
  const cause = suspensionCause(org.status, org.licence)
  const end = graceEndsAt(org.licence)
  const title = grace ? `${org.name} · grace ends ${licenceDate(end, { year: false })}` : `${org.name} · suspended`
  const detail = grace
    ? `Licence expired ${licenceDate(org.licence?.expires_at)} · sync still works · sign-in refused after grace`
    : cause === 'expired'
      ? `Grace ended ${licenceDate(end)} · rangers cannot sign in · SOS endpoint still open`
      : cause === 'no_licence'
        ? 'No licence on record · rangers cannot sign in · SOS endpoint still open'
        : 'Suspended by zrGISsolutions · rangers cannot sign in · SOS endpoint still open'
  const reinstate = !grace && cause === 'manual'
  return (
    <li className={clsx('flex items-center gap-3 py-2.5', !first && 'border-t border-line-soft')}>
      <Icon name={grace ? 'schedule' : 'lock'} size={20} className={grace ? 'text-amber' : 'text-danger'} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="text-[13px] text-ink-2">{detail}</p>
      </div>
      <Button kind="secondary" onClick={reinstate ? onOpen : onRenew} aria-label={`${reinstate ? 'Reinstate' : 'Renew'} ${org.name}`} className="min-w-[88px]">
        {reinstate ? 'Reinstate' : 'Renew'}
      </Button>
    </li>
  )
}
