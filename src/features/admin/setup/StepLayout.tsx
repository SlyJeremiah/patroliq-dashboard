import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui'

/** Left panel + map (+ optional right panel) with a bottom action bar, filling the setup page. */
export function StepLayout({ left, map, right, bottom, leftWidth = 420 }: { left: ReactNode; map: ReactNode; right?: ReactNode; bottom: ReactNode; leftWidth?: number }) {
  return (
    <>
      <div className="flex min-h-0 flex-1">
        <aside className="scroll-thin flex shrink-0 flex-col overflow-y-auto border-r border-line bg-white" style={{ width: leftWidth }}>
          {left}
        </aside>
        <div className="relative min-w-0 flex-1 bg-[#DDE5DC]">
          {/* maplibre-gl.css sets `.maplibregl-map {position: relative}`, which collapses AreaMap's `absolute inset-0` container. */}
          <div className="absolute inset-0 [&_.maplibregl-map]:!absolute">{map}</div>
        </div>
        {right && <aside className="scroll-thin flex w-[330px] shrink-0 flex-col overflow-y-auto border-l border-line bg-white">{right}</aside>}
      </div>
      <div className="flex min-h-[72px] shrink-0 items-center gap-6 border-t border-line bg-cream-tint px-6 py-2">{bottom}</div>
    </>
  )
}

/** Dark translucent chip floating over the map (design: "Grid preview · 1 km · not saved"). */
export function MapChip({ icon, children, tone = 'dark', className }: { icon?: string; children: ReactNode; tone?: 'dark' | 'danger'; className?: string }) {
  return (
    <div
      className={clsx(
        'pointer-events-none inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold shadow-pop',
        tone === 'dark' ? 'bg-forest/92 text-cream' : 'bg-danger text-white',
        className,
      )}
    >
      {icon && <Icon name={icon} size={17} className={tone === 'dark' ? 'text-emerald' : undefined} />}
      {children}
    </div>
  )
}

export function BottomMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      <span className="text-body font-semibold whitespace-nowrap text-ink">{value}</span>
    </div>
  )
}

export function CheckLine({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-small', ok === false ? 'text-danger' : 'text-ink-2')}>
      <Icon name={ok === false ? 'cancel' : ok ? 'check_circle' : 'radio_button_unchecked'} size={17} className={ok ? 'text-success' : ok === false ? 'text-danger' : 'text-ink-3'} />
      {children}
    </span>
  )
}

export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-readonly px-3 py-2.5 text-small text-ink-2">
      <Icon name="lock" size={17} className="mt-px text-ink-3" />
      <span>{children}</span>
    </div>
  )
}
