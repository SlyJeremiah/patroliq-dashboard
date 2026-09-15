import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'

export const fmt = {
  date: (iso?: string | null) => (iso ? format(parseISO(iso), 'd MMM yyyy') : '—'),
  dateTime: (iso?: string | null) => (iso ? format(parseISO(iso), 'd MMM yyyy, HH:mm') : '—'),
  time: (iso?: string | null) => (iso ? format(parseISO(iso), 'HH:mm') : '—'),
  dayTime: (iso?: string | null) => (iso ? format(parseISO(iso), 'EEE d MMM, HH:mm') : '—'),
  ago: (iso?: string | null) => (iso ? `${formatDistanceToNowStrict(parseISO(iso))} ago` : '—'),
  km: (m?: number | null) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`),
  pct: (v?: number | null, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`),
  coord: (lat?: number | null, lon?: number | null, digits = 5) => (lat == null || lon == null ? '—' : `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`),
  bytes: (b?: number | null) => (b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`),
  duration: (seconds?: number | null) => {
    if (seconds == null) return '—'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h ? `${h} h ${m} m` : `${m} min`
  },
  titleCase: (s?: string | null) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'),
}

export const rangerStatusColor: Record<string, string> = {
  active: '#27AE60',
  paused: '#E67E22',
  sos: '#C0392B',
  offline: '#6C757D',
}

export const roleColor: Record<string, string> = {
  platform_admin: '#102C26',
  org_admin: '#2D6A4F',
  manager: '#7B2D8B',
  ranger: '#1A6496',
  researcher: '#6C757D',
  viewer: '#6C757D',
}

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
