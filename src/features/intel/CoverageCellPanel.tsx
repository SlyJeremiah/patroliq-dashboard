import { Link } from 'react-router-dom'
import { useObservations } from '@/api/hooks'
import type { CoverageCell, Observation } from '@/api/types'
import { CELL_STYLE } from '@/components/map/AreaMap'
import { Icon, IconButton, ProgressBar, SeverityBadge, Spinner } from '@/components/ui'
import { fmt } from '@/lib/format'
import { monthBounds, monthLabel, shortSectorName } from './intelLogic'

export const STATUS_LABEL: Record<CoverageCell['status'], string> = {
  complete: 'Complete',
  partial: 'Partial',
  pending: 'Pending',
  never: 'Never surveyed',
}

const CATEGORY_ICON: Record<Observation['category'], string> = {
  wildlife: 'pets',
  threat: 'warning',
  carcass: 'skull',
  habitat: 'forest',
  infrastructure: 'fence',
  other: 'label',
}

function observationTitle(o: Observation): string {
  const name = o.species_name ?? (o.subtype ? fmt.titleCase(o.subtype) : fmt.titleCase(o.category))
  return o.count && o.count > 1 ? `${name} · ${o.count}` : name
}

export function StatusPill({ status }: { status: CoverageCell['status'] }) {
  const s = CELL_STYLE[status]
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold tracking-[0.05em] uppercase" style={{ background: `${s.fill}22`, color: status === 'pending' ? '#1B4332' : s.stroke }}>
      <span className="h-2 w-2 rounded-[2px]" style={{ background: s.fill }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** Selected GRTS cell: visits vs target, last visit, this month's observations and a link to assign a team. */
export function CoverageCellPanel({ areaId, cell, month, target, sectorName, canAssign, onClose }: {
  areaId: string
  cell: CoverageCell
  month: string
  target: number
  sectorName?: string
  canAssign: boolean
  onClose: () => void
}) {
  const { since, until } = monthBounds(month)
  const obs = useObservations({ area_id: areaId, since: `${since}T00:00:00Z`, until: `${until}T00:00:00Z` })
  const inCell = (obs.data ?? []).filter((o) => o.cell_id === cell.cell_id).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))

  return (
    <section aria-label={`Cell ${cell.label}`} className="flex min-h-0 flex-1 flex-col rounded-xl bg-white shadow-card">
      <header className="flex items-start gap-3 px-5 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="font-mono text-[20px] font-medium text-ink">{cell.label}</h2>
            <StatusPill status={cell.status} />
          </div>
          <p className="text-small text-ink-3">
            {sectorName ? shortSectorName(sectorName) : 'No sector'} · {cell.last_visit_at ? `last visit ${fmt.date(cell.last_visit_at)}, ${fmt.ago(cell.last_visit_at)}` : 'never visited'}
          </p>
        </div>
        <IconButton icon="close" label="Close cell details" onClick={onClose} className="-mt-1 -mr-2" />
      </header>

      <div className="grid grid-cols-2 gap-4 px-5 pt-3 pb-4">
        <div>
          <p className="text-[12px] font-semibold text-ink-3">{monthLabel(month, 'MMMM')} visits</p>
          <p className="text-body text-ink">
            <span className="text-[22px] font-bold" style={{ color: cell.visits >= target ? '#2D6A4F' : cell.visits > 0 ? '#B35F12' : '#C0392B' }}>{cell.visits}</span> of {target}
          </p>
          <ProgressBar value={cell.visits / Math.max(1, target)} color={cell.visits >= target ? '#2D6A4F' : '#E67E22'} className="mt-1" />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-ink-3">Observations</p>
          <p className="text-body text-ink"><span className="text-[22px] font-bold">{cell.observations}</span> this month</p>
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-line px-5 pt-3">
        <h3 className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">Observations in {monthLabel(month, 'MMMM')}</h3>
        {inCell.length > 0 && <span className="text-caption text-ink-3">{inCell.length} recorded</span>}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        {obs.isLoading ? (
          <div className="flex justify-center py-6 text-forest"><Spinner /></div>
        ) : inCell.length === 0 ? (
          <p className="py-4 text-small text-ink-3">No observations were logged in this cell this month.</p>
        ) : (
          <ul>
            {inCell.slice(0, 6).map((o) => (
              <li key={o.client_uuid} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream-tint text-mid-green"><Icon name={CATEGORY_ICON[o.category]} size={18} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-small font-semibold text-ink">{observationTitle(o)}</span>
                  <span className="truncate text-[12px] text-ink-3">{fmt.date(o.recorded_at)}{o.observer_name ? ` · ${o.observer_name}` : ''}</span>
                </span>
                {o.severity && <SeverityBadge level={o.severity} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canAssign && (
        <footer className="flex gap-2 border-t border-line px-5 py-3">
          <Link
            to={`/areas/${areaId}/setup/teams`}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-forest px-4 text-[14px] font-bold tracking-[0.03em] text-cream uppercase hover:bg-[#0A1E1A]"
          >
            <Icon name="person_add" size={18} />
            Assign ranger
          </Link>
        </footer>
      )}
    </section>
  )
}
