// Pure helpers for the admin feature (area setup progress, error copy, users, audit). Unit-tested in adminLogic.test.ts.
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Area, AreaSetup, AuditEntry, Licence, Role, User } from '@/api/types'

// ------------------------------------------------------------------ area setup

export type StepKey = 'boundary' | 'bases' | 'grid' | 'teams'

export const SETUP_STEPS: { key: StepKey; label: string; hint: string; doneHint: string }[] = [
  { key: 'boundary', label: 'Boundary', hint: 'Upload a shapefile or draw the outline', doneHint: 'Boundary saved' },
  { key: 'bases', label: 'APU bases', hint: 'Place at least one base inside the boundary', doneHint: 'Bases placed' },
  { key: 'grid', label: 'GRTS grid', hint: 'Generate once bases are placed', doneHint: 'Grid generated' },
  { key: 'teams', label: 'Teams', hint: 'Assign rangers to sectors', doneHint: 'Teams created' },
]

export function isStepKey(v: string | undefined | null): v is StepKey {
  return v === 'boundary' || v === 'bases' || v === 'grid' || v === 'teams'
}

const EMPTY_SETUP: AreaSetup = { boundary: false, bases: false, grid: false, teams: false }

/** Setup progress derived from `area.setup` (falls back to the counters when `setup` is absent). */
export function setupProgress(area: Pick<Area, 'setup' | 'boundary' | 'apu_base_count' | 'cell_count' | 'team_count'>): {
  setup: AreaSetup
  done: number
  next: StepKey | null
} {
  const setup: AreaSetup = area.setup ?? {
    ...EMPTY_SETUP,
    boundary: !!area.boundary,
    bases: (area.apu_base_count ?? 0) > 0,
    grid: (area.cell_count ?? 0) > 0,
    teams: (area.team_count ?? 0) > 0,
  }
  const done = SETUP_STEPS.filter((s) => setup[s.key]).length
  const next = SETUP_STEPS.find((s) => !setup[s.key])?.key ?? null
  return { setup, done, next }
}

/** Human copy for `400 area_not_ready` field keys. */
export function activationProblems(fields: Record<string, unknown> | undefined): string[] {
  if (!fields) return []
  const labels: Record<string, string> = { boundary: 'Boundary', apu_bases: 'APU bases', bases: 'APU bases', grid: 'GRTS grid' }
  return Object.entries(fields).map(([k, v]) => {
    const msg = Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : ''
    return `${labels[k] ?? k}: ${msg || 'missing'}`
  })
}

export const AREA_TYPES: { value: string; label: string }[] = [
  { value: 'national_park', label: 'National park' },
  { value: 'safari_area', label: 'Safari area' },
  { value: 'conservancy', label: 'Conservancy' },
  { value: 'concession', label: 'Concession' },
  { value: 'community', label: 'Community area' },
  { value: 'other', label: 'Other' },
]

export const TIMEZONES = [
  'Africa/Harare', 'Africa/Johannesburg', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Gaborone', 'Africa/Windhoek',
  'Africa/Blantyre', 'Africa/Lubumbashi', 'Africa/Nairobi', 'Africa/Dar_es_Salaam', 'Africa/Kampala', 'Africa/Kigali', 'UTC',
]

export function areaTypeLabel(t?: string | null): string {
  return AREA_TYPES.find((a) => a.value === t)?.label ?? (t ? t.replace(/_/g, ' ') : 'Area')
}

/** 124 km² · 412.0 km² style: whole numbers from 100, one decimal from 10, two below. */
export function formatKm2(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2
  return `${v.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })} km²`
}

export function formatCellSize(m: number): string {
  return m >= 1000 ? `${Number((m / 1000).toFixed(2))} km` : `${m} m`
}

// ------------------------------------------------------------------ boundary import

export const BOUNDARY_EXTENSIONS = ['.zip', '.geojson', '.json', '.kml', '.kmz']
export const MAX_BOUNDARY_BYTES = 50 * 1024 * 1024

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

/** Client-side pre-check before uploading. Returns an error code or null. */
export function precheckBoundaryFile(file: { name: string; size: number }): 'unsupported_file_type' | 'file_too_large' | null {
  if (!BOUNDARY_EXTENSIONS.includes(fileExtension(file.name))) return 'unsupported_file_type'
  if (file.size > MAX_BOUNDARY_BYTES) return 'file_too_large'
  return null
}

export function boundarySourceLabel(ext: string): string {
  return ext === '.zip' ? 'Shapefile' : ext === '.kml' || ext === '.kmz' ? 'KML' : 'GeoJSON'
}

/** Plain-language copy for boundary import errors (Backend notes). */
export function boundaryErrorMessage(code: string, serverMessage?: string, fileName?: string): { title: string; text: string } {
  switch (code) {
    case 'invalid_file': {
      const ext = fileName ? fileExtension(fileName) : '.zip'
      const hint =
        ext === '.zip'
          ? 'For a shapefile, zip the .shp, .shx and .dbf files together (the .prj is optional).'
          : ext === '.kml' || ext === '.kmz'
            ? 'Export the boundary again from Google Earth or QGIS as KML.'
            : 'Check that the file is valid GeoJSON, for example by opening it in QGIS.'
      return { title: 'The file could not be read', text: `${serverMessage ? `${serverMessage} ` : ''}${hint}` }
    }
    case 'invalid_crs':
      return { title: 'Unknown coordinate system', text: 'Include the .prj file, or export the boundary in WGS 84 (EPSG:4326) and upload it again.' }
    case 'no_polygons':
      return { title: 'No polygons in this file', text: 'The file holds points or lines only. Upload the area outline as a polygon layer.' }
    case 'unsupported_file_type':
      return { title: 'File type not supported', text: 'Upload a zipped shapefile (.zip), GeoJSON (.geojson or .json), or KML/KMZ.' }
    case 'file_too_large':
      return { title: 'File is too large', text: 'Boundary files can be up to 50 MB. Remove extra layers or simplify the outline and try again.' }
    case 'invalid_feature_index':
      return { title: 'Feature not found', text: 'The selected feature is not in this file. Choose a feature again.' }
    case 'network_error':
      return { title: 'Cannot reach the server', text: 'Check your connection and try again.' }
    default:
      return { title: 'Boundary not saved', text: serverMessage || 'Something went wrong while saving the boundary.' }
  }
}

export interface CandidateFeature {
  index: number
  name: string
  area_km2: number | null
}

/** Parse `fields.features` from `feature_selection_required`. */
export function parseCandidateFeatures(fields: Record<string, unknown> | undefined): CandidateFeature[] {
  const raw = fields?.features
  if (!Array.isArray(raw)) return []
  return raw
    .map((f, i) => {
      const o = (f ?? {}) as Record<string, unknown>
      const index = typeof o.index === 'number' ? o.index : i
      const name = typeof o.name === 'string' && o.name.trim() ? o.name : `Feature ${index + 1}`
      const km2 = typeof o.area_km2 === 'number' ? o.area_km2 : null
      return { index, name, area_km2: km2 }
    })
    .sort((a, b) => a.index - b.index)
}

// ------------------------------------------------------------------ grid / sectors

export const CELL_SIZES = [500, 1000, 2000]

/** Count items per key (e.g. cells per APU base). Null keys are counted under ''. */
export function countBy<T>(items: T[], key: (item: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const it of items) {
    const k = key(it) ?? ''
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

/** Suggested code for a new base: APU-<highest number + 1>. */
export function nextBaseCode(codes: string[]): string {
  let max = 0
  for (const c of codes) {
    const m = /(\d+)\s*$/.exec(c)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `APU-${max + 1}`
}

/** Parses a latitude/longitude pair typed by the user. Null when invalid. */
export function parseLatLon(lat: string, lon: string): { lat: number; lon: number } | null {
  const la = Number(lat.trim())
  const lo = Number(lon.trim())
  if (!lat.trim() || !lon.trim() || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null
  return { lat: la, lon: lo }
}

/** Sector colours (design AreaBases): tan, green, teal, then muted extras. */
export const SECTOR_COLORS = ['#C9A77C', '#52B788', '#5FA8A0', '#8E7CC3', '#D98C5F', '#7FA0C9', '#B5B86A', '#C97C9A']

// ------------------------------------------------------------------ users

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ranger', label: 'Ranger' },
  { value: 'manager', label: 'Manager' },
  { value: 'org_admin', label: 'Admin' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'viewer', label: 'NGO/Gov' },
]

export const EMPLOYEE_PREFIX: Record<string, string> = { ranger: 'RGR', manager: 'MGR', org_admin: 'ADM', researcher: 'RES', viewer: 'NGO' }

/** Next free employee ID like RGR-2026-049, based on existing IDs with the same prefix and year. */
export function nextEmployeeId(existing: (string | null | undefined)[], role: Role, year: number): string {
  const prefix = `${EMPLOYEE_PREFIX[role] ?? 'USR'}-${year}-`
  let max = 0
  for (const id of existing) {
    if (!id || !id.toUpperCase().startsWith(prefix)) continue
    const n = Number.parseInt(id.slice(prefix.length), 10)
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

export const WEB_ROLE_SET: Role[] = ['org_admin', 'manager', 'researcher', 'viewer']
export const TOTP_ROLE_SET: Role[] = ['org_admin', 'manager']

export type UserStatus = 'active' | 'suspended' | 'pending'

export function userStatus(u: Pick<User, 'is_active' | 'status'> & { must_change_password?: boolean }): UserStatus {
  if (!u.is_active) return 'suspended'
  const s = (u.status ?? '').toLowerCase()
  if (u.must_change_password || s.includes('pending')) return 'pending'
  return 'active'
}

export const USER_STATUS_META: Record<UserStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: '#27AE60' },
  pending: { label: 'Pending first login', color: '#E67E22' },
  suspended: { label: 'Suspended', color: '#C0392B' },
}

export function filterUsers(users: User[], opts: { search?: string; role?: string; status?: string }): User[] {
  const q = (opts.search ?? '').trim().toLowerCase()
  return users
    .filter((u) => !opts.role || u.role === opts.role)
    .filter((u) => !opts.status || userStatus(u) === opts.status)
    .filter((u) => !q || u.full_name.toLowerCase().includes(q) || (u.employee_id ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (!a.employee_id !== !b.employee_id) return a.employee_id ? -1 : 1 // accounts without an ID last
      return (a.employee_id ?? '').localeCompare(b.employee_id ?? '') || a.full_name.localeCompare(b.full_name)
    })
}

/** Seats in use (active users only): rangers vs every web role (Backend notes). */
export function seatUsage(users: Pick<User, 'role' | 'is_active'>[]): { rangers: number; managers: number } {
  let rangers = 0
  let managers = 0
  for (const u of users) {
    if (!u.is_active) continue
    if (u.role === 'ranger') rangers++
    else if (u.role !== 'platform_admin') managers++
  }
  return { rangers, managers }
}

export function licenceModulesLabel(licence: Licence | null | undefined): string {
  const n = licence?.modules?.length ?? 0
  return n === 0 || n >= 6 ? 'all modules' : `${n} module${n === 1 ? '' : 's'}`
}

/** Latest successful sign-in per user id from `auth.login` audit entries. */
export function lastLoginByActor(entries: Pick<AuditEntry, 'actor_id' | 'action' | 'created_at'>[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of entries) {
    if (e.action !== 'auth.login' || !e.actor_id) continue
    if (!out[e.actor_id] || e.created_at > out[e.actor_id]) out[e.actor_id] = e.created_at
  }
  return out
}

/** "Today 07:58", "Yesterday 17:12", or "28 Aug 2026". */
export function loginLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  const days = differenceInCalendarDays(now, d)
  if (days === 0) return `Today ${format(d, 'HH:mm')}`
  if (days === 1) return `Yesterday ${format(d, 'HH:mm')}`
  return format(d, 'd MMM yyyy')
}

// ------------------------------------------------------------------ audit

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.login_refused': 'Sign-in refused',
  'auth.logout': 'Signed out',
  'auth.password_changed': 'Changed password',
  'user.create': 'Created user',
  'user.update': 'Updated user',
  'user.deactivate': 'Deactivated user',
  'area.create': 'Created area',
  'area.update': 'Updated area',
  'area.delete': 'Deleted area',
  'area.activate': 'Activated area',
  'area.boundary_import': 'Imported boundary',
  'area.boundary_drawn': 'Drew boundary',
  'area.grid_generate': 'Generated GRTS grid',
  'area.layer_set': 'Updated map layer',
  'apu_base.create': 'Added APU base',
  'apu_base.update': 'Updated APU base',
  'apu_base.delete': 'Removed APU base',
  'team.create': 'Created team',
  'team.update': 'Updated team',
  'team.delete': 'Deleted team',
  'assignment.create': 'Assigned team',
  'assignment.update': 'Updated assignment',
  'assignment.delete': 'Removed assignment',
  'alert.dispatch': 'Dispatched responders',
  'observation.acknowledge': 'Acknowledged threat',
  'safety_alert.create': 'SOS raised',
  'safety_alert.acknowledge': 'Acknowledged SOS',
  'safety_alert.resolve': 'Resolved SOS',
  'safety_alert.cancel': 'SOS cancelled',
  'ranger.message': 'Messaged ranger',
  'report.generate': 'Generated report',
  'report.download': 'Downloaded report',
  'report.share': 'Shared report',
  'report.share_open': 'Opened shared report',
  'coverage.export': 'Exported coverage',
  'media.upload': 'Uploaded media',
  'sync.push': 'Ranger sync',
  'platform.licence_update': 'Licence updated',
  'platform.organisation_create': 'Organisation created',
  'platform.organisation_update': 'Organisation updated',
}

export const AUDIT_ACTIONS = Object.keys(ACTION_LABELS)

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const s = action.replace(/[._]/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Tone for an audit action: failures/refusals/deletions are highlighted. */
export function actionTone(action: string): 'danger' | 'warning' | 'neutral' | 'success' {
  if (/failed|refused|safety_alert\.create/.test(action)) return 'danger'
  if (/delete|deactivate|cancel/.test(action)) return 'warning'
  if (/create|activate|generate/.test(action)) return 'success'
  return 'neutral'
}

/** The API sends `actor_label` ("Name (EMP-ID)"); the shared type says `actor_name`. */
export function actorText(e: AuditEntry & { actor_label?: string | null }): string {
  return e.actor_label || e.actor_name || (e.actor_id ? 'Unknown user' : 'System')
}

export function targetText(e: Pick<AuditEntry, 'target_type' | 'target_id'>): string {
  if (!e.target_type) return '—'
  const t = e.target_type.split('.').pop() ?? e.target_type
  const label = t.replace(/_/g, ' ').replace(/^apubase$/, 'APU base')
  return e.target_id ? `${label} ${e.target_id.slice(0, 8)}` : label
}
