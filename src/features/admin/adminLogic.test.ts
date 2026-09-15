import { describe, expect, it } from 'vitest'
import type { User } from '@/api/types'
import {
  actionLabel, actorText, activationProblems, boundaryErrorMessage, countBy, fileExtension, filterUsers, formatCellSize, formatKm2,
  lastLoginByActor, loginLabel, nextBaseCode, nextEmployeeId, parseCandidateFeatures, parseLatLon, precheckBoundaryFile, seatUsage, setupProgress, targetText,
  userStatus,
} from './adminLogic'

const user = (o: Partial<User>): User => ({ id: 'u', full_name: 'X', role: 'ranger', language: 'en', is_active: true, area_ids: [], ...o })

describe('setup progress', () => {
  it('uses area.setup and finds the next step', () => {
    expect(setupProgress({ setup: { boundary: true, bases: false, grid: false, teams: false } })).toMatchObject({ done: 1, next: 'bases' })
    expect(setupProgress({ setup: { boundary: true, bases: true, grid: true, teams: true } })).toMatchObject({ done: 4, next: null })
  })
  it('falls back to counters', () => {
    const r = setupProgress({ boundary: { type: 'MultiPolygon', coordinates: [] }, apu_base_count: 2, cell_count: 0, team_count: 0 })
    expect(r.done).toBe(2)
    expect(r.next).toBe('grid')
  })
  it('explains area_not_ready fields', () => {
    expect(activationProblems({ apu_bases: ['At least one APU base is required.'], grid: ['A GRTS grid is required.'] })).toEqual([
      'APU bases: At least one APU base is required.',
      'GRTS grid: A GRTS grid is required.',
    ])
    expect(activationProblems(undefined)).toEqual([])
  })
})

describe('formatting', () => {
  it('formats km² and cell sizes', () => {
    expect(formatKm2(114.7569)).toBe('115 km²')
    expect(formatKm2(96.44)).toBe('96.4 km²')
    expect(formatKm2(1.234)).toBe('1.23 km²')
    expect(formatKm2(1234.5)).toBe('1,235 km²')
    expect(formatKm2(null)).toBe('—')
    expect(formatCellSize(500)).toBe('500 m')
    expect(formatCellSize(1000)).toBe('1 km')
    expect(formatCellSize(2500)).toBe('2.5 km')
  })
})

describe('boundary import', () => {
  it('prechecks extension and size', () => {
    expect(fileExtension('Chewore.North.ZIP')).toBe('.zip')
    expect(precheckBoundaryFile({ name: 'a.kmz', size: 10 })).toBeNull()
    expect(precheckBoundaryFile({ name: 'a.shp', size: 10 })).toBe('unsupported_file_type')
    expect(precheckBoundaryFile({ name: 'a.geojson', size: 60 * 1024 * 1024 })).toBe('file_too_large')
  })
  it('has plain-language copy for every documented code', () => {
    for (const code of ['invalid_file', 'invalid_crs', 'no_polygons', 'unsupported_file_type', 'file_too_large', 'invalid_feature_index']) {
      const m = boundaryErrorMessage(code)
      expect(m.title.length).toBeGreaterThan(5)
      expect(m.text).not.toMatch(/_/)
    }
    expect(boundaryErrorMessage('weird', 'Server said no').text).toBe('Server said no')
  })
  it('parses candidate features', () => {
    expect(parseCandidateFeatures({ features: [{ index: 1, name: 'Block B', area_km2: 96 }, { index: 0, name: '', area_km2: null }] })).toEqual([
      { index: 0, name: 'Feature 1', area_km2: null },
      { index: 1, name: 'Block B', area_km2: 96 },
    ])
    expect(parseCandidateFeatures({})).toEqual([])
  })
})

describe('grid', () => {
  it('suggests base codes and parses coordinates', () => {
    expect(nextBaseCode(['APU-1', 'APU-3', 'HQ'])).toBe('APU-4')
    expect(nextBaseCode([])).toBe('APU-1')
    expect(parseLatLon('-17.5', '30.95')).toEqual({ lat: -17.5, lon: 30.95 })
    expect(parseLatLon('', '30')).toBeNull()
    expect(parseLatLon('-95', '30')).toBeNull()
    expect(parseLatLon('abc', '30')).toBeNull()
  })
  it('counts cells per base', () => {
    expect(countBy([{ b: 'x' }, { b: 'y' }, { b: 'x' }, { b: null }], (i) => i.b)).toEqual({ x: 2, y: 1, '': 1 })
  })
})

describe('users', () => {
  it('generates the next employee id per role and year', () => {
    expect(nextEmployeeId(['RGR-2026-041', 'rgr-2026-048', 'RGR-2025-090', 'MGR-2026-003', null], 'ranger', 2026)).toBe('RGR-2026-049')
    expect(nextEmployeeId([], 'viewer', 2026)).toBe('NGO-2026-001')
  })
  it('derives status', () => {
    expect(userStatus({ is_active: false })).toBe('suspended')
    expect(userStatus({ is_active: true })).toBe('active')
    expect(userStatus({ is_active: true, status: 'pending_first_login' })).toBe('pending')
  })
  it('filters and sorts by employee id', () => {
    const users = [
      user({ id: '1', employee_id: 'RGR-2026-041', full_name: 'Tendai Moyo' }),
      user({ id: '2', employee_id: 'ADM-2026-001', full_name: 'Tafadzwa Shumba', role: 'org_admin' }),
      user({ id: '3', employee_id: 'RGR-2026-038', full_name: 'Farai Ncube', is_active: false }),
    ]
    expect(filterUsers(users, {}).map((u) => u.id)).toEqual(['2', '3', '1'])
    expect(filterUsers(users, { role: 'ranger' }).map((u) => u.id)).toEqual(['3', '1'])
    expect(filterUsers(users, { status: 'suspended' }).map((u) => u.id)).toEqual(['3'])
    expect(filterUsers(users, { search: '041' }).map((u) => u.id)).toEqual(['1'])
    expect(filterUsers(users, { search: 'shumba' }).map((u) => u.id)).toEqual(['2'])
  })
  it('counts seats for active users only', () => {
    expect(seatUsage([user({}), user({ is_active: false }), user({ role: 'viewer' }), user({ role: 'manager' })])).toEqual({ rangers: 1, managers: 2 })
  })
  it('finds last login per actor', () => {
    const r = lastLoginByActor([
      { actor_id: 'a', action: 'auth.login', created_at: '2026-09-14T08:00:00Z' },
      { actor_id: 'a', action: 'auth.login', created_at: '2026-09-15T08:00:00Z' },
      { actor_id: 'b', action: 'auth.logout', created_at: '2026-09-15T09:00:00Z' },
    ])
    expect(r).toEqual({ a: '2026-09-15T08:00:00Z' })
  })
  it('labels login times', () => {
    const now = new Date(2026, 8, 15, 12, 0)
    expect(loginLabel(new Date(2026, 8, 15, 7, 58).toISOString(), now)).toBe('Today 07:58')
    expect(loginLabel(new Date(2026, 8, 14, 17, 12).toISOString(), now)).toBe('Yesterday 17:12')
    expect(loginLabel(new Date(2026, 7, 28, 9, 0).toISOString(), now)).toBe('28 Aug 2026')
    expect(loginLabel(null, now)).toBe('—')
  })
})

describe('audit', () => {
  it('labels actions, actors and targets', () => {
    expect(actionLabel('area.boundary_import')).toBe('Imported boundary')
    expect(actionLabel('thing.did_stuff')).toBe('Thing did stuff')
    expect(actorText({ id: '1', action: 'x', created_at: '', actor_label: 'Grace Mutasa (MGR-2026-003)' })).toBe('Grace Mutasa (MGR-2026-003)')
    expect(actorText({ id: '1', action: 'x', created_at: '' })).toBe('System')
    expect(targetText({ target_type: 'areas.area', target_id: 'f8f55fd5-f11f-4e59' })).toBe('area f8f55fd5')
    expect(targetText({ target_type: null, target_id: null })).toBe('—')
  })
})
