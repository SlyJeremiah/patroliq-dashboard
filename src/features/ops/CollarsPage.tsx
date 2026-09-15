// Collars (`/collars`) — honest empty state: no collar data source exists in the MVP (Platform Spec §7 "Collars").
import { useArea } from '@/auth/AreaContext'
import { useAuth } from '@/auth/AuthContext'
import { AreaMap } from '@/components/map/AreaMap'
import { Icon } from '@/components/ui'
import { MAP_FILL, addMapControls, useAreaLayers } from './useOpsMap'

const WILL_SHOW: [string, string][] = [
  ['location_on', 'GPS collar positions per individual, with species icon, collar ID and last fix time'],
  ['timeline', 'Movement trail for the past 24 hours'],
  ['info', 'Collar detail: species, age, last seen, territory and nearest ranger'],
  ['warning', 'Mortality alert when a collar is stationary for more than 8 hours'],
]

export function CollarsPage() {
  const { area } = useArea()
  const { hasModule } = useAuth()
  const layers = useAreaLayers(area?.id ?? null)
  const licensed = hasModule('collars')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AreaMap className={`min-h-0 flex-1 ${MAP_FILL}`} boundary={area?.boundary} cells={layers.cells} showCells points={layers.bases} onReady={addMapControls}>
        <div className="pointer-events-none absolute inset-0 z-10 bg-forest/35" aria-hidden />
        <div className="absolute top-1/2 left-1/2 z-20 w-[min(520px,calc(100%-48px))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-pop">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cream text-forest">
              <Icon name="pets" size={28} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Animal collar layer{area ? ` · ${area.name}` : ''}</p>
              <h1 className="text-h2 font-semibold text-ink">{licensed ? 'No collar feed connected' : 'Collar tracking is not in your licence'}</h1>
              <p className="mt-1 text-small text-ink-2">
                {licensed
                  ? 'GPS collar integration is not part of the current PatrolIQ release, so there is no collar data to show yet. The area boundary and GRTS grid below are live.'
                  : 'Your organisation’s licence does not include the collars module. Contact zrGISsolutions to add it once collar integration is available.'}
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-lg bg-cream-tint px-4 py-3">
            <p className="text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-2">When a collar provider is connected, this layer will show</p>
            <ul className="flex flex-col gap-2">
              {WILL_SHOW.map(([icon, text]) => (
                <li key={text} className="flex items-start gap-2.5 text-small text-ink">
                  <Icon name={icon} size={18} className="mt-px text-mid-green" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-[#F3E8F5] px-3.5 py-2.5 text-[13px] text-[#4A1D55]">
            <Icon name="lock" size={18} />
            <span>
              <b>Restricted layer.</b> Visible to Ranger (own area), Manager, Admin and Researcher. Not available to NGO or Government roles.
            </span>
          </p>
        </div>
      </AreaMap>
    </div>
  )
}
