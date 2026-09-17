// React Query hooks for every dashboard endpoint (spec §5 + §7). Feature pages import from here.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, fetchBlob } from './client'
import type {
  AlertItem, ApuBase, Area, AreaBoundary, AreaRisk, Assignment, AuditEntry, CellCollection, Coverage, DashboardSummary,
  Licence, Observation, OrgUsage, Page, Patrol, PlatformOrganisation, RangerDetail, RangerLive, Report, ReportFormat,
  ReportType, RiskTrendPoint, Sector, SessionResponse, Species, Team, TrackFeature, User,
} from './types'

/** Live data refresh (App Flow 9: every 30 seconds). */
export const LIVE_REFRESH_MS = 30_000

export const qk = {
  me: ['me'] as const,
  summary: (areaId?: string | null) => ['summary', areaId ?? 'all'] as const,
  rangers: (areaId?: string | null) => ['rangers', areaId ?? 'all'] as const,
  ranger: (id: string) => ['ranger', id] as const,
  alerts: (params: object) => ['alerts', params] as const,
  alert: (id: string) => ['alert', id] as const,
  areas: ['areas'] as const,
  area: (id: string) => ['area', id] as const,
  bases: (areaId?: string) => ['apu-bases', areaId ?? 'all'] as const,
  sectors: (areaId: string) => ['sectors', areaId] as const,
  cells: (areaId: string) => ['cells', areaId] as const,
  risk: (areaId: string, date?: string) => ['risk', areaId, date ?? 'today'] as const,
  riskTrend: (areaId: string, days: number) => ['risk-trend', areaId, days] as const,
  coverage: (areaId: string, month?: string) => ['coverage', areaId, month ?? 'current'] as const,
  teams: (areaId?: string) => ['teams', areaId ?? 'all'] as const,
  assignments: (params: object) => ['assignments', params] as const,
  users: (params: object) => ['users', params] as const,
  observations: (params: object) => ['observations', params] as const,
  media: (id: string) => ['media', id] as const,
  patrols: (params: object) => ['patrols', params] as const,
  track: (uuid: string) => ['track', uuid] as const,
  positionsHistory: (params: object) => ['positions-history', params] as const,
  reports: ['reports'] as const,
  report: (id: string) => ['report', id] as const,
  audit: (params: object) => ['audit', params] as const,
  species: ['species'] as const,
  platformOrgs: ['platform-orgs'] as const,
  platformOrg: (id: string) => ['platform-org', id] as const,
}

/** Accepts either a plain array or a paginated `{results}` response. */
function list<T>(data: T[] | Page<T>): T[] {
  return Array.isArray(data) ? data : data.results
}

// ------------------------------------------------------------------ session
export const useMe = (enabled = true) =>
  useQuery({ queryKey: qk.me, queryFn: () => api.get<SessionResponse>('me/'), enabled, staleTime: 5 * 60_000 })

// ------------------------------------------------------------------ operations
export const useSummary = (areaId?: string | null) =>
  useQuery({
    queryKey: qk.summary(areaId),
    queryFn: () => api.get<DashboardSummary>('dashboard/summary/', { area_id: areaId }),
    refetchInterval: LIVE_REFRESH_MS,
  })

export const useRangers = (areaId?: string | null) =>
  useQuery({
    queryKey: qk.rangers(areaId),
    queryFn: async () => list(await api.get<RangerLive[] | Page<RangerLive>>('rangers/', { area_id: areaId })),
    refetchInterval: LIVE_REFRESH_MS,
  })

export const useRanger = (id?: string | null) =>
  useQuery({
    queryKey: qk.ranger(id ?? ''),
    queryFn: () => api.get<RangerDetail>(`rangers/${id}/`),
    enabled: !!id,
    refetchInterval: LIVE_REFRESH_MS,
  })

export const useMessageRanger = () =>
  useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.post<{ channel: string; queued: boolean }>(`rangers/${id}/message/`, { text }),
  })

export interface AlertParams {
  status?: 'active' | 'acknowledged'
  area_id?: string | null
  limit?: number
}

export const useAlerts = (params: AlertParams = {}) =>
  useQuery({
    queryKey: qk.alerts(params),
    queryFn: async () => list(await api.get<AlertItem[] | Page<AlertItem>>('alerts/', { ...params })),
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  })

export const useAlert = (id?: string | null) =>
  useQuery({ queryKey: qk.alert(id ?? ''), queryFn: () => api.get<AlertItem>(`alerts/${id}/`), enabled: !!id, refetchInterval: 15_000 })

function useAlertMutation<V>(fn: (v: V) => Promise<AlertItem>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

export const useAcknowledgeAlert = () =>
  useAlertMutation(({ id, note }: { id: string; note?: string }) => api.post<AlertItem>(`alerts/${id}/acknowledge/`, note ? { note } : {}))
export const useResolveAlert = () =>
  useAlertMutation(({ id, note }: { id: string; note?: string }) => api.post<AlertItem>(`alerts/${id}/resolve/`, note ? { note } : {}))
export const useDispatchAlert = () =>
  useAlertMutation(({ id, note, responder_ids }: { id: string; note: string; responder_ids: string[] }) =>
    api.post<AlertItem>(`alerts/${id}/dispatch/`, { note, responder_ids }))

export const useObservations = (params: { area_id?: string | null; since?: string; until?: string; category?: string; limit?: number } = {}, opts: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: qk.observations(params),
    enabled: opts.enabled ?? true,
    queryFn: async () => list(await api.get<Observation[] | Page<Observation>>('observations/', { ...params })),
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  })

export const usePatrols = (params: { area_id?: string | null; ranger_id?: string; since?: string; status?: string } = {}) =>
  useQuery({
    queryKey: qk.patrols(params),
    queryFn: async () => list(await api.get<Patrol[] | Page<Patrol>>('patrols/', { ...params })),
    refetchInterval: LIVE_REFRESH_MS,
  })

/**
 * Observation photo/video/audio as a Blob (the file endpoint needs the auth header, so no plain `<img src>`).
 * Cached by media id; files never change. 404/403 are not retried (older photos may be missing on the server).
 */
export const useMediaBlob = (media: { id: string; url?: string | null } | null | undefined) =>
  useQuery({
    queryKey: qk.media(media?.id ?? '-'),
    enabled: !!media?.id,
    queryFn: ({ signal }) => fetchBlob(media!.url || `media/${media!.id}/file/`, signal),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: (count, e) => count < 1 && !(e instanceof Error && 'status' in e && [401, 403, 404, 410].includes((e as { status: number }).status)),
  })

export const useTrack = (clientUuid?: string | null) =>
  useQuery({
    queryKey: qk.track(clientUuid ?? ''),
    queryFn: () => api.get<TrackFeature>(`patrols/${clientUuid}/track/`),
    enabled: !!clientUuid,
    refetchInterval: LIVE_REFRESH_MS,
  })

export const usePositionHistory = (params: { ranger_id?: string; since?: string; until?: string }) =>
  useQuery({
    queryKey: qk.positionsHistory(params),
    queryFn: () => api.get<{ recorded_at: string; lat: number; lon: number; battery_pct?: number | null }[]>('positions/history/', { ...params }),
    enabled: !!params.ranger_id,
  })

// ------------------------------------------------------------------ areas, grid, risk, coverage
export const useAreas = () =>
  useQuery({ queryKey: qk.areas, queryFn: async () => list(await api.get<Area[] | Page<Area>>('areas/')), staleTime: 60_000 })

export const useArea = (id?: string | null) =>
  useQuery({ queryKey: qk.area(id ?? ''), queryFn: () => api.get<Area>(`areas/${id}/`), enabled: !!id })

export const useApuBases = (areaId?: string | null) =>
  useQuery({
    queryKey: qk.bases(areaId ?? undefined),
    queryFn: async () => list(await api.get<ApuBase[] | Page<ApuBase>>('apu-bases/', { area_id: areaId })),
    enabled: areaId !== undefined,
  })

export const useSectors = (areaId?: string | null) =>
  useQuery({
    queryKey: qk.sectors(areaId ?? ''),
    queryFn: async () => list(await api.get<Sector[] | Page<Sector>>(`areas/${areaId}/sectors/`)),
    enabled: !!areaId,
  })

export const useCells = (areaId?: string | null) =>
  useQuery({ queryKey: qk.cells(areaId ?? ''), queryFn: () => api.get<CellCollection>(`areas/${areaId}/cells/`), enabled: !!areaId, staleTime: 5 * 60_000 })

export const useAreaRisk = (areaId?: string | null, date?: string) =>
  useQuery({ queryKey: qk.risk(areaId ?? '', date), queryFn: () => api.get<AreaRisk>(`areas/${areaId}/risk/`, { date }), enabled: !!areaId })

export const useRiskTrend = (areaId?: string | null, days = 30) =>
  useQuery({
    queryKey: qk.riskTrend(areaId ?? '', days),
    queryFn: () => api.get<RiskTrendPoint[]>(`areas/${areaId}/risk/trend/`, { days }),
    enabled: !!areaId,
  })

export const useCoverage = (areaId?: string | null, month?: string) =>
  useQuery({ queryKey: qk.coverage(areaId ?? '', month), queryFn: () => api.get<Coverage>(`areas/${areaId}/coverage/`, { month }), enabled: !!areaId })

function useInvalidate(keys: readonly (readonly unknown[])[]) {
  const qc = useQueryClient()
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
}

export const useCreateArea = () => {
  const inv = useInvalidate([qk.areas])
  return useMutation({
    mutationFn: (body: { name: string; client_name?: string; area_type?: string; timezone?: string }) => api.post<Area>('areas/', body),
    onSuccess: inv,
  })
}

export const useUpdateArea = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Area> & { id: string }) => api.patch<Area>(`areas/${id}/`, body),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: qk.areas })
      qc.setQueryData(qk.area(a.id), a)
    },
  })
}

export interface BoundaryImportResult {
  area: Area
  features_found: number
  crs_detected?: string | null
}

export const useImportBoundary = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, file, featureIndex, dissolve }: { areaId: string; file: File; featureIndex?: number; dissolve?: boolean }) => {
      const form = new FormData()
      form.append('file', file)
      if (featureIndex !== undefined) form.append('feature_index', String(featureIndex))
      if (dissolve) form.append('dissolve', 'true')
      return api.upload<BoundaryImportResult>(`areas/${areaId}/boundary/import/`, form)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: qk.areas })
      qc.setQueryData(qk.area(r.area.id), r.area)
    },
  })
}

export const useSaveDrawnBoundary = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, boundary }: { areaId: string; boundary: AreaBoundary }) => api.put<Area>(`areas/${areaId}/boundary/`, { boundary }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: qk.areas })
      qc.setQueryData(qk.area(a.id), a)
    },
  })
}

export const useGenerateGrid = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, cellSizeM, dryRun, force }: { areaId: string; cellSizeM: number; dryRun?: boolean; force?: boolean }) =>
      api.post<{ cells_created: number; sectors_created: number; cells?: CellCollection }>(`areas/${areaId}/grid/generate/`, {
        cell_size_m: cellSizeM,
        ...(dryRun ? { dry_run: true } : {}),
        ...(force ? { force: true } : {}),
      }),
    onSuccess: (_r, v) => {
      if (v.dryRun) return
      qc.invalidateQueries({ queryKey: qk.cells(v.areaId) })
      qc.invalidateQueries({ queryKey: qk.sectors(v.areaId) })
      qc.invalidateQueries({ queryKey: qk.areas })
      qc.invalidateQueries({ queryKey: qk.area(v.areaId) })
    },
  })
}

export const useActivateArea = () => {
  const inv = useInvalidate([qk.areas])
  return useMutation({ mutationFn: (areaId: string) => api.post<Area>(`areas/${areaId}/activate/`), onSuccess: inv })
}

export const useSaveApuBase = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Omit<ApuBase, 'id'>> & { id?: string; area_id: string }) =>
      id ? api.patch<ApuBase>(`apu-bases/${id}/`, body) : api.post<ApuBase>('apu-bases/', body),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['apu-bases'] })
      qc.invalidateQueries({ queryKey: qk.areas })
      qc.invalidateQueries({ queryKey: qk.area(b.area_id) })
    },
  })
}

export const useDeleteApuBase = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`apu-bases/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apu-bases'] })
      qc.invalidateQueries({ queryKey: qk.areas })
    },
  })
}

export const useTeams = (areaId?: string | null) =>
  useQuery({ queryKey: qk.teams(areaId ?? undefined), queryFn: async () => list(await api.get<Team[] | Page<Team>>('teams/', { area_id: areaId })) })

export const useSaveTeam = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Omit<Team, 'id'>> & { id?: string }) => (id ? api.patch<Team>(`teams/${id}/`, body) : api.post<Team>('teams/', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['rangers'] })
    },
  })
}

export const useAssignments = (params: { area_id?: string | null; team_id?: string; date?: string } = {}) =>
  useQuery({ queryKey: qk.assignments(params), queryFn: async () => list(await api.get<Assignment[] | Page<Assignment>>('assignments/', { ...params })) })

export const useSaveAssignment = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Omit<Assignment, 'id'>> & { id?: string }) =>
      id ? api.patch<Assignment>(`assignments/${id}/`, body) : api.post<Assignment>('assignments/', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  })
}

// ------------------------------------------------------------------ users, audit, species
export const useUsers = (params: { role?: string; is_active?: boolean; search?: string; area_id?: string } = {}) =>
  useQuery({
    queryKey: qk.users(params),
    queryFn: async () => list(await api.get<User[] | Page<User>>('users/', { ...params })),
    placeholderData: keepPreviousData,
  })

export type NewUserResult = User & { temporary_password?: string; totp_secret?: string; totp_uri?: string }

export const useSaveUser = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Omit<User, 'id'>> & { id?: string }) =>
      id ? api.patch<NewUserResult>(`users/${id}/`, body) : api.post<NewUserResult>('users/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['rangers'] })
    },
  })
}

export const useDeactivateUser = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.delete<void>(`users/${id}/`), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })
}

export const useAuditLog = (params: { limit?: number; offset?: number; action?: string; actor_id?: string } = {}) =>
  useQuery({
    queryKey: qk.audit(params),
    queryFn: () => api.get<AuditEntry[] | Page<AuditEntry>>('audit-log/', { limit: 50, ...params }),
    placeholderData: keepPreviousData,
  })

export const useSpecies = () =>
  useQuery({ queryKey: qk.species, queryFn: async () => list(await api.get<Species[] | Page<Species>>('species/')), staleTime: 60 * 60_000 })

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) => api.post<void>('auth/password/', body),
  })

// ------------------------------------------------------------------ reports
export const useReports = () =>
  useQuery({ queryKey: qk.reports, queryFn: async () => list(await api.get<Report[] | Page<Report>>('reports/')) })

export const useReport = (id?: string | null) =>
  useQuery({ queryKey: qk.report(id ?? ''), queryFn: () => api.get<Report>(`reports/${id}/`), enabled: !!id })

export interface ReportRequest {
  type: ReportType
  format: ReportFormat
  date_from: string
  date_to: string
  area_id?: string | null
  sector_id?: string | null
  ranger_id?: string | null
  species_id?: string | null
}

export const useGenerateReport = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReportRequest) => api.post<Report>('reports/', body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: qk.reports })
      qc.setQueryData(qk.report(r.id), r)
    },
  })
}

export const useShareReport = () =>
  useMutation({ mutationFn: (id: string) => api.post<{ url: string; token: string; expires_at: string }>(`reports/${id}/share/`) })

// ------------------------------------------------------------------ platform (zrGISsolutions)
export const usePlatformOrgs = () =>
  useQuery({
    queryKey: qk.platformOrgs,
    queryFn: async () => list(await api.get<PlatformOrganisation[] | Page<PlatformOrganisation>>('platform/organisations/')),
  })

export const usePlatformOrg = (id?: string | null) =>
  useQuery({ queryKey: qk.platformOrg(id ?? ''), queryFn: () => api.get<PlatformOrganisation>(`platform/organisations/${id}/`), enabled: !!id })

export const useOrgLicence = (id?: string | null) =>
  useQuery({ queryKey: ['platform-licence', id], queryFn: () => api.get<Licence>(`platform/organisations/${id}/licence/`), enabled: !!id })

export const useOrgUsage = (id?: string | null) =>
  useQuery({ queryKey: ['platform-usage', id], queryFn: () => api.get<OrgUsage>(`platform/organisations/${id}/usage/`), enabled: !!id })

export const useSaveLicence = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orgId, ...body }: Partial<Licence> & { orgId: string }) => api.put<Licence>(`platform/organisations/${orgId}/licence/`, body),
    onSuccess: (_l, v) => {
      qc.invalidateQueries({ queryKey: qk.platformOrgs })
      qc.invalidateQueries({ queryKey: ['platform-licence', v.orgId] })
    },
  })
}

export const useUpdateOrg = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<PlatformOrganisation> & { id: string }) => api.patch<PlatformOrganisation>(`platform/organisations/${id}/`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platformOrgs }),
  })
}

export const useCreateOrg = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<PlatformOrganisation & { admin?: NewUserResult }>('platform/organisations/', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platformOrgs }),
  })
}
