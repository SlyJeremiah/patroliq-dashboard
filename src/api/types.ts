// Wire types for docs/PATROLIQ_Platform_Spec_v1.2.md (§4, §5 and §7). JSON is snake_case.
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon } from 'geojson'

export type Role = 'platform_admin' | 'org_admin' | 'manager' | 'ranger' | 'researcher' | 'viewer'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
/**
 * Precedence on the server: sos > paused > active > online > offline.
 * `online` = the phone synced or sent a position recently but the ranger has no open patrol.
 */
export type RangerStatus = 'active' | 'paused' | 'online' | 'offline' | 'sos'

export interface User {
  id: string
  organisation_id?: string | null
  employee_id?: string | null
  email?: string | null
  full_name: string
  role: Role
  phone?: string | null
  language: 'en' | 'sn' | 'nd'
  is_active: boolean
  area_ids: string[]
  apu_base_id?: string | null
  team_id?: string | null
  last_login?: string | null
  status?: string
}

export interface Organisation {
  id: string
  name: string
  code: string
  country?: string | null
  status: 'active' | 'grace' | 'suspended'
  created_at?: string
}

export interface Licence {
  plan: 'pilot' | 'standard' | 'enterprise'
  max_rangers?: number | null
  max_managers?: number | null
  max_areas?: number | null
  modules: string[]
  starts_at?: string | null
  expires_at?: string | null
  grace_days?: number | null
  status: 'active' | 'grace' | 'suspended'
  deployment?: string | null
}

export interface SessionResponse {
  token?: string
  user: User
  organisation: Organisation | null
  licence: Licence | null
}

export interface AreaSetup {
  boundary: boolean
  bases: boolean
  grid: boolean
  teams: boolean
}

export interface Area {
  id: string
  organisation_id?: string
  name: string
  client_name?: string | null
  area_type?: string | null
  boundary?: MultiPolygon | null
  boundary_source?: string | null
  area_km2?: number | null
  timezone?: string | null
  grid_cell_size_m?: number | null
  status: 'draft' | 'active' | 'archived'
  updated_at?: string
  apu_base_count?: number
  cell_count?: number
  team_count?: number
  sector_count?: number
  setup?: AreaSetup
}

export interface ApuBase {
  id: string
  area_id: string
  name: string
  code: string
  call_sign?: string | null
  location: Point
  updated_at?: string
  ranger_count?: number
}

export interface Sector {
  id: string
  area_id: string
  name: string
  apu_base_id?: string | null
}

export interface CellProperties {
  id: string
  label: string
  grts_order: number
  sector_id?: string | null
}
export type CellCollection = FeatureCollection<Polygon, CellProperties>

export interface Team {
  id: string
  organisation_id?: string
  area_id: string
  apu_base_id: string
  name: string
  leader_id?: string | null
  member_ids: string[]
}

export interface Assignment {
  id: string
  team_id?: string | null
  area_id: string
  date: string
  cell_ids: string[]
  visit_target?: number | null
  notes?: string | null
}

export interface RiskFactor {
  key: string
  label: string
  weight: number
  value?: number | string | null
}

export interface CellRisk {
  cell_id: string
  label: string
  sector_id?: string | null
  score: number
  level: Severity
  factors: RiskFactor[]
  centroid: Point
}

export interface AreaRisk {
  date: string
  engine: 'heuristic' | 'ml'
  model_confidence: 'low' | 'moderate' | 'high'
  cells: CellRisk[]
}

export interface RiskTrendPoint {
  date: string
  mean_score: number
  max_score: number
  high_cells: number
  critical_cells: number
}

export interface DashboardSummary {
  area_id: string | null
  rangers_total: number
  rangers_active: number
  rangers_paused: number
  /** Added with the `online` ranger status; older servers omit it (treat as 0). */
  rangers_online?: number
  rangers_offline: number
  open_alerts: number
  critical_alerts: number
  sos_active: number
  sync_rate_24h: number
  grts_coverage_month: number
  observations_today: number
  patrols_today: number
  last_ranger_sync_at: string | null
  server_time: string
}

export interface LastPosition {
  lat: number
  lon: number
  accuracy_m?: number | null
  battery_pct?: number | null
  recorded_at: string
}

export interface RangerLive {
  id: string
  full_name: string
  employee_id?: string | null
  phone?: string | null
  team_id?: string | null
  team_name?: string | null
  apu_base_id?: string | null
  apu_base_code?: string | null
  status: RangerStatus
  last_position: LastPosition | null
  current_patrol: {
    client_uuid: string
    started_at: string
    status: 'active' | 'paused' | 'ended'
    distance_m: number
    patrol_type: string
  } | null
  today: { distance_m: number; observations: number; patrols: number; cells_visited: string[] }
  last_sync_at?: string | null
}

export interface RangerDetail extends RangerLive {
  recent_observations: Observation[]
  alerts: AlertItem[]
}

export interface Observation {
  client_uuid: string
  id?: string
  patrol_client_uuid?: string | null
  area_id: string
  observer_id?: string | null
  observer_name?: string | null
  category: 'wildlife' | 'threat' | 'carcass' | 'habitat' | 'infrastructure' | 'other'
  subtype?: string | null
  species_id?: string | null
  species_name?: string | null
  count?: number | null
  sex?: 'male' | 'female' | 'mixed' | 'unknown' | null
  male_count?: number | null
  female_count?: number | null
  age_class?: string | null
  behaviour?: string | null
  severity?: Severity | null
  direction_of_travel?: string | null
  alert_manager: boolean
  notes?: string | null
  lat: number
  lon: number
  accuracy_m?: number | null
  cell_id?: string | null
  cell_label?: string | null
  ai_species_confidence?: number | null
  recorded_at: string
  voice_transcript?: string | null
  media?: ObservationMedia[]
}

export interface ObservationMedia {
  id: string
  observation_client_uuid?: string | null
  kind: 'photo' | 'video' | 'audio' | (string & {})
  content_type?: string | null
  size_bytes?: number | null
  sha256?: string | null
  /** Absolute API URL (`…/api/v1/media/<id>/file/`); requires the Authorization header. */
  url?: string | null
}

export interface Patrol {
  client_uuid: string
  ranger_id: string
  ranger_name?: string
  team_id?: string | null
  area_id: string
  apu_base_id?: string | null
  patrol_type: string
  started_at: string
  ended_at?: string | null
  status: 'active' | 'paused' | 'ended'
  distance_m: number
  duration_s: number
  notes?: string | null
}

export type TrackFeature = Feature<LineString, { ranger_id: string; started_at: string; ended_at?: string | null; distance_m: number; status: string }>

export interface AlertTimelineEntry {
  at: string
  action: string
  actor_name?: string | null
  note?: string | null
}

export interface AlertItem {
  id: string
  type: 'safety' | 'threat'
  kind: string
  status: string
  severity: Severity
  ranger_id?: string | null
  ranger_name?: string | null
  area_id?: string | null
  cell_id?: string | null
  cell_label?: string | null
  lat?: number | null
  lon?: number | null
  accuracy_m?: number | null
  battery_pct?: number | null
  signal_level?: number | null
  occurred_at: string
  acknowledged_at?: string | null
  resolved_at?: string | null
  dispatched_at?: string | null
  note?: string | null
  title?: string
  timeline?: AlertTimelineEntry[]
  responders?: { id: string; full_name: string }[]
}

export interface CoverageSector {
  id: string
  name: string
  cells: number
  complete: number
  partial: number
  pending: number
  coverage_pct: number
}

export interface CoverageCell {
  cell_id: string
  label: string
  sector_id?: string | null
  visits: number
  status: 'complete' | 'partial' | 'pending' | 'never'
  last_visit_at?: string | null
  observations: number
}

export interface Coverage {
  month: string
  visit_target: number
  coverage_pct: number
  season_coverage_pct: number
  never_surveyed: number
  mean_visits: number
  sectors: CoverageSector[]
  cells: CoverageCell[]
}

export type ReportType =
  | 'patrol_summary'
  | 'incident_report'
  | 'wildlife_census'
  | 'threat_intelligence'
  | 'grts_survey'
  | 'ranger_performance'
  | 'donor_report'
  | 'zpwma_compliance'
export type ReportFormat = 'pdf' | 'csv' | 'geojson'

export interface Report {
  id: string
  type: ReportType
  format: ReportFormat
  status: 'ready' | 'failed' | 'generating'
  title: string
  params: Record<string, unknown>
  size_bytes?: number | null
  created_at: string
  created_by_name?: string | null
  anonymised: boolean
  summary?: Record<string, unknown>
}

export interface AuditEntry {
  id: string
  actor_id?: string | null
  actor_name?: string | null
  action: string
  target_type?: string | null
  target_id?: string | null
  ip?: string | null
  created_at: string
  detail?: Record<string, unknown>
}

export interface Species {
  id: string
  common_name: string
  scientific_name?: string | null
  shona_name?: string | null
  ndebele_name?: string | null
  iucn_status?: string | null
}

export interface PlatformOrganisation extends Organisation {
  licence?: Licence | null
  usage?: OrgUsage
}

export interface OrgUsage {
  rangers: number
  managers: number
  areas: number
  active_devices?: number
  last_sync_at?: string | null
}

export interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type AreaBoundary = Polygon | MultiPolygon
