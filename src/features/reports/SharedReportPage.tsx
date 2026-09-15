import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { EmptyState, ErrorState, Spinner } from '@/components/ui'
import { reportErrorMessage } from './reportsLogic'
import { ReportView, type ReportWire } from './ReportView'

const back = <Link to="/reports" className="text-small font-semibold text-forest underline">Go to reports</Link>

/** `/reports/shared/:token` — a 48-hour link that still requires signing in to the same organisation. */
export function SharedReportPage() {
  const { token } = useParams<{ token: string }>()
  const shared = useQuery({
    queryKey: ['shared-report', token],
    queryFn: () => api.get<ReportWire>(`reports/shared/${encodeURIComponent(token ?? '')}/`),
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  })

  if (shared.isLoading) {
    return <div className="flex flex-1 items-center justify-center text-forest"><Spinner size={28} /></div>
  }
  if (shared.isError) {
    const err = shared.error
    if (err instanceof ApiError && (err.code === 'share_expired' || err.status === 410)) {
      return <EmptyState icon="timer_off" title="This share link has expired" text="Share links last 48 hours. Ask the person who shared it to send a new link." action={back} />
    }
    if (err instanceof ApiError && err.status === 404) {
      return <EmptyState icon="link_off" title="Share link not found" text="The link is incomplete, was revoked, or belongs to another organisation." action={back} />
    }
    if (err instanceof ApiError && err.status === 403) {
      return <EmptyState icon="lock" title="You cannot open this report" text={reportErrorMessage(err)} action={back} />
    }
    return <div className="p-6"><ErrorState error={new Error(reportErrorMessage(err))} onRetry={() => void shared.refetch()} /></div>
  }
  if (!shared.data) return null
  return <ReportView report={shared.data} shared />
}
