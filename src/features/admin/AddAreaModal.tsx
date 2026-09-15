import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useCreateArea } from '@/api/hooks'
import { useAuth } from '@/auth/AuthContext'
import { Banner, Button, Field, Modal, Select, TextInput } from '@/components/ui'
import { AREA_TYPES, TIMEZONES } from './adminLogic'

export function AddAreaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { licence } = useAuth()
  const create = useCreateArea()
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [type, setType] = useState('conservancy')
  const [tz, setTz] = useState('Africa/Harare')
  const [touched, setTouched] = useState(false)

  const err = create.error instanceof ApiError ? create.error : null
  const fieldError = (k: string) => {
    const v = err?.fields?.[k]
    return Array.isArray(v) ? String(v[0]) : null
  }

  const close = () => {
    create.reset()
    setTouched(false)
    onClose()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!name.trim()) return
    create.mutate(
      { name: name.trim(), client_name: client.trim() || undefined, area_type: type, timezone: tz },
      {
        onSuccess: (area) => {
          setName('')
          setClient('')
          setTouched(false)
          onClose()
          navigate(`/areas/${area.id}/setup/boundary`)
        },
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add conservation area"
      width={520}
      footer={
        <>
          <Button kind="secondary" type="button" onClick={close}>Cancel</Button>
          <Button type="submit" form="add-area-form" icon="arrow_forward" loading={create.isPending}>Create and set boundary</Button>
        </>
      }
    >
      <form id="add-area-form" onSubmit={submit} className="flex flex-col gap-4 pt-1" noValidate>
        <p className="text-small text-ink-3">
          The area starts as a draft. Rangers only receive it after the boundary, APU bases and GRTS grid are set up and it is activated.
        </p>
        {err?.code === 'licence_area_limit' && (
          <Banner tone="warning" title="Area limit reached">
            Your {licence?.plan ?? ''} licence allows {licence?.max_areas ?? 'a limited number of'} active or draft areas. Archive an unused area or ask
            zrGISsolutions to raise the limit.
          </Banner>
        )}
        {err && err.code !== 'licence_area_limit' && !err.fields && <Banner tone="danger">{err.message}</Banner>}
        <Field label="Area name" htmlFor="area-name" error={touched && !name.trim() ? 'Enter the area name.' : fieldError('name')}>
          <TextInput id="area-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chewore North Concession" autoFocus invalid={touched && !name.trim()} />
        </Field>
        <Field label="Client / landholder" htmlFor="area-client" helper="Shown on reports and the area switcher." error={fieldError('client_name')}>
          <TextInput id="area-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Chewore Safaris" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Area type" htmlFor="area-type" error={fieldError('area_type')}>
            <Select id="area-type" value={type} onChange={(e) => setType(e.target.value)}>
              {AREA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Timezone" htmlFor="area-tz" helper="Defines “today” for assignments." error={fieldError('timezone')}>
            <Select id="area-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
              {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  )
}
