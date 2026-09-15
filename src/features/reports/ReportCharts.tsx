// Small summary charts for the report preview side panel (Recharts, direct labels, minimal axes).
import { Bar, BarChart, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { severityColor } from '@/components/ui'
import { topWithOther, type NamedCount } from './reportsLogic'

const TICK = { fontSize: 10, fill: '#6C757D' }

export function WeeklyBars({ data }: { data: { label: string; week: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between">
        <span className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">Observations by week</span>
        <span className="text-caption text-ink-3">{total.toLocaleString('en-GB')} total</span>
      </figcaption>
      <div className="mt-1 h-[120px]" role="img" aria-label={`Observations by ISO week: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: '#E6DFD0' }} interval={0} />
            <YAxis hide domain={[0, 'dataMax']} />
            <Bar dataKey="value" fill="#2D6A4F" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="value" position="top" style={{ fontSize: 10, fontWeight: 600, fill: '#1A1A1A' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

/** Horizontal ranked bars as plain HTML (crisper than SVG for text-heavy lists). */
export function RankedBars({ title, items, max = 5, unit, color = '#2D6A4F' }: { title: string; items: NamedCount[]; max?: number; unit?: string; color?: string }) {
  const rows = topWithOther(items, max)
  const top = Math.max(1, ...rows.map((r) => r.count))
  const total = items.reduce((s, x) => s + x.count, 0)
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between">
        <span className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">{title}</span>
        <span className="text-caption text-ink-3">{total.toLocaleString('en-GB')}{unit ? ` ${unit}` : ''}</span>
      </figcaption>
      <ul className="mt-2 flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="truncate text-ink-2">{r.name}</span>
              <span className="font-semibold text-ink">{r.count.toLocaleString('en-GB')}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-[#EFE8DA]">
              <div className="h-full rounded-full" style={{ width: `${(r.count / top) * 100}%`, background: r.name.startsWith('Other (') ? '#ADB5BD' : color }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export function RiskTrendMini({ data }: { data: { label: string; value: number | null }[] }) {
  const scored = data.filter((d) => d.value !== null)
  const last = scored[scored.length - 1]
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between">
        <span className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">AI risk trend</span>
        <span className="text-caption text-ink-3">mean cell score, 0–10</span>
      </figcaption>
      <div className="mt-1 h-[110px]" role="img" aria-label={last ? `Mean risk score ended at ${last.value?.toFixed(1)} on ${last.label}` : 'No risk scores in this period'}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 30, bottom: 0, left: -30 }}>
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: '#E6DFD0' }} interval="preserveStartEnd" minTickGap={40} />
            <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={TICK} tickLine={false} axisLine={false} />
            <ReferenceLine y={5.5} stroke={severityColor.high} strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#102C26"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              label={(p: { index?: number; x?: number | string; y?: number | string }) =>
                last && p.index === data.indexOf(last) ? (
                  <text key="end" x={Number(p.x) + 4} y={Number(p.y) + 4} fontSize={11} fontWeight={600} fill="#1A1A1A">{last.value?.toFixed(1)}</text>
                ) : (
                  <g key={`n${p.index}`} />
                )
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
