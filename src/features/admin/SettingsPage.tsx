import { useState, type FormEvent, type ReactNode } from 'react'
import { API_BASE, ApiError } from '@/api/client'
import { useChangePassword } from '@/api/hooks'
import { useArea } from '@/auth/AreaContext'
import { roleLabel, useAuth } from '@/auth/AuthContext'
import { Avatar, Banner, Button, Field, Icon, TextInput } from '@/components/ui'
import { fmt, roleColor } from '@/lib/format'
import { TOTP_ROLE_SET, licenceModulesLabel } from './adminLogic'

const LANGUAGE: Record<string, string> = { en: 'English', sn: 'Shona', nd: 'Ndebele' }

function Card({ title, icon, children, aside }: { title: string; icon: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-card">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint text-mid-green"><Icon name={icon} size={22} /></span>
        <h2 className="flex-1 text-h3 font-semibold text-ink">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-h-10 items-center gap-4 border-b border-line-soft last:border-0">
      <span className="w-40 shrink-0 text-small text-ink-3">{label}</span>
      <span className={mono ? 'mono text-ink' : 'text-body text-ink'}>{children}</span>
    </div>
  )
}

export function SettingsPage() {
  const { user, organisation, licence, logout } = useAuth()
  const { areas } = useArea()
  if (!user) return null
  const totp = TOTP_ROLE_SET.includes(user.role) || user.role === 'platform_admin'
  const remembered = (() => {
    try {
      return !!localStorage.getItem('patroliq.token')
    } catch {
      return false
    }
  })()
  const host = (() => {
    try {
      return new URL(API_BASE).host
    } catch {
      return API_BASE
    }
  })()
  const myAreas = areas.filter((a) => user.area_ids.includes(a.id))

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="px-6 pt-5 pb-4">
        <h1 className="text-h1 font-bold text-ink">Settings</h1>
        <p className="mt-0.5 text-body text-ink-2">Your profile, password, two-factor sign-in and session.</p>
      </div>
      <div className="grid grid-cols-1 gap-5 px-6 pb-8 xl:grid-cols-2">
        <Card title="Profile" icon="person">
          <div className="flex items-center gap-4">
            <Avatar name={user.full_name} color={roleColor[user.role]} size={56} />
            <div className="flex flex-col">
              <span className="text-h3 font-semibold text-ink">{user.full_name}</span>
              <span className="text-small font-bold tracking-[0.05em] uppercase" style={{ color: roleColor[user.role] }}>{roleLabel(user.role)}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <Row label="Email">{user.email ?? '—'}</Row>
            <Row label="Employee ID" mono>{user.employee_id ?? '—'}</Row>
            <Row label="Phone" mono>{user.phone ?? '—'}</Row>
            <Row label="Organisation">{organisation ? `${organisation.name} (${organisation.code})` : 'zrGISsolutions platform'}</Row>
            {user.role !== 'platform_admin' && (
              <Row label="Areas">{myAreas.length ? myAreas.map((a) => a.name).join(', ') : 'All areas of the organisation'}</Row>
            )}
            <Row label="Language">
              {LANGUAGE[user.language] ?? user.language}
              <span className="ml-2 text-small text-ink-3">· for SMS alerts</span>
            </Row>
          </div>
          <p className="text-[12px] text-ink-3">Your organisation administrator changes names, roles, phone numbers and area access under Users.</p>
        </Card>

        <ChangePasswordCard />

        <Card
          title="Two-factor authentication"
          icon="verified_user"
          aside={
            <span className={totp ? 'inline-flex h-6 items-center gap-1 rounded-full bg-mint px-2.5 text-[12px] font-bold text-forest' : 'inline-flex h-6 items-center rounded-full bg-black/5 px-2.5 text-[12px] font-bold text-ink-3'}>
              {totp ? <><Icon name="lock" size={14} /> ON</> : 'NOT REQUIRED'}
            </span>
          }
        >
          {totp ? (
            <p className="text-body text-ink-2">
              A 6-digit code from your authenticator app (TOTP) is required every time you sign in to the dashboard. It is mandatory for {roleLabel(user.role).toLowerCase()} accounts and cannot be switched off.
            </p>
          ) : (
            <p className="text-body text-ink-2">Two-factor sign-in is not required for the {roleLabel(user.role)} role.</p>
          )}
          <Banner tone="info">Lost your phone or authenticator? Ask your organisation administrator{user.role === 'org_admin' ? ' or zrGISsolutions support' : ''} to re-issue your two-factor secret.</Banner>
        </Card>

        <Card title="Session" icon="devices">
          <div className="flex flex-col">
            <Row label="Signed in as">{user.email ?? user.employee_id}</Row>
            <Row label="Kept on this device">{remembered ? 'Yes · remembered until you sign out' : 'No · ends when this browser tab closes'}</Row>
            <Row label="Idle timeout">Signed out after 8 hours without activity</Row>
            <Row label="Server" mono>{host}</Row>
            {licence && <Row label="Licence">{fmt.titleCase(licence.plan)} · {licenceModulesLabel(licence)} · expires {fmt.date(licence.expires_at)}</Row>}
          </div>
          <div className="flex items-center gap-3">
            <p className="flex-1 text-small text-ink-3">Signing out ends this session. Changing your password signs out your other sessions.</p>
            <Button kind="danger" icon="logout" onClick={() => void logout()}>Sign out</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function ChangePasswordCard() {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [done, setDone] = useState(false)

  const err = change.error instanceof ApiError ? change.error : null
  const serverNewErr = (() => {
    const v = err?.fields?.new_password
    return Array.isArray(v) ? v.join(' ') : null
  })()
  const tooShort = touched && next.length > 0 && next.length < 8
  const mismatch = touched && confirm.length > 0 && confirm !== next
  const sameAsOld = touched && next.length > 0 && next === current

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setDone(false)
    if (!current || next.length < 8 || next !== confirm || next === current) return
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setDone(true)
          setCurrent('')
          setNext('')
          setConfirm('')
          setTouched(false)
        },
      },
    )
  }

  return (
    <Card title="Change password" icon="password">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {done && <Banner tone="success" title="Password changed">Other sessions for your account were signed out.</Banner>}
        {err && !serverNewErr && (
          <Banner tone="danger">{err.code === 'invalid_credentials' ? 'Your current password is incorrect.' : err.message}</Banner>
        )}
        <Field label="Current password" htmlFor="pw-current" error={touched && !current ? 'Enter your current password.' : null}>
          <TextInput id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} invalid={(touched && !current) || err?.code === 'invalid_credentials'} />
        </Field>
        <Field
          label="New password"
          htmlFor="pw-new"
          helper="At least 8 characters. Avoid common words and your name."
          error={tooShort ? 'Use at least 8 characters.' : sameAsOld ? 'Choose a password different from the current one.' : serverNewErr}
        >
          <TextInput id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} invalid={tooShort || sameAsOld || !!serverNewErr} />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm" error={mismatch ? 'Passwords do not match.' : null}>
          <TextInput id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={mismatch} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" icon="check" loading={change.isPending}>Change password</Button>
        </div>
      </form>
    </Card>
  )
}
