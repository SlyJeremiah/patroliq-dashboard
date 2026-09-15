import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { FeatureCollection, Geometry, GeometryCollection, LineString, Point, Polygon } from 'geojson'
import { downloadFile, fetchFile } from '@/api/client'
import { useSectors, useShareReport, useSpecies, useUsers } from '@/api/hooks'
import type { Report } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { AreaMap, MapLegend, type MapCell, type MapPoint } from '@/components/map/AreaMap'
import { Banner, Button, EmptyState, ErrorState, Icon, Pill, severityColor, Spinner } from '@/components/ui'
import { fmt } from '@/lib/format'
import { RankedBars, RiskTrendMini, WeeklyBars } from './ReportCharts'
import {
  FORMAT_INFO, geojsonStats, humanise, parseCsvPreview, rangeLabel, reportErrorMessage, reportFileName, reportTypeInfo, shareUrl, summaryMetrics, summarySeries,
} from './reportsLogic'

/** Report object as returned by the API, including additive v1.3 keys. */
export type ReportWire = Report & { download_url?: string | null; error?: string | null; shared_by_name?: string | null; share_expires_at?: string | null }

type Loaded =
  | { kind: 'pdf'; url: string; filename: string }
  | { kind: 'csv'; filename: string; headers: string[]; rows: string[][]; totalRows: number }
  | { kind: 'geojson'; filename: string; fc: FeatureCollection }

/** Preview body shared by `/reports/:id` and `/reports/shared/:token`. */
export function ReportView({ report, shared }: { report: ReportWire; shared?: boolean }) {
  const ready = report.status === 'ready'
  const file = useQuery({
    queryKey: ['report-file', report.id],
    enabled: ready,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { blob, filename } = await fetchFile(`reports/${report.id}/download/`)
      const name = filename === 'download' ? reportFileName(report) : filename
      if (report.format === 'pdf') return { kind: 'pdf', blob: new Blob([blob], { type: 'application/pdf' }), filename: name } as const
      const text = await blob.text()
      if (report.format === 'csv') return { kind: 'csv', filename: name, ...parseCsvPreview(text, 50) } as const
      return { kind: 'geojson', filename: name, fc: JSON.parse(text) as FeatureCollection } as const
    },
  })

  // Blob URL for the PDF iframe, revoked when the preview unmounts or the file changes.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const pdfBlob = file.data?.kind === 'pdf' ? file.data.blob : null
  useEffect(() => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    setPdfUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setPdfUrl(null)
    }
  }, [pdfBlob])

  const loaded: Loaded | null = !file.data
    ? null
    : file.data.kind === 'pdf'
      ? pdfUrl ? { kind: 'pdf', url: pdfUrl, filename: file.data.filename } : null
      : file.data

  const filename = file.data?.filename ?? reportFileName(report)
  const info = reportTypeInfo(report.type)

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-[#D9D3C7]">
        <div className="flex h-12 shrink-0 items-center gap-3 bg-[#2A3B35] px-4 text-cream">
          <Link to="/reports" className="flex h-11 items-center gap-1 rounded-md pr-2 text-small font-semibold text-cream/80 hover:text-cream" aria-label="Back to reports">
            <Icon name="arrow_back" size={18} />
            Reports
          </Link>
          <span className="h-5 w-px bg-cream/20" />
          <Icon name={FORMAT_INFO[report.format].icon} size={18} className="text-emerald" />
          <span className="min-w-0 truncate text-small font-semibold">{filename}</span>
          <span className="flex-1" />
          {loaded?.kind === 'csv' && <span className="text-[12px] text-cream/70">Showing {loaded.rows.length} of {loaded.totalRows.toLocaleString('en-GB')} rows</span>}
          {loaded?.kind === 'geojson' && <span className="text-[12px] text-cream/70">{loaded.fc.features?.length ?? 0} features</span>}
          {loaded?.kind === 'pdf' && (
            <a href={loaded.url} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold text-cream/80 hover:text-cream">
              <Icon name="open_in_new" size={16} /> Open full screen
            </a>
          )}
        </div>
        <div className="relative min-h-0 flex-1">
          {!ready ? (
            <div className="flex h-full items-center justify-center p-8">
              {report.status === 'generating' ? (
                <EmptyState icon="hourglass_top" title="Generating report" text="The server is still building this file. The preview opens when it is ready." />
              ) : (
                <div className="max-w-md"><Banner tone="danger" title="This report failed to generate">{report.error || 'No file was produced. Generate it again from the Reports page.'}</Banner></div>
              )}
            </div>
          ) : file.isError ? (
            <div className="p-8"><ErrorState error={new Error(reportErrorMessage(file.error))} onRetry={() => void file.refetch()} /></div>
          ) : !loaded ? (
            <div className="flex h-full items-center justify-center gap-3 text-small text-ink-2"><Spinner /> Loading the {FORMAT_INFO[report.format].label} file…</div>
          ) : loaded.kind === 'pdf' ? (
            <>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center text-small text-ink-2" aria-hidden="true">
                <Icon name="picture_as_pdf" size={32} className="text-ink-3" />
                <p>If the PDF does not appear here, your browser has no built-in PDF viewer.</p>
                <p>Use Open full screen or Download.</p>
              </div>
              <iframe title={`${report.title} (PDF)`} src={loaded.url} className="absolute inset-0 h-full w-full border-0 bg-transparent" />
            </>
          ) : loaded.kind === 'csv' ? (
            <CsvTable headers={loaded.headers} rows={loaded.rows} totalRows={loaded.totalRows} />
          ) : (
            <GeojsonMap fc={loaded.fc} />
          )}
        </div>
      </div>
      <SidePanel report={report} info={info?.name} filename={filename} shared={shared} />
    </div>
  )
}

function CsvTable({ headers, rows, totalRows }: { headers: string[]; rows: string[][]; totalRows: number }) {
  if (!headers.length) return <div className="p-8"><EmptyState icon="table_view" title="The CSV file is empty" /></div>
  const numeric = headers.map((_, i) => rows.length > 0 && rows.every((r) => r[i] === undefined || r[i] === '' || /^-?\d+(\.\d+)?$/.test(r[i])))
  return (
    <div className="scroll-thin absolute inset-0 overflow-auto p-5">
      <div className="inline-block min-w-full rounded-lg bg-white shadow-card">
        <table className="border-collapse text-small">
          <caption className="sr-only">First {rows.length} of {totalRows} rows</caption>
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th scope="col" className="h-10 border-b border-line px-3 text-right text-label font-semibold text-ink-3">#</th>
              {headers.map((h, i) => (
                <th key={i} scope="col" className={clsx('h-10 border-b border-line px-3 text-label font-semibold tracking-[0.04em] whitespace-nowrap text-ink-3 uppercase', numeric[i] ? 'text-right' : 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={ri % 2 ? 'bg-[#FBF8F2]' : 'bg-white'}>
                <td className="h-9 border-b border-line-soft px-3 text-right font-mono text-[12px] text-ink-3">{ri + 1}</td>
                {headers.map((_, ci) => (
                  <td key={ci} className={clsx('h-9 max-w-[280px] truncate border-b border-line-soft px-3 whitespace-nowrap text-ink', numeric[ci] && 'text-right tabular-nums')} title={r[ci]}>{r[ci] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {totalRows > rows.length && (
          <p className="border-t border-line px-4 py-3 text-small text-ink-3">Preview shows the first {rows.length} of {totalRows.toLocaleString('en-GB')} rows. Download the CSV for the full table.</p>
        )}
      </div>
    </div>
  )
}

const OBS_COLOR: Record<string, string> = { wildlife: '#2D6A4F', threat: severityColor.critical, carcass: '#7B2D8B', habitat: '#1A6496', infrastructure: '#6C757D', other: '#6C757D' }

function GeojsonMap({ fc }: { fc: FeatureCollection }) {
  const stats = useMemo(() => geojsonStats(fc as never), [fc])
  const { cells, points, tracks, fit } = useMemo(() => {
    const cells: MapCell[] = []
    const points: MapPoint[] = []
    const lines: FeatureCollection<LineString>['features'] = []
    const geoms: Geometry[] = []
    ;(fc.features ?? []).forEach((f, i) => {
      if (!f.geometry) return
      const p = (f.properties ?? {}) as Record<string, unknown>
      const id = String(f.id ?? p.client_uuid ?? i)
      geoms.push(f.geometry)
      if (f.geometry.type === 'Polygon') {
        const status = p.kind === 'cell' ? (Number(p.visit_days ?? 0) > 0 ? 'surveyed' : 'none') : 'assigned'
        cells.push({ id, label: String(p.label ?? p.cell_label ?? ''), geometry: f.geometry as Polygon, status })
      } else if (f.geometry.type === 'Point') {
        const [lon, lat] = (f.geometry as Point).coordinates
        points.push({ id, lat, lon, kind: 'pin', radius: 9, color: OBS_COLOR[String(p.category)] ?? '#2D6A4F', label: String(p.species_name ?? p.subtype ?? p.category ?? 'Observation') })
      } else if (f.geometry.type === 'LineString') {
        lines.push({ type: 'Feature', geometry: f.geometry as LineString, properties: { color: '#F7E7CE' } })
      }
    })
    const fit: GeometryCollection | null = geoms.length ? { type: 'GeometryCollection', geometries: geoms.slice(0, 2000) } : null
    return { cells, points: points.slice(0, 600), tracks: { type: 'FeatureCollection', features: lines } as FeatureCollection<LineString>, fit }
  }, [fc])

  if (!stats.total) return <div className="p-8"><EmptyState icon="map" title="The GeoJSON file has no features" /></div>
  const legend = [
    ...(stats.byKind.cell ? [{ color: '#27AE60', label: `Cells visited · ${cells.filter((c) => c.status === 'surveyed').length}`, square: true }, { color: '#6C757D', label: 'Cells not visited', square: true }] : []),
    ...(stats.byKind.observation ? [{ color: '#2D6A4F', label: `Observations · ${stats.byKind.observation}` }] : []),
    ...(stats.byKind.track ? [{ color: '#F7E7CE', label: `Patrol tracks · ${stats.byKind.track}` }] : []),
  ]
  return (
    <>
      <AreaMap className="absolute inset-0" cells={cells} points={points} tracks={tracks} fitTo={fit} showCellLabels />
      {legend.length > 0 && <MapLegend items={legend} />}
      {stats.withoutGeometry > 0 && (
        <div className="absolute top-3 left-3 z-10 rounded-lg bg-forest/92 px-3 py-2 text-[12px] text-cream">{stats.withoutGeometry} features have no geometry (outside the grid or anonymised)</div>
      )}
    </>
  )
}

function SidePanel({ report, info, filename, shared }: { report: ReportWire; info?: string; filename: string; shared?: boolean }) {
  const share = useShareReport()
  const [copied, setCopied] = useState<'copied' | 'manual' | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const metrics = summaryMetrics(report.summary)
  const series = summarySeries(report.summary)
  const link = share.data ? shareUrl(window.location.origin, share.data.token) : null

  const copyShare = async () => {
    setCopied(null)
    const res = share.data ?? (await share.mutateAsync(report.id).catch(() => null))
    if (!res) return
    try {
      await navigator.clipboard.writeText(shareUrl(window.location.origin, res.token))
      setCopied('copied')
    } catch {
      setCopied('manual')
    }
  }
  const download = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadFile(`reports/${report.id}/download/`, undefined, filename)
    } catch (e) {
      setDownloadError(reportErrorMessage(e))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <aside className="scroll-thin flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-line bg-white" aria-label="Report details">
      <div className="flex flex-col gap-3 px-5 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {report.status === 'ready' ? (
            <Pill tone="success"><Icon name="check_circle" size={14} />Ready</Pill>
          ) : report.status === 'failed' ? (
            <Pill tone="danger"><Icon name="error" size={14} />Failed</Pill>
          ) : (
            <Pill tone="warning"><Spinner size={12} />Generating</Pill>
          )}
          {report.anonymised && <Pill tone="info"><Icon name="shield" size={14} />Anonymised</Pill>}
        </div>
        <h1 className="text-h2 font-semibold text-ink">{report.title}</h1>
        <Button icon="download" onClick={() => void download()} loading={downloading} disabled={report.status !== 'ready'}>
          Download {FORMAT_INFO[report.format].label}
        </Button>
        {downloadError && <p className="text-[12px] text-danger">{downloadError}</p>}
        {!shared && (
          <Button kind="secondary" icon="link" onClick={() => void copyShare()} loading={share.isPending} disabled={report.status !== 'ready'}>
            {copied === 'copied' ? 'Link copied' : 'Copy share link'}
          </Button>
        )}
        {share.isError && <p className="text-[12px] text-danger">{reportErrorMessage(share.error)}</p>}
        {link && share.data && (
          <div className="rounded-lg border border-[#EDE4D3] bg-cream-tint p-3">
            <label htmlFor="share-url" className="sr-only">Share link</label>
            <div className="flex items-center gap-2 rounded-md border border-line bg-[#F2EEE6] px-2.5">
              <Icon name="link" size={16} className="text-ink-3" />
              <input id="share-url" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 bg-transparent font-mono text-[12px] text-ink outline-none" />
            </div>
            {copied === 'manual' && <p className="mt-1.5 text-[12px] text-ink-2">Copy the link above; the browser blocked clipboard access.</p>}
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2"><Icon name="schedule" size={14} className="text-amber" />Expires {fmt.dateTime(share.data.expires_at)} · 48 h</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-2"><Icon name="lock" size={14} className="text-ink-3" />Recipients must sign in to PATROLIQ</p>
          </div>
        )}
        {shared && (
          <Banner tone="info" icon="share">
            Shared{report.shared_by_name ? ` by ${report.shared_by_name}` : ''}{report.share_expires_at ? ` · link expires ${fmt.dateTime(report.share_expires_at)}` : ''}
          </Banner>
        )}
      </div>

      {metrics.length > 0 && (
        <section className="mt-5 border-t border-line px-5 pt-4">
          <h2 className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">Key metrics</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            {metrics.slice(0, 6).map((m) => (
              <div key={m.key} className="flex flex-col-reverse justify-end rounded-lg bg-cream-tint px-3 py-2">
                <dt className="text-[12px] leading-4 text-ink-3">{m.label}</dt>
                <dd className={clsx('text-[20px] leading-7 font-bold', m.tone === 'danger' ? 'text-amber' : 'text-ink')}>{m.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {(series.byWeek.length > 0 || series.species.length > 0 || series.incidents.length > 0 || series.riskTrend.some((r) => r.value !== null)) && (
        <section className="mt-4 flex flex-col gap-4 border-t border-line px-5 pt-4">
          {series.byWeek.length > 0 && <WeeklyBars data={series.byWeek} />}
          {series.species.length > 0 && <RankedBars title="Species" items={series.species} unit="individuals" />}
          {series.incidents.length > 0 && <RankedBars title="Incidents by type" items={series.incidents} color="#A0522D" />}
          {series.riskTrend.some((r) => r.value !== null) && <RiskTrendMini data={series.riskTrend} />}
        </section>
      )}

      <section className="mt-4 border-t border-line px-5 pt-4 pb-2">
        <h2 className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">Report details</h2>
        <dl className="mt-1 text-small">
          <Detail label="Type">{info ?? humanise(report.type)}</Detail>
          <Detail label="Period">{rangeLabel(report.params.date_from as string, report.params.date_to as string)}</Detail>
          <Detail label="Filters"><FilterSummary params={report.params} /></Detail>
          <Detail label="Format">{FORMAT_INFO[report.format].label} · {fmt.bytes(report.size_bytes)}</Detail>
          <Detail label="Data">{report.anonymised ? 'Anonymised: cell labels, no ranger identities' : 'Full detail (managers)'}</Detail>
          <Detail label="Generated">{fmt.dateTime(report.created_at)}{report.created_by_name ? ` · ${report.created_by_name}` : ''}</Detail>
          <Detail label="Report ID"><span className="font-mono text-[12px] break-all">{report.id}</span></Detail>
        </dl>
      </section>
      <div className="flex-1" />
      <p className="flex items-center gap-1.5 px-5 py-4 text-[12px] text-ink-3"><Icon name="history" size={14} />Downloads and share links are recorded in the audit log</p>
    </aside>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-line-soft py-2.5 last:border-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}

function FilterSummary({ params }: { params: Record<string, unknown> }) {
  const { areas } = useArea()
  const areaId = (params.area_id as string | null) ?? null
  const sectors = useSectors(params.sector_id ? areaId : null)
  const species = useSpecies()
  const parts = [
    areaId ? areas.find((a) => a.id === areaId)?.name ?? 'One area' : 'All areas',
    params.sector_id ? sectors.data?.find((s) => s.id === params.sector_id)?.name ?? 'one sector' : 'all sectors',
    params.ranger_id ? <RangerName key="r" id={params.ranger_id as string} /> : 'all rangers',
    params.species_id ? species.data?.find((s) => s.id === params.species_id)?.common_name ?? 'one species' : 'all species',
  ]
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>{i > 0 && ' · '}{p}</span>
      ))}
    </>
  )
}

function RangerName({ id }: { id: string }) {
  const users = useUsers({ role: 'ranger' })
  return <>{users.data?.find((u) => u.id === id)?.full_name ?? 'one ranger'}</>
}
