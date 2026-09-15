// Presentational pieces shared by the operations pages.
import clsx from 'clsx'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useAcknowledgeAlert, useMessageRanger, useResolveAlert } from '@/api/hooks'
import type { AlertItem, RangerStatus } from '@/api/types'
import { Banner, Button, Field, Icon, Modal, SeverityBadge, StatusDot, TextArea, severityColor } from '@/components/ui'
import { fmt, rangerStatusColor } from '@/lib/format'
import type { AlarmState } from './alarm'
import { STATUS_LABEL, alertIcon, alertTitle, isOpen, isSafety, kindLabel, statusLabel } from './opsLogic'

/** Human message for alert mutation errors, including `409 alert_closed`. */
export function alertErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'alert_closed' || e.status === 409) return 'This alert is already closed — the ranger cancelled it or another manager resolved it.'
    return e.message
  }
  return 'The action did not complete. Try again.'
}

export function RangerStatusLabel({ status, className }: { status: RangerStatus; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-small font-semibold', className)}>
      <StatusDot color={rangerStatusColor[status] ?? '#6C757D'} pulse={status === 'sos' ? 'sos' : undefined} />
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function AlertStatusPill({ status }: { status: string }) {
  const tone = status === 'active' ? 'bg-danger-bg text-[#8a2a20]' : status === 'acknowledged' ? 'bg-warn-bg text-[#7a4a12]' : 'bg-mint text-forest'
  const icon = status === 'active' ? 'notifications_active' : status === 'acknowledged' ? 'visibility' : 'check_circle'
  return (
    <span className={clsx('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap', tone)}>
      <Icon name={icon} size={14} />
      {statusLabel(status)}
    </span>
  )
}

// ------------------------------------------------------------------ alert card

export function AlertCard({ alert, cellLabel, onAcknowledge, acknowledging }: { alert: AlertItem; cellLabel?: string; onAcknowledge?: () => void; acknowledging?: boolean }) {
  const acked = alert.status !== 'active'
  const pulse = alert.severity === 'critical' && !acked
  const color = severityColor[alert.severity]
  const sub = [alert.ranger_name, alert.cell_label ?? cellLabel].filter(Boolean).join(' · ')
  return (
    <article
      className={clsx('relative rounded-lg border-l-4 bg-white py-3 pr-3 pl-3.5 shadow-card transition-opacity hover:shadow-pop', acked && 'opacity-60')}
      style={{ borderLeftColor: color, animation: pulse ? 'piq-critical 2.4s ease-in-out infinite' : undefined, background: pulse ? undefined : acked ? '#FFFFFF' : `${color}0A` }}
    >
      <div className="flex items-start gap-2.5">
        <Icon name={alertIcon(alert)} size={20} className="mt-0.5" fill={isSafety(alert)} />
        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] leading-5 font-semibold text-ink">
            <Link to={`/alerts/${alert.id}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-emerald">
              {alertTitle(alert)}
            </Link>
          </h4>
          {sub && <p className="text-small text-ink-2">{sub}</p>}
          {alert.note && <p className="line-clamp-2 text-small text-ink-3">{alert.note}</p>}
        </div>
        <SeverityBadge level={alert.severity} className="shrink-0" />
      </div>
      <div className="mt-2 flex min-h-8 items-center gap-2 pl-[30px]">
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
          <time dateTime={alert.occurred_at}>{fmt.time(alert.occurred_at)}</time> · {fmt.ago(alert.occurred_at)}
        </span>
        {acked ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-ink-3">
            <Icon name="check" size={16} />
            {statusLabel(alert.status)}
          </span>
        ) : onAcknowledge ? (
          <Button
            kind="secondary"
            size="sm"
            className="relative z-10 h-9 min-w-[44px]"
            loading={acknowledging}
            onClick={onAcknowledge}
            aria-label={`Acknowledge ${alertTitle(alert)}`}
          >
            Acknowledge
          </Button>
        ) : null}
      </div>
    </article>
  )
}

// ------------------------------------------------------------------ chip with a popover menu

export interface ChipOption {
  value: string
  label: string
}

export function ChipMenu({ icon, value, options, onChange, label, dark }: { icon: string; value: string; options: ChipOption[]; onChange: (v: string) => void; label: string; dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const current = options.find((o) => o.value === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const isDefault = current?.value === options[0]?.value
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${current?.label}`}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'inline-flex h-11 items-center gap-2 rounded-full px-3.5 text-[14px] font-semibold shadow-pop transition-colors',
          dark ? (isDefault ? 'bg-forest/92 text-cream hover:bg-forest' : 'bg-cream text-forest') : isDefault ? 'bg-white text-ink' : 'bg-forest text-cream',
        )}
      >
        <Icon name={icon} size={18} />
        {current?.label}
        <Icon name="expand_more" size={16} className="opacity-70" />
      </button>
      {open && (
        <ul id={id} role="listbox" aria-label={label} className="scroll-thin absolute top-12 left-0 z-20 max-h-72 min-w-52 overflow-y-auto rounded-lg bg-white py-1 text-ink shadow-pop">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={clsx('flex h-10 w-full items-center gap-2 px-3.5 text-left text-small hover:bg-mint', o.value === value && 'font-semibold')}
              >
                <Icon name="check" size={16} className={o.value === value ? 'text-mid-green' : 'invisible'} />
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ alarm + urgent banner

export function AlarmControl({ alarm, onDark = true }: { alarm: AlarmState; onDark?: boolean }) {
  const base = clsx('inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold whitespace-nowrap', onDark ? 'bg-black/20 text-white hover:bg-black/30' : 'bg-danger-bg text-[#8a2a20] hover:bg-[#f3c5ca]')
  if (alarm.blocked) {
    return (
      <button type="button" className={base} onClick={alarm.enable}>
        <Icon name="volume_off" size={20} />
        Click to enable alarm sound
      </button>
    )
  }
  return (
    <button type="button" className={base} onClick={alarm.toggleMute} aria-pressed={alarm.muted} aria-label={alarm.muted ? 'Alarm muted. Unmute alarm' : 'Alarm sounding. Mute alarm'}>
      <Icon name={alarm.muted ? 'volume_off' : 'volume_up'} size={20} />
      {alarm.muted ? 'Alarm muted' : alarm.sounding ? 'Alarm sounding' : 'Alarm on'}
    </button>
  )
}

/** Full-width red banner while a panic / dead man's switch alert is open. */
export function UrgentSosBanner({ alerts, alarm, cellLabel }: { alerts: AlertItem[]; alarm: AlarmState; cellLabel?: (id?: string | null) => string | undefined }) {
  const a = alerts[0]
  if (!a) return null
  const where = a.cell_label ?? cellLabel?.(a.cell_id)
  return (
    <div role="alert" className="flex min-h-[72px] shrink-0 items-center gap-4 bg-danger px-5 py-2.5 text-white">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20" style={{ animation: a.status === 'active' ? 'piq-sos 1s infinite' : undefined }}>
        <Icon name={alertIcon(a)} size={28} fill />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold tracking-[0.08em] uppercase text-white/85">
          Urgent · {a.status === 'active' ? 'SOS active' : 'SOS acknowledged — not resolved'}
          {alerts.length > 1 && ` · ${alerts.length} open SOS alerts`}
        </p>
        <p className="truncate text-h3 font-bold">
          {kindLabel(a.kind)} — {a.ranger_name ?? 'Unknown ranger'}
        </p>
        <p className="truncate text-small text-white/90">
          Triggered {fmt.time(a.occurred_at)} · {fmt.ago(a.occurred_at)}
          {where ? ` · ${where}` : ''}
          {a.lat != null && a.lon != null ? ` · ${fmt.coord(a.lat, a.lon, 4)}` : ''}
        </p>
      </div>
      {alerts.some((x) => x.status === 'active') && <AlarmControl alarm={alarm} />}
      <Link to={`/alerts/${a.id}`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-[14px] font-bold tracking-[0.03em] uppercase text-danger hover:bg-cream">
        Open SOS panel
        <Icon name="arrow_forward" size={18} />
      </Link>
    </div>
  )
}

// ------------------------------------------------------------------ modals

export function useAcknowledge() {
  const ack = useAcknowledgeAlert()
  const [error, setError] = useState<string | null>(null)
  const acknowledge = (id: string, note?: string) => {
    setError(null)
    ack.mutate({ id, note }, { onError: (e) => setError(alertErrorMessage(e)) })
  }
  return { acknowledge, pendingId: ack.isPending ? ack.variables?.id : undefined, error, clearError: () => setError(null) }
}

export function ResolveModal({ alert, open, onClose }: { alert: AlertItem | null; open: boolean; onClose: () => void }) {
  const resolve = useResolveAlert()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setNote('')
      setError(null)
      resolve.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!alert) return null
  const safety = isSafety(alert)
  const submit = () =>
    resolve.mutate(
      { id: alert.id, note: note.trim() || undefined },
      { onSuccess: onClose, onError: (e) => setError(alertErrorMessage(e)) },
    )
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Resolve: ${alertTitle(alert)}`}
      footer={
        <>
          <Button kind="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="task_alt" loading={resolve.isPending} disabled={safety && !note.trim()} onClick={submit}>Resolve alert</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-small text-ink-2">
          {alert.ranger_name ? `${alert.ranger_name} · ` : ''}
          {fmt.dateTime(alert.occurred_at)}. The note is added to the alert timeline and the audit log and cannot be edited later.
        </p>
        <Field label={safety ? 'Resolution note (required)' : 'Resolution note'} htmlFor="resolve-note" helper={`${note.length}/1000`}>
          <TextArea id="resolve-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={safety ? 'e.g. Ranger reached by radio, safe at APU-2' : 'e.g. Snare removed and logged'} />
        </Field>
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </Modal>
  )
}

export function MessageModal({ ranger, open, onClose }: { ranger: { id: string; full_name: string; phone?: string | null } | null; open: boolean; onClose: () => void }) {
  const send = useMessageRanger()
  const [text, setText] = useState('')
  useEffect(() => {
    if (open) {
      setText('')
      send.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!ranger) return null
  const done = send.isSuccess
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Message ${ranger.full_name}`}
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button kind="ghost" onClick={onClose}>Cancel</Button>
            <Button icon="send" loading={send.isPending} disabled={!text.trim()} onClick={() => send.mutate({ id: ranger.id, text: text.trim() })}>Send message</Button>
          </>
        )
      }
    >
      {done ? (
        <Banner tone="success" title="Message queued">
          Sent by {send.data?.channel === 'sms' ? `SMS to ${ranger.phone ?? 'the ranger'}` : 'push notification to the PatrolIQ app'}. Logged in the audit trail.
        </Banner>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Message" htmlFor="ranger-message" helper={`${text.length}/320 · ${ranger.phone ? 'Delivered by SMS' : 'Delivered as a push notification'}`}>
            <TextArea id="ranger-message" maxLength={320} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Move to GRTS-031 after your current loop. Report on arrival." autoFocus />
          </Field>
          {send.isError && <Banner tone="danger">{send.error instanceof Error ? send.error.message : 'Message not sent.'}</Banner>}
        </div>
      )}
    </Modal>
  )
}

export function OpenBadge({ alert }: { alert: AlertItem }) {
  return isOpen(alert) ? <SeverityBadge level={alert.severity} /> : <AlertStatusPill status={alert.status} />
}
