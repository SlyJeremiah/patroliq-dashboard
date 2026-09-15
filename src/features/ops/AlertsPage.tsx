// Alerts (`/alerts`) — full alert feed with Active / Acknowledged / All tabs, filters and acknowledge / resolve actions.
import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlerts } from '@/api/hooks'
import type { AlertItem, Severity } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { Banner, Button, DataTable, EmptyState, ErrorState, Icon, PageHeader, Select, SeverityBadge, Spinner, Tabs, TextInput, severityColor, type Column } from '@/components/ui'
import { fmt } from '@/lib/format'
import { alertIcon, alertTitle, filterAlerts, isOpen, isSafety, mergeAlerts, sortAlerts, type AlertFilter } from './opsLogic'
import { AlertStatusPill, ResolveModal, useAcknowledge } from './parts'
import { useAreaLayers } from './useOpsMap'

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']

export function AlertsPage() {
  const { areaId, area } = useArea()
  const navigate = useNavigate()
  const activeQ = useAlerts({ status: 'active', area_id: areaId })
  const ackQ = useAlerts({ status: 'acknowledged', area_id: areaId })
  const allQ = useAlerts({ area_id: areaId, limit: 200 })
  const { cellLabel } = useAreaLayers(areaId)
  const { acknowledge, pendingId, error: ackError, clearError } = useAcknowledge()
  const [resolving, setResolving] = useState<AlertItem | null>(null)
  const [filter, setFilter] = useState<AlertFilter>({ tab: 'active', severities: [], type: 'all', search: '' })

  const all = useMemo(() => sortAlerts(mergeAlerts(allQ.data, ackQ.data, activeQ.data)), [allQ.data, ackQ.data, activeQ.data])
  const rows = useMemo(() => {
    const filtered = filterAlerts(all, filter, cellLabel)
    // "All" is a history view: newest first. Open tabs keep the Critical → Low ordering.
    return filter.tab === 'all' ? [...filtered].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)) : filtered
  }, [all, filter, cellLabel])

  const q = filter.tab === 'active' ? activeQ : filter.tab === 'acknowledged' ? ackQ : allQ
  const activeCount = activeQ.data?.length
  const ackCount = ackQ.data?.length
  const filtersOn = filter.severities.length > 0 || filter.type !== 'all' || filter.search.trim() !== ''
  const set = (patch: Partial<AlertFilter>) => setFilter((f) => ({ ...f, ...patch }))

  const columns: Column<AlertItem>[] = [
    {
      key: 'severity',
      header: 'Severity',
      width: '112px',
      render: (a) => <SeverityBadge level={a.severity} />,
    },
    {
      key: 'alert',
      header: 'Alert',
      render: (a) => (
        <div className="flex max-w-[420px] items-center gap-2.5 py-2 whitespace-normal">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${severityColor[a.severity]}1A`, color: severityColor[a.severity] }}>
            <Icon name={alertIcon(a)} size={20} fill={isSafety(a)} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{alertTitle(a)}</span>
            <span className="line-clamp-1 block text-[12px] text-ink-3">{isSafety(a) ? 'Safety alert' : 'Threat report'}{a.note ? ` · ${a.note}` : ''}</span>
          </span>
        </div>
      ),
    },
    { key: 'ranger', header: 'Ranger', render: (a) => a.ranger_name ?? '—' },
    { key: 'cell', header: 'Cell', render: (a) => <span className="mono">{a.cell_label ?? cellLabel(a.cell_id) ?? '—'}</span> },
    {
      key: 'time',
      header: 'Occurred',
      render: (a) => (
        <span className="flex flex-col leading-tight">
          <span>{fmt.dayTime(a.occurred_at)}</span>
          <span className="text-[12px] text-ink-3">{fmt.ago(a.occurred_at)}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (a) => <AlertStatusPill status={a.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (a) => (
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {a.status === 'active' && (
            <Button kind="secondary" size="sm" className="h-9" loading={pendingId === a.id} onClick={() => acknowledge(a.id)} aria-label={`Acknowledge ${alertTitle(a)}`}>
              Acknowledge
            </Button>
          )}
          {isOpen(a) && (
            <Button kind="ghost" size="sm" className="h-9" icon="task_alt" onClick={() => setResolving(a)} aria-label={`Resolve ${alertTitle(a)}`}>
              Resolve
            </Button>
          )}
          <Icon name="chevron_right" size={20} className="self-center text-ink-3" />
        </div>
      ),
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Alerts"
        subtitle={`${area?.name ?? 'All areas'} · safety and threat alerts, updated every 30 s`}
        actions={
          (activeCount ?? 0) > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full bg-danger-bg px-3 py-1 text-small font-semibold text-[#8a2a20]">
              <Icon name="notifications_active" size={16} />
              {activeCount} unacknowledged
            </span>
          ) : null
        }
      />
      <div className="px-6">
        <Tabs
          value={filter.tab}
          onChange={(tab) => set({ tab })}
          tabs={[
            { value: 'active', label: `Active${activeCount != null ? ` (${activeCount})` : ''}`, icon: 'notifications_active' },
            { value: 'acknowledged', label: `Acknowledged${ackCount != null ? ` (${ackCount})` : ''}`, icon: 'visibility' },
            { value: 'all', label: 'All', icon: 'history' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <div className="relative w-72">
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <TextInput value={filter.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search ranger, cell, type, note" className="!h-11 pl-9" aria-label="Search alerts" />
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Severity">
          {SEVERITIES.map((s) => {
            const on = filter.severities.includes(s)
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => set({ severities: on ? filter.severities.filter((x) => x !== s) : [...filter.severities, s] })}
                className={clsx('inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold capitalize', on ? 'border-forest bg-forest text-cream' : 'border-[#DDD5C5] bg-white text-ink-2 hover:bg-mint')}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: severityColor[s] }} />
                {s}
              </button>
            )
          })}
        </div>
        <div className="w-48">
          <Select value={filter.type} onChange={(e) => set({ type: e.target.value as AlertFilter['type'] })} className="!h-11" aria-label="Alert type">
            <option value="all">All types</option>
            <option value="safety">Safety (SOS)</option>
            <option value="threat">Threats</option>
          </Select>
        </div>
        {filtersOn && (
          <Button kind="ghost" size="sm" className="h-11" icon="filter_alt_off" onClick={() => set({ severities: [], type: 'all', search: '' })}>
            Clear filters
          </Button>
        )}
        <span className="ml-auto text-small text-ink-3">{rows.length} shown</span>
      </div>
      {ackError && (
        <div className="px-6 pb-2">
          <Banner tone="danger" action={<Button kind="ghost" size="sm" onClick={clearError}>Dismiss</Button>}>{ackError}</Banner>
        </div>
      )}
      <div className="min-h-0 flex-1 px-6 pb-6">
        <div className="scroll-thin h-full overflow-y-auto rounded-xl bg-white shadow-card">
          {q.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-forest"><Spinner size={22} /> Loading alerts</div>
          ) : q.error ? (
            <div className="p-5"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(a) => a.id}
              onRowClick={(a) => navigate(`/alerts/${a.id}`)}
              empty={
                filtersOn ? (
                  <EmptyState icon="filter_alt_off" title="No alerts match these filters" action={<Button kind="secondary" size="sm" onClick={() => set({ severities: [], type: 'all', search: '' })}>Clear filters</Button>} />
                ) : filter.tab === 'active' ? (
                  <EmptyState icon="verified_user" title="No active alerts" text="New SOS alerts and threat reports from rangers appear here as soon as they reach the server." />
                ) : filter.tab === 'acknowledged' ? (
                  <EmptyState icon="visibility" title="Nothing waiting for resolution" text="Acknowledged alerts stay here until they are resolved." />
                ) : (
                  <EmptyState icon="history" title="No alerts recorded yet" />
                )
              }
            />
          )}
        </div>
      </div>
      <ResolveModal alert={resolving} open={!!resolving} onClose={() => setResolving(null)} />
    </div>
  )
}
