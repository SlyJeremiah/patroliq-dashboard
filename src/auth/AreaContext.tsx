import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAreas } from '@/api/hooks'
import type { Area } from '@/api/types'
import { useAuth } from './AuthContext'

interface AreaState {
  areas: Area[]
  /** Selected conservation area (header switcher). Null only before areas load or when the org has none. */
  area: Area | null
  areaId: string | null
  setAreaId: (id: string) => void
  loading: boolean
}

const AreaContext = createContext<AreaState | null>(null)
const KEY = 'patroliq.area'

export function AreaProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const enabled = status === 'signed_in' && user?.role !== 'platform_admin'
  const { data, isLoading } = useAreas()
  const [areaId, setAreaIdState] = useState<string | null>(() => localStorage.getItem(KEY))

  const areas = useMemo(() => (enabled ? (data ?? []).filter((a) => a.status !== 'archived') : []), [data, enabled])

  useEffect(() => {
    if (!areas.length) return
    if (!areaId || !areas.some((a) => a.id === areaId)) {
      const preferred = areas.find((a) => a.status === 'active') ?? areas[0]
      setAreaIdState(preferred.id)
    }
  }, [areas, areaId])

  const value = useMemo<AreaState>(() => {
    const area = areas.find((a) => a.id === areaId) ?? null
    return {
      areas,
      area,
      areaId: area?.id ?? null,
      setAreaId: (id) => {
        localStorage.setItem(KEY, id)
        setAreaIdState(id)
      },
      loading: enabled && isLoading,
    }
  }, [areas, areaId, enabled, isLoading])

  return <AreaContext.Provider value={value}>{children}</AreaContext.Provider>
}

export function useArea(): AreaState {
  const ctx = useContext(AreaContext)
  if (!ctx) throw new Error('useArea outside AreaProvider')
  return ctx
}
