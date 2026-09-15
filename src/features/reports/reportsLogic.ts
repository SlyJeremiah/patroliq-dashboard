// Pure helpers for the reports builder and preview (no React; unit-tested in reportsLogic.test.ts).
import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import type { Report, ReportFormat, ReportType, Role } from '@/api/types'
import { ApiError } from '@/api/client'

// ------------------------------------------------------------------ catalogue

export interface ReportTypeInfo {
  type: ReportType
  name: string
  description: string
  icon: string
  /** What the main CSV table / GeoJSON contains. */
  contents: string
}

/** The eight report types of spec §7 (PRD 6.5 + App Flow 11). */
export const REPORT_TYPES: ReportTypeInfo[] = [
  { type: 'patrol_summary', name: 'Patrol Summary', icon: 'route', description: 'Patrols, distance, hours and observations', contents: 'patrols' },
  { type: 'incident_report', name: 'Incident Report', icon: 'warning', description: 'Threats and carcasses by severity and type', contents: 'incidents' },
  { type: 'wildlife_census', name: 'Wildlife Census', icon: 'pets', description: 'Species counts per GRTS cell', contents: 'wildlife observations' },
  { type: 'threat_intelligence', name: 'Threat Intelligence Brief', icon: 'psychology', description: 'AI risk trend, hotspots and incidents', contents: 'incidents and risk' },
  { type: 'grts_survey', name: 'GRTS Survey Completion', icon: 'grid_on', description: 'Visits per cell and season coverage', contents: 'cells' },
  { type: 'ranger_performance', name: 'Ranger Performance', icon: 'badge', description: 'Team patrol metrics and observation quality', contents: 'ranger performance' },
  { type: 'donor_report', name: 'Donor Report', icon: 'volunteer_activism', description: 'Hours, km, incidents responded to, species', contents: 'monthly statistics' },
  { type: 'zpwma_compliance', name: 'ZPWMA Compliance', icon: 'gavel', description: 'Monthly summary in the government format', contents: 'monthly statistics' },
]

export function reportTypeInfo(type: string): ReportTypeInfo | undefined {
  return REPORT_TYPES.find((t) => t.type === type)
}

/** Researchers and NGO/Government viewers receive anonymised CSV/GeoJSON only (spec §7). */
export function isAnonymisedRole(role?: Role | null): boolean {
  return role === 'researcher' || role === 'viewer'
}

export function allowedFormats(role?: Role | null): ReportFormat[] {
  return isAnonymisedRole(role) ? ['csv', 'geojson'] : ['pdf', 'csv', 'geojson']
}

export function audienceNote(type: ReportType, role?: Role | null): string {
  if (isAnonymisedRole(role)) {
    return type === 'ranger_performance' ? 'Anonymised: rangers shown as Ranger 01…' : 'Anonymised: GRTS cells instead of coordinates'
  }
  return 'Managers · all formats · anonymised copy for research roles'
}

export const FORMAT_INFO: Record<ReportFormat, { label: string; icon: string; description: string }> = {
  pdf: { label: 'PDF', icon: 'picture_as_pdf', description: 'Formatted summary for managers and HQ' },
  csv: { label: 'CSV', icon: 'table_view', description: 'Tabular data for analysis' },
  geojson: { label: 'GeoJSON', icon: 'map', description: 'Tracks, observations and cells for GIS' },
}

// ------------------------------------------------------------------ dates

export type PresetKey = 'last_month' | 'this_month' | 'dry_season' | 'custom'
export interface DateRange {
  from: string
  to: string
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/**
 * Quick date ranges. Dry season is May–October: the current one when today is in or after May (ending today while it is
 * still running), otherwise last year's.
 */
export function presetRange(key: Exclude<PresetKey, 'custom'>, todayIso: string): DateRange {
  const today = parseISO(todayIso)
  if (key === 'last_month') {
    const m = subMonths(today, 1)
    return { from: iso(startOfMonth(m)), to: iso(endOfMonth(m)) }
  }
  if (key === 'this_month') return { from: iso(startOfMonth(today)), to: todayIso }
  const year = today.getMonth() >= 4 ? today.getFullYear() : today.getFullYear() - 1
  const from = `${year}-05-01`
  const end = `${year}-10-31`
  return { from, to: end < todayIso ? end : todayIso }
}

/** Which preset (if any) a range corresponds to. */
export function matchPreset(range: DateRange, todayIso: string): PresetKey {
  for (const k of ['last_month', 'this_month', 'dry_season'] as const) {
    const p = presetRange(k, todayIso)
    if (p.from === range.from && p.to === range.to) return k
  }
  return 'custom'
}

export const MAX_RANGE_DAYS = 366

/** Inclusive day count. */
export function rangeDays(range: DateRange): number {
  return differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1
}

/** Client-side validation mirroring the API (400 validation_error / date_range_too_large). */
export function validateRange(range: DateRange): string | null {
  if (!range.from || !range.to) return 'Choose a start and an end date.'
  if (range.to < range.from) return 'The end date is before the start date.'
  if (rangeDays(range) > MAX_RANGE_DAYS) return `Reports can cover at most ${MAX_RANGE_DAYS} days. Shorten the range.`
  return null
}

/** "1–31 Aug 2026", "16 Aug – 15 Sep 2026", "1 Dec 2025 – 31 Jan 2026". */
export function rangeLabel(from?: string | null, to?: string | null): string {
  if (!from || !to) return '—'
  const a = parseISO(from)
  const b = parseISO(to)
  if (from === to) return format(a, 'd MMM yyyy')
  if (a.getFullYear() !== b.getFullYear()) return `${format(a, 'd MMM yyyy')} – ${format(b, 'd MMM yyyy')}`
  if (a.getMonth() !== b.getMonth()) return `${format(a, 'd MMM')} – ${format(b, 'd MMM yyyy')}`
  return `${format(a, 'd')}–${format(b, 'd MMM yyyy')}`
}

// ------------------------------------------------------------------ errors

/** Human copy for the report error codes of spec §7 backend notes. */
export function reportErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'date_range_too_large':
        return `The date range is too long. Reports can cover at most ${MAX_RANGE_DAYS} days.`
      case 'format_not_allowed':
        return 'PDF reports are only available to managers. Choose CSV or GeoJSON for an anonymised export.'
      case 'anonymised_only':
        return 'This report contains identifiable data. Your role can only open anonymised reports.'
      case 'share_expired':
        return 'This share link has expired. Share links last 48 hours; ask the sender for a new one.'
      case 'module_disabled':
        return 'The reports module is not part of your licence.'
      case 'report_not_ready':
        return 'This report failed to generate, so there is no file to download.'
      case 'not_found':
        return 'This report does not exist or belongs to another organisation.'
      case 'validation_error': {
        const first = err.fields ? Object.values(err.fields).flat()[0] : null
        return typeof first === 'string' ? first : err.message
      }
      default:
        return err.message
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}

// ------------------------------------------------------------------ preview

export function reportFileName(r: Pick<Report, 'type' | 'format' | 'params'>): string {
  const p = r.params as { date_from?: string | null; date_to?: string | null }
  return `patroliq-${r.type}-${p.date_from ?? 'from'}-${p.date_to ?? 'to'}.${r.format}`
}

export interface CsvPreview {
  headers: string[]
  rows: string[][]
  totalRows: number
}

/** RFC 4180 parse (quotes, escaped quotes, embedded newlines, CRLF, BOM) keeping the first `maxRows` data rows. */
export function parseCsvPreview(text: string, maxRows = 50): CsvPreview {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const pushRow = () => {
    row.push(field)
    field = ''
    if (!(row.length === 1 && row[0] === '')) records.push(row)
    row = []
  }
  while (i < src.length) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      pushRow()
    } else field += ch
    i += 1
  }
  if (field !== '' || row.length) pushRow()
  const [headers = [], ...data] = records
  return { headers, rows: data.slice(0, maxRows), totalRows: data.length }
}

export interface Metric {
  key: string
  label: string
  value: string
  tone?: 'danger'
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const int = (n: number) => n.toLocaleString('en-GB')

/** Headline metrics present in a report summary, in display order. */
export function summaryMetrics(summary?: Record<string, unknown> | null): Metric[] {
  if (!summary) return []
  const out: Metric[] = []
  const add = (key: string, label: string, render: (n: number) => string, tone?: (n: number) => 'danger' | undefined) => {
    const n = num(summary[key])
    if (n !== null) out.push({ key, label, value: render(n), tone: tone?.(n) })
  }
  add('patrols', 'Patrols completed', int)
  add('observations', 'Observations logged', int)
  add('high_severity_incidents', 'High-severity incidents', int, (n) => (n > 0 ? 'danger' : undefined))
  add('grts_coverage_pct', 'GRTS coverage', (n) => `${Math.round(n * 100)}%`)
  add('distance_km', 'Distance patrolled', (n) => `${n.toLocaleString('en-GB', { maximumFractionDigits: 1 })} km`)
  add('patrol_hours', 'Patrol hours', (n) => `${n.toLocaleString('en-GB', { maximumFractionDigits: 1 })} h`)
  add('incidents', 'Incidents', int)
  add('wildlife_sightings', 'Wildlife sightings', int)
  add('rangers', 'Rangers', int)
  const visited = num(summary.cells_visited)
  const total = num(summary.cells_total)
  if (visited !== null && total !== null) out.push({ key: 'cells', label: 'Cells visited', value: `${int(visited)} of ${int(total)}` })
  return out
}

export interface NamedCount {
  name: string
  count: number
}

/** `{week: "2026-W37"}` → "W37". */
export function weekLabel(week: string): string {
  const m = /W(\d+)$/.exec(week)
  return m ? `W${m[1]}` : week
}

export function summarySeries(summary?: Record<string, unknown> | null) {
  const arr = <T,>(k: string): T[] => (Array.isArray(summary?.[k]) ? (summary![k] as T[]) : [])
  const byWeek = arr<{ week: string; observations: number }>('by_week').map((w) => ({ label: weekLabel(w.week), week: w.week, value: w.observations }))
  const species = arr<{ name: string; count: number }>('species').map((s) => ({ name: s.name, count: s.count }))
  const incidents = arr<{ type: string; count: number }>('incidents_by_type').map((s) => ({ name: humanise(s.type), count: s.count }))
  const riskTrend = arr<{ date: string; mean_score: number | null }>('risk_trend').map((p) => ({ date: p.date, label: format(parseISO(p.date), 'd MMM'), value: p.mean_score }))
  return { byWeek, species, incidents, riskTrend }
}

/** Keep the top `n` items and fold the rest into "Other (k)". */
export function topWithOther(items: NamedCount[], n: number): NamedCount[] {
  const sorted = [...items].sort((a, b) => b.count - a.count)
  if (sorted.length <= n) return sorted
  const rest = sorted.slice(n)
  return [...sorted.slice(0, n), { name: `Other (${rest.length})`, count: rest.reduce((s, x) => s + x.count, 0) }]
}

export function humanise(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export interface GeojsonStats {
  total: number
  byKind: Record<string, number>
  withoutGeometry: number
}

export function geojsonStats(fc: { features?: { geometry: unknown; properties?: Record<string, unknown> | null }[] } | null | undefined): GeojsonStats {
  const byKind: Record<string, number> = {}
  let withoutGeometry = 0
  for (const f of fc?.features ?? []) {
    const kind = typeof f.properties?.kind === 'string' ? (f.properties.kind as string) : 'feature'
    byKind[kind] = (byKind[kind] ?? 0) + 1
    if (!f.geometry) withoutGeometry += 1
  }
  return { total: fc?.features?.length ?? 0, byKind, withoutGeometry }
}

/** Share URL for the dashboard route (App Flow 11: auth-required, 48 h). */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/reports/shared/${encodeURIComponent(token)}`
}
