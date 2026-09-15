import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { downloadFile } from '@/api/client'
import { useGenerateReport, useReports, useSectors, useSpecies, useUsers } from '@/api/hooks'
import type { ReportFormat, ReportType } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { useAuth } from '@/auth/AuthContext'
import { Banner, Button, EmptyState, ErrorState, Icon, IconButton, Select, Spinner } from '@/components/ui'
import { fmt, todayIso } from '@/lib/format'
import {
  allowedFormats, audienceNote, FORMAT_INFO, isAnonymisedRole, matchPreset, presetRange, rangeLabel, REPORT_TYPES, reportErrorMessage, reportFileName, reportTypeInfo,
  validateRange, type DateRange, type PresetKey,
} from './reportsLogic'
import type { ReportWire } from './ReportView'

const PRESETS: { key: Exclude<PresetKey, 'custom'>; label: string }[] = [
  { key: 'last_month', label: 'Last month' },
  { key: 'this_month', label: 'This month' },
  { key: 'dry_season', label: 'Dry season' },
]

export function ReportsPage() {
  const { hasModule } = useAuth()
  if (!hasModule('reports')) {
    return <EmptyState icon="extension_off" title="Reports are not enabled" text="The reports module is not part of your organisation's licence. Contact zrGISsolutions to enable it." />
  }
  return (
    <div className="scroll-thin flex min-h-0 flex-1 overflow-y-auto">
      <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(340px,392px)] gap-6 px-6 py-5">
        <h1 className="sr-only">Reports</h1>
        <ReportBuilder />
        <RecentReports />
      </div>
    </div>
  )
}

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="flex w-full items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest text-[13px] font-bold text-white">{n}</span>
        <span className="text-[16px] font-semibold text-ink">{title}</span>
        <span className="flex-1" />
        {aside}
      </legend>
      <div className="mt-3">{children}</div>
    </fieldset>
  )
}

function ReportBuilder() {
  const { user } = useAuth()
  const { areas, areaId: currentAreaId } = useArea()
  const navigate = useNavigate()
  const anonymised = isAnonymisedRole(user?.role)
  const formats = allowedFormats(user?.role)
  const today = todayIso()

  const [type, setType] = useState<ReportType>('patrol_summary')
  const [range, setRange] = useState<DateRange>(() => presetRange('last_month', today))
  const [areaSel, setAreaSel] = useState<string | null>(null) // null = follow header area; '' = all areas
  const areaId = areaSel === null ? currentAreaId ?? '' : areaSel
  const [sectorId, setSectorId] = useState('')
  const [rangerId, setRangerId] = useState('')
  const [speciesId, setSpeciesId] = useState('')
  const [format, setFormat] = useState<ReportFormat>(anonymised ? 'csv' : 'pdf')

  const sectors = useSectors(areaId || null)
  const species = useSpecies()
  const generate = useGenerateReport()
  const [failed, setFailed] = useState<string | null>(null)

  const preset = matchPreset(range, today)
  const rangeError = validateRange(range)
  const info = reportTypeInfo(type)!
  const sectorName = sectors.data?.find((s) => s.id === sectorId)?.name
  const speciesName = species.data?.find((s) => s.id === speciesId)?.common_name
  const titleLine = [info.name, sectorName ?? (areaId ? areas.find((a) => a.id === areaId)?.name : 'All areas'), speciesName, rangeLabel(range.from, range.to), FORMAT_INFO[format].label]
    .filter(Boolean)
    .join(' · ')

  const submit = () => {
    if (rangeError) return
    setFailed(null)
    generate.mutate(
      {
        type,
        format,
        date_from: range.from,
        date_to: range.to,
        area_id: areaId || null,
        sector_id: sectorId || null,
        ranger_id: anonymised ? null : rangerId || null,
        species_id: speciesId || null,
      },
      {
        onSuccess: (r) => {
          const wire = r as ReportWire
          if (wire.status === 'failed') setFailed(wire.error || 'The server could not build this report.')
          else navigate(`/reports/${r.id}`)
        },
      },
    )
  }

  return (
    <section className="flex min-w-0 flex-col gap-5 self-start rounded-xl bg-white px-6 py-5 shadow-card" aria-labelledby="new-report">
      <h2 id="new-report" className="text-h3 font-semibold text-ink">New report</h2>

      <Step n={1} title="Report type">
        <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Report type">
          {REPORT_TYPES.map((t) => {
            const on = t.type === type
            return (
              <button
                key={t.type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setType(t.type)}
                className={clsx(
                  'relative flex min-h-[104px] flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors',
                  on ? 'border-2 border-forest bg-mint' : 'border-line bg-white hover:border-mid-green/50 hover:bg-cream-tint',
                )}
              >
                <span className={clsx('mb-1 flex h-7 w-7 items-center justify-center rounded-md', on ? 'bg-white text-forest' : 'bg-cream-tint text-mid-green')}>
                  <Icon name={t.icon} size={17} />
                </span>
                <span className="text-[14px] leading-[18px] font-semibold text-ink">{t.name}</span>
                <span className="text-[12px] leading-4 text-ink-2">{t.description}</span>
                {on && <Icon name="check_circle" fill size={20} className="absolute top-2.5 right-2.5 text-forest" />}
              </button>
            )
          })}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">
          <Icon name={anonymised ? 'shield' : 'group'} size={14} />
          {audienceNote(type, user?.role)}
        </p>
      </Step>

      <Step n={2} title="Date range and filters">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">From</span>
            <input type="date" value={range.from} max={range.to || today} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="h-12 w-[164px] rounded-lg border-[1.5px] border-grey bg-white px-3 text-body text-ink outline-none focus:border-2 focus:border-forest" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">To</span>
            <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="h-12 w-[164px] rounded-lg border-[1.5px] border-grey bg-white px-3 text-body text-ink outline-none focus:border-2 focus:border-forest" />
          </label>
          <div className="flex h-12 items-center gap-2" role="group" aria-label="Quick date ranges">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={preset === p.key}
                onClick={() => setRange(presetRange(p.key, today))}
                title={p.key === 'dry_season' ? 'May to October' : undefined}
                className={clsx('h-9 rounded-full border px-3.5 text-[13px] font-semibold', preset === p.key ? 'border-forest bg-forest text-cream' : 'border-[#DDD5C5] bg-white text-ink-2 hover:bg-mint')}
              >
                {p.label}
              </button>
            ))}
            {preset === 'custom' && <span className="h-9 rounded-full bg-black/5 px-3 text-[13px] leading-9 font-semibold text-ink">Custom range</span>}
          </div>
        </div>
        {rangeError && <p className="mt-2 flex items-center gap-1 text-[12px] text-danger" role="alert"><Icon name="error" size={14} />{rangeError}</p>}

        <div className={clsx('mt-3 grid gap-3', anonymised ? 'grid-cols-[1.5fr_1fr_1fr]' : 'grid-cols-[1.5fr_1fr_1fr_1fr]')}>
          <FilterSelect label="Area" icon="fence" value={areaId} onChange={(v) => { setAreaSel(v); setSectorId('') }}>
            <option value="">All areas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Sector" icon="grid_on" value={sectorId} onChange={setSectorId} disabled={!areaId}>
            <option value="">{areaId ? 'All sectors' : 'Choose an area first'}</option>
            {(sectors.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </FilterSelect>
          {!anonymised && <RangerFilter value={rangerId} onChange={setRangerId} />}
          <FilterSelect label="Species" icon="pets" value={speciesId} onChange={setSpeciesId}>
            <option value="">All species</option>
            {(species.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.common_name}</option>)}
          </FilterSelect>
        </div>
      </Step>

      <Step n={3} title="Output format">
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Output format">
          {(['pdf', 'csv', 'geojson'] as ReportFormat[]).map((f) => {
            const allowed = formats.includes(f)
            const on = f === format
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={!allowed}
                disabled={!allowed}
                onClick={() => setFormat(f)}
                className={clsx(
                  'flex min-h-[76px] items-start gap-3 rounded-xl border p-3 text-left',
                  on ? 'border-2 border-forest bg-mint' : 'border-line bg-white',
                  allowed ? !on && 'hover:bg-cream-tint' : 'cursor-not-allowed bg-[#F4F2EE] opacity-70',
                )}
              >
                <span className={clsx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-forest' : 'border-grey')}>
                  {on && <span className="h-2.5 w-2.5 rounded-full bg-forest" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink"><Icon name={FORMAT_INFO[f].icon} size={18} />{FORMAT_INFO[f].label}</span>
                  <span className="text-[12px] leading-4 text-ink-2">{FORMAT_INFO[f].description}</span>
                  {!allowed ? (
                    <span className="mt-1 flex items-start gap-1 text-[11px] leading-4 font-semibold text-ink-3"><Icon name="lock" size={13} />Managers only · use CSV or GeoJSON</span>
                  ) : f !== 'pdf' ? (
                    <span className="mt-1 flex items-start gap-1 text-[11px] leading-4 font-semibold text-mid-green"><Icon name="shield" size={13} />Anonymised for research roles</span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </Step>

      {(generate.isError || failed) && (
        <Banner tone="danger" title="The report was not generated">
          {failed ?? reportErrorMessage(generate.error)}
        </Banner>
      )}

      <div className="sticky bottom-0 z-10 -mx-6 -mb-5 flex flex-wrap items-center gap-4 rounded-b-xl border-t border-line bg-white px-6 pt-4 pb-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{titleLine}</p>
          <p className="flex items-center gap-1.5 text-small text-ink-3">
            <Icon name="dns" size={14} />
            {anonymised ? 'Anonymised: GRTS cell labels instead of coordinates, no ranger identities · ' : ''}English · generated on the server, usually under a minute
          </p>
        </div>
        <Button icon="summarize" onClick={submit} loading={generate.isPending} disabled={!!rangeError}>
          {generate.isPending ? 'Generating…' : 'Generate report'}
        </Button>
      </div>
    </section>
  )
}

function FilterSelect({ label, value, onChange, children, disabled }: { label: string; icon?: string; value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="truncate">
        {children}
      </Select>
    </label>
  )
}

function RangerFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const rangers = useUsers({ role: 'ranger', is_active: true })
  return (
    <FilterSelect label="Ranger" icon="person" value={value} onChange={onChange}>
      <option value="">All rangers</option>
      {(rangers.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
    </FilterSelect>
  )
}

const FORMAT_ICON: Record<ReportFormat, string> = { pdf: 'description', csv: 'table_view', geojson: 'map' }

function RecentReports() {
  const reports = useReports()
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const items = useMemo(() => ((reports.data ?? []) as ReportWire[]).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)), [reports.data])

  const download = async (r: ReportWire) => {
    setDownloading(r.id)
    setError(null)
    try {
      await downloadFile(`reports/${r.id}/download/`, undefined, reportFileName(r))
    } catch (e) {
      setError(reportErrorMessage(e))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <section className="flex min-h-0 flex-col self-start rounded-xl bg-white shadow-card" aria-labelledby="recent-reports">
      <header className="flex items-center gap-3 px-5 pt-5 pb-2">
        <h2 id="recent-reports" className="flex-1 text-h3 font-semibold text-ink">Recent reports</h2>
        {reports.data && <span className="text-small text-ink-3">{items.length} {items.length === 1 ? 'report' : 'reports'}</span>}
      </header>
      {error && <div className="px-5 pb-2"><Banner tone="danger">{error}</Banner></div>}
      <div className="px-5">
        {reports.isLoading ? (
          <div className="flex justify-center py-10 text-forest"><Spinner /></div>
        ) : reports.isError ? (
          <ErrorState error={new Error(reportErrorMessage(reports.error))} onRetry={() => void reports.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon="summarize" title="No reports yet" text="Reports you and your team generate appear here for 50 most recent." />
        ) : (
          <ul>
            {items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cream-tint text-ink-2"><Icon name={FORMAT_ICON[r.format]} size={20} /></span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link to={`/reports/${r.id}`} className="truncate text-small font-semibold text-ink hover:underline">{r.title}</Link>
                  <span className="flex items-center gap-x-1.5 truncate text-[12px] text-ink-2">
                    {reportTypeInfo(r.type)?.name ?? r.type} · {FORMAT_INFO[r.format].label}{r.size_bytes ? ` · ${fmt.bytes(r.size_bytes)}` : ''}
                    {r.anonymised && <span className="rounded bg-mint px-1.5 text-[10px] leading-4 font-bold tracking-[0.05em] text-forest uppercase">Anonymised</span>}
                  </span>
                  <span className="truncate text-[12px] text-ink-3">
                    {rangeLabel(r.params.date_from as string, r.params.date_to as string)} · {fmt.dayTime(r.created_at)}{r.created_by_name ? ` · ${r.created_by_name}` : ''}
                  </span>
                  {r.status === 'failed' && <span className="text-[12px] font-semibold text-danger">Failed{r.error ? `: ${r.error}` : ''}</span>}
                  {r.status === 'generating' && <span className="flex items-center gap-1 text-[12px] font-semibold text-amber"><Spinner size={10} />Generating…</span>}
                </div>
                {r.status === 'ready' ? (
                  downloading === r.id ? (
                    <span className="flex h-11 w-11 items-center justify-center text-forest"><Spinner /></span>
                  ) : (
                    <IconButton icon="download" label={`Download ${r.title} (${FORMAT_INFO[r.format].label})`} onClick={() => void download(r)} className="border border-line text-forest" />
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 flex items-center gap-1.5 border-t border-line px-5 py-3 text-[12px] text-ink-3"><Icon name="history" size={14} />Every download is recorded in the audit log</p>
    </section>
  )
}
