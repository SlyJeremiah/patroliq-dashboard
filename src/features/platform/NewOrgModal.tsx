// NEW ORGANISATION: organisation + licence + first org_admin (POST platform/organisations/).
import { useState } from 'react'
import { ApiError } from '@/api/client'
import { useCreateOrg } from '@/api/hooks'
import { Banner, Button, Field, Icon, Modal, TextInput } from '@/components/ui'
import type { CreateOrgBody, CreateOrgResult } from './platformApi'
import {
  MODULES, PLAN_PRESETS, addYears, endOfDayIso, flattenFieldErrors, licenceDate, normaliseCode, planLabel, parseLimit, startOfDayIso, toDateInput,
  validateEmail, validateOrgCode, type Deployment, type Plan,
} from './platformLogic'
import { CopyValue, DeploymentChoice, ModuleSwitch, PlanPicker, SectionLabel } from './parts'

interface Form {
  name: string
  code: string
  country: string
  plan: Plan
  max_rangers: string
  max_managers: string
  max_areas: string
  modules: string[]
  starts: string
  expires: string
  grace_days: string
  deployment: Deployment
  admin_name: string
  admin_email: string
}

function blank(): Form {
  const today = new Date()
  const p = PLAN_PRESETS.pilot
  return {
    name: '', code: '', country: 'Zimbabwe', plan: 'pilot',
    max_rangers: String(p.max_rangers), max_managers: String(p.max_managers), max_areas: String(p.max_areas), modules: [...p.modules],
    starts: toDateInput(today), expires: toDateInput(addYears(today, 1)), grace_days: '14', deployment: 'shared',
    admin_name: '', admin_email: '',
  }
}

/** API error keys → form keys. */
const FIELD_MAP: Record<string, keyof Form> = {
  name: 'name', code: 'code', country: 'country', deployment: 'deployment',
  'licence.plan': 'plan', 'licence.max_rangers': 'max_rangers', 'licence.max_managers': 'max_managers', 'licence.max_areas': 'max_areas',
  'licence.modules': 'modules', 'licence.starts_at': 'starts', 'licence.expires_at': 'expires', 'licence.grace_days': 'grace_days',
  'admin.full_name': 'admin_name', 'admin.email': 'admin_email',
}

const INPUT_ID: Partial<Record<keyof Form, string>> = {
  name: 'no-name', code: 'no-code', country: 'no-country', max_rangers: 'no-max_rangers', max_managers: 'no-max_managers',
  max_areas: 'no-max_areas', starts: 'no-starts', expires: 'no-expires', grace_days: 'no-grace', admin_name: 'no-admin-name', admin_email: 'no-admin-email',
}

/** Move keyboard focus (and the scroll position) to the first field with an error, in form order. */
function focusFirstError(errors: Partial<Record<keyof Form, string>>) {
  const first = (Object.keys(INPUT_ID) as (keyof Form)[]).find((k) => errors[k])
  if (first) window.setTimeout(() => document.getElementById(INPUT_ID[first]!)?.focus(), 0)
}

export function NewOrgModal({ open, existingCodes, onClose, onOpenOrg }: { open: boolean; existingCodes: string[]; onClose: () => void; onOpenOrg: (id: string) => void }) {
  const [form, setForm] = useState<Form>(blank)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateOrgResult | null>(null)
  const create = useCreateOrg()

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  function pickPlan(plan: Plan) {
    const p = PLAN_PRESETS[plan]
    setForm((f) => ({ ...f, plan, max_rangers: String(p.max_rangers), max_managers: String(p.max_managers), max_areas: String(p.max_areas), modules: [...p.modules] }))
  }

  function close() {
    setForm(blank())
    setErrors({})
    setFormError(null)
    setResult(null)
    create.reset()
    onClose()
  }

  function validate() {
    const e: Partial<Record<keyof Form, string>> = {}
    if (!form.name.trim()) e.name = 'Enter the organisation name.'
    const codeErr = validateOrgCode(form.code, existingCodes)
    if (codeErr) e.code = codeErr
    for (const k of ['max_rangers', 'max_managers', 'max_areas', 'grace_days'] as const) if (parseLimit(form[k]) == null) e[k] = 'Whole number, 0 or more.'
    if (!form.starts) e.starts = 'Choose a start date.'
    if (!form.expires) e.expires = 'Choose an expiry date.'
    else if (form.starts && form.expires <= form.starts) e.expires = 'Must be after the start date.'
    if (!form.admin_name.trim()) e.admin_name = 'Enter the administrator’s full name.'
    const emailErr = validateEmail(form.admin_email)
    if (emailErr) e.admin_email = emailErr
    return e
  }

  async function submit() {
    const e = validate()
    setErrors(e)
    setFormError(null)
    if (Object.keys(e).length) {
      focusFirstError(e)
      return
    }
    const body: CreateOrgBody = {
      name: form.name.trim(),
      code: form.code.trim(),
      ...(form.country.trim() ? { country: form.country.trim() } : {}),
      deployment: form.deployment,
      licence: {
        plan: form.plan,
        max_rangers: parseLimit(form.max_rangers),
        max_managers: parseLimit(form.max_managers),
        max_areas: parseLimit(form.max_areas),
        modules: MODULES.map((m) => m.key).filter((m) => form.modules.includes(m)),
        starts_at: startOfDayIso(form.starts),
        expires_at: endOfDayIso(form.expires),
        grace_days: parseLimit(form.grace_days),
      },
      admin: { full_name: form.admin_name.trim(), email: form.admin_email.trim() },
    }
    try {
      const res = (await create.mutateAsync(body as unknown as Record<string, unknown>)) as unknown as CreateOrgResult
      setResult(res)
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const flat = flattenFieldErrors(err.fields)
        const mapped: Partial<Record<keyof Form, string>> = {}
        const rest: string[] = []
        for (const [k, v] of Object.entries(flat)) {
          const target = FIELD_MAP[k] ?? (k.startsWith('admin') ? 'admin_email' : undefined)
          if (target) mapped[target] = v
          else rest.push(v)
        }
        setErrors(mapped)
        focusFirstError(mapped)
        setFormError(rest.length ? rest.join(' ') : 'Check the highlighted fields.')
      } else {
        setFormError(err instanceof Error ? err.message : 'The organisation was not created.')
      }
    }
  }

  if (result) {
    const org = result.organisation
    return (
      <Modal
        open={open}
        onClose={close}
        width={560}
        title="Organisation created"
        footer={
          <>
            <Button kind="secondary" onClick={close}>Done</Button>
            <Button kind="primary" icon="open_in_new" onClick={() => { const id = org.id; close(); onOpenOrg(id) }}>Open licence</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-small text-ink-2">
            <b className="text-ink">{org.name}</b> ({org.code}) is licensed on the {planLabel(org.licence?.plan ?? form.plan)} plan until {licenceDate(org.licence?.expires_at)}.
            Its first administrator is <b className="text-ink">{result.admin_user.full_name}</b> ({result.admin_user.email}).
          </p>
          <Banner tone="warning" icon="key" title="Shown once">
            Send these to the administrator over a secure channel. They must change the password at first sign-in and add the TOTP secret to an authenticator app.
            They cannot be shown again.
          </Banner>
          <CopyValue label="Temporary password" value={result.temporary_password} />
          {result.totp_secret && <CopyValue label="TOTP secret" value={result.totp_secret} />}
          {result.totp_uri && <CopyValue label="TOTP setup URI" value={result.totp_uri} />}
        </div>
      </Modal>
    )
  }

  const busy = create.isPending
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      width={640}
      title="New organisation"
      footer={
        <>
          {formError && <span className="mr-auto flex items-center gap-1.5 text-small text-danger"><Icon name="error" size={16} />{formError}</span>}
          <Button kind="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button kind="primary" icon="add" onClick={submit} loading={busy}>Create organisation</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5 pt-1"
        noValidate
        onSubmit={(e) => { e.preventDefault(); void submit() }}
      >
        <p className="text-small text-ink-3">Creates an isolated tenant, its licence and the first organisation administrator.</p>

        <section className="flex flex-col gap-3">
          <SectionLabel>Organisation</SectionLabel>
          <Field label="Name" htmlFor="no-name" error={errors.name}>
            <TextInput id="no-name" value={form.name} invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} autoFocus maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" htmlFor="no-code" error={errors.code} helper="Rangers type this at sign-in, e.g. GRTTS">
              <TextInput id="no-code" mono value={form.code} invalid={!!errors.code} maxLength={32} autoComplete="off" spellCheck={false}
                onChange={(e) => set('code', normaliseCode(e.target.value))}
                onBlur={() => form.code && setErrors((er) => ({ ...er, code: validateOrgCode(form.code, existingCodes) ?? undefined }))} />
            </Field>
            <Field label="Country" htmlFor="no-country" error={errors.country}>
              <TextInput id="no-country" value={form.country} invalid={!!errors.country} maxLength={64} onChange={(e) => set('country', e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel aside="Picking a plan fills typical limits — adjust as agreed">Licence</SectionLabel>
          <PlanPicker value={form.plan} onChange={pickPlan} disabled={busy} />
          <div className="grid grid-cols-3 gap-3">
            {([['max_rangers', 'Max rangers'], ['max_managers', 'Max managers'], ['max_areas', 'Max areas']] as const).map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`no-${k}`} error={errors[k]}>
                <TextInput id={`no-${k}`} mono inputMode="numeric" value={form[k]} invalid={!!errors[k]} onChange={(e) => set(k, e.target.value.replace(/[^\d]/g, ''))} />
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2" aria-label="Modules">
            {MODULES.map((m) => (
              <ModuleSwitch key={m.key} label={m.label} checked={form.modules.includes(m.key)}
                onChange={(on) => set('modules', on ? [...form.modules, m.key] : form.modules.filter((x) => x !== m.key))} />
            ))}
          </div>
          {errors.modules && <p className="text-[12px] text-danger">{errors.modules}</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px] gap-3 [&>*]:min-w-0">
            <Field label="Starts" htmlFor="no-starts" error={errors.starts}>
              <TextInput id="no-starts" type="date" value={form.starts} invalid={!!errors.starts} onChange={(e) => set('starts', e.target.value)} />
            </Field>
            <Field label="Expires" htmlFor="no-expires" error={errors.expires}>
              <TextInput id="no-expires" type="date" value={form.expires} invalid={!!errors.expires} onChange={(e) => set('expires', e.target.value)} />
            </Field>
            <Field label="Grace days" htmlFor="no-grace" error={errors.grace_days}>
              <TextInput id="no-grace" mono inputMode="numeric" value={form.grace_days} invalid={!!errors.grace_days} onChange={(e) => set('grace_days', e.target.value.replace(/[^\d]/g, ''))} />
            </Field>
          </div>
          <DeploymentChoice value={form.deployment} onChange={(v) => set('deployment', v)} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel>First organisation administrator</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" htmlFor="no-admin-name" error={errors.admin_name}>
              <TextInput id="no-admin-name" value={form.admin_name} invalid={!!errors.admin_name} maxLength={200} autoComplete="off" onChange={(e) => set('admin_name', e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="no-admin-email" error={errors.admin_email}>
              <TextInput id="no-admin-email" type="email" value={form.admin_email} invalid={!!errors.admin_email} autoComplete="off" onChange={(e) => set('admin_email', e.target.value)} />
            </Field>
          </div>
          <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
            <Icon name="lock" size={14} />A temporary password and TOTP secret are generated and shown once after creation.
          </p>
        </section>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
