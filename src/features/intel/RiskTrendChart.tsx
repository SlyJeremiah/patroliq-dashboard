import { Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { severityColor } from '@/components/ui'
import { lastScored, RISK_HIGH_THRESHOLD, type TrendRow } from './intelLogic'

const INK3 = '#6C757D'
const AXIS = { fontSize: 11, fill: INK3 }

function TrendTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const row = active ? (payload?.[0]?.payload as TrendRow | undefined) : undefined
  if (!row) return null
  return (
    <div className="rounded-lg bg-forest px-3 py-2 text-[12px] text-cream shadow-pop">
      <p className="font-semibold">{row.label}</p>
      {row.mean === null ? (
        <p className="text-cream/70">No scores this day</p>
      ) : (
        <>
          <p>Mean score {row.mean.toFixed(2)} · highest {row.max?.toFixed(1)}</p>
          <p>{row.high} high · {row.critical} critical cells</p>
        </>
      )}
    </div>
  )
}

/** 30-day area risk: mean score line (0–10) over faint high/critical cell counts, with the high threshold marked. */
export function RiskTrendChart({ rows, selectedDate }: { rows: TrendRow[]; selectedDate?: string | null }) {
  const last = lastScored(rows)
  const maxCount = Math.max(1, ...rows.map((r) => r.elevated))
  const selected = selectedDate ? rows.find((r) => r.date === selectedDate) : undefined
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-forest" />Reserve mean score (0–10)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: severityColor.high, opacity: 0.45 }} />High cells</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: severityColor.critical, opacity: 0.7 }} />Critical cells</span>
      </div>
      <div className="min-h-0 flex-1" role="img" aria-label={last ? `Risk trend over ${rows.length} days. Latest reserve mean ${last.mean?.toFixed(1)} on ${last.label}.` : 'No risk scores in this period.'}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 96, bottom: 0, left: -18 }} barCategoryGap={1}>
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#E6DFD0' }} interval={6} minTickGap={16} />
            <YAxis yAxisId="score" domain={[0, 10]} ticks={[0, 5, 10]} tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis yAxisId="count" orientation="right" domain={[0, maxCount * 2.6]} hide />
            <Bar yAxisId="count" dataKey="high" stackId="c" fill={severityColor.high} fillOpacity={0.28} isAnimationActive={false} />
            <Bar yAxisId="count" dataKey="critical" stackId="c" fill={severityColor.critical} fillOpacity={0.65} isAnimationActive={false} />
            <ReferenceLine
              yAxisId="score"
              y={RISK_HIGH_THRESHOLD}
              stroke={severityColor.high}
              strokeDasharray="4 4"
              label={{ value: `High ≥ ${RISK_HIGH_THRESHOLD}`, position: 'insideBottomLeft', fill: '#B35F12', fontSize: 11, fontWeight: 600 }}
            />
            {selected && (
              <ReferenceLine yAxisId="score" x={selected.label} stroke={INK3} strokeDasharray="2 3" label={{ value: `Selected · ${selected.label}`, position: 'insideTopRight', fill: INK3, fontSize: 11 }} />
            )}
            <Line
              yAxisId="score"
              type="monotone"
              dataKey="mean"
              stroke="#102C26"
              strokeWidth={2.25}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              label={(p: { index?: number; x?: number | string; y?: number | string }) =>
                last && p.index === rows.indexOf(last) ? (
                  <g key="end-label">
                    <circle cx={Number(p.x)} cy={Number(p.y)} r={3.5} fill="#102C26" />
                    <text x={Number(p.x) + 8} y={Number(p.y) + 4} fontSize={12} fontWeight={600} fill="#1A1A1A">
                      Mean · {last.mean?.toFixed(1)}
                    </text>
                  </g>
                ) : (
                  <g key={`l-${p.index}`} />
                )
              }
            />
            <Tooltip content={TrendTooltip} cursor={{ stroke: '#C9BFAD', strokeWidth: 1 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
