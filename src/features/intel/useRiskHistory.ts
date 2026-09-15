import { useQueries } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/hooks'
import type { AreaRisk } from '@/api/types'
import { shiftDate } from './intelLogic'

/**
 * Daily area risk responses for the `days` days ending at `endDate` (one request per day, shared cache with useAreaRisk).
 * Used for a cell's score history; past days never change, so results stay fresh for 10 minutes.
 */
export function useRiskHistory(areaId: string | null | undefined, endDate: string | null | undefined, days = 14, enabled = true) {
  const dates = endDate ? Array.from({ length: days }, (_, i) => shiftDate(endDate, i - days + 1)) : []
  const results = useQueries({
    queries: dates.map((date) => ({
      queryKey: qk.risk(areaId ?? '', date),
      queryFn: () => api.get<AreaRisk>(`areas/${areaId}/risk/`, { date }),
      enabled: enabled && !!areaId,
      staleTime: 10 * 60_000,
    })),
  })
  return {
    data: results.map((r) => r.data),
    isLoading: results.some((r) => r.isLoading),
    isError: results.length > 0 && results.every((r) => r.isError),
  }
}
