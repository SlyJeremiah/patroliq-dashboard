import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useApuBases, useAreaRisk, useAssignments, useCells, useSaveAssignment, useSectors, useTeams, useUsers } from '@/api/hooks'
import type { Area, Severity, Team } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap, MapLegend, type MapCell } from '@/components/map/AreaMap'
import { Avatar, Banner, Button, EmptyState, Icon, SeverityBadge, TextArea } from '@/components/ui'
import { roleColor, todayIso } from '@/lib/format'
import { Skeleton } from '../parts'
import { MapChip, StepLayout } from './StepLayout'
import { TeamEditor } from './TeamEditor'

const RISK_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 }

export function TeamsStep({ area }: { area: Area }) {
  const navigate = useNavigate()
  const { hasRole, hasModule } = useAuth()
  const isAdmin = hasRole('org_admin')
  const canAssign = hasRole('org_admin', 'manager')
  const [date, setDate] = useState(todayIso())
  const basesQ = useApuBases(area.id)
  const teamsQ = useTeams(area.id)
  const cellsQ = useCells(area.id)
  const sectorsQ = useSectors(area.id)
  const rangersQ = useUsers({ role: 'ranger' })
  const assignmentsQ = useAssignments({ area_id: area.id, date })
  const riskQ = useAreaRisk(hasModule('ai_risk') ? area.id : null, date)
  const save = useSaveAssignment()

  const [teamId, setTeamId] = useState<string | null>(null)
  const [cellIds, setCellIds] = useState<string[]>([])
  const [target, setTarget] = useState(1)
  const [notes, setNotes] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ team: Team | null; baseId?: string | null } | null>(null)

  const bases = useMemo(() => [...(basesQ.data ?? [])].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })), [basesQ.data])
  const teams = useMemo(() => teamsQ.data ?? [], [teamsQ.data])
  const team = teams.find((t) => t.id === teamId) ?? null
  const assignments = useMemo(() => assignmentsQ.data ?? [], [assignmentsQ.data])
  const assignment = assignments.find((a) => a.team_id === teamId) ?? null
  const users = useMemo(() => Object.fromEntries((rangersQ.data ?? []).map((u) => [u.id, u])), [rangersQ.data])
  const cellsById = useMemo(() => Object.fromEntries((cellsQ.data?.features ?? []).map((f) => [f.properties.id, f])), [cellsQ.data])
  const sectorName = useMemo(() => Object.fromEntries((sectorsQ.data ?? []).map((s) => [s.id, s.name])), [sectorsQ.data])
  const risk = useMemo(() => Object.fromEntries((riskQ.data?.cells ?? []).map((c) => [c.cell_id, c])), [riskQ.data])

  // Pick the first team once teams load.
  useEffect(() => {
    if (!teamId && teams.length) {
      const first = [...teams].sort((a, b) => a.name.localeCompare(b.name))[0]
      setTeamId(first.id)
    }
  }, [teams, teamId])

  // Load the existing assignment for the selected team and date.
  useEffect(() => {
    if (dirty) return
    setCellIds(assignment?.cell_ids ?? [])
    setTarget(assignment?.visit_target ?? 1)
    setNotes(assignment?.notes ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.id, teamId, date, assignmentsQ.dataUpdatedAt])

  const selectTeam = (id: string) => {
    setDirty(false)
    setSaved(null)
    save.reset()
    setTeamId(id)
  }

  const otherAssigned = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of assignments) if (a.team_id && a.team_id !== teamId) for (const c of a.cell_ids) m[c] = a.team_id
    return m
  }, [assignments, teamId])

  const mapCells: MapCell[] = useMemo(
    () =>
      (cellsQ.data?.features ?? []).map((f) => ({
        id: f.properties.id,
        label: f.properties.label,
        geometry: f.geometry,
        status: cellIds.includes(f.properties.id) ? 'assigned' : otherAssigned[f.properties.id] ? 'none' : 'pending',
      })),
    [cellsQ.data, cellIds, otherAssigned],
  )

  const toggleCell = (id: string) => {
    if (!canAssign || !team) return
    setDirty(true)
    setSaved(null)
    setCellIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  const selectedRows = cellIds
    .map((id) => ({ id, label: cellsById[id]?.properties.label ?? id.slice(0, 8), sector: cellsById[id]?.properties.sector_id, risk: risk[id] }))
    .sort((a, b) => (b.risk ? RISK_RANK[b.risk.level] * 100 + b.risk.score : 0) - (a.risk ? RISK_RANK[a.risk.level] * 100 + a.risk.score : 0) || a.label.localeCompare(b.label))
  const sectorsOfSelection = [...new Set(selectedRows.map((r) => r.sector).filter(Boolean))].map((s) => sectorName[s as string] ?? 'Sector')
  const dateLabel = format(parseISO(date), 'EEE d MMM')
  const members = team?.member_ids ?? []
  const leader = team?.leader_id ? users[team.leader_id] : null

  const submit = () => {
    if (!team) return
    setSaved(null)
    save.mutate(
      { id: assignment?.id, team_id: team.id, area_id: area.id, date, cell_ids: cellIds, visit_target: target, notes: notes.trim() },
      {
        onSuccess: () => {
          setDirty(false)
          setSaved(`${team.name} · ${cellIds.length} cells · ${cellIds.length * target} visits · ${dateLabel}. Rangers receive it on their next sync.`)
        },
      },
    )
  }

  const teamCellCount = (t: Team) => assignments.find((a) => a.team_id === t.id)?.cell_ids.length ?? 0
  const saveErr = save.error instanceof ApiError ? save.error : null

  const left = (
    <div className="flex flex-col gap-4 p-5">
      <label className="flex flex-col gap-1">
        <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Assignment date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (!e.target.value) return
            setDate(e.target.value)
            setDirty(false)
            setSaved(null)
          }}
          className="h-12 w-full rounded-lg border-[1.5px] border-grey bg-white px-3.5 text-body text-ink outline-none focus:border-2 focus:border-forest"
        />
      </label>
      <div className="flex items-baseline gap-2">
        <h2 className="flex-1 text-h2 font-semibold text-ink">Teams</h2>
        <span className="text-[12px] text-ink-3">{teams.length} teams · grouped by APU base</span>
      </div>
      {teamsQ.isLoading || basesQ.isLoading ? (
        <Skeleton className="h-48" />
      ) : bases.length === 0 ? (
        <EmptyState icon="cabin" title="No APU bases" text="Teams are based at an APU base. Place bases first." action={isAdmin && <Button kind="secondary" onClick={() => navigate(`/areas/${area.id}/setup/bases`)}>Add bases</Button>} />
      ) : (
        bases.map((b) => {
          const baseTeams = teams.filter((t) => t.apu_base_id === b.id).sort((x, y) => x.name.localeCompare(y.name))
          return (
            <section key={b.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                <Icon name="cabin" size={15} />
                <span className="mono !text-[12px]">{b.code}</span>
                <span className="flex-1 truncate">{b.name}</span>
                {isAdmin && (
                  <button type="button" onClick={() => setEditor({ team: null, baseId: b.id })} className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-mid-green normal-case hover:bg-mint" aria-label={`New team at ${b.code}`}>
                    <Icon name="add" size={16} /> Team
                  </button>
                )}
              </div>
              {baseTeams.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-small text-ink-3">No team at this base yet.</p>}
              {baseTeams.map((t) => {
                const sel = t.id === teamId
                const lead = t.leader_id ? users[t.leader_id] : null
                const n = sel ? cellIds.length : teamCellCount(t)
                return (
                  <div key={t.id} className={clsx('rounded-xl border-[1.5px]', sel ? 'border-forest bg-mint/70' : 'border-line bg-white')}>
                    <button type="button" onClick={() => selectTeam(t.id)} aria-pressed={sel} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                      <Avatar name={lead?.full_name ?? t.name.replace(/^Team\s+/i, '')} color={roleColor.ranger} size={34} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body font-semibold text-ink">{t.name}</span>
                        <span className="truncate text-small text-ink-3">{lead ? `${lead.full_name} · ` : ''}{t.member_ids.length} rangers</span>
                      </span>
                      <span className={clsx('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold', n ? (sel ? 'bg-forest text-cream' : 'bg-info-bg text-[#1d5d87]') : 'bg-black/5 text-ink-3')}>
                        {n ? `${n} cells` : 'None'}
                      </span>
                    </button>
                    {sel && (
                      <div className="flex flex-col gap-1 border-t border-forest/15 px-3.5 pt-2 pb-3">
                        {members.length === 0 && <p className="text-small text-ink-3">No rangers in this team.</p>}
                        {members.map((id) => (
                          <div key={id} className="flex h-9 items-center gap-2.5">
                            <Avatar name={users[id]?.full_name ?? '?'} color={roleColor.ranger} size={24} />
                            <span className="flex-1 truncate text-small text-ink">{users[id]?.full_name ?? 'Unknown ranger'}</span>
                            {id === t.leader_id && <span className="rounded-full border border-info px-2 text-[11px] font-bold tracking-[0.05em] text-info uppercase">Leader</span>}
                          </div>
                        ))}
                        {isAdmin && (
                          <Button kind="ghost" size="sm" icon="edit" className="mt-1 self-start" onClick={() => setEditor({ team: t })}>Edit team</Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })
      )}
    </div>
  )

  const mapEl = (
    <AreaMap className="h-full w-full" boundary={area.boundary} cells={mapCells} showCellLabels onCellClick={canAssign && team ? toggleCell : undefined}
      points={bases.map((b) => ({ id: b.id, kind: 'base' as const, lat: b.location.coordinates[1], lon: b.location.coordinates[0], color: '#102C26', label: b.code }))}
    >
      <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
        <MapChip icon="group">{team ? `${team.name} · click cells to ${cellIds.length ? 'add or remove' : 'add'}` : 'Select a team'}</MapChip>
        {riskQ.data && riskQ.data.cells.length > 0 && <MapChip icon="local_fire_department">AI risk · {format(parseISO(riskQ.data.date), 'd MMM')}</MapChip>}
      </div>
      <MapLegend
        items={[
          { color: '#1A6496', label: 'Selected for this team', square: true },
          { color: '#6C757D', label: 'Assigned to another team', square: true },
          { color: '#2D6A4F', label: 'Not assigned', square: true },
        ]}
      />
      {cellsQ.data && cellsQ.data.features.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
          <EmptyState icon="grid_off" title="No GRTS grid yet" text="Generate the grid before assigning cells." />
        </div>
      )}
    </AreaMap>
  )

  const right = (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 font-semibold text-ink">Selected cells</h2>
          <p className="text-small text-ink-3">
            {cellIds.length} cell{cellIds.length === 1 ? '' : 's'}{sectorsOfSelection.length ? ` in ${sectorsOfSelection.join(', ')}` : ''} · {dateLabel}
          </p>
        </div>
        {cellIds.length > 0 && canAssign && (
          <button type="button" className="h-9 rounded-md px-2 text-small font-semibold text-mid-green hover:bg-mint" onClick={() => { setCellIds([]); setDirty(true) }}>
            Clear
          </button>
        )}
      </div>

      {!team ? (
        <p className="text-small text-ink-3">Choose a team on the left, then click cells on the map.</p>
      ) : cellIds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-small text-ink-3">No cells yet. Click GRTS cells on the map to add them.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
              <th className="pb-2 font-semibold">Cell</th>
              {hasModule('ai_risk') && <th className="pb-2 font-semibold">AI risk</th>}
              <th className="pb-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {selectedRows.map((r) => (
              <tr key={r.id} className="border-t border-line-soft">
                <td className="mono h-11 font-medium text-ink">{r.label}</td>
                {hasModule('ai_risk') && <td>{r.risk ? <SeverityBadge level={r.risk.level} /> : <span className="text-small text-ink-3">—</span>}</td>}
                <td className="text-right">
                  {canAssign && (
                    <button type="button" aria-label={`Remove ${r.label}`} onClick={() => toggleCell(r.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-3 hover:bg-black/5">
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <div className="flex-1">
          <p className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Visit target</p>
          <p className="text-[12px] text-ink-3">Visits per cell for this assignment</p>
        </div>
        <button type="button" aria-label="Decrease visit target" disabled={!canAssign || target <= 1} onClick={() => { setTarget(target - 1); setDirty(true) }} className="flex h-11 w-11 items-center justify-center rounded-lg border-[1.5px] border-[#CFC6B4] disabled:opacity-40">
          <Icon name="remove" size={20} />
        </button>
        <span className="w-6 text-center text-h3 font-semibold" aria-live="polite">{target}</span>
        <button type="button" aria-label="Increase visit target" disabled={!canAssign || target >= 20} onClick={() => { setTarget(target + 1); setDirty(true) }} className="flex h-11 w-11 items-center justify-center rounded-lg border-[1.5px] border-[#CFC6B4] disabled:opacity-40">
          <Icon name="add" size={20} />
        </button>
      </div>
      {hasModule('ai_risk') && <p className="-mt-2 text-[12px] text-ink-3">High-risk cells are listed first.</p>}

      <label className="flex flex-col gap-1">
        <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Notes for the team</span>
        <TextArea value={notes} maxLength={1000} readOnly={!canAssign} onChange={(e) => { setNotes(e.target.value); setDirty(true) }} placeholder="e.g. Walk the snare line reported near the river first." />
      </label>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-cream-tint p-3">
        <div><p className="text-h3 font-bold text-ink">{cellIds.length * target}</p><p className="text-[12px] text-ink-3">planned visits</p></div>
        <div><p className="text-h3 font-bold text-ink">{cellIds.length}</p><p className="text-[12px] text-ink-3">cells</p></div>
        <div><p className="text-h3 font-bold text-ink">{members.length}</p><p className="text-[12px] text-ink-3">rangers</p></div>
      </div>
      {dirty && <p className="flex items-center gap-1.5 text-[12px] text-[#7a4a12]"><Icon name="edit_note" size={16} /> Unsaved changes</p>}
    </div>
  )

  const bottom = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-bg text-info"><Icon name="sync" size={22} /></span>
      <div className="min-w-0 flex-1">
        {saved ? (
          <>
            <p className="flex items-center gap-1.5 text-body font-semibold text-success"><Icon name="check_circle" size={18} /> Assignment saved</p>
            <p className="truncate text-small text-ink-3">{saved}</p>
          </>
        ) : (
          <>
            <p className="text-body font-semibold text-ink">Rangers receive assignments on their next sync</p>
            <p className="truncate text-small text-ink-3">
              {team ? `${team.name} · ${cellIds.length} cells · ${cellIds.length * target} visits · ${format(parseISO(date), 'EEE d MMM yyyy')}${leader ? ` · SMS to ${leader.full_name}` : ''}` : 'Select a team'}
              {area.status !== 'active' && ' · area is a draft: activate it so rangers receive it'}
            </p>
          </>
        )}
        {saveErr && <p className="text-small text-danger">{saveErr.message}</p>}
      </div>
      <Button kind="secondary" icon="arrow_back" onClick={() => navigate(isAdmin ? `/areas/${area.id}/setup/grid` : '/areas')}>Back</Button>
      {canAssign && (
        <Button icon="send" onClick={submit} disabled={!team || (!assignment && cellIds.length === 0)} loading={save.isPending}>
          Assign &amp; notify rangers
        </Button>
      )}
    </>
  )

  return (
    <>
      {area.status === 'draft' && (
        <div className="border-b border-line px-6 py-2">
          <Banner tone="info">This area is a draft. You can prepare teams and assignments now; rangers receive them once the area is activated.</Banner>
        </div>
      )}
      <StepLayout left={left} map={mapEl} right={right} bottom={bottom} leftWidth={360} />
      {editor && (
        <TeamEditor
          open
          onClose={() => setEditor(null)}
          area={area}
          bases={bases}
          teams={teams}
          team={editor.team}
          defaultBaseId={editor.baseId}
          onSaved={(t) => selectTeam(t.id)}
        />
      )}
    </>
  )
}
