import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { qk, useReport } from '@/api/hooks'
import { useAuth } from '@/auth/AuthContext'
import { EmptyState, ErrorState, Spinner } from '@/components/ui'
import { reportErrorMessage } from './reportsLogic'
import { ReportView, type ReportWire } from './ReportView'
import { ApiError } from '@/api/client'

export function ReportPreviewPage() {
  const { reportId } = useParams<{ reportId: string }>()
  const { hasModule } = useAuth()
  const report = useReport(reportId)
  const qc = useQueryClient()

  // A report still generating is re-checked every few seconds.
  const generating = report.data?.status === 'generating'
  useEffect(() => {
    if (!generating || !reportId) return
    const t = setInterval(() => void qc.invalidateQueries({ queryKey: qk.report(reportId) }), 4000)
    return () => clearInterval(t)
  }, [generating, reportId, qc])

  if (!hasModule('reports')) {
    return <EmptyState icon="extension_off" title="Reports are not enabled" text="The reports module is not part of your organisation's licence." />
  }
  if (report.isLoading) {
    return <div className="flex flex-1 items-center justify-center text-forest"><Spinner size={28} /></div>
  }
  if (report.isError) {
    const notFound = report.error instanceof ApiError && report.error.status === 404
    return notFound ? (
      <EmptyState
        icon="description"
        title="Report not found"
        text="It may belong to another organisation, or your role can only open anonymised reports."
        action={<Link to="/reports" className="text-small font-semibold text-forest underline">Back to reports</Link>}
      />
    ) : (
      <div className="p-6"><ErrorState error={new Error(reportErrorMessage(report.error))} onRetry={() => void report.refetch()} /></div>
    )
  }
  if (!report.data) return null
  return <ReportView report={report.data as ReportWire} />
}
