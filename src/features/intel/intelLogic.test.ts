import { describe, expect, it } from 'vitest'
import type { AlertItem, AreaRisk, CellRisk, Coverage } from '@/api/types'
import {
  cellCenter, cellScoreHistory, confidenceInfo, factorContributions, feedAlerts, formatDelta, isUnderSurveyed, lastScored, monthBounds, monthOptions,
  plainFactorLabel, previousDayCells, rankRiskCells, riskOverview, sectorRows, shiftDate, statusCounts, trendRows, visitIntensity,
} from './intelLogic'

const pt = { type: 'Point' as const, coordinates: [30.9, -17.5] }

function cell(id: string, score: number, level: CellRisk['level'], sector = 's1'): CellRisk {
  return {
    cell_id: id, label: `GRTS-${id}`, sector_id: sector, score, level, centroid: pt,
    factors: [
      { key: 'boundary_proximity', label: 'Distance to boundary: 871 m', weight: 0.25, value: 0.8 },
      { key: 'patrol_gap', label: 'Last patrolled 1 day(s) ago', weight: 0.2, value: 0.1 },
      { key: 'road_proximity', label: 'Distance to road: 5,283 m', weight: 0.15, value: 0 },
    ],
  }
}

describe('risk helpers', () => {
  it('shifts ISO dates across month ends', () => {
    expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('fixes (s) plurals in engine labels', () => {
    expect(plainFactorLabel('Last patrolled 1 day(s) ago')).toBe('Last patrolled 1 day ago')
    expect(plainFactorLabel('Last patrolled 5 day(s) ago')).toBe('Last patrolled 5 days ago')
    expect(plainFactorLabel('3 threat/carcass report(s) in 90 days')).toBe('3 threat/carcass reports in 90 days')
    expect(plainFactorLabel('Late dry season')).toBe('Late dry season')
  })

  it('orders factor contributions by points', () => {
    const f = factorContributions(cell('1', 5, 'medium').factors)
    expect(f.map((x) => x.key)).toEqual(['boundary_proximity', 'patrol_gap', 'road_proximity'])
    expect(f[0].points).toBe(2)
    expect(f[1].points).toBe(0.2)
  })

  it('ranks cells with deltas and sector filter', () => {
    const cur = [cell('a', 6.1, 'high'), cell('b', 8.2, 'critical', 's2'), cell('c', 6.1, 'high'), cell('d', 2, 'low')]
    const prev = [cell('a', 5.0, 'medium'), cell('b', 8.5, 'critical', 's2')]
    const ranked = rankRiskCells(cur, prev, { limit: 3 })
    expect(ranked.map((r) => r.cell.cell_id)).toEqual(['b', 'a', 'c'])
    expect(ranked[0].delta).toBe(-0.3)
    expect(ranked[1].delta).toBe(1.1)
    expect(ranked[2].delta).toBeNull()
    expect(ranked[0].topFactors.every((f) => f.points > 0)).toBe(true)
    expect(rankRiskCells(cur, prev, { sectorId: 's2' }).map((r) => r.cell.cell_id)).toEqual(['b'])
  })

  it('summarises elevated cells and mean with deltas', () => {
    const cur = [cell('a', 6, 'high'), cell('b', 8, 'critical'), cell('c', 1, 'low')]
    const prev = [cell('a', 5, 'medium'), cell('b', 8, 'critical'), cell('c', 2, 'low')]
    const o = riskOverview(cur, prev)
    expect(o.elevated).toBe(2)
    expect(o.elevatedDelta).toBe(1)
    expect(o.mean).toBe(5)
    expect(o.meanDelta).toBe(0)
    expect(riskOverview([], null).mean).toBeNull()
  })

  it('ignores a previous-day response that fell back to the same date', () => {
    const cur: AreaRisk = { date: '2026-09-15', engine: 'heuristic', model_confidence: 'high', cells: [cell('a', 1, 'low')] }
    expect(previousDayCells(cur, { ...cur })).toBeNull()
    expect(previousDayCells(cur, { ...cur, date: '2026-09-14' })).toHaveLength(1)
  })

  it('builds trend rows and finds the last scored day', () => {
    const rows = trendRows([
      { date: '2026-09-13', mean_score: 4.5, max_score: 7, high_cells: 3, critical_cells: 1 },
      { date: '2026-09-14', mean_score: null as unknown as number, max_score: null as unknown as number, high_cells: 0, critical_cells: 0 },
    ])
    expect(rows[0]).toMatchObject({ label: '13 Sep', elevated: 4 })
    expect(lastScored(rows)?.date).toBe('2026-09-13')
  })

  it('builds a de-duplicated cell score history', () => {
    const d = (date: string, score: number): AreaRisk => ({ date, engine: 'heuristic', model_confidence: 'low', cells: [cell('a', score, 'medium')] })
    const h = cellScoreHistory([d('2026-09-14', 4), d('2026-09-13', 3), d('2026-09-14', 9), undefined], 'a')
    expect(h.map((x) => [x.date, x.score])).toEqual([['2026-09-13', 3], ['2026-09-14', 4]])
  })

  it('formats deltas with sign', () => {
    expect(formatDelta(1.25)).toBe('+1.3')
    expect(formatDelta(-0.3)).toBe('−0.3')
    expect(formatDelta(0)).toBe('±0.0')
    expect(formatDelta(null)).toBe('—')
  })

  it('explains the engine phase honestly', () => {
    expect(confidenceInfo('heuristic', 'moderate')).toMatchObject({ phase: 'Phase 1', step: 1, levelLabel: 'Moderate' })
    expect(confidenceInfo('ml', 'high').phase).toBe('Phase 2')
  })

  it('sorts the alert feed by severity then time and drops closed alerts', () => {
    const a = (id: string, severity: AlertItem['severity'], at: string, status = 'active'): AlertItem => ({ id, type: 'threat', kind: 'snare', status, severity, occurred_at: at })
    const out = feedAlerts([a('1', 'medium', '2026-09-15T08:00:00Z'), a('2', 'critical', '2026-09-14T08:00:00Z'), a('3', 'medium', '2026-09-15T09:00:00Z'), a('4', 'critical', '2026-09-15T09:00:00Z', 'resolved')])
    expect(out.map((x) => x.id)).toEqual(['2', '3', '1'])
  })
})

describe('coverage helpers', () => {
  it('lists months newest first', () => {
    const m = monthOptions('2026-01-15', 3)
    expect(m).toEqual([
      { value: '2026-01', label: 'January 2026' },
      { value: '2025-12', label: 'December 2025' },
      { value: '2025-11', label: 'November 2025' },
    ])
  })

  it('computes month bounds', () => {
    expect(monthBounds('2026-12')).toEqual({ since: '2026-12-01', until: '2027-01-01' })
  })

  it('flags under-surveyed sectors', () => {
    expect(isUnderSurveyed(0.38, 0.47)).toBe(true)
    expect(isUnderSurveyed(0.45, 0.47)).toBe(false)
    expect(isUnderSurveyed(0.5, 0.65)).toBe(true)
  })

  it('derives never counts and flags', () => {
    const cov: Coverage = {
      month: '2026-09', visit_target: 2, coverage_pct: 0.6, season_coverage_pct: 0.8, never_surveyed: 1, mean_visits: 1,
      sectors: [
        { id: 's1', name: 'S1', cells: 10, complete: 3, partial: 2, pending: 1, coverage_pct: 0.3 },
        { id: 's2', name: 'S2', cells: 10, complete: 7, partial: 2, pending: 0, coverage_pct: 0.7, never: 0 } as Coverage['sectors'][number],
      ],
      cells: [],
    }
    const rows = sectorRows(cov)
    expect(rows[0]).toMatchObject({ never: 4, underSurveyed: true })
    expect(rows[1]).toMatchObject({ never: 0, underSurveyed: false })
  })

  it('counts statuses and visit intensity', () => {
    const c = (status: 'complete' | 'partial' | 'pending' | 'never') => ({ cell_id: status, label: status, visits: 0, status, observations: 0 })
    expect(statusCounts([c('complete'), c('complete'), c('never')])).toEqual({ complete: 2, partial: 0, pending: 0, never: 1 })
    expect(visitIntensity(0, 3)).toBe(0)
    expect(visitIntensity(1, 2)).toBe(0.5)
    expect(visitIntensity(5, 2)).toBe(1)
  })

  it('finds a cell label point', () => {
    const sq = { coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] }
    expect(cellCenter(sq)).toEqual([1, 1])
    expect(cellCenter(sq, { coordinates: [5, 6] })).toEqual([5, 6])
  })
})
