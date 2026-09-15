import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/api/client'
import { useApuBases, useSaveUser, useTeams, type NewUserResult } from '@/api/hooks'
import type { Role, User } from '@/api/types'
import { useArea } from '@/auth/AreaContext'
import { useAuth } from '@/auth/AuthContext'
import { Banner, Button, Drawer, Field, Icon, Select, TextInput } from '@/components/ui'
import { roleColor } from '@/lib/format'
import { ROLE_OPTIONS, TOTP_ROLE_SET, nextEmployeeId } from './adminLogic'
import { CopyField } from './parts'

const LANGS: { value: User['language']; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'sn', label: 'Shona' },
  { value: 'nd', label: 'Ndebele' },
]

interface Form {
  role: Role
  full_name: string
  email: string
  employee_id: string
  phone: string
  language: User['language']
  area_ids: string[]
  apu_base_id: string
  team_id: string
}

const blank = (areaIds: string[]): Form => ({ role: 'ranger', full_name: '', email: '', employee_id: '', phone: '', language: 'en', area_ids: areaIds, apu_base_id: '', team_id: '' })

export function UserDrawer({ open, onClose, user, allUsers }: { open: boolean; onClose: () => void; user: User | null; allUsers: User[] }) {
  const { user: me, licence } = useAuth()
  const { areas } = useArea()
  const save = useSaveUser()
  const basesQ = useApuBases(null)
  const teamsQ = useTeams()
  const [form, setForm] = useState<Form>(blank([]))
  const [touched, setTouched] = useState(false)
  const [result, setResult] = useState<NewUserResult | null>(null)

  useEffect(() => {
    if (!open) return
    save.reset()
    setTouched(false)
    setResult(null)
    setForm(
      user
        ? {
            role: user.role,
            full_name: user.full_name,
            email: user.email ?? '',
            employee_id: user.employee_id ?? '',
            phone: user.phone ?? '',
            language: user.language,
            area_ids: user.area_ids,
            apu_base_id: user.apu_base_id ?? '',
            team_id: user.team_id ?? '',
          }
        : blank(areas.length === 1 ? [areas[0].id] : []),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const isRanger = form.role === 'ranger'
  const needsEmail = !isRanger
  const suggestedId = useMemo(() => nextEmployeeId(allUsers.map((u) => u.employee_id), form.role, new Date().getFullYear()), [allUsers, form.role])
  const bases = (basesQ.data ?? []).filter((b) => !form.area_ids.length || form.area_ids.includes(b.area_id))
  const teams = (teamsQ.data ?? []).filter((t) => (!form.apu_base_id || t.apu_base_id === form.apu_base_id) && (!form.area_ids.length || form.area_ids.includes(t.area_id)))

  const err = save.error instanceof ApiError ? save.error : null
  const fieldErr = (k: string): string | null => {
    const v = err?.fields?.[k]
    return Array.isArray(v) ? String(v[0]) : typeof v === 'string' ? v : null
  }
  const nameMissing = touched && !form.full_name.trim()
  const emailMissing = touched && needsEmail && !form.email.trim()

  const submit = () => {
    setTouched(true)
    if (!form.full_name.trim() || (needsEmail && !form.email.trim())) return
    const employeeId = form.employee_id.trim() || (isRanger && !user ? suggestedId : '')
    save.mutate(
      {
        id: user?.id,
        role: form.role,
        full_name: form.full_name.trim(),
        email: needsEmail ? form.email.trim() : form.email.trim() || null,
        employee_id: employeeId || null,
        phone: form.phone.trim(), // the API rejects null for phone; blank clears it
        language: form.language,
        area_ids: form.area_ids,
        apu_base_id: isRanger ? form.apu_base_id || null : null,
        team_id: isRanger ? form.team_id || null : null,
      },
      {
        onSuccess: (r) => {
          if (!user || r.temporary_password || r.totp_secret) setResult(r)
          else onClose()
        },
      },
    )
  }

  const seatKind = isRanger ? 'ranger' : 'manager'
  const seatMax = isRanger ? licence?.max_rangers : licence?.max_managers

  if (result) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        width={540}
        title={user ? 'Two-factor secret issued' : 'Account created'}
        subtitle={`${result.full_name} · ${ROLE_OPTIONS.find((r) => r.value === result.role)?.label}`}
        footer={<Button icon="check" onClick={onClose}>Done</Button>}
      >
        <div className="flex flex-col gap-4">
          <Banner tone="warning" icon="visibility_lock" title="Shown once">
            Copy these credentials now and hand them over securely. They cannot be displayed again; if they are lost, issue new ones.
          </Banner>
          {result.employee_id && <CopyField label="Employee ID" value={result.employee_id} />}
          {result.email && <CopyField label="Sign-in email" value={result.email} />}
          {result.temporary_password && (
            <div className="flex flex-col gap-1">
              <CopyField label="Temporary password" value={result.temporary_password} secret />
              <p className="text-[12px] text-ink-3">The user must change it at first sign-in.</p>
            </div>
          )}
          {result.totp_secret && (
            <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
              <p className="flex items-center gap-2 text-body font-semibold text-ink"><Icon name="shield_lock" size={20} className="text-mid-green" /> Authenticator app (TOTP)</p>
              <p className="text-small text-ink-2">Add this key in Google Authenticator, Microsoft Authenticator or similar. A 6-digit code is required at every web sign-in.</p>
              <CopyField label="TOTP secret" value={result.totp_secret} secret />
              {result.totp_uri && <CopyField label="otpauth URI" value={result.totp_uri} secret />}
            </div>
          )}
          {result.role === 'ranger' && (
            <p className="flex items-start gap-2 text-small text-ink-2">
              <Icon name="smartphone" size={18} className="mt-px text-ink-3" />
              Rangers sign in on the PatrolIQ app with organisation code, employee ID and this password.
            </p>
          )}
        </div>
      </Drawer>
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={540}
      title={user ? `Edit ${user.full_name}` : 'Add user'}
      subtitle={user ? `${user.employee_id ?? 'No employee ID'} · ${user.is_active ? 'active' : 'deactivated'}` : `New account · created by ${me?.full_name ?? 'you'}`}
      footer={
        <div className="flex w-full flex-col gap-3">
          <p className="flex items-start gap-2 text-[12px] text-ink-2">
            <Icon name="history" size={16} className="mt-px text-ink-3" />
            {user ? 'This change is written to the audit log.' : 'A one-time temporary password is shown after saving. This change is written to the audit log.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button kind="secondary" onClick={onClose}>Cancel</Button>
            <Button icon="check" onClick={submit} loading={save.isPending}>{user ? 'Save changes' : 'Create user'}</Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {err?.code === 'licence_seat_limit' && (
          <Banner tone="warning" title={`No ${seatKind} seats left`}>
            Your licence allows {seatMax ?? 'a limited number of'} active {seatKind === 'ranger' ? 'rangers' : 'web users (managers, admins, researchers and NGO/Gov)'}. Deactivate an unused account or ask zrGISsolutions to add seats.
          </Banner>
        )}
        {err && err.code !== 'licence_seat_limit' && !err.fields && <Banner tone="danger">{err.message}</Banner>}

        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <Field
            label="Employee ID"
            htmlFor="u-emp"
            error={fieldErr('employee_id')}
            helper={isRanger ? (user ? 'Used at sign-in on the app' : `Blank = ${suggestedId}`) : 'Optional for web users'}
          >
            <TextInput id="u-emp" mono value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} placeholder={isRanger ? suggestedId : 'e.g. ' + suggestedId} invalid={!!fieldErr('employee_id')} />
          </Field>
          <Field label="Full name" htmlFor="u-name" error={nameMissing ? 'Enter the full name.' : fieldErr('full_name')}>
            <TextInput id="u-name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="e.g. Tendai Moyo" invalid={nameMissing || !!fieldErr('full_name')} autoFocus={!user} />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Role</legend>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Role">
            {ROLE_OPTIONS.map((r) => {
              const on = form.role === r.value
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('role', r.value)}
                  className={clsx(
                    'flex h-12 items-center justify-center gap-1.5 rounded-lg border-[1.5px] px-1 text-[13px] whitespace-nowrap',
                    on ? 'border-forest bg-mint font-semibold text-ink' : 'border-[#DDD5C5] bg-white text-ink-2 hover:bg-cream-tint',
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: roleColor[r.value] }} />
                  {r.label}
                </button>
              )
            })}
          </div>
          {fieldErr('role') && <p className="text-[12px] text-danger">{fieldErr('role')}</p>}
        </fieldset>

        {needsEmail && (
          <Field label="Email (web sign-in)" htmlFor="u-email" error={emailMissing ? 'Web users sign in with email.' : fieldErr('email')}>
            <TextInput id="u-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@organisation.org" invalid={emailMissing || !!fieldErr('email')} />
          </Field>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 flex w-full items-center">
            <span className="flex-1 text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">Assigned areas</span>
            <span className="text-[12px] text-ink-3">{form.area_ids.length} selected</span>
          </legend>
          {areas.length === 0 ? (
            <p className="text-small text-ink-3">No areas yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {areas.map((a) => {
                const on = form.area_ids.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('area_ids', on ? form.area_ids.filter((x) => x !== a.id) : [...form.area_ids, a.id])}
                    className={clsx(
                      'inline-flex h-11 items-center gap-1.5 rounded-lg border-[1.5px] px-3.5 text-[13px]',
                      on ? 'border-forest bg-mint font-semibold text-ink' : 'border-[#DDD5C5] bg-white text-ink-2 hover:bg-cream-tint',
                    )}
                  >
                    {on && <Icon name="check" size={16} />}
                    {a.name}
                    {a.status === 'draft' && <span className="text-[11px] text-ink-3 uppercase">draft</span>}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[12px] text-ink-3">
            {isRanger ? 'The ranger receives these areas (and their team’s area) on the app.' : 'Limits the user’s map, risk and report data to these areas.'}
          </p>
        </fieldset>

        {isRanger && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="APU base" htmlFor="u-base" error={fieldErr('apu_base_id')}>
              <Select id="u-base" value={form.apu_base_id} onChange={(e) => setForm((f) => ({ ...f, apu_base_id: e.target.value, team_id: '' }))}>
                <option value="">No base</option>
                {areas
                  .filter((a) => bases.some((b) => b.area_id === a.id))
                  .map((a) => (
                    <optgroup key={a.id} label={a.name}>
                      {bases.filter((b) => b.area_id === a.id).map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                    </optgroup>
                  ))}
              </Select>
            </Field>
            <Field label="Team" htmlFor="u-team" error={fieldErr('team_id')} helper={teams.length ? undefined : 'No team at this base'}>
              <Select id="u-team" value={form.team_id} onChange={(e) => set('team_id', e.target.value)} disabled={!teams.length}>
                <option value="">No team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-[1fr_1.1fr] gap-3">
          <Field label="Phone for SMS alerts" htmlFor="u-phone" error={fieldErr('phone')}>
            <div className="relative">
              <Icon name="call" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
              <TextInput id="u-phone" mono type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+263 77 000 0000" className="pl-10" />
            </div>
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase" id="u-lang">Language</span>
            <div className="grid h-12 grid-cols-3 overflow-hidden rounded-lg border-[1.5px] border-[#DDD5C5]" role="radiogroup" aria-labelledby="u-lang">
              {LANGS.map((l, i) => (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={form.language === l.value}
                  onClick={() => set('language', l.value)}
                  className={clsx('text-[14px]', i > 0 && 'border-l border-[#DDD5C5]', form.language === l.value ? 'bg-forest font-semibold text-cream' : 'bg-white text-ink-2 hover:bg-cream-tint')}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-line p-4">
          <Icon name={TOTP_ROLE_SET.includes(form.role) ? 'verified_user' : 'shield'} size={22} className={TOTP_ROLE_SET.includes(form.role) ? 'text-mid-green' : 'text-ink-3'} />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink">Two-factor authentication (TOTP)</p>
            <p className="text-small text-ink-2">
              {TOTP_ROLE_SET.includes(form.role)
                ? user && TOTP_ROLE_SET.includes(user.role)
                  ? 'Required and already enrolled for this account.'
                  : 'Required for Manager and Admin. A secret for the authenticator app is shown once after saving.'
                : isRanger
                  ? 'Off for rangers. They sign in on their device with employee ID and password.'
                  : 'Not required for this role.'}
            </p>
          </div>
          <span className={clsx('mt-0.5 inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold tracking-[0.05em] uppercase', TOTP_ROLE_SET.includes(form.role) ? 'bg-mint text-forest' : 'bg-black/5 text-ink-3')}>
            {TOTP_ROLE_SET.includes(form.role) ? <><Icon name="lock" size={13} className="mr-1" />On</> : 'Off'}
          </span>
        </div>
      </div>
    </Drawer>
  )
}
