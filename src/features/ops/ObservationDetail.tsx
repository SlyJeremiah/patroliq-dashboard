// Observation detail: right-side panel on the Command Dashboard and Live Operations maps (same frame as RangerDetailPanel).
import type { ReactNode } from 'react'
import type { Observation, RangerLive } from '@/api/types'
import { MediaGallery } from '@/components/media/AuthMedia'
import { Icon, IconButton, SeverityBadge } from '@/components/ui'
import { fmt } from '@/lib/format'
import { OBS_COLOR, OBS_ICON, kindLabel, observationLabel, observerName, sexSummary } from './opsLogic'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-b border-line-soft py-2 last:border-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="break-words text-ink">{children}</dd>
    </div>
  )
}

export function ObservationDetailPanel({ observation: o, rangers, cellLabel, onClose, onRanger }: {
  observation: Observation
  rangers?: readonly RangerLive[]
  cellLabel?: (id?: string | null) => string | undefined
  onClose: () => void
  /** Open the observer's ranger detail (map pages). */
  onRanger?: (rangerId: string) => void
}) {
  const color = OBS_COLOR[o.category] ?? OBS_COLOR.other
  const title = observationLabel(o)
  const observer = observerName(o, rangers)
  const cell = o.cell_label ?? cellLabel?.(o.cell_id) ?? o.cell_id
  const sex = sexSummary(o)
  const photos = (o.media ?? []).filter((m) => m.kind === 'photo').length
  const observerKnown = !!o.observer_id && !!rangers?.some((r) => r.id === o.observer_id)

  return (
    <aside aria-label="Observation detail" className="flex w-[360px] shrink-0 flex-col border-l border-line bg-white">
      <header className="flex h-14 shrink-0 items-center gap-2.5 bg-forest pr-2 pl-5 text-cream">
        <Icon name="visibility" size={22} />
        <h2 className="flex-1 text-h3 font-semibold">Observation</h2>
        <IconButton icon="close" label="Close observation detail" onClick={onClose} className="text-cream hover:bg-cream/10" />
      </header>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
            <Icon name={OBS_ICON[o.category] ?? 'visibility'} size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-h3 font-semibold text-ink">{title}</h3>
            <p className="flex flex-wrap items-center gap-x-2 text-small text-ink-3">
              <span>{fmt.titleCase(o.category)}</span>
              <span aria-hidden>·</span>
              <time dateTime={o.recorded_at}>{fmt.dayTime(o.recorded_at)}</time>
            </p>
            {(o.severity || o.alert_manager) && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {o.severity && <SeverityBadge level={o.severity} />}
                {o.alert_manager && <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-warn-bg px-2 text-[11px] font-semibold text-[#7a4a12]"><Icon name="notifications_active" size={13} />Manager alerted</span>}
              </div>
            )}
          </div>
        </div>

        <section className="flex flex-col gap-2" aria-label="Photos">
          <h4 className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Photos{photos ? ` (${photos})` : ''}</h4>
          {o.media?.length ? <MediaGallery media={o.media} title={title} size={96} /> : <p className="text-small text-ink-3">No photos attached.</p>}
        </section>

        {o.notes && (
          <section className="flex flex-col gap-1">
            <h4 className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Notes</h4>
            <p className="text-small whitespace-pre-wrap text-ink">{o.notes}</p>
          </section>
        )}
        {o.voice_transcript && (
          <section className="flex flex-col gap-1">
            <h4 className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Voice note</h4>
            <p className="text-small whitespace-pre-wrap text-ink-2 italic">{o.voice_transcript}</p>
          </section>
        )}

        <dl className="text-small">
          <Row label="Category">{fmt.titleCase(o.category)}</Row>
          {o.species_name && <Row label="Species">{o.species_name}</Row>}
          {o.subtype && <Row label="Type">{kindLabel(o.subtype)}</Row>}
          {o.count != null && <Row label="Count">{o.count}</Row>}
          {sex && <Row label="Sex">{sex}</Row>}
          {o.age_class && <Row label="Age class">{fmt.titleCase(o.age_class)}</Row>}
          {o.behaviour && <Row label="Behaviour">{fmt.titleCase(o.behaviour)}</Row>}
          {o.direction_of_travel && <Row label="Direction">{o.direction_of_travel}</Row>}
          {o.severity && <Row label="Severity">{fmt.titleCase(o.severity)}</Row>}
          <Row label="Observer">
            {observer ? (
              observerKnown && onRanger ? (
                <button type="button" onClick={() => onRanger(o.observer_id!)} className="font-semibold text-mid-green underline-offset-2 hover:underline">{observer}</button>
              ) : observer
            ) : o.observer_id ? (
              <span className="mono text-[12px]">{o.observer_id}</span>
            ) : '—'}
          </Row>
          <Row label="Recorded">{fmt.dateTime(o.recorded_at)} · {fmt.ago(o.recorded_at)}</Row>
          {cell && <Row label="GRTS cell"><span className="mono">{cell}</span></Row>}
          <Row label="Location">
            <span className="mono">{fmt.coord(o.lat, o.lon)}</span>
            {o.accuracy_m != null && <span className="text-ink-3"> ±{Math.round(o.accuracy_m)} m</span>}
          </Row>
        </dl>
      </div>
    </aside>
  )
}
