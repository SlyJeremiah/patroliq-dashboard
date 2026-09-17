import { describe, expect, it } from 'vitest'
import { resolveApiRequest } from '@/api/client'
import type { AlertItem, Observation, RangerLive } from '@/api/types'
import {
  alarmAlerts, bearingDeg, chipCounts, compass, filterAlerts, filterRangers, formatElapsed, haversineM, interpolateAt, lastSeen,
  mergeAlerts, nearestRangers, observationCategoryCounts, observationPoints, observationSince, observerName, openSosAlerts, sexSummary, signalLabel, sortAlerts,
  sortRangers, stationarySince, statusCounts, toTimed, trackCandidates, trailUntil,
} from './opsLogic'

const alert = (p: Partial<AlertItem>): AlertItem => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  type: 'threat',
  kind: 'snare',
  status: 'active',
  severity: 'high',
  occurred_at: '2026-09-15T08:00:00Z',
  ...p,
})

const ranger = (p: Partial<RangerLive>): RangerLive => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  full_name: 'Ranger',
  status: 'active',
  last_position: null,
  current_patrol: null,
  today: { distance_m: 0, observations: 0, patrols: 0, cells_visited: [] },
  ...p,
})

describe('sortAlerts', () => {
  it('orders Critical → High → Medium → Low, then most recent first', () => {
    const list = [
      alert({ id: 'low', severity: 'low', occurred_at: '2026-09-15T10:00:00Z' }),
      alert({ id: 'high-old', severity: 'high', occurred_at: '2026-09-14T10:00:00Z' }),
      alert({ id: 'crit', severity: 'critical', occurred_at: '2026-09-13T10:00:00Z' }),
      alert({ id: 'high-new', severity: 'high', occurred_at: '2026-09-15T09:00:00Z' }),
      alert({ id: 'med', severity: 'medium' }),
    ]
    expect(sortAlerts(list).map((a) => a.id)).toEqual(['crit', 'high-new', 'high-old', 'med', 'low'])
  })

  it('does not mutate the input', () => {
    const list = [alert({ severity: 'low' }), alert({ severity: 'critical' })]
    sortAlerts(list)
    expect(list[0]!.severity).toBe('low')
  })
})

describe('alert selection', () => {
  const list = [
    alert({ id: 'sos-active', type: 'safety', kind: 'panic', severity: 'critical', occurred_at: '2026-09-15T08:00:00Z' }),
    alert({ id: 'dms-ack', type: 'safety', kind: 'dead_mans_switch', severity: 'critical', status: 'acknowledged', occurred_at: '2026-09-15T09:00:00Z' }),
    alert({ id: 'sos-cancelled', type: 'safety', kind: 'panic', severity: 'critical', status: 'cancelled' }),
    alert({ id: 'snare', severity: 'high' }),
  ]

  it('open SOS alerts include acknowledged ones, newest first', () => {
    expect(openSosAlerts(list).map((a) => a.id)).toEqual(['dms-ack', 'sos-active'])
  })

  it('only unacknowledged SOS alerts sound the alarm', () => {
    expect(alarmAlerts(list).map((a) => a.id)).toEqual(['sos-active'])
  })

  it('counts filter chips', () => {
    expect(chipCounts(list)).toEqual({ all: 4, critical: 3, high: 1, safety: 3 })
  })

  it('merges lists by id', () => {
    const updated = alert({ id: 'snare', status: 'acknowledged' })
    const merged = mergeAlerts(list, [updated])
    expect(merged).toHaveLength(4)
    expect(merged.find((a) => a.id === 'snare')!.status).toBe('acknowledged')
  })

  it('filters by tab, severity, type and search (incl. cell label lookup)', () => {
    const base = { tab: 'all' as const, severities: [], type: 'all' as const, search: '' }
    expect(filterAlerts(list, { ...base, tab: 'acknowledged' }).map((a) => a.id)).toEqual(['dms-ack'])
    expect(filterAlerts(list, { ...base, type: 'threat' }).map((a) => a.id)).toEqual(['snare'])
    expect(filterAlerts(list, { ...base, severities: ['high'] }).map((a) => a.id)).toEqual(['snare'])
    expect(filterAlerts(list, { ...base, search: "dead man" }).map((a) => a.id)).toEqual(['dms-ack'])
    const withCell = [alert({ id: 'c', cell_id: 'cell-1' })]
    expect(filterAlerts(withCell, { ...base, search: 'grts-047' }, (id) => (id === 'cell-1' ? 'GRTS-047' : undefined))).toHaveLength(1)
  })
})

describe('rangers', () => {
  const rangers = [
    ranger({ id: 'a', full_name: 'Tendai Moyo', status: 'active', team_id: 't1', current_patrol: { client_uuid: 'p-a', started_at: '', status: 'active', distance_m: 0, patrol_type: 'foot' } }),
    ranger({ id: 'b', full_name: 'Farai Ncube', status: 'sos', team_id: 't2', current_patrol: { client_uuid: 'p-b', started_at: '', status: 'active', distance_m: 0, patrol_type: 'foot' } }),
    ranger({ id: 'c', full_name: 'Rudo Chikore', status: 'offline', team_id: 't1', employee_id: 'RGR-2026-042' }),
    ranger({ id: 'd', full_name: 'Sipho Ndlovu', status: 'paused', team_id: 't2' }),
    ranger({ id: 'e', full_name: 'Nyasha Dube', status: 'online', team_id: 't1' }),
  ]

  it('counts statuses', () => {
    expect(statusCounts(rangers)).toEqual({ active: 1, paused: 1, online: 1, offline: 1, sos: 1, total: 5 })
  })

  it('sorts SOS → active → paused → online → offline', () => {
    expect(sortRangers(rangers).map((r) => r.id)).toEqual(['b', 'a', 'd', 'e', 'c'])
  })

  it('filters by team, status and search', () => {
    expect(filterRangers(rangers, { teamId: 't1' }).map((r) => r.id)).toEqual(['a', 'c', 'e'])
    expect(filterRangers(rangers, { statuses: ['online'] }).map((r) => r.id)).toEqual(['e'])
    expect(filterRangers(rangers, { statuses: ['sos', 'paused'] }).map((r) => r.id)).toEqual(['b', 'd'])
    expect(filterRangers(rangers, { search: 'rgr-2026-042' }).map((r) => r.id)).toEqual(['c'])
  })

  it('picks track candidates with SOS first and a cap', () => {
    expect(trackCandidates(rangers)).toEqual(['p-b', 'p-a'])
    expect(trackCandidates(rangers, 1)).toEqual(['p-b'])
  })

  it('last seen is the later of ping and sync', () => {
    expect(lastSeen({ last_position: { lat: 0, lon: 0, recorded_at: '2026-09-15T10:00:00Z' }, last_sync_at: '2026-09-15T09:00:00Z' })).toBe('2026-09-15T10:00:00Z')
    expect(lastSeen({ last_position: null, last_sync_at: '2026-09-15T09:00:00Z' })).toBe('2026-09-15T09:00:00Z')
    expect(lastSeen({ last_position: null, last_sync_at: null })).toBeNull()
  })
})

describe('geometry', () => {
  it('haversine: 0.01° of latitude ≈ 1.11 km', () => {
    expect(haversineM({ lat: -17.5, lon: 30.95 }, { lat: -17.51, lon: 30.95 })).toBeCloseTo(1112, -1)
  })

  it('bearing and compass', () => {
    const o = { lat: -17.5, lon: 30.95 }
    expect(compass(bearingDeg(o, { lat: -17.4, lon: 30.95 }))).toBe('N')
    expect(compass(bearingDeg(o, { lat: -17.5, lon: 31.05 }))).toBe('E')
    expect(compass(bearingDeg(o, { lat: -17.6, lon: 31.05 }))).toBe('SE')
    expect(compass(359)).toBe('N')
  })

  it('nearest rangers excludes the SOS ranger and ranks offline last', () => {
    const from = { lat: -17.5, lon: 30.95 }
    const pos = (lat: number, lon: number) => ({ lat, lon, recorded_at: '2026-09-15T08:00:00Z' })
    const list = [
      ranger({ id: 'self', status: 'sos', last_position: pos(-17.5, 30.95) }),
      ranger({ id: 'far', status: 'active', last_position: pos(-17.55, 30.95) }),
      ranger({ id: 'near-offline', status: 'offline', last_position: pos(-17.501, 30.95) }),
      ranger({ id: 'near', status: 'paused', last_position: pos(-17.51, 30.95) }),
      ranger({ id: 'nopos', status: 'active' }),
    ]
    const res = nearestRangers(list, from, { excludeId: 'self', limit: 5 })
    expect(res.map((n) => n.ranger.id)).toEqual(['near', 'far', 'near-offline'])
    expect(res[0]!.direction).toBe('S')
    expect(nearestRangers(list, from, { excludeId: 'self', includeOffline: false }).map((n) => n.ranger.id)).toEqual(['near', 'far'])
  })
})

describe('replay', () => {
  const history = toTimed([
    { recorded_at: '2026-09-15T08:10:00Z', lat: -17.52, lon: 30.97 },
    { recorded_at: '2026-09-15T08:00:00Z', lat: -17.5, lon: 30.95 },
    { recorded_at: 'bad', lat: 0, lon: 0 },
    { recorded_at: '2026-09-15T08:20:00Z', lat: -17.52, lon: 30.97 },
  ])

  it('sorts and drops invalid timestamps', () => {
    expect(history.map((p) => p.lat)).toEqual([-17.5, -17.52, -17.52])
  })

  it('interpolates between pings and clamps outside the range', () => {
    const mid = interpolateAt(history, Date.parse('2026-09-15T08:05:00Z'))!
    expect(mid.lat).toBeCloseTo(-17.51, 6)
    expect(mid.lon).toBeCloseTo(30.96, 6)
    expect(mid.index).toBe(0)
    expect(interpolateAt(history, Date.parse('2026-09-15T07:00:00Z'))).toMatchObject({ lat: -17.5, index: -1 })
    expect(interpolateAt(history, Date.parse('2026-09-15T09:00:00Z'))).toMatchObject({ lat: -17.52, index: 2 })
    expect(interpolateAt([], 0)).toBeNull()
  })

  it('builds the trail up to the replay time', () => {
    const trail = trailUntil(history, Date.parse('2026-09-15T08:05:00Z'))
    expect(trail).toHaveLength(2)
    expect(trail[1]![0]).toBeCloseTo(-17.51, 6)
    expect(trailUntil(history, Date.parse('2026-09-15T07:00:00Z'))).toEqual([])
  })

  it('finds when the ranger stopped moving', () => {
    expect(stationarySince(history)).toBe(Date.parse('2026-09-15T08:10:00Z'))
    expect(stationarySince([])).toBeNull()
  })
})

describe('formatting', () => {
  it('formats elapsed time', () => {
    expect(formatElapsed(220_000)).toBe('3 min 40 s')
    expect(formatElapsed(3 * 3600_000 + 5 * 60_000)).toBe('3 h 5 min')
    expect(formatElapsed(-1)).toBe('—')
  })

  it('labels signal levels', () => {
    expect(signalLabel(1)).toBe('Weak')
    expect(signalLabel(null)).toBe('Unknown')
  })
})

const observation = (p: Partial<Observation>): Observation => ({
  client_uuid: p.client_uuid ?? Math.random().toString(36).slice(2),
  area_id: 'area-1',
  category: 'wildlife',
  alert_manager: false,
  lat: -17.5,
  lon: 30.95,
  recorded_at: '2026-09-15T08:00:00Z',
  ...p,
})

describe('observations', () => {
  it('builds observation map points coloured by category, oldest first', () => {
    const pts = observationPoints([
      observation({ client_uuid: 'new', category: 'threat', subtype: 'snare', recorded_at: '2026-09-15T10:00:00Z' }),
      observation({ client_uuid: 'old', species_name: 'Elephant', count: 4, recorded_at: '2026-09-15T07:00:00Z' }),
      observation({ client_uuid: 'bad', lat: Number.NaN }),
    ])
    expect(pts.map((p) => p.id)).toEqual(['old', 'new'])
    expect(pts[0]).toMatchObject({ kind: 'observation', color: '#2D6A4F', icon: 'pets', label: 'Elephant · 4' })
    expect(pts[1]).toMatchObject({ kind: 'observation', color: '#C0392B', label: 'Snare found' })
  })

  it('counts categories in a fixed order', () => {
    expect(observationCategoryCounts([observation({ category: 'threat' }), observation({}), observation({ category: 'threat' })])).toEqual([
      { category: 'wildlife', count: 1 },
      { category: 'threat', count: 2 },
    ])
  })

  it('resolves the observer name from the ranger list when the API omits it', () => {
    const rangers = [{ id: 'r1', full_name: 'Tendai Moyo' }]
    expect(observerName({ observer_name: 'Given Name', observer_id: 'r1' }, rangers)).toBe('Given Name')
    expect(observerName({ observer_id: 'r1' }, rangers)).toBe('Tendai Moyo')
    expect(observerName({ observer_id: 'r2' }, rangers)).toBeNull()
    expect(observerName({}, rangers)).toBeNull()
  })

  it('summarises sex counts', () => {
    expect(sexSummary({ male_count: 2, female_count: 1, sex: 'mixed' })).toBe('2 male, 1 female')
    expect(sexSummary({ sex: 'female' })).toBe('female')
    expect(sexSummary({})).toBeNull()
  })

  it('computes a stable period start', () => {
    const now = Date.parse('2026-09-15T10:03:27Z')
    expect(observationSince('24h', now)).toBe('2026-09-14T10:00:00.000Z')
    expect(observationSince('24h', now + 60_000)).toBe(observationSince('24h', now))
    expect(observationSince('7d', now)).toBe('2026-09-08T10:00:00.000Z')
    const today = new Date(observationSince('today', now))
    expect([today.getHours(), today.getMinutes()]).toEqual([0, 0])
  })
})

describe('media requests', () => {
  const base = 'https://api.example.org/api/v1/'
  it('sends the token only to URLs under the API base', () => {
    expect(resolveApiRequest('https://api.example.org/api/v1/media/m1/file/', base)).toEqual({ url: 'https://api.example.org/api/v1/media/m1/file/', withToken: true })
    expect(resolveApiRequest('media/m1/file/', base)).toEqual({ url: 'https://api.example.org/api/v1/media/m1/file/', withToken: true })
    expect(resolveApiRequest('https://cdn.example.com/photo.jpg', base)).toEqual({ url: 'https://cdn.example.com/photo.jpg', withToken: false })
    expect(resolveApiRequest('https://api.example.org/other/m1', base).withToken).toBe(false)
  })

  it('re-points an API path on another origin at the configured base', () => {
    expect(resolveApiRequest('http://internal:8000/api/v1/media/m1/file/?x=1', base)).toEqual({ url: 'https://api.example.org/api/v1/media/m1/file/?x=1', withToken: true })
  })
})
