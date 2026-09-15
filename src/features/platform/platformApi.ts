// Feature-local adapters around the foundation platform hooks (real response shapes differ from types.ts — see FOUNDATION_REQUESTS.md).
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '@/api/client'
import type { Licence, PlatformOrganisation, User } from '@/api/types'
import { normaliseUsage, type Deployment, type Usage, type UsageWire } from './platformLogic'

/** `GET platform/organisations/` items: organisation + `deployment` + full licence. */
export type PlatformOrg = PlatformOrganisation & { deployment?: Deployment | null }

/** `POST platform/organisations/` 201 body. */
export interface CreateOrgResult {
  organisation: PlatformOrg
  admin_user: User
  temporary_password: string
  totp_secret?: string
  totp_uri?: string
}

export interface CreateOrgBody {
  name: string
  code: string
  country?: string
  deployment?: Deployment
  licence: Pick<Licence, 'plan' | 'max_rangers' | 'max_managers' | 'max_areas' | 'modules' | 'starts_at' | 'expires_at' | 'grace_days'>
  admin: { full_name: string; email: string }
}

/** Same cache key as the foundation `useOrgUsage`; the raw (nested) body is cached and normalised on read. */
export const usageKey = (id: string) => ['platform-usage', id] as const

export function useUsages(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: usageKey(id),
      queryFn: () => api.get<UsageWire>(`platform/organisations/${id}/usage/`),
      staleTime: 30_000,
    })),
    combine: (results) => {
      const byId: Record<string, Usage | null> = {}
      results.forEach((r, i) => {
        byId[ids[i]] = r.data ? normaliseUsage(r.data) : null
      })
      return { byId, loading: results.some((r) => r.isLoading), error: results.find((r) => r.error)?.error ?? null }
    },
  })
}

/** Invalidate everything the console shows for one organisation after a write. */
export function useInvalidateOrg() {
  const qc = useQueryClient()
  return useCallback(
    (id: string) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['platform-orgs'] }),
        qc.invalidateQueries({ queryKey: ['platform-org', id] }),
        qc.invalidateQueries({ queryKey: ['platform-licence', id] }),
        qc.invalidateQueries({ queryKey: usageKey(id) }),
      ]),
    [qc],
  )
}
