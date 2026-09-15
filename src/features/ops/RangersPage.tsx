// Rangers (`/rangers`) — live roster table with status, last seen, battery and today's activity; row opens the ranger detail drawer.
import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useRangers, useTeams } from '@/api/hooks'
import type { RangerLive, RangerStatus } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { DataTable, Drawer, EmptyState, ErrorState, Icon, PageHeader, Select, Spinner, TextInput, type Column } from '@/components/ui'
import { fmt, rangerStatusColor } from '@/lib/format'
import { STATUS_LABEL, filterRangers, initials, lastSeen, sortRangers, statusCounts } from './opsLogic'
import { RangerStatusLabel } from './parts'
import { RangerDetailContent } from './RangerDetail'

const STATUSES: RangerStatus[] = ['sos', 'active', 'paused', 'offline']

function Battery({ pct }: { pct?: number | null }) {
  if (pct == null) return <span className="text-ink-3">—</span>
  const low = pct <= 15
  return (
    <span className={clsx('inline-flex items-center gap-1.5', low && 'font-semibold text-danger')}>
      <span className="relative h-2.5 w-6 rounded-[3px] border-[1.5px] border-current" aria-hidden>
        <span className="absolute inset-[1px] rounded-[1px]" style={{ width: `${Math.max(8, pct)}%`, background: low ? '#C0392B' : pct <= 40 ? '#E67E22' : '#27AE60' }} />
      </span>
      {pct}%{low && <span className="sr-only"> low battery</span>}
    </span>
  )
}

export function RangersPage() {
  const { areaId, area } = useArea()
  const rangersQ = useRangers(areaId)
  const teamsQ = useTeams(areaId ?? undefined)
  const [search, setSearch] = useState('')
  const [teamId, setTeamId] = useState('')
  const [statuses, setStatuses] = useState<RangerStatus[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const rangers = useMemo(() => rangersQ.data ?? [], [rangersQ.data])
  const counts = statusCounts(rangers)
  const rows = useMemo(() => sortRangers(filterRangers(rangers, { search, teamId: teamId || undefined, statuses })), [rangers, search, teamId, statuses])
  const selectedRanger = rangers.find((r) => r.id === selected)

  const columns: Column<RangerLive>[] = [
    {
      key: 'name',
      header: 'Ranger',
      render: (r) => (
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ranger text-[13px] font-bold text-white">{initials(r.full_name)}</span>
          <span className="flex flex-col leading-tight">
            <span className="font-semibold text-ink">{r.full_name}</span>
            <span className="mono !text-[12px] text-ink-3">{r.employee_id ?? '—'}</span>
          </span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <RangerStatusLabel status={r.status} /> },
    {
      key: 'team',
      header: 'Team / base',
      render: (r) => (
        <span className="flex flex-col leading-tight">
          <span>{r.team_name ?? 'No team'}</span>
          <span className="text-[12px] text-ink-3">{r.apu_base_code ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'seen',
      header: 'Last seen',
      render: (r) => {
        const s = lastSeen(r)
        return s ? (
          <span className="flex flex-col leading-tight" title={fmt.dateTime(s)}>
            <span>{fmt.ago(s)}</span>
            <span className="text-[12px] text-ink-3">{r.last_position ? 'GPS ping' : 'Sync only, no GPS'}</span>
          </span>
        ) : (
          <span className="text-ink-3">Never</span>
        )
      },
    },
    { key: 'battery', header: 'Battery', render: (r) => <Battery pct={r.last_position?.battery_pct} /> },
    { key: 'distance', header: 'Distance today', align: 'right', render: (r) => (r.today.distance_m ? fmt.km(r.today.distance_m) : <span className="text-ink-3">0 km</span>) },
    { key: 'obs', header: 'Observations', align: 'right', render: (r) => r.today.observations },
    {
      key: 'patrol',
      header: 'Current patrol',
      render: (r) =>
        r.current_patrol ? (
          <span className="flex flex-col leading-tight">
            <span>{fmt.titleCase(r.current_patrol.patrol_type)} · {fmt.titleCase(r.current_patrol.status)}</span>
            <span className="text-[12px] text-ink-3">since {fmt.time(r.current_patrol.started_at)} · {fmt.km(r.current_patrol.distance_m)}</span>
          </span>
        ) : (
          <span className="text-ink-3">None</span>
        ),
    },
  ]

  const filtersOn = !!search.trim() || !!teamId || statuses.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Rangers"
        subtitle={`${area?.name ?? 'All areas'} · ${counts.total} rangers · ${counts.active} active · ${counts.paused} paused · ${counts.offline} offline${counts.sos ? ` · ${counts.sos} SOS` : ''}`}
      />
      <div className="flex flex-wrap items-center gap-3 px-6 pb-3">
        <div className="relative w-72">
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, employee ID, team" className="!h-11 pl-9" aria-label="Search rangers" />
        </div>
        <div className="w-56">
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="!h-11" aria-label="Team">
            <option value="">All teams</option>
            {(teamsQ.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Status">
          {STATUSES.map((s) => {
            const on = statuses.includes(s)
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setStatuses((v) => (on ? v.filter((x) => x !== s) : [...v, s]))}
                className={clsx('inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold', on ? 'border-forest bg-forest text-cream' : 'border-[#DDD5C5] bg-white text-ink-2 hover:bg-mint')}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: rangerStatusColor[s], outline: s === 'offline' ? '1.5px dashed currentColor' : undefined, outlineOffset: 1 }} />
                {STATUS_LABEL[s]} · {counts[s]}
              </button>
            )
          })}
        </div>
        <span className="ml-auto text-small text-ink-3">{rows.length} shown</span>
      </div>
      <div className="min-h-0 flex-1 px-6 pb-6">
        <div className="scroll-thin h-full overflow-y-auto rounded-xl bg-white shadow-card">
          {rangersQ.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-forest"><Spinner size={22} /> Loading rangers</div>
          ) : rangersQ.error ? (
            <div className="p-5"><ErrorState error={rangersQ.error} onRetry={() => void rangersQ.refetch()} /></div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelected(r.id)}
              selectedKey={selected}
              empty={
                filtersOn ? (
                  <EmptyState icon="person_off" title="No rangers match these filters" />
                ) : (
                  <EmptyState icon="badge" title="No rangers in this area" text="Add ranger accounts in Users and assign them to a team in this area." />
                )
              }
            />
          )}
        </div>
      </div>
      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Ranger detail" subtitle={selectedRanger?.full_name} width={400}>
        {selected && (
          <div className="-mx-5 -my-4 flex h-[calc(100%+32px)] flex-col">
            <RangerDetailContent rangerId={selected} areaId={areaId} />
          </div>
        )}
      </Drawer>
    </div>
  )
}
