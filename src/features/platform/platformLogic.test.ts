import { describe, expect, it } from 'vitest'
import {
  deriveStatus, flattenFieldErrors, graceDaysLeft, isExpired, licenceDate, modulesSummary, normaliseCode, normaliseUsage, parseLimit,
  seatUsage, statusFromDates, suspensionCause, syncLabel, validateEmail, validateOrgCode,
} from './platformLogic'

const now = new Date('2026-09-15T12:00:00Z')
const lic = (expires_at: string, grace_days = 14, status = 'active') => ({ expires_at, grace_days, status })

describe('deriveStatus', () => {
  it('is active before expiry', () => {
    expect(deriveStatus('active', lic('2027-09-30T23:59:59Z'), now)).toBe('active')
  })
  it('is grace after expiry and within grace days', () => {
    expect(deriveStatus('active', lic('2026-09-02T23:59:59Z', 30), now)).toBe('grace')
  })
  it('is suspended once expiry + grace has passed', () => {
    expect(deriveStatus('active', lic('2026-06-14T23:59:59Z', 30), now)).toBe('suspended')
  })
  it('respects manual suspension and missing licence', () => {
    expect(deriveStatus('suspended', lic('2027-09-30T23:59:59Z'), now)).toBe('suspended')
    expect(deriveStatus('active', lic('2027-09-30T23:59:59Z', 14, 'suspended'), now)).toBe('suspended')
    expect(deriveStatus('active', null, now)).toBe('suspended')
  })
  it('respects manual grace', () => {
    expect(deriveStatus('grace', lic('2027-09-30T23:59:59Z'), now)).toBe('grace')
  })
  it('treats the grace boundary as inclusive', () => {
    expect(deriveStatus('active', lic('2026-09-01T12:00:00Z', 14), now)).toBe('grace')
  })
})

describe('suspension helpers', () => {
  it('distinguishes expired from manual suspension', () => {
    expect(suspensionCause('suspended', lic('2026-06-14T23:59:59Z', 30), now)).toBe('expired')
    expect(suspensionCause('suspended', lic('2027-06-14T23:59:59Z', 30, 'suspended'), now)).toBe('manual')
    expect(suspensionCause('active', lic('2027-06-14T23:59:59Z'), now)).toBeNull()
    expect(suspensionCause('suspended', null, now)).toBe('no_licence')
  })
  it('previews status from dates only', () => {
    expect(statusFromDates(lic('2027-06-14T23:59:59Z', 30, 'suspended'), now)).toBe('active')
  })
  it('counts grace days left', () => {
    expect(graceDaysLeft(lic('2026-09-10T12:00:00Z', 14), now)).toBe(9)
    expect(graceDaysLeft({ expires_at: null }, now)).toBeNull()
  })
  it('detects expiry', () => {
    expect(isExpired('2026-09-14T00:00:00Z', now)).toBe(true)
    expect(isExpired('2026-09-16T00:00:00Z', now)).toBe(false)
    expect(isExpired(null, now)).toBe(false)
  })
})

describe('seatUsage', () => {
  it('computes ratio and level', () => {
    expect(seatUsage(34, 50)).toMatchObject({ pct: 0.68, level: 'ok' })
    expect(seatUsage(9, 10).level).toBe('near')
    expect(seatUsage(10, 10).level).toBe('full')
    expect(seatUsage(12, 10).level).toBe('over')
  })
  it('handles zero and missing limits', () => {
    expect(seatUsage(0, 0)).toMatchObject({ pct: 0, level: 'none' })
    expect(seatUsage(3, 0)).toMatchObject({ pct: 1, level: 'over' })
    expect(seatUsage(undefined, null)).toMatchObject({ used: 0, limit: 0 })
  })
})

describe('organisation code', () => {
  it('normalises input', () => {
    expect(normaliseCode(' crc 01 ')).toBe('CRC01')
  })
  it('validates format and uniqueness', () => {
    expect(validateOrgCode('')).toMatch(/Enter/)
    expect(validateOrgCode('A')).toMatch(/at least 2/)
    expect(validateOrgCode('CR.C')).toMatch(/capital letters/)
    expect(validateOrgCode('crc')).toMatch(/capital letters/)
    expect(validateOrgCode('X'.repeat(33))).toMatch(/32/)
    expect(validateOrgCode('GRTTS', ['grtts'])).toMatch(/already/)
    expect(validateOrgCode('MAPT-2', ['GRTTS'])).toBeNull()
  })
})

describe('form helpers', () => {
  it('parses limits', () => {
    expect(parseLimit('12')).toBe(12)
    expect(parseLimit(' 0 ')).toBe(0)
    expect(parseLimit('-1')).toBeNull()
    expect(parseLimit('1.5')).toBeNull()
    expect(parseLimit('')).toBeNull()
  })
  it('validates email', () => {
    expect(validateEmail('')).toMatch(/Enter/)
    expect(validateEmail('a@b')).toMatch(/valid/)
    expect(validateEmail('admin@crc.org.zw')).toBeNull()
  })
  it('summarises modules', () => {
    expect(modulesSummary(['ai_risk', 'species_id', 'voice', 'grts', 'collars', 'reports'])).toBe('All modules')
    expect(modulesSummary(['grts', 'ai_risk', 'species_id'])).toBe('3 of 6 modules')
    expect(modulesSummary([])).toBe('No modules')
  })
  it('flattens nested API field errors', () => {
    expect(
      flattenFieldErrors({
        name: ['This field may not be blank.'],
        licence: { expires_at: ['This field is required.'] },
        admin: { email: ['Already in use.'] },
        non_field_errors: ['Nope.'],
      }),
    ).toEqual({ name: 'This field may not be blank.', 'licence.expires_at': 'This field is required.', 'admin.email': 'Already in use.', _: 'Nope.' })
    expect(flattenFieldErrors(undefined)).toEqual({})
  })
})

describe('licenceDate', () => {
  it('formats the UTC calendar day', () => {
    expect(licenceDate('2027-09-30T23:59:59Z')).toBe('30 Sep 2027')
    expect(licenceDate('2026-01-01T00:00:00Z', { year: false })).toBe('1 Jan')
    expect(licenceDate(new Date('2026-09-27T23:59:59Z'))).toBe('27 Sep 2026')
    expect(licenceDate(null)).toBe('—')
  })
})

describe('syncLabel', () => {
  const local = new Date(2026, 8, 15, 12, 0)
  it('labels recent syncs relative to today', () => {
    expect(syncLabel(new Date(2026, 8, 15, 8, 2).toISOString(), local)).toBe('Today 08:02')
    expect(syncLabel(new Date(2026, 8, 14, 17, 40).toISOString(), local)).toBe('Yesterday 17:40')
    expect(syncLabel(new Date(2026, 8, 3, 14, 10).toISOString(), local)).toBe('3 Sep 14:10')
    expect(syncLabel(new Date(2025, 8, 3, 14, 10).toISOString(), local)).toBe('3 Sep 2025')
    expect(syncLabel(null, local)).toBe('Never')
  })
})

describe('normaliseUsage', () => {
  it('maps the nested API shape', () => {
    expect(
      normaliseUsage({
        seats: { rangers_used: 9, max_rangers: 50, managers_used: 2, max_managers: 10 },
        areas: { total: 3, active: 1, archived: 1, max_areas: 5 },
        last_sync_at: '2026-09-15T12:13:51Z',
      }),
    ).toEqual({ rangers: 9, managers: 2, areas: 2, archivedAreas: 1, activeDevices: null, lastSyncAt: '2026-09-15T12:13:51Z' })
  })
  it('accepts the flat types.ts shape', () => {
    expect(normaliseUsage({ rangers: 4, managers: 1, areas: 2 as never, active_devices: 3 })).toMatchObject({ rangers: 4, areas: 2, activeDevices: 3 })
    expect(normaliseUsage(null)).toBeNull()
  })
})
