// Pure helpers for the operations pages (alert ordering, ranger status counts, nearest units, replay interpolation).
import type { AlertItem, RangerLive, RangerStatus, Severity } from '@/api/types'

// ------------------------------------------------------------------ alerts

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const ts = (iso?: string | null) => (iso ? Date.parse(iso) : 0)

/** Critical → High → Medium → Low, then most recent first (App Flow 9.1 Active Alerts Panel). */
export function sortAlerts<T extends Pick<AlertItem, 'severity' | 'occurred_at'>>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || ts(b.occurred_at) - ts(a.occurred_at))
}

export const SAFETY_KINDS = ['panic', 'dead_mans_switch'] as const

export function isSafety(a: Pick<AlertItem, 'type' | 'kind'>): boolean {
  return a.type === 'safety' || (SAFETY_KINDS as readonly string[]).includes(a.kind)
}

/** Not handled yet: `active`, or `acknowledged` (still open until resolved/cancelled). */
export function isOpen(a: Pick<AlertItem, 'status'>): boolean {
  return a.status === 'active' || a.status === 'acknowledged'
}

export function isClosed(a: Pick<AlertItem, 'status'>): boolean {
  return a.status === 'resolved' || a.status === 'cancelled'
}

/** Safety alerts that are still open (drive the URGENT banner). Oldest-first is irrelevant: most recent first. */
export function openSosAlerts<T extends AlertItem>(alerts: readonly T[]): T[] {
  return alerts.filter((a) => isSafety(a) && isOpen(a)).sort((a, b) => ts(b.occurred_at) - ts(a.occurred_at))
}

/** Unacknowledged SOS alerts sound the alarm (acknowledging stops it). */
export function alarmAlerts<T extends AlertItem>(alerts: readonly T[]): T[] {
  return alerts.filter((a) => isSafety(a) && a.status === 'active')
}

export type AlertChip = 'all' | 'critical' | 'high' | 'safety'

export function matchesChip(a: AlertItem, chip: AlertChip): boolean {
  if (chip === 'all') return true
  if (chip === 'safety') return isSafety(a)
  return a.severity === chip
}

export function chipCounts(alerts: readonly AlertItem[]): Record<AlertChip, number> {
  return {
    all: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    high: alerts.filter((a) => a.severity === 'high').length,
    safety: alerts.filter(isSafety).length,
  }
}

/** Merge alert lists from several queries, de-duplicated by id (later lists win). */
export function mergeAlerts(...lists: (readonly AlertItem[] | undefined)[]): AlertItem[] {
  const byId = new Map<string, AlertItem>()
  for (const l of lists) for (const a of l ?? []) byId.set(a.id, a)
  return [...byId.values()]
}

export interface AlertFilter {
  tab: 'active' | 'acknowledged' | 'all'
  severities: Severity[]
  type: 'all' | 'safety' | 'threat'
  search: string
}

export function filterAlerts(alerts: readonly AlertItem[], f: AlertFilter, cellLabel?: (id?: string | null) => string | undefined): AlertItem[] {
  const q = f.search.trim().toLowerCase()
  return alerts.filter((a) => {
    if (f.tab !== 'all' && a.status !== f.tab) return false
    if (f.severities.length && !f.severities.includes(a.severity)) return false
    if (f.type === 'safety' && !isSafety(a)) return false
    if (f.type === 'threat' && isSafety(a)) return false
    if (q) {
      const hay = [alertTitle(a), a.kind, a.ranger_name, a.cell_label, cellLabel?.(a.cell_id), a.note, a.status].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

const KIND_LABEL: Record<string, string> = {
  panic: 'Panic button',
  dead_mans_switch: "Dead man's switch",
  poacher_camp: 'Poacher camp reported',
  poacher_sighting: 'Poacher sighting',
  snare: 'Snare found',
  gunshot: 'Gunshot heard',
  elephant_carcass: 'Elephant carcass',
  carcass: 'Carcass found',
  fence_damage: 'Fence damage',
  low_battery: 'Low battery',
  trespass: 'Trespass',
}

export function kindLabel(kind?: string | null): string {
  if (!kind) return 'Alert'
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function alertTitle(a: Pick<AlertItem, 'kind' | 'title' | 'type'>): string {
  return a.title || kindLabel(a.kind)
}

const KIND_ICON: Record<string, string> = {
  panic: 'e911_emergency',
  dead_mans_switch: 'timer_off',
  poacher_camp: 'camping',
  poacher_sighting: 'person_alert',
  snare: 'cable',
  gunshot: 'crisis_alert',
  elephant_carcass: 'skull',
  carcass: 'skull',
  fence_damage: 'fence',
  low_battery: 'battery_alert',
}

export function alertIcon(a: Pick<AlertItem, 'kind' | 'type'>): string {
  return KIND_ICON[a.kind] ?? (a.type === 'safety' ? 'sos' : 'warning')
}

export function statusLabel(status: string): string {
  return { active: 'Active', acknowledged: 'Acknowledged', resolved: 'Resolved', cancelled: 'Cancelled by ranger' }[status] ?? status
}

// ------------------------------------------------------------------ rangers

export type StatusCounts = Record<RangerStatus, number> & { total: number }

export function statusCounts(rangers: readonly Pick<RangerLive, 'status'>[]): StatusCounts {
  const c: StatusCounts = { active: 0, paused: 0, offline: 0, sos: 0, total: rangers.length }
  for (const r of rangers) if (r.status in c) c[r.status] += 1
  return c
}

export const STATUS_LABEL: Record<RangerStatus, string> = { active: 'Active', paused: 'Paused', offline: 'Offline', sos: 'SOS' }
const STATUS_RANK: Record<RangerStatus, number> = { sos: 0, active: 1, paused: 2, offline: 3 }

export function initials(name?: string | null): string {
  return (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('')
}

export interface RangerFilter {
  search?: string
  teamId?: string
  statuses?: RangerStatus[]
}

export function filterRangers<T extends RangerLive>(rangers: readonly T[], f: RangerFilter): T[] {
  const q = (f.search ?? '').trim().toLowerCase()
  return rangers.filter((r) => {
    if (f.teamId && r.team_id !== f.teamId) return false
    if (f.statuses?.length && !f.statuses.includes(r.status)) return false
    if (q && ![r.full_name, r.employee_id, r.team_name, r.apu_base_code].filter(Boolean).join(' ').toLowerCase().includes(q)) return false
    return true
  })
}

/** SOS first, then active, paused, offline; by name within a status. */
export function sortRangers<T extends RangerLive>(rangers: readonly T[]): T[] {
  return [...rangers].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.full_name.localeCompare(b.full_name))
}

/** Most recent sign of life: last position ping or last sync. */
export function lastSeen(r: Pick<RangerLive, 'last_position' | 'last_sync_at'>): string | null {
  const a = r.last_position?.recorded_at ?? null
  const b = r.last_sync_at ?? null
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

/** Rangers whose current patrol track should be drawn: SOS/active/paused first, capped. */
export function trackCandidates(rangers: readonly RangerLive[], cap = 15): string[] {
  return sortRangers(rangers.filter((r) => r.current_patrol))
    .slice(0, cap)
    .map((r) => r.current_patrol!.client_uuid)
}

// ------------------------------------------------------------------ geometry

export interface LatLon {
  lat: number
  lon: number
}

const R_EARTH = 6_371_008.8

export function haversineM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from a to b in degrees (0 = north, clockwise). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad)
  return ((Math.atan2(y, x) / rad) + 360) % 360
}

export function compass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!
}

export interface NearestUnit<T> {
  ranger: T
  distance_m: number
  direction: string
}

/** Rangers with a known position ordered by straight-line distance from `from` (offline rangers last unless includeOffline). */
export function nearestRangers<T extends RangerLive>(rangers: readonly T[], from: LatLon, opts: { excludeId?: string | null; limit?: number; includeOffline?: boolean } = {}): NearestUnit<T>[] {
  const { excludeId, limit = 3, includeOffline = true } = opts
  return rangers
    .filter((r) => r.last_position && r.id !== excludeId && (includeOffline || r.status !== 'offline'))
    .map((r) => {
      const p = { lat: r.last_position!.lat, lon: r.last_position!.lon }
      return { ranger: r, distance_m: haversineM(from, p), direction: compass(bearingDeg(from, p)) }
    })
    .sort((a, b) => Number(a.ranger.status === 'offline') - Number(b.ranger.status === 'offline') || a.distance_m - b.distance_m)
    .slice(0, limit)
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

// ------------------------------------------------------------------ replay

export interface HistoryPoint {
  recorded_at: string
  lat: number
  lon: number
  battery_pct?: number | null
}

export interface TimedPoint extends LatLon {
  t: number
}

/** Parse and sort history points by time (drops invalid timestamps). */
export function toTimed(history: readonly HistoryPoint[]): TimedPoint[] {
  return history
    .map((p) => ({ t: Date.parse(p.recorded_at), lat: p.lat, lon: p.lon }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)
}

/**
 * Position at time `t` by linear interpolation between the surrounding pings. Clamps to the first/last ping.
 * `index` = last ping at or before `t` (−1 before the first ping).
 */
export function interpolateAt(points: readonly TimedPoint[], t: number): (LatLon & { index: number }) | null {
  if (!points.length) return null
  const first = points[0]!
  const last = points[points.length - 1]!
  if (t <= first.t) return { lat: first.lat, lon: first.lon, index: t < first.t ? -1 : 0 }
  if (t >= last.t) return { lat: last.lat, lon: last.lon, index: points.length - 1 }
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid]!.t <= t) lo = mid
    else hi = mid
  }
  const a = points[lo]!
  const b = points[hi]!
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, index: lo }
}

/** Trail up to time `t` as [lat, lon] pairs (for the map `route`), ending at the interpolated position. */
export function trailUntil(points: readonly TimedPoint[], t: number): [number, number][] {
  const pos = interpolateAt(points, t)
  if (!pos || pos.index < 0) return []
  const trail = points.slice(0, pos.index + 1).map((p) => [p.lat, p.lon] as [number, number])
  trail.push([pos.lat, pos.lon])
  return trail
}

/**
 * When the ranger last moved: walks back from the latest ping until one is more than `thresholdM` away.
 * Returns the time of the first ping at the current spot (so "stationary since"), or null without data.
 */
export function stationarySince(points: readonly TimedPoint[], thresholdM = 50): number | null {
  if (!points.length) return null
  const last = points[points.length - 1]!
  for (let i = points.length - 2; i >= 0; i--) {
    if (haversineM(points[i]!, last) > thresholdM) return points[i + 1]!.t
  }
  return points[0]!.t
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h} h ${m} min`
  if (m) return `${m} min ${sec} s`
  return `${sec} s`
}

export function signalLabel(level?: number | null): string {
  if (level == null) return 'Unknown'
  return ['No signal', 'Weak', 'Fair', 'Good', 'Strong'][Math.max(0, Math.min(4, Math.round(level)))]!
}
