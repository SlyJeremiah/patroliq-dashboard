import clsx from 'clsx'
import { Fragment, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { qk, useActivateArea, useArea as useAreaDetail } from '@/api/hooks'
import type { Area } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { Banner, Button, EmptyState, ErrorState, Icon, Spinner } from '@/components/ui'
import { SETUP_STEPS, activationProblems, areaTypeLabel, formatKm2, isStepKey, setupProgress, type StepKey } from './adminLogic'
import { AreaStatusBadge } from './parts'
import { BoundaryStep } from './setup/BoundaryStep'
import { BasesStep } from './setup/BasesStep'
import { GridStep } from './setup/GridStep'
import { TeamsStep } from './setup/TeamsStep'

export function AreaSetupPage() {
  const { areaId, step } = useParams()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('org_admin')
  const areaQ = useAreaDetail(areaId)

  if (areaQ.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-forest">
        <Spinner size={28} />
      </div>
    )
  }
  if (areaQ.isError || !areaQ.data) {
    const notFound = areaQ.error instanceof ApiError && areaQ.error.status === 404
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        {notFound ? (
          <EmptyState icon="explore_off" title="Area not found" text="It may have been removed, or it belongs to another organisation." action={<Link to="/areas" className="font-semibold text-mid-green underline">Back to areas</Link>} />
        ) : (
          <ErrorState error={areaQ.error} onRetry={() => void areaQ.refetch()} />
        )}
      </div>
    )
  }

  const area = areaQ.data
  if (!isStepKey(step)) {
    const { next } = setupProgress(area)
    return <Navigate to={`/areas/${area.id}/setup/${isAdmin ? next ?? 'boundary' : 'teams'}`} replace />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <SetupHeader area={area} step={step} />
      {step === 'boundary' && <BoundaryStep key={area.id} area={area} />}
      {step === 'bases' && <BasesStep key={area.id} area={area} />}
      {step === 'grid' && <GridStep key={area.id} area={area} />}
      {step === 'teams' && <TeamsStep key={area.id} area={area} />}
    </div>
  )
}

function SetupHeader({ area, step }: { area: Area; step: StepKey }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('org_admin')
  const activate = useActivateArea()
  const [problems, setProblems] = useState<string[] | null>(null)
  const { setup } = setupProgress(area)
  const index = SETUP_STEPS.findIndex((s) => s.key === step)

  const onActivate = () => {
    setProblems(null)
    activate.mutate(area.id, {
      onSuccess: (a) => qc.setQueryData(qk.area(a.id), a),
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'area_not_ready') setProblems(activationProblems(e.fields))
        else setProblems([e instanceof Error ? e.message : 'The area could not be activated.'])
      },
    })
  }
  const readyToActivate = setup.boundary && setup.bases && setup.grid

  return (
    <>
      <div className="flex min-h-[64px] shrink-0 items-center gap-5 border-b border-line px-6 py-2">
        <button
          type="button"
          onClick={() => navigate('/areas')}
          aria-label="Back to conservation areas"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-black/5"
        >
          <Icon name="arrow_back" size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-[20px] leading-7 font-semibold text-ink">{area.name}</h1>
            <AreaStatusBadge status={area.status} />
          </div>
          <p className="truncate text-small text-ink-3">
            {[area.client_name, areaTypeLabel(area.area_type).toLowerCase(), area.boundary ? formatKm2(area.area_km2) : null].filter(Boolean).join(' · ')} · step {index + 1} of 4
          </p>
        </div>
        {isAdmin && area.status === 'draft' && (
          <Button
            icon="rocket_launch"
            onClick={onActivate}
            loading={activate.isPending}
            kind={readyToActivate ? 'primary' : 'secondary'}
            title={readyToActivate ? 'Rangers assigned to this area receive it on their next sync' : 'Needs a boundary, at least one APU base and a grid'}
          >
            Activate area
          </Button>
        )}
        <nav aria-label="Setup steps" className="flex items-center">
          {SETUP_STEPS.map((s, i) => {
            const current = s.key === step
            const complete = setup[s.key]
            return (
              <Fragment key={s.key}>
                {i > 0 && <span className={clsx('mx-2 h-[2px] w-8', setup[SETUP_STEPS[i - 1].key] ? 'bg-mid-green' : 'bg-[#D9D1C2]')} aria-hidden />}
                <Link
                  to={`/areas/${area.id}/setup/${s.key}`}
                  aria-current={current ? 'step' : undefined}
                  className={clsx('flex h-11 items-center gap-2 rounded-lg px-1.5 hover:bg-black/5', current ? 'font-semibold text-ink' : 'text-ink-2')}
                >
                  {complete && !current ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-mid-green text-white"><Icon name="check" size={18} /></span>
                  ) : (
                    <span
                      className={clsx(
                        'flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold',
                        current ? 'bg-forest text-cream shadow-[0_0_0_3px_#D8F3DC]' : 'border-[1.5px] border-[#BDB5A6] text-ink-3',
                      )}
                    >
                      {complete ? <Icon name="check" size={16} /> : i + 1}
                    </span>
                  )}
                  <span className="text-[15px]">{s.label}</span>
                  <span className="sr-only">{complete ? '(complete)' : '(not complete)'}</span>
                </Link>
              </Fragment>
            )
          })}
        </nav>
      </div>
      {problems && (
        <div className="border-b border-line px-6 py-2">
          <Banner tone="warning" title="The area is not ready to activate" action={<Button kind="ghost" size="sm" onClick={() => setProblems(null)}>Dismiss</Button>}>
            <ul className="list-disc pl-4">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </Banner>
        </div>
      )}
      {activate.isSuccess && area.status === 'active' && (
        <div className="border-b border-line px-6 py-2">
          <Banner tone="success" title="Area activated">Rangers assigned to {area.name} receive it on their next sync.</Banner>
        </div>
      )}
    </>
  )
}
