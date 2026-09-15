import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { qk, useSaveTeam, useTeams, useUsers } from '@/api/hooks'
import type { ApuBase, Area, Team } from '@/api/types'
import { Avatar, Banner, Button, Drawer, Field, Icon, Select, TextInput } from '@/components/ui'
import { roleColor } from '@/lib/format'

export function TeamEditor({
  open, onClose, area, bases, teams, team, defaultBaseId, onSaved,
}: {
  open: boolean
  onClose: () => void
  area: Area
  bases: ApuBase[]
  teams: Team[]
  team: Team | null
  defaultBaseId?: string | null
  onSaved?: (t: Team) => void
}) {
  const qc = useQueryClient()
  const save = useSaveTeam()
  const rangersQ = useUsers({ role: 'ranger' })
  const allTeamsQ = useTeams()
  const [name, setName] = useState('')
  const [baseId, setBaseId] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [leader, setLeader] = useState('')
  const [search, setSearch] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(team?.name ?? '')
    setBaseId(team?.apu_base_id ?? defaultBaseId ?? bases[0]?.id ?? '')
    setMembers(team?.member_ids ?? [])
    setLeader(team?.leader_id ?? '')
    setSearch('')
    setTouched(false)
    save.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team?.id])

  const teamName = useMemo(() => Object.fromEntries([...(allTeamsQ.data ?? []), ...teams].map((t) => [t.id, t.name])), [allTeamsQ.data, teams])
  const rangers = useMemo(
    () =>
      (rangersQ.data ?? [])
        .filter((u) => u.is_active || members.includes(u.id))
        .filter((u) => !search.trim() || `${u.full_name} ${u.employee_id ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => Number(members.includes(b.id)) - Number(members.includes(a.id)) || a.full_name.localeCompare(b.full_name)),
    [rangersQ.data, members, search],
  )
  const byId = useMemo(() => Object.fromEntries((rangersQ.data ?? []).map((u) => [u.id, u])), [rangersQ.data])
  const err = save.error instanceof ApiError ? save.error : null
  const fieldErr = (k: string) => (Array.isArray(err?.fields?.[k]) ? String((err!.fields![k] as unknown[])[0]) : null)

  const toggle = (id: string) => {
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
    if (leader === id) setLeader('')
  }

  const submit = () => {
    setTouched(true)
    if (!name.trim() || !baseId) return
    save.mutate(
      { id: team?.id, area_id: area.id, apu_base_id: baseId, name: name.trim(), member_ids: members, leader_id: leader || null },
      {
        onSuccess: (t) => {
          qc.invalidateQueries({ queryKey: qk.area(area.id) })
          qc.invalidateQueries({ queryKey: qk.areas })
          onSaved?.(t)
          onClose()
        },
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={460}
      title={team ? `Edit ${team.name}` : 'New team'}
      subtitle={`${area.name} · rangers belong to one team at a time`}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={submit} loading={save.isPending}>{team ? 'Save team' : 'Create team'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && !err.fields && <Banner tone="danger">{err.message}</Banner>}
        <Field label="Team name" htmlFor="team-name" error={(touched && !name.trim() ? 'Enter a team name.' : null) ?? fieldErr('name')}>
          <TextInput id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Team Mazowe Alpha" invalid={touched && !name.trim()} />
        </Field>
        <Field label="APU base" htmlFor="team-base" error={(touched && !baseId ? 'Choose the base.' : null) ?? fieldErr('apu_base_id')}>
          <Select id="team-base" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            <option value="" disabled>Choose a base</option>
            {bases.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </Select>
        </Field>
        <Field label="Team leader" htmlFor="team-leader" helper="Receives the assignment SMS." error={fieldErr('leader_id')}>
          <Select id="team-leader" value={leader} onChange={(e) => setLeader(e.target.value)} disabled={!members.length}>
            <option value="">{members.length ? 'No leader' : 'Add members first'}</option>
            {members.map((id) => <option key={id} value={id}>{byId[id]?.full_name ?? id}</option>)}
          </Select>
        </Field>
        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <span className="flex-1 text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Members</span>
            <span className="text-[12px] text-ink-3">{members.length} selected</span>
          </div>
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rangers" aria-label="Search rangers" />
          {fieldErr('member_ids') && <p className="text-[12px] text-danger">{fieldErr('member_ids')}</p>}
          {rangersQ.isLoading ? (
            <p className="text-small text-ink-3">Loading rangers…</p>
          ) : rangers.length === 0 ? (
            <p className="text-small text-ink-3">No active rangers. Add rangers under Users first.</p>
          ) : (
            <ul className="flex flex-col rounded-lg border border-line">
              {rangers.map((u, i) => {
                const on = members.includes(u.id)
                const otherTeam = u.team_id && u.team_id !== team?.id ? teamName[u.team_id] ?? 'another team' : null
                return (
                  <li key={u.id} className={clsx(i > 0 && 'border-t border-line-soft')}>
                    <label className={clsx('flex min-h-13 cursor-pointer items-center gap-3 px-3 py-2', on && 'bg-mint/60')}>
                      <input type="checkbox" className="h-5 w-5 accent-[#102C26]" checked={on} onChange={() => toggle(u.id)} />
                      <Avatar name={u.full_name} color={roleColor.ranger} size={30} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-small font-semibold text-ink">{u.full_name}</span>
                        <span className="mono truncate !text-[12px] text-ink-3">{u.employee_id}</span>
                      </span>
                      {otherTeam && (
                        <span className={clsx('flex items-center gap-1 text-[12px]', on ? 'text-[#7a4a12]' : 'text-ink-3')}>
                          {on && <Icon name="swap_horiz" size={14} />}
                          {on ? `moves from ${otherTeam}` : otherTeam}
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  )
}
