// Pure helpers for the zrGISsolutions platform console (spec §1 tenancy & licensing, §5 Platform).
import type { Licence, Organisation } from '@/api/types'

export type OrgStatus = Organisation['status']
export type Plan = Licence['plan']
export type Deployment = 'shared' | 'dedicated'

const DAY_MS = 86_400_000

export const MODULES = [
  { key: 'ai_risk', label: 'AI risk' },
  { key: 'species_id', label: 'Species ID' },
  { key: 'voice', label: 'Voice' },
  { key: 'grts', label: 'GRTS' },
  { key: 'collars', label: 'Collars' },
  { key: 'reports', label: 'Reports' },
] as const

export const PLANS: { value: Plan; label: string }[] = [
  { value: 'pilot', label: 'Pilot' },
  { value: 'standard', label: 'Standard' },
  { value: 'enterprise', label: 'Enterprise' },
]

/** Starting values offered in the New organisation form when a plan is picked (editable before saving). */
export const PLAN_PRESETS: Record<Plan, { max_rangers: number; max_managers: number; max_areas: number; modules: string[] }> = {
  pilot: { max_rangers: 10, max_managers: 3, max_areas: 1, modules: ['ai_risk', 'grts', 'species_id'] },
  standard: { max_rangers: 50, max_managers: 10, max_areas: 5, modules: MODULES.map((m) => m.key) },
  enterprise: { max_rangers: 200, max_managers: 30, max_areas: 20, modules: MODULES.map((m) => m.key) },
}

export const planLabel = (p?: string | null) => PLANS.find((x) => x.value === p)?.label ?? (p ? p[0].toUpperCase() + p.slice(1) : '—')

// ------------------------------------------------------------------ status

interface LicenceDates {
  status?: string | null
  expires_at?: string | null
  grace_days?: number | null
}

/**
 * Effective organisation status, mirroring backend `accounts.licensing.effective_status`:
 * suspended if set manually, no licence, or past expiry + grace; grace if past expiry (or set manually); else active.
 */
export function deriveStatus(orgStatus: string | null | undefined, licence: LicenceDates | null | undefined, now: Date = new Date()): OrgStatus {
  if (orgStatus === 'suspended' || !licence || licence.status === 'suspended') return 'suspended'
  const expires = parseDate(licence.expires_at)
  if (expires) {
    const graceEnd = expires.getTime() + (licence.grace_days ?? 0) * DAY_MS
    if (now.getTime() > graceEnd) return 'suspended'
    if (now.getTime() > expires.getTime()) return 'grace'
  }
  if (orgStatus === 'grace' || licence.status === 'grace') return 'grace'
  return 'active'
}

/** Status the licence dates alone would produce (ignores manual status). */
export const statusFromDates = (licence: LicenceDates | null | undefined, now: Date = new Date()): OrgStatus =>
  deriveStatus('active', licence ? { ...licence, status: 'active' } : licence, now)

/** Why an organisation is suspended: the licence ran out of grace, or zrGISsolutions suspended it. */
export function suspensionCause(status: OrgStatus, licence: LicenceDates | null | undefined, now: Date = new Date()): 'expired' | 'manual' | 'no_licence' | null {
  if (status !== 'suspended') return null
  if (!licence) return 'no_licence'
  return statusFromDates(licence, now) === 'suspended' ? 'expired' : 'manual'
}

export function graceEndsAt(licence: LicenceDates | null | undefined): Date | null {
  const expires = parseDate(licence?.expires_at)
  if (!expires) return null
  return new Date(expires.getTime() + (licence?.grace_days ?? 0) * DAY_MS)
}

/** Whole days until the grace period ends (0 on the last day, negative once over). */
export function graceDaysLeft(licence: LicenceDates | null | undefined, now: Date = new Date()): number | null {
  const end = graceEndsAt(licence)
  if (!end) return null
  return Math.ceil((end.getTime() - now.getTime()) / DAY_MS)
}

export function isExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  const d = parseDate(expiresAt)
  return !!d && now.getTime() > d.getTime()
}

// ------------------------------------------------------------------ seats

export type SeatLevel = 'ok' | 'near' | 'full' | 'over' | 'none'

/** Seat usage as a 0..1+ ratio plus a level for colouring (near ≥ 85 %, full = 100 %, over > 100 %). */
export function seatUsage(used: number | null | undefined, limit: number | null | undefined): { used: number; limit: number; pct: number; level: SeatLevel } {
  const u = Math.max(0, used ?? 0)
  const l = Math.max(0, limit ?? 0)
  if (l === 0) return { used: u, limit: l, pct: u > 0 ? 1 : 0, level: u > 0 ? 'over' : 'none' }
  const pct = u / l
  const level: SeatLevel = pct > 1 ? 'over' : pct === 1 ? 'full' : pct >= 0.85 ? 'near' : 'ok'
  return { used: u, limit: l, pct, level }
}

export const SEAT_COLOR: Record<SeatLevel, string> = { ok: '#2D6A4F', near: '#E67E22', full: '#E67E22', over: '#C0392B', none: '#ADB5BD' }

export function modulesSummary(modules: string[] | null | undefined): string {
  const enabled = MODULES.filter((m) => modules?.includes(m.key)).length
  if (enabled === MODULES.length) return 'All modules'
  if (enabled === 0) return 'No modules'
  return `${enabled} of ${MODULES.length} modules`
}

// ------------------------------------------------------------------ codes & forms

export const ORG_CODE_RE = /^[A-Z0-9_-]{2,32}$/

/** Normalise what the user types into an organisation code: upper-case, no spaces. */
export const normaliseCode = (raw: string) => raw.toUpperCase().replace(/\s+/g, '')

/** Returns an error message or null. `existing` = codes already in use (case-insensitive). */
export function validateOrgCode(code: string, existing: string[] = []): string | null {
  const c = code.trim()
  if (!c) return 'Enter a short code rangers type at sign-in.'
  if (c.length < 2) return 'Use at least 2 characters.'
  if (c.length > 32) return 'Use 32 characters or fewer.'
  if (!ORG_CODE_RE.test(c)) return 'Use capital letters, digits, hyphen or underscore only.'
  if (existing.some((e) => e.toUpperCase() === c.toUpperCase())) return 'This code is already used by another organisation.'
  return null
}

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Enter the administrator’s email.'
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Enter a valid email address.'
}

/** Integer limit from a text field; null when blank or not a whole number ≥ 0. */
export function parseLimit(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null
  return Number(raw.trim())
}

/**
 * Flatten the API error envelope `fields` ({name: [...], licence: {max_rangers: [...]}, admin: {email: [...]}})
 * into dotted keys with the first message: {'name': '…', 'licence.max_rangers': '…', 'admin.email': '…'}.
 */
export function flattenFieldErrors(fields: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fields || typeof fields !== 'object') return out
  if (Array.isArray(fields)) {
    const first = fields.find((x) => typeof x === 'string')
    if (first && prefix) out[prefix] = first
    else fields.forEach((x, i) => Object.assign(out, flattenFieldErrors(x, prefix ? `${prefix}.${i}` : String(i))))
    return out
  }
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    const key = k === 'non_field_errors' ? prefix || '_' : prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else Object.assign(out, flattenFieldErrors(v, key))
  }
  return out
}

// ------------------------------------------------------------------ dates

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `2027-09-30T23:59:59Z` → `2027-09-30` (UTC calendar date, for <input type="date">). */
export const isoToDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

/** Licence starts at the beginning and expires at the end of the chosen UTC day. */
export const startOfDayIso = (date: string) => `${date}T00:00:00Z`
export const endOfDayIso = (date: string) => `${date}T23:59:59Z`

export function addYears(date: Date, years: number): Date {
  const d = new Date(date)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d
}

export const toDateInput = (d: Date) => d.toISOString().slice(0, 10)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Licence terms are whole UTC days (expires 23:59:59Z), so show the UTC calendar date — local formatting would turn
 * `2027-09-30T23:59:59Z` into "1 Oct 2027" east of Greenwich. `year: false` drops the year ("27 Sep").
 */
export function licenceDate(value: string | Date | null | undefined, opts: { year?: boolean } = {}): string {
  const d = value instanceof Date ? value : parseDate(value)
  if (!d) return '—'
  const s = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return opts.year === false ? s : `${s} ${d.getUTCFullYear()}`
}

// ------------------------------------------------------------------ usage (API shape adapter)

/** Real `GET platform/organisations/{id}/usage/` response (nested; differs from `OrgUsage` in types.ts). */
export interface UsageWire {
  organisation_id?: string
  status?: OrgStatus
  seats?: { rangers_used: number; max_rangers: number; managers_used: number; max_managers: number }
  areas?: { total: number; active: number; archived: number; max_areas: number }
  last_sync_at?: string | null
  active_devices?: number
  // flat legacy shape
  rangers?: number
  managers?: number
}

export interface Usage {
  rangers: number
  managers: number
  /** Non-archived areas — what counts toward max_areas. */
  areas: number
  archivedAreas: number
  activeDevices: number | null
  lastSyncAt: string | null
}

export function normaliseUsage(raw: UsageWire | null | undefined): Usage | null {
  if (!raw) return null
  const areasRaw = raw.areas as unknown
  const areas = typeof areasRaw === 'number' ? areasRaw : raw.areas ? raw.areas.total - raw.areas.archived : 0
  return {
    rangers: raw.seats?.rangers_used ?? raw.rangers ?? 0,
    managers: raw.seats?.managers_used ?? raw.managers ?? 0,
    areas,
    archivedAreas: typeof areasRaw === 'object' && raw.areas ? raw.areas.archived : 0,
    activeDevices: typeof raw.active_devices === 'number' ? raw.active_devices : null,
    lastSyncAt: raw.last_sync_at ?? null,
  }
}

/** Last sync in the viewer's local time: "Today 08:02", "Yesterday 17:40", "3 Sep 14:10", "3 Sep 2025". */
export function syncLabel(iso: string | null | undefined, now: Date = new Date()): string {
  const d = parseDate(iso)
  if (!d) return 'Never'
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / DAY_MS)
  if (diff === 0) return `Today ${time}`
  if (diff === 1) return `Yesterday ${time}`
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? `${date} ${time}` : `${date} ${d.getFullYear()}`
}

/** Two–four letter mark for the organisation tile. */
export const orgMark = (code: string) => code.slice(0, 4).toUpperCase()
