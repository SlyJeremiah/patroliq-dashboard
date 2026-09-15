import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import {
  allowedFormats, geojsonStats, matchPreset, parseCsvPreview, presetRange, rangeDays, rangeLabel, reportErrorMessage, reportFileName, shareUrl,
  summaryMetrics, summarySeries, topWithOther, validateRange, weekLabel,
} from './reportsLogic'

describe('date presets', () => {
  it('computes last month and this month', () => {
    expect(presetRange('last_month', '2026-09-15')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(presetRange('last_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(presetRange('this_month', '2026-09-15')).toEqual({ from: '2026-09-01', to: '2026-09-15' })
  })

  it('computes the dry season (May–Oct)', () => {
    expect(presetRange('dry_season', '2026-09-15')).toEqual({ from: '2026-05-01', to: '2026-09-15' })
    expect(presetRange('dry_season', '2026-12-02')).toEqual({ from: '2026-05-01', to: '2026-10-31' })
    expect(presetRange('dry_season', '2026-03-02')).toEqual({ from: '2025-05-01', to: '2025-10-31' })
  })

  it('matches a range to its preset', () => {
    expect(matchPreset({ from: '2026-08-01', to: '2026-08-31' }, '2026-09-15')).toBe('last_month')
    expect(matchPreset({ from: '2026-08-02', to: '2026-08-31' }, '2026-09-15')).toBe('custom')
  })

  it('validates ranges like the API', () => {
    expect(rangeDays({ from: '2026-01-01', to: '2026-12-31' })).toBe(365)
    expect(validateRange({ from: '2025-09-15', to: '2026-09-15' })).toBeNull() // 366 days inclusive
    expect(validateRange({ from: '2025-09-14', to: '2026-09-15' })).toMatch(/366/)
    expect(validateRange({ from: '2026-09-15', to: '2026-09-01' })).toMatch(/before/)
    expect(validateRange({ from: '', to: '2026-09-01' })).toMatch(/Choose/)
  })

  it('labels ranges compactly', () => {
    expect(rangeLabel('2026-08-01', '2026-08-31')).toBe('1–31 Aug 2026')
    expect(rangeLabel('2026-08-16', '2026-09-15')).toBe('16 Aug – 15 Sep 2026')
    expect(rangeLabel('2025-12-01', '2026-01-31')).toBe('1 Dec 2025 – 31 Jan 2026')
    expect(rangeLabel(null, '2026-01-31')).toBe('—')
  })
})

describe('roles and errors', () => {
  it('restricts research roles to anonymised formats', () => {
    expect(allowedFormats('manager')).toEqual(['pdf', 'csv', 'geojson'])
    expect(allowedFormats('researcher')).toEqual(['csv', 'geojson'])
    expect(allowedFormats('viewer')).not.toContain('pdf')
  })

  it('maps API error codes to calm copy', () => {
    expect(reportErrorMessage(new ApiError(400, 'date_range_too_large', 'x'))).toMatch(/366 days/)
    expect(reportErrorMessage(new ApiError(403, 'format_not_allowed', 'x'))).toMatch(/CSV or GeoJSON/)
    expect(reportErrorMessage(new ApiError(403, 'anonymised_only', 'x'))).toMatch(/anonymised/)
    expect(reportErrorMessage(new ApiError(410, 'share_expired', 'x'))).toMatch(/expired/)
    expect(reportErrorMessage(new ApiError(400, 'validation_error', 'Invalid', { sector_id: ['Sector is not in this area.'] }))).toBe('Sector is not in this area.')
    expect(reportErrorMessage(new Error('boom'))).toBe('boom')
  })
})

describe('preview helpers', () => {
  it('parses CSV with BOM, quotes, escaped quotes and newlines', () => {
    const text = '﻿Recorded,Species,Notes\r\n2026-08-16,Impala,"Herd, 26"\r\n2026-08-17,"Kudu","He said ""hi""\nthen left"\r\n\r\n'
    const p = parseCsvPreview(text)
    expect(p.headers).toEqual(['Recorded', 'Species', 'Notes'])
    expect(p.totalRows).toBe(2)
    expect(p.rows[0]).toEqual(['2026-08-16', 'Impala', 'Herd, 26'])
    expect(p.rows[1][2]).toBe('He said "hi"\nthen left')
  })

  it('limits preview rows but counts all', () => {
    const text = ['a,b', ...Array.from({ length: 120 }, (_, i) => `${i},x`)].join('\n')
    const p = parseCsvPreview(text, 50)
    expect(p.rows).toHaveLength(50)
    expect(p.totalRows).toBe(120)
    expect(parseCsvPreview('')).toEqual({ headers: [], rows: [], totalRows: 0 })
  })

  it('extracts summary metrics that are present', () => {
    const m = summaryMetrics({ patrols: 47, observations: 312, high_severity_incidents: 8, grts_coverage_pct: 0.784, distance_km: 370.25, cells_visited: 88, cells_total: 131, by_week: [] })
    expect(m.map((x) => x.key)).toEqual(['patrols', 'observations', 'high_severity_incidents', 'grts_coverage_pct', 'distance_km', 'cells'])
    expect(m.find((x) => x.key === 'grts_coverage_pct')?.value).toBe('78%')
    expect(m.find((x) => x.key === 'high_severity_incidents')?.tone).toBe('danger')
    expect(m.find((x) => x.key === 'cells')?.value).toBe('88 of 131')
    expect(summaryMetrics(undefined)).toEqual([])
  })

  it('builds chart series and folds long tails', () => {
    const s = summarySeries({ by_week: [{ week: '2026-W37', observations: 5 }], incidents_by_type: [{ type: 'fence_cut', count: 2 }], risk_trend: [{ date: '2026-08-16', mean_score: 4.9 }] })
    expect(s.byWeek[0]).toMatchObject({ label: 'W37', value: 5 })
    expect(s.incidents[0].name).toBe('Fence cut')
    expect(s.riskTrend[0].label).toBe('16 Aug')
    expect(s.species).toEqual([])
    expect(weekLabel('nope')).toBe('nope')
    const t = topWithOther([{ name: 'a', count: 1 }, { name: 'b', count: 5 }, { name: 'c', count: 3 }, { name: 'd', count: 2 }], 2)
    expect(t).toEqual([{ name: 'b', count: 5 }, { name: 'c', count: 3 }, { name: 'Other (2)', count: 3 }])
  })

  it('counts GeoJSON features by kind', () => {
    const s = geojsonStats({ features: [{ geometry: null, properties: { kind: 'track' } }, { geometry: {}, properties: { kind: 'cell' } }, { geometry: {}, properties: {} }] })
    expect(s).toEqual({ total: 3, byKind: { track: 1, cell: 1, feature: 1 }, withoutGeometry: 1 })
  })

  it('builds file names and share URLs', () => {
    expect(reportFileName({ type: 'patrol_summary', format: 'pdf', params: { date_from: '2026-08-01', date_to: '2026-08-31' } })).toBe('patroliq-patrol_summary-2026-08-01-2026-08-31.pdf')
    expect(shareUrl('https://dash.example/', 'ab c')).toBe('https://dash.example/reports/shared/ab%20c')
  })
})
