import clsx from 'clsx'
import type { Map as MlMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useApuBases, useImportBoundary, useSaveDrawnBoundary, useUpdateArea, type BoundaryImportResult } from '@/api/hooks'
import type { Area } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap } from '@/components/map/AreaMap'
import { Banner, Button, Icon, Spinner, Tabs, TextInput } from '@/components/ui'
import { fmt } from '@/lib/format'
import {
  BOUNDARY_EXTENSIONS, boundaryErrorMessage, boundarySourceLabel, fileExtension, formatKm2, parseCandidateFeatures, precheckBoundaryFile,
  type CandidateFeature,
} from '../adminLogic'
import { areaKm2, outerRingVertices, perimeterKm, pointInBoundary, polygonFromVertices, validateOutline, type LngLat } from '../geometry'
import { usePolygonDraw } from '../mapTools'
import { BottomMetric, CheckLine, MapChip, ReadOnlyNote, StepLayout } from './StepLayout'

type Mode = 'upload' | 'draw'

const SOURCE_TEXT: Record<string, string> = { shapefile: 'Shapefile', geojson: 'GeoJSON', kml: 'KML', drawn: 'Drawn on map' }

interface UploadState {
  file: File
  at: string
  status: 'uploading' | 'select' | 'done' | 'error'
  candidates?: CandidateFeature[]
  result?: BoundaryImportResult
  error?: { title: string; text: string }
  choice?: number | 'merge'
}

export function BoundaryStep({ area }: { area: Area }) {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const canEdit = hasRole('org_admin')
  const [mode, setMode] = useState<Mode>(area.boundary_source === 'drawn' ? 'draw' : 'upload')
  const [map, setMap] = useState<MlMap | null>(null)
  const basesQ = useApuBases(area.id)

  // ---- upload
  const importer = useImportBoundary()
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const send = (file: File, opts: { featureIndex?: number; dissolve?: boolean } = {}, prev?: UploadState) => {
    const base: UploadState = { file, at: new Date().toISOString(), status: 'uploading', candidates: prev?.candidates, choice: prev?.choice }
    setUpload(base)
    importer.mutate(
      { areaId: area.id, file, ...opts },
      {
        onSuccess: (result) => setUpload({ ...base, status: 'done', result }),
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'feature_selection_required') {
            const candidates = parseCandidateFeatures(e.fields)
            setUpload({ ...base, status: 'select', candidates, choice: candidates[0]?.index })
            return
          }
          const code = e instanceof ApiError ? e.code : 'unknown'
          setUpload({ ...base, status: base.candidates ? 'select' : 'error', error: boundaryErrorMessage(code, e.message, file.name) })
        },
      },
    )
  }

  const pick = (file: File | undefined) => {
    if (!file || !canEdit) return
    const pre = precheckBoundaryFile(file)
    if (pre) {
      setUpload({ file, at: '', status: 'error', error: boundaryErrorMessage(pre) })
      return
    }
    send(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    pick(e.dataTransfer.files?.[0])
  }

  // ---- draw
  const initial = useMemo(() => outerRingVertices(area.boundary), [area.boundary])
  const [vertices, setVertices] = useState<LngLat[]>(initial)
  const [closed, setClosed] = useState(initial.length >= 3)
  useEffect(() => {
    // A new boundary arrived from the server (file import or save): edit that one.
    setVertices(initial)
    setClosed(initial.length >= 3)
  }, [initial])
  const saveDrawn = useSaveDrawnBoundary()
  const drawing = mode === 'draw' && canEdit
  usePolygonDraw(map, { active: drawing, vertices, closed, onChange: setVertices, onClosedChange: setClosed })

  const drawnPolygon = useMemo(() => polygonFromVertices(vertices), [vertices])
  const check = validateOutline(vertices)
  const drawnKm2 = drawnPolygon ? areaKm2(drawnPolygon) : 0
  const multiPart = (area.boundary?.coordinates.length ?? 0) > 1
  const basesOutside = drawnPolygon ? (basesQ.data ?? []).filter((b) => !pointInBoundary(b.location.coordinates, drawnPolygon)) : []
  const drawnChanged = JSON.stringify(vertices) !== JSON.stringify(initial)

  const saveDrawing = () => {
    if (!drawnPolygon || !check.ok) return
    saveDrawn.mutate(
      { areaId: area.id, boundary: drawnPolygon },
      { onSuccess: () => navigate(`/areas/${area.id}/setup/bases`) },
    )
  }

  // ---- bottom bar metrics
  const showDrawn = drawing && vertices.length >= 3
  const km2 = showDrawn ? drawnKm2 : area.area_km2 ?? (area.boundary ? areaKm2(area.boundary) : null)
  const perim = showDrawn ? perimeterKm(drawnPolygon) : perimeterKm(area.boundary)
  const source = showDrawn
    ? 'Drawn on map'
    : upload?.status === 'done'
      ? `${boundarySourceLabel(fileExtension(upload.file.name))}${upload.choice === 'merge' ? ' · merged' : upload.candidates && typeof upload.choice === 'number' ? ` · ${upload.candidates.find((c) => c.index === upload.choice)?.name ?? ''}` : ''}`
      : area.boundary_source
        ? SOURCE_TEXT[area.boundary_source] ?? area.boundary_source
        : '—'

  const saveError = saveDrawn.error instanceof ApiError ? boundaryErrorMessage(saveDrawn.error.code, saveDrawn.error.message) : saveDrawn.error ? boundaryErrorMessage('unknown', saveDrawn.error.message) : null

  const left = (
    <div className="flex flex-col gap-4 p-5">
      <AreaDetailsForm area={area} canEdit={canEdit} />
      {!canEdit && <ReadOnlyNote>Only organisation administrators can change the boundary. You can view it and assign teams.</ReadOnlyNote>}
      {canEdit && (
        <Tabs
          value={mode}
          onChange={setMode}
          tabs={[
            { value: 'upload', label: 'Upload file', icon: 'upload' },
            { value: 'draw', label: 'Draw on map', icon: 'draw' },
          ]}
        />
      )}

      {canEdit && mode === 'upload' && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={clsx(
              'flex items-center gap-3 rounded-lg border-[1.5px] border-dashed px-4 py-3.5 transition-colors',
              dragOver ? 'border-mid-green bg-mint' : 'border-[#CBBFA8] bg-cream-tint',
            )}
          >
            <Icon name="cloud_upload" size={26} className="text-mid-green" />
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink">
                Drop a file or{' '}
                <button type="button" onClick={() => inputRef.current?.click()} className="font-semibold text-mid-green underline-offset-2 hover:underline">
                  browse
                </button>
              </p>
              <p className="text-[12px] text-ink-3">Zipped shapefile (.shp .shx .dbf, .prj optional) · GeoJSON · KML/KMZ · up to 50 MB</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={BOUNDARY_EXTENSIONS.join(',')}
              className="sr-only"
              aria-label="Choose boundary file"
              onChange={(e) => {
                pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          {upload && (
            <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-readonly text-ink-2"><Icon name="description" size={22} /></span>
                <div className="min-w-0 flex-1">
                  <p className="mono truncate font-medium text-ink">{upload.file.name}</p>
                  <p className="text-[12px] text-ink-3">{fmt.bytes(upload.file.size)} · {upload.status === 'uploading' ? 'uploading…' : upload.at ? `uploaded ${fmt.time(upload.at)}` : 'not uploaded'}</p>
                </div>
                {upload.status === 'uploading' ? (
                  <Spinner className="text-mid-green" />
                ) : upload.status === 'done' ? (
                  <Icon name="check_circle" size={24} className="text-success" label="Imported" />
                ) : upload.status === 'error' ? (
                  <Icon name="error" size={24} className="text-danger" label="Failed" />
                ) : (
                  <Icon name="rule" size={24} className="text-amber" label="Choose a feature" />
                )}
                <button type="button" aria-label="Remove file" onClick={() => setUpload(null)} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-black/5">
                  <Icon name="close" size={20} />
                </button>
              </div>

              {upload.error && (
                <Banner tone="danger" title={upload.error.title}>
                  {upload.error.text}
                </Banner>
              )}

              {upload.status === 'done' && upload.result && <ImportSummary result={upload.result} area={area} fileName={upload.file.name} />}

              {(upload.status === 'select' || (upload.status === 'uploading' && upload.candidates)) && upload.candidates && (
                <FeaturePicker
                  candidates={upload.candidates}
                  choice={upload.choice}
                  busy={upload.status === 'uploading'}
                  onChoice={(choice) => setUpload({ ...upload, choice, error: undefined })}
                  onApply={() =>
                    send(upload.file, upload.choice === 'merge' ? { dissolve: true } : { featureIndex: upload.choice as number }, upload)
                  }
                />
              )}
            </div>
          )}

          {!upload && area.boundary && (
            <div className="flex items-center gap-3 rounded-lg border border-line p-4">
              <Icon name="check_circle" size={22} className="text-success" />
              <div className="text-small text-ink-2">
                <p className="font-semibold text-ink">Boundary saved · {formatKm2(area.area_km2)}</p>
                <p>{SOURCE_TEXT[area.boundary_source ?? ''] ?? 'Saved'} · updated {fmt.date(area.updated_at)}. Uploading a new file replaces it.</p>
              </div>
            </div>
          )}
        </>
      )}

      {drawing && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-readonly px-3 py-2">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Vertices</p>
              <p className="text-h3 font-semibold text-ink">{vertices.length}</p>
            </div>
            <div className="col-span-2 rounded-lg bg-readonly px-3 py-2">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Area (live)</p>
              <p className="text-h3 font-semibold text-ink">{vertices.length >= 3 ? formatKm2(drawnKm2) : '—'}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <CheckLine ok={vertices.length >= 3}>At least 3 vertices</CheckLine>
            <CheckLine ok={closed ? true : null}>Closed polygon</CheckLine>
            <CheckLine ok={check.enoughVertices ? !check.selfIntersects : null}>No self-intersections</CheckLine>
          </div>
          {check.selfIntersects && (
            <Banner tone="danger" title="The outline crosses itself">Drag a vertex so the edges no longer cross, or remove the last vertex.</Banner>
          )}
          {multiPart && !drawnChanged && (
            <Banner tone="info">This boundary has {area.boundary?.coordinates.length} parts. Only the largest part is editable here; saving replaces the boundary with the drawn outline.</Banner>
          )}
          {basesOutside.length > 0 && (
            <Banner tone="warning" title={`${basesOutside.length} APU base${basesOutside.length > 1 ? 's' : ''} outside this outline`}>
              {basesOutside.map((b) => b.code).join(', ')} would sit outside the new boundary. Move them in the APU bases step after saving.
            </Banner>
          )}
          {(area.cell_count ?? 0) > 0 && drawnChanged && (
            <Banner tone="info">Regenerate the GRTS grid after changing the boundary so cells match the new outline.</Banner>
          )}
          <div className="flex flex-wrap gap-2">
            <Button kind="secondary" size="sm" icon="check" disabled={closed || vertices.length < 3} onClick={() => setClosed(true)}>Finish</Button>
            <Button
              kind="secondary"
              size="sm"
              icon="undo"
              disabled={!vertices.length}
              onClick={() => {
                if (closed) setClosed(false)
                setVertices(vertices.slice(0, -1))
              }}
            >
              Remove last
            </Button>
            <Button kind="ghost" size="sm" icon="delete" disabled={!vertices.length} onClick={() => { setVertices([]); setClosed(false) }}>Clear</Button>
            {drawnChanged && initial.length > 0 && (
              <Button kind="ghost" size="sm" icon="restart_alt" onClick={() => { setVertices(initial); setClosed(true) }}>Reset</Button>
            )}
          </div>
          {saveError && <Banner tone="danger" title={saveError.title}>{saveError.text}</Banner>}
        </div>
      )}
    </div>
  )

  const mapEl = (
    <AreaMap
      className="h-full w-full"
      boundary={drawing ? null : area.boundary}
      fitTo={area.boundary ?? null}
      points={(basesQ.data ?? []).map((b) => ({ id: b.id, kind: 'base' as const, lat: b.location.coordinates[1], lon: b.location.coordinates[0], color: '#102C26', label: b.code }))}
      onReady={setMap}
    >
      <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
        {upload?.status === 'done' && upload.result ? (
          <MapChip icon="layers">
            {upload.result.features_found} feature{upload.result.features_found === 1 ? '' : 's'} from {upload.file.name}
          </MapChip>
        ) : area.boundary && !drawing ? (
          <MapChip icon="fence">Saved boundary · {formatKm2(area.area_km2)}</MapChip>
        ) : drawing ? (
          <MapChip icon="draw">{closed ? `Outline closed · ${formatKm2(drawnKm2)}` : vertices.length ? `Drawing · ${vertices.length} vertices` : 'Click on the map to start the outline'}</MapChip>
        ) : (
          <MapChip icon="info">No boundary yet · upload a file or draw it</MapChip>
        )}
      </div>
      {drawing && (
        <div className="absolute bottom-10 left-4 z-10 w-[270px] rounded-xl bg-white p-3 shadow-pop">
          <p className="mb-1 flex items-center gap-2 px-1 text-small font-semibold text-ink"><Icon name="draw" size={18} /> Draw on map</p>
          {[
            ['add', 'Click to add vertices'],
            ['open_with', 'Drag a vertex to move it'],
            ['backspace', 'Right-click or Backspace removes the last'],
            ['done_all', 'Double-click or click the first vertex to finish'],
          ].map(([icon, text]) => (
            <p key={text} className="flex items-center gap-2.5 px-1 py-1 text-small text-ink-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-readonly"><Icon name={icon} size={16} /></span>
              {text}
            </p>
          ))}
        </div>
      )}
    </AreaMap>
  )

  const bottom = (
    <>
      <BottomMetric label="Area" value={km2 ? formatKm2(km2) : '—'} />
      <BottomMetric label="Perimeter" value={perim ? `${perim.toFixed(1)} km` : '—'} />
      <BottomMetric label="Source" value={source} />
      <BottomMetric label="Stored as" value="MultiPolygon · WGS 84" />
      <span className="flex-1" />
      <Button kind="secondary" onClick={() => navigate('/areas')}>{canEdit ? 'Cancel' : 'Back'}</Button>
      {canEdit && drawing && (drawnChanged || !area.boundary) ? (
        <Button icon="arrow_forward" onClick={saveDrawing} disabled={!closed || !check.ok} loading={saveDrawn.isPending}>
          Save boundary &amp; continue
        </Button>
      ) : (
        <Button icon="arrow_forward" disabled={!area.boundary} onClick={() => navigate(`/areas/${area.id}/setup/bases`)}>
          Continue to APU bases
        </Button>
      )}
    </>
  )

  return <StepLayout left={left} map={mapEl} bottom={bottom} leftWidth={440} />
}

function ImportSummary({ result, area, fileName }: { result: BoundaryImportResult; area: Area; fileName: string }) {
  const crs = result.crs_detected
  const isWgs = !crs || /4326|wgs\s*-?\s*84$/i.test(crs.trim())
  const outline = outerRingVertices(result.area.boundary ?? area.boundary)
  const check = validateOutline(outline)
  const ext = fileExtension(fileName)
  return (
    <div className="flex flex-col gap-2.5">
      {ext === '.zip' && (
        <div className="flex flex-wrap gap-1.5">
          {['.shp', '.shx', '.dbf'].map((c) => (
            <span key={c} className="mono inline-flex h-7 items-center gap-1 rounded-md bg-mint px-2 text-forest"><Icon name="check" size={14} />{c}</span>
          ))}
        </div>
      )}
      <p className="flex items-start gap-2 text-small text-ink-2">
        <Icon name="public" size={17} className="mt-px text-ink-3" />
        <span>
          CRS detected: <span className="mono text-ink">{crs || 'WGS 84 (assumed)'}</span>
          {!isWgs && (
            <>
              <br />→ reprojected to <span className="mono text-ink">WGS 84</span>
            </>
          )}
        </span>
      </p>
      <p className="text-small text-ink-2">
        <span className="font-semibold text-ink">{result.features_found} feature{result.features_found === 1 ? '' : 's'} found</span> · stored boundary {formatKm2(result.area.area_km2)}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft pt-2.5">
        <CheckLine ok>Closed polygon</CheckLine>
        <CheckLine ok={check.enoughVertices ? !check.selfIntersects : null}>No self-intersections</CheckLine>
        <CheckLine ok>Saved to {area.name}</CheckLine>
      </div>
    </div>
  )
}

function FeaturePicker({
  candidates, choice, busy, onChoice, onApply,
}: {
  candidates: CandidateFeature[]
  choice?: number | 'merge'
  busy: boolean
  onChoice: (c: number | 'merge') => void
  onApply: () => void
}) {
  const total = candidates.reduce((s, c) => s + (c.area_km2 ?? 0), 0)
  const opts: { value: number | 'merge'; label: string; km2: number | null; icon?: string }[] = [
    ...candidates.map((c) => ({ value: c.index, label: c.name, km2: c.area_km2 })),
    { value: 'merge' as const, label: 'Merge all features', km2: total || null, icon: 'layers' },
  ]
  return (
    <fieldset className="flex flex-col gap-2" disabled={busy}>
      <legend className="mb-2 flex w-full items-center">
        <span className="flex-1 text-body font-semibold text-ink">{candidates.length} features found</span>
        <span className="text-[12px] text-ink-3">Pick one or merge all</span>
      </legend>
      {opts.map((o) => {
        const selected = choice === o.value
        return (
          <label
            key={String(o.value)}
            className={clsx(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-[1.5px] px-3.5 transition-colors',
              selected ? 'border-forest bg-mint' : 'border-transparent hover:bg-readonly',
              o.value === 'merge' && 'mt-1',
            )}
          >
            <input type="radio" name="boundary-feature" className="h-5 w-5 accent-[#102C26]" checked={selected} onChange={() => onChoice(o.value)} />
            {o.icon && <Icon name={o.icon} size={18} className="text-ink-2" />}
            <span className={clsx('flex-1 text-body text-ink', selected && 'font-semibold')}>{o.label}</span>
            <span className="mono text-ink-2">{o.km2 != null ? formatKm2(o.km2) : '—'}</span>
          </label>
        )
      })}
      <Button className="mt-1 self-end" icon="check" onClick={onApply} loading={busy} disabled={choice === undefined}>
        {choice === 'merge' ? 'Merge and save' : 'Use this feature'}
      </Button>
    </fieldset>
  )
}

function AreaDetailsForm({ area, canEdit }: { area: Area; canEdit: boolean }) {
  const update = useUpdateArea()
  const [name, setName] = useState(area.name)
  const [client, setClient] = useState(area.client_name ?? '')
  const dirty = name.trim() !== area.name || client.trim() !== (area.client_name ?? '')
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        update.mutate({ id: area.id, name: name.trim(), client_name: client.trim() })
      }}
    >
      <div className="grid grid-cols-[1.3fr_1fr] gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Area name</span>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} readOnly={!canEdit} invalid={!name.trim()} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Client</span>
          <TextInput value={client} onChange={(e) => setClient(e.target.value)} readOnly={!canEdit} placeholder="Landholder" />
        </label>
      </div>
      {canEdit && dirty && (
        <div className="flex items-center justify-end gap-2">
          {update.isError && <span className="text-[12px] text-danger">{update.error.message}</span>}
          <Button kind="ghost" size="sm" type="button" onClick={() => { setName(area.name); setClient(area.client_name ?? '') }}>Undo</Button>
          <Button size="sm" type="submit" loading={update.isPending} disabled={!name.trim()}>Save details</Button>
        </div>
      )}
    </form>
  )
}
