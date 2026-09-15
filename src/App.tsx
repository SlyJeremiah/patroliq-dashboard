import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { AreaProvider } from '@/auth/AreaContext'
import { AuthProvider, MANAGER_ROLES, ADMIN_ROLES, useAuth } from '@/auth/AuthContext'
import type { Role } from '@/api/types'
import { EmptyState, Spinner } from '@/components/ui'
import { AppShell } from '@/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { CommandDashboardPage } from '@/features/ops/CommandDashboardPage'
import { LiveOpsPage } from '@/features/ops/LiveOpsPage'
import { AlertsPage } from '@/features/ops/AlertsPage'
import { AlertDetailPage } from '@/features/ops/AlertDetailPage'
import { RangersPage } from '@/features/ops/RangersPage'
import { CollarsPage } from '@/features/ops/CollarsPage'
import { IntelligencePage } from '@/features/intel/IntelligencePage'
import { CoveragePage } from '@/features/intel/CoveragePage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { ReportPreviewPage } from '@/features/reports/ReportPreviewPage'
import { SharedReportPage } from '@/features/reports/SharedReportPage'
import { AreasPage } from '@/features/admin/AreasPage'
import { AreaSetupPage } from '@/features/admin/AreaSetupPage'
import { UsersPage } from '@/features/admin/UsersPage'
import { AuditPage } from '@/features/admin/AuditPage'
import { SettingsPage } from '@/features/admin/SettingsPage'
import { PlatformPage } from '@/features/platform/PlatformPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-forest">
        <Spinner size={28} />
      </div>
    )
  }
  if (status !== 'signed_in') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth()
  if (!hasRole(...roles)) {
    return <EmptyState icon="lock" title="Not available for your role" text="Ask your organisation administrator if you need access." />
  }
  return <>{children}</>
}

/** Landing page depends on the role. */
function Home() {
  const { user } = useAuth()
  if (user?.role === 'platform_admin') return <Navigate to="/platform" replace />
  if (user?.role === 'researcher' || user?.role === 'viewer') return <Navigate to="/reports" replace />
  return <CommandDashboardPage />
}

const r = (roles: Role[], el: ReactNode) => <RequireRole roles={roles}>{el}</RequireRole>
const RESEARCH: Role[] = ['org_admin', 'manager', 'researcher']
const READERS: Role[] = ['org_admin', 'manager', 'researcher', 'viewer']

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AreaProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<Home />} />
                <Route path="live" element={r(MANAGER_ROLES, <LiveOpsPage />)} />
                <Route path="alerts" element={r(MANAGER_ROLES, <AlertsPage />)} />
                <Route path="alerts/:alertId" element={r(MANAGER_ROLES, <AlertDetailPage />)} />
                <Route path="rangers" element={r(MANAGER_ROLES, <RangersPage />)} />
                <Route path="collars" element={r(RESEARCH, <CollarsPage />)} />
                <Route path="intelligence" element={r(RESEARCH, <IntelligencePage />)} />
                <Route path="coverage" element={r(RESEARCH, <CoveragePage />)} />
                <Route path="reports" element={r(READERS, <ReportsPage />)} />
                <Route path="reports/shared/:token" element={<SharedReportPage />} />
                <Route path="reports/:reportId" element={r(READERS, <ReportPreviewPage />)} />
                <Route path="areas" element={r(MANAGER_ROLES, <AreasPage />)} />
                <Route path="areas/:areaId/setup" element={r(MANAGER_ROLES, <AreaSetupPage />)} />
                <Route path="areas/:areaId/setup/:step" element={r(MANAGER_ROLES, <AreaSetupPage />)} />
                <Route path="users" element={r(ADMIN_ROLES, <UsersPage />)} />
                <Route path="audit" element={r(MANAGER_ROLES, <AuditPage />)} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="platform" element={r(['platform_admin'], <PlatformPage />)} />
                <Route path="*" element={<EmptyState icon="explore_off" title="Page not found" />} />
              </Route>
            </Routes>
          </AreaProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
