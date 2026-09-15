// Ranger detail (App Flow 9.1 / Design Doc 8.3): shared by the Command Dashboard, Live Operations and the Rangers table.
import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useRanger } from '@/api/hooks'
import type { Observation, RangerDetail as RangerDetailT } from '@/api/types'
import { Button, EmptyState, ErrorState, Icon, IconButton, SeverityBadge, Spinner, severityColor } from '@/components/ui'
import { fmt, rangerStatusColor } from '@/lib/format'
import { MessageModal, RangerStatusLabel } from './parts'
import { alertIcon, alertTitle, formatElapsed, initials, kindLabel } from './opsLogic'

const CELL_CHIPS = 12

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h4 className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 flex-1">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  )
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-line px-3 py-2.5">
      <span className="text-[22px] leading-7 font-bold text-ink">{value}</span>
      <span className="text-[12px] text-ink-3">{label}</span>
    </div>
  )
}

function observationLabel(o: Pick<Observation, 'category' | 'subtype' | 'species_name' | 'count'>): string {
  if (o.species_name) return `${o.species_name}${o.count ? ` · ${o.count}` : ''}`
  return o.subtype ? kindLabel(o.subtype) : fmt.titleCase(o.category)
}

const OBS_ICON: Record<string, string> = { wildlife: 'pets', threat: 'warning', carcass: 'skull', habitat: 'forest', infrastructure: 'construction', other: 'more_horiz' }

function batteryIcon(pct?: number | null) {
  if (pct == null) return 'battery_unknown'
  if (pct <= 15) return 'battery_alert'
  if (pct <= 40) return 'battery_3_bar'
  if (pct <= 75) return 'battery_5_bar'
  return 'battery_full'
}

export interface RangerDetailProps {
  rangerId: string
  areaId?: string | null
  /** Map pages: toggle the highlighted patrol track. Without it the button opens Live Operations. */
  onToggleRoute?: () => void
  routeShown?: boolean
}

export function RangerDetailContent({ rangerId, areaId, onToggleRoute, routeShown }: RangerDetailProps) {
  const { data: r, isLoading, error, refetch } = useRanger(rangerId)
  const [messaging, setMessaging] = useState(false)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-forest">
        <Spinner size={24} />
      </div>
    )
  }
  if (error || !r) return <div className="p-5"><ErrorState error={error} onRetry={() => void refetch()} /></div>

  return (
    <>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <Profile r={r} />
        <GpsCard r={r} />
        <Section title="Today">
          <div className="flex gap-2">
            <Stat value={fmt.km(r.today.distance_m)} label="Distance" />
            <Stat value={r.today.observations} label="Observations" />
            <Stat value={r.today.patrols} label={r.today.patrols === 1 ? 'Patrol' : 'Patrols'} />
          </div>
        </Section>
        <Section title="GRTS cells visited today" right={<span className="text-small font-semibold text-ink">{r.today.cells_visited.length}</span>}>
          {r.today.cells_visited.length ? (
            <div className="flex flex-wrap gap-1.5">
              {r.today.cells_visited.slice(0, CELL_CHIPS).map((c) => (
                <span key={c} className="mono inline-flex h-7 items-center gap-1 rounded bg-mint px-2 text-[12px] font-medium text-forest">
                  <Icon name="check" size={14} />
                  {c}
                </span>
              ))}
              {r.today.cells_visited.length > CELL_CHIPS && <span className="inline-flex h-7 items-center px-1 text-[12px] text-ink-3">+{r.today.cells_visited.length - CELL_CHIPS} more</span>}
            </div>
          ) : (
            <p className="text-small text-ink-3">No cells visited yet today.</p>
          )}
        </Section>
        <Section title="Current patrol">
          {r.current_patrol ? (
            <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
              <Icon name={r.current_patrol.patrol_type === 'vehicle' ? 'directions_car' : 'hiking'} size={22} className="text-mid-green" />
              <div className="min-w-0 flex-1">
                <p className="text-small font-semibold text-ink">
                  {fmt.titleCase(r.current_patrol.patrol_type)} patrol · {fmt.titleCase(r.current_patrol.status)}
                </p>
                <p className="text-[12px] text-ink-3">
                  Started {fmt.time(r.current_patrol.started_at)} · {formatElapsed(Date.now() - Date.parse(r.current_patrol.started_at))} · {fmt.km(r.current_patrol.distance_m)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-small text-ink-3">No open patrol.</p>
          )}
        </Section>
        <Section title="Latest observations">
          {r.recent_observations.length ? (
            <ul className="flex flex-col">
              {r.recent_observations.slice(0, 5).map((o) => (
                <li key={o.client_uuid} className="flex h-9 items-center gap-2.5 text-small">
                  <Icon name={OBS_ICON[o.category] ?? 'visibility'} size={18} className={o.severity ? undefined : 'text-mid-green'} />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {observationLabel(o)}
                    {o.cell_label && <span className="text-ink-3"> · {o.cell_label}</span>}
                  </span>
                  <span className="mono text-[12px] text-ink-3" title={fmt.dateTime(o.recorded_at)}>
                    {isToday(o.recorded_at) ? fmt.time(o.recorded_at) : fmt.date(o.recorded_at).replace(/ \d{4}$/, '')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-3">No observations recorded.</p>
          )}
        </Section>
        <Section title="Recent alerts">
          {r.alerts.length ? (
            <ul className="flex flex-col gap-1.5">
              {r.alerts.map((a) => (
                <li key={a.id}>
                  <Link to={`/alerts/${a.id}`} className="flex min-h-11 items-center gap-2.5 rounded-lg border-l-4 bg-cream-tint px-3 py-1.5 text-small hover:bg-mint" style={{ borderLeftColor: severityColor[a.severity] }}>
                    <Icon name={alertIcon(a)} size={18} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{alertTitle(a)}</span>
                      <span className="block text-[12px] text-ink-3">{fmt.dayTime(a.occurred_at)} · {a.status}</span>
                    </span>
                    <SeverityBadge level={a.severity} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-3">No alerts for this ranger.</p>
          )}
        </Section>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-white px-5 py-4">
        <Button icon="chat" onClick={() => setMessaging(true)}>Send message</Button>
        <div className="grid grid-cols-2 gap-2">
          {onToggleRoute ? (
            <Button kind="secondary" icon="route" onClick={onToggleRoute} disabled={!r.current_patrol} aria-pressed={routeShown} className={clsx(routeShown && '!bg-mint')} title={r.current_patrol ? undefined : 'No open patrol to show'}>
              {routeShown ? 'Hide route' : 'Patrol route'}
            </Button>
          ) : (
            <Link to={`/live?ranger=${r.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-forest bg-white px-3 text-[14px] font-bold tracking-[0.03em] uppercase text-forest hover:bg-mint">
              <Icon name="route" size={18} />
              Patrol route
            </Link>
          )}
          {areaId ? (
            <Link to={`/areas/${areaId}/setup/teams`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-forest bg-white px-3 text-[14px] font-bold tracking-[0.03em] uppercase text-forest hover:bg-mint">
              <Icon name="assignment_ind" size={18} />
              Assign
            </Link>
          ) : (
            <Button kind="secondary" icon="assignment_ind" disabled>Assign</Button>
          )}
        </div>
        {r.phone ? (
          <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-[14px] font-bold tracking-[0.03em] uppercase text-forest hover:bg-black/5">
            <Icon name="call" size={18} />
            Call {r.phone}
          </a>
        ) : (
          <p className="text-center text-[12px] text-ink-3">No phone number on file</p>
        )}
      </div>
      <MessageModal ranger={r} open={messaging} onClose={() => setMessaging(false)} />
    </>
  )
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

function Profile({ r }: { r: RangerDetailT }) {
  const since = r.status === 'active' || r.status === 'paused' ? r.current_patrol?.started_at : null
  return (
    <div className="flex items-start gap-3.5">
      <span className="relative shrink-0">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ranger text-[24px] font-bold text-white">{initials(r.full_name)}</span>
        <span className="absolute right-0 bottom-0.5 h-4 w-4 rounded-full border-[3px] border-white" style={{ background: rangerStatusColor[r.status] }} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-h3 font-semibold text-ink">{r.full_name}</h3>
        <p className="truncate text-small text-ink-3">
          <span className="mono">{r.employee_id ?? '—'}</span>
          {(r.team_name || r.apu_base_code) && ` · ${[r.team_name, r.apu_base_code].filter(Boolean).join(' · ')}`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2">
          <span className="inline-flex h-6 items-center rounded-full bg-black/5 px-2.5">
            <RangerStatusLabel status={r.status} className="!text-[12px]" />
          </span>
          {since && <span className="text-[12px] text-ink-3">since {fmt.time(since)} · {formatElapsed(Date.now() - Date.parse(since))}</span>}
        </div>
      </div>
    </div>
  )
}

function GpsCard({ r }: { r: RangerDetailT }) {
  const p = r.last_position
  if (!p) {
    return (
      <div className="rounded-lg bg-cream-tint px-4 py-3 text-small text-ink-3">
        <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1">Current GPS</p>
        No position received yet{r.last_sync_at ? ` · last sync ${fmt.ago(r.last_sync_at)}` : ''}.
      </div>
    )
  }
  const stale = Date.now() - Date.parse(p.recorded_at) > 15 * 60_000
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-[#F7EFE0] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 flex-1">{stale ? 'Last known GPS' : 'Current GPS'}</span>
        <span className={clsx('flex items-center gap-1 text-[12px]', stale ? 'text-amber' : 'text-ink-3')}>
          <Icon name={stale ? 'schedule' : 'sync'} size={14} className={stale ? undefined : 'text-mid-green'} />
          {fmt.time(p.recorded_at)} · {fmt.ago(p.recorded_at)}
        </span>
      </div>
      <p className="flex items-center gap-2">
        <Icon name="my_location" size={18} className="text-ranger" />
        <span className="mono !text-[15px] font-medium text-ink">{fmt.coord(p.lat, p.lon, 4)}</span>
        {p.accuracy_m != null && <span className="text-[12px] text-ink-3">±{Math.round(p.accuracy_m)} m</span>}
      </p>
      <p className="flex items-center gap-2 text-small text-ink-2">
        <Icon name={batteryIcon(p.battery_pct)} size={18} className={p.battery_pct != null && p.battery_pct <= 15 ? 'text-danger' : 'text-mid-green'} />
        {p.battery_pct != null ? <><b className="text-ink">{p.battery_pct}%</b> battery</> : 'Battery unknown'}
        {r.last_sync_at && <span className="ml-auto text-[12px] text-ink-3">Synced {fmt.ago(r.last_sync_at)}</span>}
      </p>
    </div>
  )
}

/** Right-side slide-in panel (360 px) with forest header. */
export function RangerDetailPanel({ onClose, ...props }: RangerDetailProps & { onClose: () => void }) {
  return (
    <aside aria-label="Ranger detail" className="flex w-[360px] shrink-0 flex-col border-l border-line bg-white">
      <header className="flex h-14 shrink-0 items-center gap-2.5 bg-forest pr-2 pl-5 text-cream">
        <Icon name="person" size={22} />
        <h2 className="flex-1 text-h3 font-semibold">Ranger detail</h2>
        <IconButton icon="close" label="Close ranger detail" onClick={onClose} className="text-cream hover:bg-cream/10" />
      </header>
      <RangerDetailContent {...props} />
    </aside>
  )
}

export function NoRangerSelected() {
  return <EmptyState icon="person_search" title="Select a ranger" text="Click a ranger on the map or in the list to see their position, today's patrol and quick actions." />
}
