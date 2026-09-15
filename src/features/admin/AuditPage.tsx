import clsx from 'clsx'
import { Fragment, useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AuditEntry, Page } from '@/api/types'
import { Button, ErrorState, Icon, Select, Spinner } from '@/components/ui'
import { fmt } from '@/lib/format'
import { AUDIT_ACTIONS, actionLabel, actionTone, actorText, targetText } from './adminLogic'
import { Skeleton } from './parts'

const PAGE_SIZE = 25

type Entry = AuditEntry & { actor_label?: string | null }

interface Filters {
  action: string
  date_from: string
  date_to: string
}

/** Local query: the shared `useAuditLog` hook has no date filters (see FOUNDATION_REQUESTS.md). */
function useAuditPage(filters: Filters, offset: number) {
  return useQuery({
    queryKey: ['audit', { ...filters, offset, limit: PAGE_SIZE }],
    queryFn: async () => {
      const d = await api.get<Entry[] | Page<Entry>>('audit-log/', { ...filters, limit: PAGE_SIZE, offset })
      return Array.isArray(d) ? { count: d.length, results: d } : { count: d.count, results: d.results }
    },
    placeholderData: keepPreviousData,
  })
}

const TONE_CLASS = {
  danger: 'bg-danger-bg text-[#8a2a20]',
  warning: 'bg-warn-bg text-[#7a4a12]',
  success: 'bg-mint text-forest',
  neutral: 'bg-black/5 text-ink-2',
}

export function AuditPage() {
  const [filters, setFilters] = useState<Filters>({ action: '', date_from: '', date_to: '' })
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const q = useAuditPage(filters, offset)

  useEffect(() => setOffset(0), [filters])

  const count = q.data?.count ?? 0
  const rows = q.data?.results ?? []
  const page = Math.floor(offset / PAGE_SIZE)
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const filtered = !!(filters.action || filters.date_from || filters.date_to)

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-end gap-4 px-6 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-h1 font-bold text-ink">Audit log</h1>
          <p className="mt-0.5 text-body text-ink-2">Sign-ins, account changes, area setup, alerts, reports and exports in your organisation.</p>
        </div>
        {q.isFetching && !q.isLoading && <Spinner className="mb-2 text-mid-green" />}
      </div>

      <div className="flex flex-col gap-4 px-6 pb-8">
        <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-small text-ink-2">
          <Icon name="lock" size={20} className="text-info" />
          <span>
            <b className="text-ink">Immutable record.</b> Entries are append-only: nobody, including administrators, can edit or delete them. Times are shown in your browser’s timezone.
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-[260px] flex-col gap-1">
            <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Action</span>
            <Select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{actionLabel(a)} ({a})</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">From</span>
            <input type="date" value={filters.date_from} max={filters.date_to || undefined} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="h-12 rounded-lg border-[1.5px] border-grey bg-white px-3.5 text-body text-ink outline-none focus:border-2 focus:border-forest" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">To</span>
            <input type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="h-12 rounded-lg border-[1.5px] border-grey bg-white px-3.5 text-body text-ink outline-none focus:border-2 focus:border-forest" />
          </label>
          {filtered && <Button kind="ghost" icon="filter_alt_off" onClick={() => setFilters({ action: '', date_from: '', date_to: '' })}>Clear filters</Button>}
          <span className="flex-1" />
          <span className="pb-3 text-small text-ink-3">{count.toLocaleString('en-GB')} entries · newest first</span>
        </div>

        <section className="rounded-xl bg-white shadow-card">
          {q.isError ? (
            <div className="p-5"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>
          ) : q.isLoading ? (
            <div className="flex flex-col gap-2 p-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <caption className="sr-only">Audit log entries</caption>
                <thead>
                  <tr className="border-b border-line text-left text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">
                    <th scope="col" className="h-12 pl-5 font-semibold">Time</th>
                    <th scope="col" className="font-semibold">Actor</th>
                    <th scope="col" className="font-semibold">Action</th>
                    <th scope="col" className="font-semibold">Target</th>
                    <th scope="col" className="font-semibold">IP</th>
                    <th scope="col" className="w-24 pr-5 text-right font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-small text-ink-3">{filtered ? 'No entries match these filters.' : 'No audit entries yet.'}</td>
                    </tr>
                  )}
                  {rows.map((e) => {
                    const expanded = open === e.id
                    const hasDetail = e.detail && Object.keys(e.detail).length > 0
                    return (
                      <Fragment key={e.id}>
                        <tr className={clsx('h-[52px] border-b border-line-soft', expanded && 'bg-cream-tint')}>
                          <td className="pl-5 text-small whitespace-nowrap text-ink-2">{fmt.dateTime(e.created_at)}</td>
                          <td className="max-w-[240px] truncate text-small text-ink" title={actorText(e)}>{actorText(e)}</td>
                          <td>
                            <span className="flex flex-col items-start">
                              <span className={clsx('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap', TONE_CLASS[actionTone(e.action)])}>{actionLabel(e.action)}</span>
                              <span className="mono !text-[11px] text-ink-3">{e.action}</span>
                            </span>
                          </td>
                          <td className="text-small whitespace-nowrap text-ink-2" title={e.target_id ?? undefined}>{targetText(e)}</td>
                          <td className="mono whitespace-nowrap text-ink-2">{e.ip ?? '—'}</td>
                          <td className="pr-3 text-right">
                            {hasDetail ? (
                              <button
                                type="button"
                                aria-expanded={expanded}
                                aria-label={`${expanded ? 'Hide' : 'Show'} detail for ${actionLabel(e.action)} at ${fmt.dateTime(e.created_at)}`}
                                onClick={() => setOpen(expanded ? null : e.id)}
                                className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-small font-semibold text-mid-green hover:bg-mint"
                              >
                                {expanded ? 'Hide' : 'View'}
                                <Icon name={expanded ? 'expand_less' : 'expand_more'} size={18} />
                              </button>
                            ) : (
                              <span className="pr-2 text-small text-ink-3">—</span>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-line-soft bg-cream-tint">
                            <td colSpan={6} className="px-5 pb-4">
                              <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-1 rounded-lg border border-line bg-white p-4">
                                <dt className="text-small text-ink-3">Entry ID</dt>
                                <dd className="mono text-ink">{e.id}</dd>
                                {e.target_type && (
                                  <>
                                    <dt className="text-small text-ink-3">Target</dt>
                                    <dd className="mono text-ink">{e.target_type} · {e.target_id}</dd>
                                  </>
                                )}
                                {Object.entries(e.detail ?? {}).map(([k, v]) => (
                                  <Fragment key={k}>
                                    <dt className="text-small text-ink-3">{k.replace(/_/g, ' ')}</dt>
                                    <dd className="mono break-all whitespace-pre-wrap text-ink">{typeof v === 'string' ? v || '—' : JSON.stringify(v, null, 1)}</dd>
                                  </Fragment>
                                ))}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-line px-5 py-3">
            <span className="text-small text-ink-3">
              {count ? `${offset + 1}–${Math.min(count, offset + PAGE_SIZE)} of ${count.toLocaleString('en-GB')}` : '0 entries'}
            </span>
            <span className="flex-1" />
            <Button kind="secondary" size="sm" icon="chevron_left" disabled={page === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="h-11">Newer</Button>
            <span className="px-2 text-small text-ink-2">Page {page + 1} of {pages}</span>
            <Button kind="secondary" size="sm" disabled={page >= pages - 1} onClick={() => setOffset(offset + PAGE_SIZE)} className="h-11">
              Older <Icon name="chevron_right" size={16} />
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
