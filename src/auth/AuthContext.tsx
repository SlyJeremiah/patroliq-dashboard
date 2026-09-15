import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, tokenStore } from '@/api/client'
import type { Licence, Organisation, Role, SessionResponse, User } from '@/api/types'

export interface WebLogin {
  email: string
  password: string
  totp?: string
  remember: boolean
}

interface AuthState {
  status: 'loading' | 'signed_out' | 'signed_in'
  user: User | null
  organisation: Organisation | null
  licence: Licence | null
  login: (creds: WebLogin) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
  hasModule: (module: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

/** Roles allowed into the web dashboard. Rangers use the Android app. */
export const WEB_ROLES: Role[] = ['platform_admin', 'org_admin', 'manager', 'researcher', 'viewer']

// Development only (stripped from production builds): `?devtoken=<token>` signs in for local screenshots/tests.
if (import.meta.env.DEV) {
  const devToken = new URLSearchParams(window.location.search).get('devtoken')
  if (devToken) tokenStore.set(devToken, false)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [status, setStatus] = useState<AuthState['status']>(tokenStore.get() ? 'loading' : 'signed_out')

  const clear = useCallback(() => {
    tokenStore.clear()
    setSession(null)
    setStatus('signed_out')
    qc.clear()
  }, [qc])

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('signed_out')
      return
    }
    try {
      const me = await api.get<SessionResponse>('me/')
      if (!WEB_ROLES.includes(me.user.role)) throw new ApiError(403, 'role_not_allowed', 'Rangers sign in with the PatrolIQ app.')
      setSession(me)
      setStatus('signed_in')
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        // Offline: keep the token and retry later instead of signing the manager out.
        setStatus('signed_out')
        return
      }
      clear()
    }
  }, [clear])

  useEffect(() => {
    void refresh()
    return tokenStore.onUnauthorised(clear)
  }, [refresh, clear])

  const login = useCallback(async ({ email, password, totp, remember }: WebLogin) => {
    const res = await api.post<SessionResponse>('auth/login/', { email: email.trim(), password, ...(totp ? { totp } : {}) })
    if (!WEB_ROLES.includes(res.user.role)) {
      throw new ApiError(403, 'role_not_allowed', 'Rangers sign in with the PatrolIQ app on their phone.')
    }
    if (!res.token) throw new ApiError(500, 'no_token', 'The server did not return a session.')
    tokenStore.set(res.token, remember)
    qc.clear()
    setSession(res)
    setStatus('signed_in')
  }, [qc])

  const logout = useCallback(async () => {
    try {
      await api.post('auth/logout/')
    } catch {
      /* token may already be gone */
    }
    clear()
  }, [clear])

  const value = useMemo<AuthState>(() => ({
    status,
    user: session?.user ?? null,
    organisation: session?.organisation ?? null,
    licence: session?.licence ?? null,
    login,
    logout,
    refresh,
    hasRole: (...roles) => !!session && roles.includes(session.user.role),
    hasModule: (m) => {
      const mods = session?.licence?.modules
      return !mods || mods.length === 0 || mods.includes(m)
    },
  }), [status, session, login, logout, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

export const MANAGER_ROLES: Role[] = ['org_admin', 'manager']
export const ADMIN_ROLES: Role[] = ['org_admin']
export const READER_ROLES: Role[] = ['org_admin', 'manager', 'researcher', 'viewer']

export function roleLabel(role: Role): string {
  return {
    platform_admin: 'Platform admin',
    org_admin: 'Admin',
    manager: 'Manager',
    ranger: 'Ranger',
    researcher: 'Researcher',
    viewer: 'NGO / Gov',
  }[role]
}
