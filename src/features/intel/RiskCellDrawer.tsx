import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CellRisk } from '@/api/types'
import { Drawer, SeverityBadge, severityColor, Spinner } from '@/components/ui'
import { fmt } from '@/lib/format'
import { cellScoreHistory, factorContributions, RISK_HIGH_THRESHOLD, shortSectorName } from './intelLogic'
import { Delta } from './intelParts'
import { useRiskHistory } from './useRiskHistory'

const HISTORY_DAYS = 14

export function RiskCellDrawer({ areaId, cell, date, delta, sectorName, onClose }: {
  areaId: string
  cell: CellRisk | null
  date: string
  delta: number | null
  sectorName?: string
  onClose: () => void
}) {
  const history = useRiskHistory(areaId, date, HISTORY_DAYS, !!cell)
  if (!cell) return null
  const factors = factorContributions(cell.factors)
  const maxPoints = Math.max(0.01, ...factors.map((f) => f.points))
  const series = cellScoreHistory(history.data, cell.cell_id)
  const scored = series.filter((s) => s.score !== null)

  return (
    <Drawer
      open
      onClose={onClose}
      width={440}
      title={<span className="font-mono text-[20px] font-medium">{cell.label}</span>}
      subtitle={`${sectorName ? `${shortSectorName(sectorName)} · ` : ''}scores for ${fmt.date(date)}`}
    >
      <div className="flex items-center gap-4 rounded-xl bg-cream-tint p-4">
        <span className="text-[40px] leading-none font-bold" style={{ color: severityColor[cell.level] }}>{cell.score.toFixed(1)}</span>
        <div className="flex flex-col gap-1">
          <SeverityBadge level={cell.level} className="self-start" />
          <Delta value={delta} suffix=" vs previous day" />
        </div>
      </div>

      <section className="mt-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">Score history</h3>
          <span className="text-caption text-ink-3">last {HISTORY_DAYS} days, 0–10</span>
        </div>
        <div className="mt-2 h-[150px]">
          {history.isLoading && !scored.length ? (
            <div className="flex h-full items-center justify-center text-forest"><Spinner /></div>
          ) : scored.length < 2 ? (
            <p className="flex h-full items-center justify-center text-small text-ink-3">Not enough scored days to draw a history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} stroke="#F0EADF" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6C757D' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={{ fontSize: 11, fill: '#6C757D' }} tickLine={false} axisLine={false} />
                <ReferenceLine y={RISK_HIGH_THRESHOLD} stroke={severityColor.high} strokeDasharray="4 4" />
                <Tooltip
                  formatter={(v) => [typeof v === 'number' ? v.toFixed(2) : '—', 'Score']}
                  contentStyle={{ borderRadius: 8, border: 0, background: '#102C26', color: '#F7E7CE', fontSize: 12 }}
                  labelStyle={{ color: '#F7E7CE', fontWeight: 600 }}
                  itemStyle={{ color: '#F7E7CE' }}
                />
                <Line type="monotone" dataKey="score" stroke="#102C26" strokeWidth={2} dot={{ r: 2.5, fill: '#102C26' }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-label font-semibold tracking-[0.06em] uppercase text-ink-3">Contributing factors</h3>
          <span className="text-caption text-ink-3">points added to the score</span>
        </div>
        <ul className="mt-2 flex flex-col">
          {factors.map((f) => (
            <li key={f.key} className="border-b border-line-soft py-2.5 last:border-0">
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 text-small text-ink">{f.label}</span>
                <span className="mono font-medium text-ink">+{f.points.toFixed(1)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EFE8DA]">
                  <div className="h-full rounded-full bg-mid-green" style={{ width: `${(f.points / maxPoints) * 100}%` }} />
                </div>
                <span className="w-28 text-right text-caption text-ink-3">weight {Math.round(f.weight * 100)}%</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-ink-3">
          Each factor adds 10 × weight × its 0–1 component. The points sum to the cell score of {cell.score.toFixed(2)}.
        </p>
      </section>
    </Drawer>
  )
}
