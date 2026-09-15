// Docked licence drawer for one organisation (PlatformLicensees design, right column).
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { useSaveLicence, useUpdateOrg } from '@/api/hooks'
import type { Licence, PlatformOrganisation } from '@/api/types'
import { Banner, Button, Icon, IconButton, Spinner, TextInput } from '@/components/ui'
import { fmt } from '@/lib/format'
import { useInvalidateOrg, type PlatformOrg } from './platformApi'
import {
  MODULES, endOfDayIso, flattenFieldErrors, graceDaysLeft, graceEndsAt, isoToDateInput, licenceDate, parseLimit, startOfDayIso, statusFromDates,
  suspensionCause, syncLabel, type Deployment, type Plan, type Usage,
} from './platformLogic'
import { ConfirmDialog, DeploymentChoice, ModuleSwitch, OrgMark, PlanPicker, PrivacyNote, SectionLabel, StatusBadge } from './parts'

interface FormState {
  plan: Plan
  max_rangers: string
  max_managers: string
  max_areas: string
  modules: string[]
  starts: string
  expires: string
  grace_days: string
  deployment: Deployment
}

function initialForm(org: PlatformOrg): FormState {
  const l = org.licence
  return {
    plan: l?.plan ?? 'pilot',
    max_rangers: String(l?.max_rangers ?? ''),
    max_managers: String(l?.max_managers ?? ''),
    max_areas: String(l?.max_areas ?? ''),
    modules: [...(l?.modules ?? [])],
    starts: isoToDateInput(l?.starts_at),
    expires: isoToDateInput(l?.expires_at),
    grace_days: String(l?.grace_days ?? ''),
    deployment: org.deployment === 'dedicated' ? 'dedicated' : 'shared',
  }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function OrgDrawer({
  org, usage, usageLoading, focus, onClose,
}: {
  org: PlatformOrg; usage: Usage | null; usageLoading: boolean; focus?: string | null; onClose: () => void
}) {
  const initial = useMemo(() => initialForm(org), [org])
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirm, setConfirm] = useState<null | 'suspend' | 'reinstate'>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const saveLicence = useSaveLicence()
  const updateOrg = useUpdateOrg()
  const invalidate = useInvalidateOrg()
  const expiresRef = useRef<HTMLInputElement>(null)
  const termRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focus !== 'term') return
    const t = window.setTimeout(() => {
      termRef.current?.scrollIntoView({ block: 'center' })
      expiresRef.current?.focus()
    }, 50)
    return () => window.clearTimeout(t)
  }, [focus, org.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirm || e.target instanceof HTMLInputElement) return
      if (document.querySelector('[role="dialog"], dialog[open]')) return // New organisation modal handles its own Escape
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm, onClose])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
    setErrors((e) => {
      const next = { ...e }
      delete next[k === 'starts' ? 'starts_at' : k === 'expires' ? 'expires_at' : k]
      return next
    })
  }

  const dirty = JSON.stringify({ ...form, modules: [...form.modules].sort() }) !== JSON.stringify({ ...initial, modules: [...initial.modules].sort() })
  const status = org.status
  const cause = suspensionCause(status, org.licence)
  const datesChanged = form.expires !== initial.expires || form.grace_days !== initial.grace_days
  const previewStatus = datesChanged && form.expires && parseLimit(form.grace_days) != null
    ? statusFromDates({ expires_at: endOfDayIso(form.expires), grace_days: parseLimit(form.grace_days) })
    : null

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    for (const k of ['max_rangers', 'max_managers', 'max_areas', 'grace_days'] as const) {
      if (parseLimit(form[k]) == null) e[k] = 'Enter a whole number, 0 or more.'
    }
    if (!form.starts) e.starts_at = 'Choose a start date.'
    if (!form.expires) e.expires_at = 'Choose an expiry date.'
    if (form.starts && form.expires && form.expires <= form.starts) e.expires_at = 'Must be after the start date.'
    return e
  }

  async function save() {
    const e = validate()
    setErrors(e)
    setFormError(null)
    if (Object.keys(e).length) return
    const diff: Partial<Licence> = {}
    if (form.plan !== initial.plan) diff.plan = form.plan
    for (const k of ['max_rangers', 'max_managers', 'max_areas', 'grace_days'] as const) {
      if (form[k] !== initial[k]) diff[k] = parseLimit(form[k])
    }
    if (!sameSet(form.modules, initial.modules)) diff.modules = MODULES.map((m) => m.key).filter((m) => form.modules.includes(m))
    if (form.starts !== initial.starts) diff.starts_at = startOfDayIso(form.starts)
    if (form.expires !== initial.expires) diff.expires_at = endOfDayIso(form.expires)
    try {
      if (Object.keys(diff).length) await saveLicence.mutateAsync({ orgId: org.id, ...diff })
      if (form.deployment !== initial.deployment) {
        await updateOrg.mutateAsync({ id: org.id, deployment: form.deployment } as Partial<PlatformOrganisation> & { id: string })
      }
      await invalidate(org.id)
      setSaved(true)
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const flat = flattenFieldErrors(err.fields)
        setErrors(flat)
        const known = ['plan', 'max_rangers', 'max_managers', 'max_areas', 'modules', 'starts_at', 'expires_at', 'grace_days', 'deployment']
        const other = Object.entries(flat).filter(([k]) => !known.includes(k))
        setFormError(other.length ? other.map(([, v]) => v).join(' ') : null)
      } else {
        setFormError(err instanceof Error ? err.message : 'The licence was not saved.')
      }
    }
  }

  async function changeStatus() {
    setConfirmError(null)
    try {
      if (confirm === 'suspend') {
        await updateOrg.mutateAsync({ id: org.id, status: 'suspended' })
      } else {
        await updateOrg.mutateAsync({ id: org.id, status: 'active' })
        await saveLicence.mutateAsync({ orgId: org.id, status: 'active' })
      }
      await invalidate(org.id)
      setConfirm(null)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'The status was not changed.')
    }
  }

  const enabledCount = MODULES.filter((m) => form.modules.includes(m.key)).length
  const busy = saveLicence.isPending || updateOrg.isPending
  const created = org.created_at ? fmt.date(org.created_at).split(' ').slice(1).join(' ') : null
  const limitUse = { max_rangers: usage?.rangers, max_managers: usage?.managers, max_areas: usage?.areas }

  return (
    <aside aria-label={`${org.name} licence`} className="flex h-full w-[500px] shrink-0 flex-col border-l border-line bg-white">
      <header className="flex items-start gap-3 px-6 pt-4 pb-3">
        <OrgMark code={org.code} size={48} muted={status === 'suspended'} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h2 font-semibold text-ink">{org.name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
            <span><b className="font-semibold text-ink">{org.code}</b>{org.country ? ` · ${org.country}` : ''}{created ? ` · since ${created}` : ''}</span>
            <StatusBadge status={status} />
          </div>
        </div>
        <IconButton icon="close" label="Close licence drawer" onClick={onClose} className="-mt-1 -mr-2" />
      </header>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-t border-line px-6 py-4">
        {!org.licence && <Banner tone="warning" title="No licence">This organisation has no licence, so sign-in is refused. Fill in the terms below and save.</Banner>}

        <section className="flex flex-col gap-2">
          <SectionLabel>Licence plan</SectionLabel>
          <PlanPicker value={form.plan} onChange={(p) => set('plan', p)} disabled={busy} />
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel aside="Over-limit creation returns 402">Seat and area limits</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            {([['max_rangers', 'Max rangers'], ['max_managers', 'Max managers'], ['max_areas', 'Max areas']] as const).map(([k, label]) => {
              const used = limitUse[k]
              const limit = parseLimit(form[k])
              const below = used != null && limit != null && limit < used
              return (
                <div key={k} className="flex flex-col gap-1">
                  <label htmlFor={`lic-${k}`} className="text-[12px] font-semibold text-ink-2">{label}</label>
                  <TextInput id={`lic-${k}`} mono inputMode="numeric" value={form[k]} invalid={!!errors[k]} disabled={busy}
                    onChange={(e) => set(k, e.target.value.replace(/[^\d]/g, ''))} aria-describedby={`lic-${k}-help`} />
                  <p id={`lic-${k}-help`} className={clsx('text-[12px]', errors[k] ? 'text-danger' : below ? 'font-semibold text-[#A8561A]' : 'text-ink-3')}>
                    {errors[k] ?? (usageLoading ? 'Loading use…' : used == null ? '—' : below ? `Below the ${used} in use` : `${used} in use`)}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel aside={`${enabledCount} of ${MODULES.length} enabled`}>Modules</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {MODULES.map((m) => (
              <ModuleSwitch key={m.key} label={m.label} checked={form.modules.includes(m.key)} disabled={busy}
                onChange={(on) => set('modules', on ? [...form.modules, m.key] : form.modules.filter((x) => x !== m.key))} />
            ))}
          </div>
          {errors.modules && <p className="text-[12px] text-danger">{errors.modules}</p>}
        </section>

        <section ref={termRef} className="flex flex-col gap-2">
          <SectionLabel aside={termAside(org)}>Term</SectionLabel>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px] gap-3 [&>*]:min-w-0">
            <div className="flex flex-col gap-1">
              <label htmlFor="lic-starts" className="text-[12px] font-semibold text-ink-2">Starts</label>
              <TextInput id="lic-starts" type="date" value={form.starts} invalid={!!errors.starts_at} disabled={busy} onChange={(e) => set('starts', e.target.value)} />
              {errors.starts_at && <p className="text-[12px] text-danger">{errors.starts_at}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lic-expires" className="text-[12px] font-semibold text-ink-2">Expires</label>
              <TextInput ref={expiresRef} id="lic-expires" type="date" value={form.expires} invalid={!!errors.expires_at} disabled={busy}
                className={clsx(focus === 'term' && 'border-forest')} onChange={(e) => set('expires', e.target.value)} />
              {errors.expires_at && <p className="text-[12px] text-danger">{errors.expires_at}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lic-grace" className="text-[12px] font-semibold text-ink-2">Grace days</label>
              <TextInput id="lic-grace" mono inputMode="numeric" value={form.grace_days} invalid={!!errors.grace_days} disabled={busy}
                onChange={(e) => set('grace_days', e.target.value.replace(/[^\d]/g, ''))} />
              {errors.grace_days && <p className="text-[12px] text-danger">{errors.grace_days}</p>}
            </div>
          </div>
          {previewStatus && (
            <p className="flex items-center gap-2 text-[12px] text-ink-2">
              <Icon name="info" size={16} className="text-info" />
              After saving, the licence dates give status <StatusBadge status={previewStatus} />
              {cause === 'manual' && previewStatus !== 'suspended' && <span>— still suspended until reinstated.</span>}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Deployment</SectionLabel>
          <DeploymentChoice value={form.deployment} onChange={(v) => set('deployment', v)} disabled={busy} />
        </section>

        <section aria-labelledby="usage-h" className="flex flex-col gap-2 rounded-lg border-[1.5px] border-line bg-cream-tint px-4 pt-2.5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="usage-h" className="text-label font-semibold uppercase tracking-[0.06em] text-ink-3">Usage</h3>
            {usage && usage.archivedAreas > 0 && <span className="text-caption text-ink-3">{usage.archivedAreas} archived area{usage.archivedAreas === 1 ? '' : 's'} not counted</span>}
          </div>
          {usageLoading ? (
            <span className="flex items-center gap-2 text-small text-ink-3"><Spinner size={16} className="text-forest" />Loading usage…</span>
          ) : !usage ? (
            <span className="text-small text-ink-3">Usage not available</span>
          ) : (
            <dl className={clsx('grid gap-3', usage.activeDevices != null ? 'grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]' : 'grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]')}>
              <UsageItem icon="sync" label="Last sync" value={syncLabel(usage.lastSyncAt)} title={usage.lastSyncAt ? fmt.dateTime(usage.lastSyncAt) : undefined} />
              <UsageItem icon="person" label="Rangers" value={`${usage.rangers} of ${initial.max_rangers || '—'}`} />
              <UsageItem icon="badge" label="Managers" value={`${usage.managers} of ${initial.max_managers || '—'}`} />
              <UsageItem icon="grid_on" label="Areas" value={`${usage.areas} of ${initial.max_areas || '—'}`} />
              {usage.activeDevices != null && <UsageItem icon="smartphone" label="Active devices" value={String(usage.activeDevices)} />}
            </dl>
          )}
        </section>

        <PrivacyNote />

        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <SectionLabel>Access</SectionLabel>
          {status === 'suspended' ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-small text-ink-2">
                {cause === 'expired'
                  ? `Licence ran out of grace on ${licenceDate(graceEndsAt(org.licence))}. Extend the expiry date above to restore sign-in.`
                  : cause === 'no_licence'
                    ? 'Save a licence to restore sign-in.'
                    : 'Suspended by zrGISsolutions. Users cannot sign in; the SOS endpoint stays open.'}
              </p>
              {cause === 'manual' && <Button kind="primary" icon="lock_open" onClick={() => setConfirm('reinstate')} disabled={busy}>Reinstate</Button>}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-small text-ink-2">Suspending refuses sign-in for every user of {org.code}. Panic/SOS is always accepted.</p>
              <Button kind="secondary" icon="block" className="!border-danger !text-danger hover:!bg-danger-bg" onClick={() => setConfirm('suspend')} disabled={busy}>Suspend</Button>
            </div>
          )}
        </section>
      </div>

      <footer className="flex h-[72px] shrink-0 items-center gap-3 border-t border-line px-6">
        <span className="flex flex-1 items-center gap-1.5 text-small text-ink-3" aria-live="polite">
          {formError ? (
            <span className="flex items-center gap-1.5 text-danger"><Icon name="error" size={16} />{formError}</span>
          ) : saved && !dirty ? (
            <span className="flex items-center gap-1.5 font-semibold text-success"><Icon name="check_circle" size={16} />Licence saved</span>
          ) : (
            <><Icon name="history" size={16} />Audit-logged</>
          )}
        </span>
        <Button kind="secondary" className="w-[110px]" onClick={() => (dirty ? (setForm(initial), setErrors({}), setFormError(null)) : onClose())} disabled={busy}>
          {dirty ? 'Reset' : 'Close'}
        </Button>
        <Button kind="primary" icon="check" onClick={save} loading={busy && !confirm} disabled={!dirty || busy}>Save licence</Button>
      </footer>

      <ConfirmDialog
        open={confirm === 'suspend'}
        title={`Suspend ${org.name}?`}
        confirmLabel="Suspend"
        tone="danger"
        loading={updateOrg.isPending}
        error={confirmError}
        onConfirm={changeStatus}
        onClose={() => { setConfirm(null); setConfirmError(null) }}
      >
        <p>Every manager and ranger of <b>{org.code}</b> will be signed out and refused sign-in. Queued field data stays on devices, and the SOS endpoint stays open so rangers are never cut off from safety.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'reinstate'}
        title={`Reinstate ${org.name}?`}
        confirmLabel="Reinstate"
        loading={busy}
        error={confirmError}
        onConfirm={changeStatus}
        onClose={() => { setConfirm(null); setConfirmError(null) }}
      >
        <p>Sign-in and sync are restored for <b>{org.code}</b> under its current licence{org.licence?.expires_at ? `, which expires ${licenceDate(org.licence.expires_at)}` : ''}.</p>
      </ConfirmDialog>
    </aside>
  )
}

function UsageItem({ icon, label, value, title }: { icon: string; label: string; value: string; title?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <Icon name={icon} size={18} className="mt-0.5 shrink-0 text-ink-3" />
      <div className="flex min-w-0 flex-col leading-tight">
        <dt className="text-caption text-ink-3">{label}</dt>
        <dd className="truncate text-[14px] font-semibold text-ink" title={title}>{value}</dd>
      </div>
    </div>
  )
}

function termAside(org: PlatformOrg) {
  if (org.status !== 'grace') return undefined
  const left = graceDaysLeft(org.licence)
  return left == null ? undefined : left <= 0 ? 'Grace ends today' : `Grace ends in ${left} day${left === 1 ? '' : 's'}`
}
