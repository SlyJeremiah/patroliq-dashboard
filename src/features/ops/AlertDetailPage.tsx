// Alert detail (`/alerts/:alertId`): SOS / Safety Alert Panel (App Flow 8.2, SosPanel.png) or a threat incident view.
import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { ApiError } from '@/api/client'
import { useAlert, useDispatchAlert, usePositionHistory, useRanger, useRangers } from '@/api/hooks'
import type { AlertItem, AlertTimelineEntry, RangerLive } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { AreaMap, type MapPoint } from '@/components/map/AreaMap'
import { Banner, Button, EmptyState, ErrorState, Field, Icon, Modal, SeverityBadge, Spinner, TextArea, severityColor } from '@/components/ui'
import { fmt, rangerStatusColor } from '@/lib/format'
import { useSosAlarm } from './alarm'
import {
  STATUS_LABEL, alertIcon, alertTitle, formatDistance, formatElapsed, haversineM, initials, isOpen, isSafety, kindLabel, nearestRangers, signalLabel,
  stationarySince, statusLabel, toTimed, type NearestUnit,
} from './opsLogic'
import { AlarmControl, AlertStatusPill, ResolveModal, alertErrorMessage, useAcknowledge } from './parts'
import { MAP_FILL, addMapControls, rangerPoints, useAreaLayers } from './useOpsMap'

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function AlertDetailPage() {
  const { alertId } = useParams()
  const q = useAlert(alertId)

  if (q.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-forest">
        <Spinner size={24} /> Loading alert
      </div>
    )
  }
  if (q.error || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        {notFound ? (
          <EmptyState icon="search_off" title="Alert not found" text="It may belong to another organisation or the link is wrong." action={<Link to="/alerts" className="font-semibold text-mid-green underline">Back to alerts</Link>} />
        ) : (
          <div className="w-full max-w-lg"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>
        )}
      </div>
    )
  }
  return isSafety(q.data) ? <SosPanel alert={q.data} /> : <IncidentPanel alert={q.data} />
}

// ------------------------------------------------------------------ shared actions

function useAlertActions(alert: AlertItem) {
  const { acknowledge, pendingId, error: ackError, clearError } = useAcknowledge()
  const [dispatching, setDispatching] = useState(false)
  const [resolving, setResolving] = useState(false)
  return {
    acknowledge: () => acknowledge(alert.id),
    acknowledging: pendingId === alert.id,
    error: ackError,
    clearError,
    dispatching,
    setDispatching,
    resolving,
    setResolving,
  }
}

const TIMELINE: Record<string, { label: string; color: string; icon: string }> = {
  raised: { label: 'Raised', color: '#C0392B', icon: 'notifications_active' },
  acknowledged: { label: 'Acknowledged', color: '#102C26', icon: 'visibility' },
  dispatched: { label: 'Support dispatched', color: '#2980B9', icon: 'directions_run' },
  resolved: { label: 'Resolved', color: '#27AE60', icon: 'task_alt' },
  cancelled: { label: 'Cancelled by ranger', color: '#27AE60', icon: 'cancel' },
}

function Timeline({ entries, safety }: { entries: AlertTimelineEntry[]; safety: boolean }) {
  const list = [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  if (!list.length) return <p className="text-small text-ink-3">No timeline entries.</p>
  return (
    <ol className="relative flex flex-col gap-3.5">
      <span className="absolute top-2 bottom-2 left-[5px] w-px bg-line" aria-hidden />
      {list.map((e, i) => {
        const m = TIMELINE[e.action] ?? { label: fmt.titleCase(e.action), color: '#6C757D', icon: 'circle' }
        const label = e.action === 'raised' && safety ? 'SOS triggered' : m.label
        return (
          <li key={`${e.at}-${i}`} className="relative flex gap-3 pl-0">
            <span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-white" style={{ background: m.color }} aria-hidden />
            <span className="mono w-[62px] shrink-0 pt-px !text-[12px] text-ink-3" title={fmt.dateTime(e.at)}>{fmt.time(e.at)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-small font-semibold text-ink">{label}</span>
              {e.note && <span className="block text-[12px] break-words text-ink-2">{e.note}</span>}
              <span className="block text-[12px] text-ink-3">{e.actor_name ?? 'System'} · {fmt.date(e.at)}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function AuditNote() {
  return (
    <p className="flex items-start gap-2 border-t border-line pt-3 text-[12px] text-ink-3">
      <Icon name="lock" size={16} />
      Immutable audit trail. Entries are append-only and cannot be edited or deleted.
    </p>
  )
}

function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-xl bg-white p-4 shadow-card', className)}>
      {(title || right) && (
        <div className="mb-3 flex items-center gap-2">
          {title && <h3 className="flex-1 text-h3 font-semibold text-ink">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

function Tile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-lg bg-[#F7EFE0] px-3.5 py-2.5', className)}>
      <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-0.5">{label}</p>
      {children}
    </div>
  )
}

function SignalBars({ level }: { level?: number | null }) {
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className="w-[3px] rounded-sm" style={{ height: 4 + i * 3, background: level != null && i <= level ? (level <= 1 ? '#E67E22' : '#27AE60') : '#D5CCBA' }} />
      ))}
    </span>
  )
}

function Responders({ alert }: { alert: AlertItem }) {
  if (!alert.responders?.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Responders dispatched{alert.dispatched_at ? ` · ${fmt.time(alert.dispatched_at)}` : ''}</p>
      <ul className="flex flex-wrap gap-1.5">
        {alert.responders.map((r) => (
          <li key={r.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-info-bg px-2.5 text-[12px] font-semibold text-[#1d5d87]">
            <Icon name="directions_run" size={14} />
            {r.full_name}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ClosedBanner({ alert }: { alert: AlertItem }) {
  if (isOpen(alert)) return null
  return (
    <Banner tone="success" title={statusLabel(alert.status)}>
      {alert.resolved_at ? `Closed ${fmt.dateTime(alert.resolved_at)}.` : 'This alert is closed.'}
      {alert.note ? ` ${alert.note}` : ''}
    </Banner>
  )
}

// ------------------------------------------------------------------ map with links to nearest units

function linksCollection(from: { lat: number; lon: number } | null, units: NearestUnit<RangerLive>[]) {
  const lines: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] }
  const labels: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] }
  if (!from) return { lines, labels }
  for (const u of units) {
    const p = u.ranger.last_position!
    lines.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[from.lon, from.lat], [p.lon, p.lat]] }, properties: {} })
    labels.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [(from.lon + p.lon) / 2, (from.lat + p.lat) / 2] }, properties: { label: formatDistance(u.distance_m) } })
  }
  return { lines, labels }
}

function useLinkLayers(map: MlMap | null, from: { lat: number; lon: number } | null, units: NearestUnit<RangerLive>[]) {
  useEffect(() => {
    if (!map) return
    const { lines, labels } = linksCollection(from, units)
    if (!map.getSource('ops-links')) {
      map.addSource('ops-links', { type: 'geojson', data: lines })
      map.addSource('ops-link-labels', { type: 'geojson', data: labels })
      map.addLayer({ id: 'ops-links-casing', type: 'line', source: 'ops-links', paint: { 'line-color': '#FFFFFF', 'line-width': 4, 'line-opacity': 0.7 } })
      map.addLayer({ id: 'ops-links', type: 'line', source: 'ops-links', paint: { 'line-color': '#102C26', 'line-width': 2, 'line-dasharray': [2, 2] } })
      map.addLayer({
        id: 'ops-link-labels', type: 'symbol', source: 'ops-link-labels',
        layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
        paint: { 'text-color': '#102C26', 'text-halo-color': '#F7E7CE', 'text-halo-width': 3 },
      })
    } else {
      ;(map.getSource('ops-links') as GeoJSONSource).setData(lines)
      ;(map.getSource('ops-link-labels') as GeoJSONSource).setData(labels)
    }
  }, [map, from, units])
}

function paddedBox(coords: { lat: number; lon: number }[], pad = 0.004): Polygon | null {
  if (!coords.length) return null
  const lats = coords.map((c) => c.lat)
  const lons = coords.map((c) => c.lon)
  const [s, n, w, e] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lons) - pad, Math.max(...lons) + pad]
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }
}

// ------------------------------------------------------------------ SOS panel

function SosPanel({ alert }: { alert: AlertItem }) {
  const { areas, area: selectedArea } = useArea()
  const area = areas.find((x) => x.id === alert.area_id) ?? selectedArea
  const layers = useAreaLayers(area?.id ?? null)
  const now = useNow(1000)
  const open = isOpen(alert)
  const alarm = useSosAlarm(alert.status === 'active')
  const actions = useAlertActions(alert)
  const rangerQ = useRanger(alert.ranger_id)
  const rangersQ = useRangers(null)
  const history = usePositionHistory({ ranger_id: alert.ranger_id ?? undefined })
  const [map, setMap] = useState<MlMap | null>(null)

  const ranger = rangerQ.data
  const sosPoint = useMemo(() => (alert.lat != null && alert.lon != null ? { lat: alert.lat, lon: alert.lon } : null), [alert.lat, alert.lon])
  const units = useMemo(() => (sosPoint ? nearestRangers(rangersQ.data ?? [], sosPoint, { excludeId: alert.ranger_id, limit: 3 }) : []), [rangersQ.data, sosPoint, alert.ranger_id])
  const nearUnits = useMemo(() => units.filter((u) => u.distance_m < 25_000), [units])
  useLinkLayers(map, sosPoint, nearUnits)

  const points = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = [...layers.bases, ...rangerPoints(nearUnits.map((u) => u.ranger))]
    if (sosPoint) pts.push({ id: alert.ranger_id ?? alert.id, kind: 'ranger', ...sosPoint, color: open ? '#C0392B' : '#6C757D', label: initials(alert.ranger_name), pulse: open ? 'sos' : undefined })
    return pts
  }, [layers.bases, nearUnits, sosPoint, alert.ranger_id, alert.id, alert.ranger_name, open])
  const fitTo = useMemo(() => paddedBox([...(sosPoint ? [sosPoint] : []), ...nearUnits.map((u) => u.ranger.last_position!)]), [sosPoint, nearUnits])

  const timed = useMemo(() => toTimed(history.data ?? []), [history.data])
  const stillSince = stationarySince(timed)
  const latest = ranger?.last_position
  const latestMoved = latest && sosPoint ? haversineM(sosPoint, latest) : null
  const cell = alert.cell_label ?? layers.cellLabel(alert.cell_id)
  const dms = alert.kind === 'dead_mans_switch'
  const phone = ranger?.phone

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* URGENT banner */}
      <div role={open ? 'alert' : undefined} className={clsx('flex min-h-[84px] shrink-0 items-center gap-4 px-5 py-3 text-white', open ? 'bg-danger' : 'bg-mid-green')}>
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-white/20" style={{ animation: alert.status === 'active' ? 'piq-sos 1s infinite' : undefined }}>
          <Icon name={open ? alertIcon(alert) : 'task_alt'} size={30} fill />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold tracking-[0.08em] uppercase text-white/85">
            {open ? `Urgent · ${alert.status === 'active' ? 'SOS active' : 'SOS acknowledged — not resolved'}` : `SOS closed · ${statusLabel(alert.status)}`}
          </p>
          <h1 className="truncate text-[24px] leading-8 font-bold">
            {kindLabel(alert.kind)} — {alert.ranger_name ?? 'Unknown ranger'}
          </h1>
          <p className="truncate text-small text-white/90">
            Triggered {format(parseISO(alert.occurred_at), 'EEE d MMM, HH:mm:ss')} · {formatElapsed(now - Date.parse(alert.occurred_at))} ago
            {cell ? ` · ${cell}` : ''}
          </p>
        </div>
        {alert.status === 'active' && <AlarmControl alarm={alarm} />}
        <Link to="/alerts" className="inline-flex h-11 items-center gap-1.5 rounded-full bg-black/15 px-4 text-[14px] font-semibold hover:bg-black/25">
          <Icon name="arrow_back" size={18} />
          All alerts
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Map */}
        <AreaMap
          className={`min-w-0 flex-1 ${MAP_FILL}`}
          boundary={area?.boundary}
          cells={layers.cells}
          showCells
          points={points}
          fitTo={fitTo}
          onReady={(m) => {
            addMapControls(m)
            setMap(m)
          }}
        >
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-lg bg-forest/92 px-3.5 py-2.5 text-small text-cream">
            <span className="w-5 border-t-2 border-dashed border-cream" aria-hidden />
            Distance to nearest units
          </div>
          {!sosPoint && (
            <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white px-4 py-3 text-small text-ink shadow-pop">This alert has no GPS position.</div>
          )}
          {open && (
            <div className="absolute bottom-10 left-4 z-10 flex items-center gap-2 rounded-lg bg-forest/92 px-3.5 py-2.5 text-small text-cream">
              <Icon name="my_location" size={18} className="text-emerald" />
              GPS every 30 s while SOS is active · page refreshes every 15 s
            </div>
          )}
        </AreaMap>

        {/* Middle column */}
        <div className="flex w-[340px] shrink-0 flex-col border-l border-line bg-white">
          <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] border-danger bg-ranger text-[20px] font-bold text-white">{initials(alert.ranger_name)}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-h3 font-semibold text-ink">{alert.ranger_name ?? 'Unknown ranger'}</span>
                  {open && <span className="shrink-0 rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-bold tracking-[0.05em] text-white">SOS</span>}
                </p>
                <p className="truncate text-small text-ink-3">
                  <span className="mono">{ranger?.employee_id ?? (alert as AlertItem & { employee_id?: string }).employee_id ?? '—'}</span>
                  {ranger?.team_name ? ` · ${ranger.team_name}` : ''}
                </p>
                {!open && <div className="mt-1"><AlertStatusPill status={alert.status} /></div>}
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Alert type</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { on: !dms, icon: 'e911_emergency', label: 'Panic button' },
                  { on: dms, icon: 'timer_off', label: "Dead man's switch" },
                ].map((t) => (
                  <div key={t.label} className={clsx('relative flex h-[62px] flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-small', t.on ? 'border-danger bg-danger-bg/60 font-semibold text-danger' : 'border-line text-ink-3')} aria-current={t.on ? 'true' : undefined}>
                    {t.on && <Icon name="check_circle" size={16} className="absolute top-1.5 right-1.5" />}
                    <Icon name={t.icon} size={20} fill={t.on} />
                    {t.label}
                  </div>
                ))}
              </div>
            </div>

            <Tile label="Last GPS">
              {sosPoint ? (
                <>
                  <p className="flex items-center gap-2">
                    <Icon name="location_on" size={18} className="text-danger" />
                    <span className="mono !text-[15px] font-medium text-ink">{fmt.coord(sosPoint.lat, sosPoint.lon, 4)}</span>
                  </p>
                  <p className="text-[12px] text-ink-3">
                    {alert.accuracy_m != null ? `±${Math.round(alert.accuracy_m)} m` : 'Accuracy unknown'}
                    {cell ? ` · ${cell}` : ''}
                  </p>
                  {latest && (
                    <p className="text-[12px] text-ink-3">
                      Latest ping {fmt.time(latest.recorded_at)} ({fmt.ago(latest.recorded_at)}){latestMoved != null && latestMoved > 30 ? ` · ${formatDistance(latestMoved)} from alert point` : ''}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-small text-ink-3">No position with this alert</p>
              )}
            </Tile>

            <div className="grid grid-cols-2 gap-2">
              <Tile label="Battery">
                <p className="flex items-center gap-1.5 text-[18px] font-bold text-ink">
                  <Icon name={alert.battery_pct != null && alert.battery_pct <= 15 ? 'battery_alert' : 'battery_horiz_050'} size={18} className={alert.battery_pct != null && alert.battery_pct <= 15 ? 'text-danger' : 'text-ink-2'} />
                  {alert.battery_pct != null ? `${alert.battery_pct}%` : '—'}
                </p>
                <p className="text-[12px] text-ink-3">at alert{latest?.battery_pct != null ? ` · now ${latest.battery_pct}%` : ''}</p>
              </Tile>
              <Tile label="Signal">
                <p className="flex items-center gap-1.5 text-[18px] font-bold text-ink">
                  <SignalBars level={alert.signal_level} />
                  {signalLabel(alert.signal_level)}
                </p>
                <p className="text-[12px] text-ink-3">at alert{alert.signal_level != null ? ` · ${alert.signal_level} of 4` : ''}</p>
              </Tile>
            </div>

            <Tile label="Since last movement">
              {history.isLoading ? (
                <p className="flex items-center gap-2 text-small text-ink-3"><Spinner size={14} /> Checking GPS history</p>
              ) : stillSince != null ? (
                <>
                  <p className="flex items-center gap-1.5 text-[18px] font-bold text-ink">
                    <Icon name="timer" size={18} />
                    {formatElapsed(now - stillSince)}
                  </p>
                  <p className="text-[12px] text-ink-3">Within 50 m of the latest ping since {fmt.time(new Date(stillSince).toISOString())}</p>
                </>
              ) : (
                <p className="text-small text-ink-3">No GPS history in the last 24 h</p>
              )}
            </Tile>

            <Responders alert={alert} />
            <ClosedBanner alert={alert} />
            {actions.error && <Banner tone="danger" action={<Button kind="ghost" size="sm" onClick={actions.clearError}>Dismiss</Button>}>{actions.error}</Banner>}
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-line px-5 py-3.5">
            {open && (
              alert.status === 'active' ? (
                <Button kind="danger" className="h-12 text-[16px]" icon="volume_off" loading={actions.acknowledging} onClick={actions.acknowledge}>
                  Acknowledge <span className="text-[12px] font-semibold tracking-normal normal-case opacity-85">· stops alarm</span>
                </Button>
              ) : (
                <p className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-mint text-small font-semibold text-forest">
                  <Icon name="check" size={18} />
                  Acknowledged {alert.acknowledged_at ? fmt.time(alert.acknowledged_at) : ''}
                </p>
              )
            )}
            {open && <Button icon="directions_run" onClick={() => actions.setDispatching(true)}>Dispatch support</Button>}
            {phone ? (
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-forest bg-white px-4 text-[14px] font-bold tracking-[0.03em] uppercase text-forest hover:bg-mint">
                <Icon name="call" size={18} />
                Attempt call
              </a>
            ) : (
              <Button kind="secondary" icon="call" disabled title="No phone number on file">Attempt call</Button>
            )}
            {open && <Button kind="ghost" icon="task_alt" onClick={() => actions.setResolving(true)}>Resolve with note</Button>}
          </div>
        </div>

        {/* Right column */}
        <div className="scroll-thin flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-canvas p-3.5">
          <Card title={<span className="flex items-center gap-2"><Icon name="groups" size={20} />Nearest units</span>} right={<span className="text-[12px] text-ink-3">Straight-line</span>}>
            {rangersQ.isLoading ? (
              <div className="flex justify-center py-4 text-forest"><Spinner size={18} /></div>
            ) : !sosPoint ? (
              <p className="text-small text-ink-3">Distances need the alert position.</p>
            ) : units.length === 0 ? (
              <p className="text-small text-ink-3">No other ranger has a known position.</p>
            ) : (
              <ul className="-my-1 flex flex-col divide-y divide-line-soft">
                {units.map((u) => (
                  <li key={u.ranger.id} className="flex items-center gap-2.5 py-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ranger text-[13px] font-bold text-white">{initials(u.ranger.full_name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-ink">{u.ranger.full_name}</span>
                      <span className="flex items-center gap-1 text-[12px] text-ink-3">
                        <span className="h-2 w-2 rounded-full" style={{ background: rangerStatusColor[u.ranger.status] }} />
                        {STATUS_LABEL[u.ranger.status]} · seen {fmt.ago(u.ranger.last_position!.recorded_at)}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="mono font-medium text-ink">{formatDistance(u.distance_m)}</span>
                      <span className="text-[11px] text-ink-3">{u.direction}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><Icon name="history" size={20} />Alert history</span>} right={<Link to="/audit" className="text-small font-semibold text-mid-green hover:underline">Audit log</Link>} className="flex flex-col">
            <Timeline entries={alert.timeline ?? []} safety />
            <div className="mt-4"><AuditNote /></div>
          </Card>
        </div>
      </div>

      <DispatchModal alert={alert} open={actions.dispatching} onClose={() => actions.setDispatching(false)} />
      <ResolveModal alert={alert} open={actions.resolving} onClose={() => actions.setResolving(false)} />
    </div>
  )
}

// ------------------------------------------------------------------ threat incident

function IncidentPanel({ alert }: { alert: AlertItem & { category?: string; subtype?: string; species_name?: string | null; count?: number | null; patrol_client_uuid?: string | null; employee_id?: string } }) {
  const { areas, area: selectedArea } = useArea()
  const area = areas.find((x) => x.id === alert.area_id) ?? selectedArea
  const layers = useAreaLayers(area?.id ?? null)
  const actions = useAlertActions(alert)
  const open = isOpen(alert)
  const cell = alert.cell_label ?? layers.cellLabel(alert.cell_id)
  const pos = alert.lat != null && alert.lon != null ? { lat: alert.lat, lon: alert.lon } : null
  const points = useMemo<MapPoint[]>(
    () => [...layers.bases, ...(pos ? [{ id: alert.id, kind: 'pin' as const, ...pos, color: severityColor[alert.severity], label: alertTitle(alert), radius: 18 }] : [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers.bases, alert.id, alert.lat, alert.lon, alert.severity],
  )
  const fitTo = useMemo(() => (pos ? paddedBox([pos], 0.02) : null), [alert.lat, alert.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows: [string, ReactNode][] = [
    ['Type', kindLabel(alert.subtype ?? alert.kind)],
    ['Category', fmt.titleCase(alert.category ?? 'threat')],
    ...(alert.species_name ? [['Species', alert.species_name] as [string, ReactNode]] : []),
    ...(alert.count != null ? [['Count', String(alert.count)] as [string, ReactNode]] : []),
    ['GRTS cell', <span className="mono">{cell ?? '—'}</span>],
    ['Position', <span className="mono">{fmt.coord(alert.lat, alert.lon, 5)}{alert.accuracy_m != null ? ` ±${Math.round(alert.accuracy_m)} m` : ''}</span>],
    ['Reported by', <>{alert.ranger_name ?? '—'}{alert.employee_id && <span className="mono text-ink-3"> · {alert.employee_id}</span>}</>],
    ['Occurred', `${fmt.dateTime(alert.occurred_at)} (${fmt.ago(alert.occurred_at)})`],
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b border-line bg-white px-6 py-4" style={{ boxShadow: `inset 4px 0 0 ${severityColor[alert.severity]}` }}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: `${severityColor[alert.severity]}1A`, color: severityColor[alert.severity] }}>
          <Icon name={alertIcon(alert)} size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Threat report{cell ? ` · ${cell}` : ''}</p>
          <h1 className="truncate text-h2 font-semibold text-ink">{alertTitle(alert)}</h1>
          <p className="text-small text-ink-3">{alert.ranger_name ?? 'Unknown ranger'} · {fmt.dateTime(alert.occurred_at)}</p>
        </div>
        <SeverityBadge level={alert.severity} />
        <AlertStatusPill status={alert.status} />
        <Link to="/alerts" className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-small font-semibold text-forest hover:bg-black/5">
          <Icon name="arrow_back" size={18} />
          All alerts
        </Link>
      </div>
      <div className="flex min-h-0 flex-1">
        <AreaMap className={`min-w-0 flex-1 ${MAP_FILL}`} boundary={area?.boundary} cells={layers.cells} showCells selectedCellId={alert.cell_id} showCellLabels points={points} fitTo={fitTo} onReady={addMapControls}>
          {!pos && <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white px-4 py-3 text-small shadow-pop">This report has no GPS position.</div>}
        </AreaMap>
        <div className="scroll-thin flex w-[400px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-canvas p-4">
          <Card title="Incident details">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-small">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {alert.note && (
              <div className="mt-3 rounded-lg bg-cream-tint px-3 py-2.5">
                <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-0.5">Ranger note</p>
                <p className="text-small text-ink">{alert.note}</p>
              </div>
            )}
          </Card>
          <Card title="Response">
            <div className="flex flex-col gap-2.5">
              <ClosedBanner alert={alert} />
              <Responders alert={alert} />
              {actions.error && <Banner tone="danger" action={<Button kind="ghost" size="sm" onClick={actions.clearError}>Dismiss</Button>}>{actions.error}</Banner>}
              {open && alert.status === 'active' && <Button kind="danger" icon="visibility" loading={actions.acknowledging} onClick={actions.acknowledge}>Acknowledge</Button>}
              {open && alert.status === 'acknowledged' && (
                <p className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-mint text-small font-semibold text-forest">
                  <Icon name="check" size={18} />
                  Acknowledged {fmt.dateTime(alert.acknowledged_at)}
                </p>
              )}
              {open && (
                <div className="grid grid-cols-2 gap-2">
                  <Button icon="directions_run" onClick={() => actions.setDispatching(true)}>Dispatch</Button>
                  <Button kind="secondary" icon="task_alt" onClick={() => actions.setResolving(true)}>Resolve</Button>
                </div>
              )}
            </div>
          </Card>
          <Card title="Timeline">
            <Timeline entries={alert.timeline ?? []} safety={false} />
            <div className="mt-4"><AuditNote /></div>
          </Card>
        </div>
      </div>
      <DispatchModal alert={alert} open={actions.dispatching} onClose={() => actions.setDispatching(false)} />
      <ResolveModal alert={alert} open={actions.resolving} onClose={() => actions.setResolving(false)} />
    </div>
  )
}

// ------------------------------------------------------------------ dispatch modal

function DispatchModal({ alert, open, onClose }: { alert: AlertItem; open: boolean; onClose: () => void }) {
  const rangersQ = useRangers(null)
  const dispatch = useDispatchAlert()
  const [ids, setIds] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setIds([])
      setNote('')
      setError(null)
      dispatch.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const candidates = useMemo(() => {
    const list = (rangersQ.data ?? []).filter((r) => r.id !== alert.ranger_id)
    const from = alert.lat != null && alert.lon != null ? { lat: alert.lat, lon: alert.lon } : null
    const withDistance = list.map((r) => ({ r, d: from && r.last_position ? haversineM(from, r.last_position) : null }))
    return withDistance.sort((a, b) => Number(a.r.status === 'offline') - Number(b.r.status === 'offline') || (a.d ?? Infinity) - (b.d ?? Infinity) || a.r.full_name.localeCompare(b.r.full_name))
  }, [rangersQ.data, alert.ranger_id, alert.lat, alert.lon])

  const submit = () => {
    setError(null)
    dispatch.mutate(
      { id: alert.id, note: note.trim(), responder_ids: ids },
      {
        onSuccess: onClose,
        onError: (e) => {
          const fields = e instanceof ApiError ? e.fields : undefined
          setError(fields?.responder_ids ? String(fields.responder_ids) : alertErrorMessage(e))
        },
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title="Dispatch support"
      footer={
        <>
          <span className="mr-auto text-small text-ink-3">{ids.length} selected</span>
          <Button kind="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="directions_run" loading={dispatch.isPending} disabled={!ids.length} onClick={submit}>Dispatch {ids.length || ''}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-small text-ink-2">
          {alertTitle(alert)} · {alert.ranger_name ?? 'Unknown ranger'}. Each responder gets an SMS (or a push notification without a phone number) with the alert position.
          {alert.status === 'active' && ' Dispatching also acknowledges the alert.'}
        </p>
        <fieldset>
          <legend className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Responders · nearest first</legend>
          {rangersQ.isLoading ? (
            <div className="flex justify-center py-4 text-forest"><Spinner size={18} /></div>
          ) : candidates.length === 0 ? (
            <p className="text-small text-ink-3">No other rangers in the organisation.</p>
          ) : (
            <ul className="scroll-thin flex max-h-64 flex-col overflow-y-auto rounded-lg border border-line">
              {candidates.map(({ r, d }) => {
                const on = ids.includes(r.id)
                return (
                  <li key={r.id} className="border-b border-line-soft last:border-0">
                    <label className={clsx('flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5', on && 'bg-mint')}>
                      <input type="checkbox" className="h-5 w-5 accent-[#102C26]" checked={on} onChange={() => setIds((v) => (on ? v.filter((x) => x !== r.id) : [...v, r.id]))} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-ink">{r.full_name}</span>
                        <span className="flex items-center gap-1 text-[12px] text-ink-3">
                          <span className="h-2 w-2 rounded-full" style={{ background: rangerStatusColor[r.status] }} />
                          {STATUS_LABEL[r.status]}{r.team_name ? ` · ${r.team_name}` : ''} · {r.phone ? 'SMS' : 'Push'}
                        </span>
                      </span>
                      <span className="mono text-ink-2">{d != null ? formatDistance(d) : 'No GPS'}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>
        <Field label="Instructions" htmlFor="dispatch-note" helper={`${note.length}/1000`}>
          <TextArea id="dispatch-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Move to last GPS position, approach from the river road, report by radio." />
        </Field>
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </Modal>
  )
}
