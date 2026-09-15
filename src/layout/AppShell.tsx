import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { useAlerts, LIVE_REFRESH_MS } from '@/api/hooks'
import { API_BASE } from '@/api/client'
import { roleLabel, useAuth, MANAGER_ROLES, ADMIN_ROLES } from '@/auth/AuthContext'
import { useArea } from '@/auth/AreaContext'
import { Avatar, Banner, Icon } from '@/components/ui'
import { fmt, roleColor } from '@/lib/format'
import type { Role } from '@/api/types'

interface NavItem {
  to: string
  label: string
  icon: string
  roles?: Role[]
  module?: string
}

const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Map', icon: 'map', roles: MANAGER_ROLES },
  { to: '/live', label: 'Live operations', icon: 'radar', roles: MANAGER_ROLES },
  { to: '/alerts', label: 'Alerts', icon: 'notifications', roles: MANAGER_ROLES },
  { to: '/intelligence', label: 'Intelligence', icon: 'psychology', roles: ['org_admin', 'manager', 'researcher'], module: 'ai_risk' },
  { to: '/coverage', label: 'GRTS coverage', icon: 'grid_on', roles: ['org_admin', 'manager', 'researcher'], module: 'grts' },
  { to: '/reports', label: 'Reports', icon: 'assessment', roles: ['org_admin', 'manager', 'researcher', 'viewer'] },
  { to: '/rangers', label: 'Rangers', icon: 'badge', roles: MANAGER_ROLES },
  { to: '/collars', label: 'Collars', icon: 'pets', roles: ['org_admin', 'manager', 'researcher'], module: 'collars' },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/areas', label: 'Areas & bases', icon: 'fence', roles: MANAGER_ROLES },
  { to: '/users', label: 'Users', icon: 'manage_accounts', roles: ADMIN_ROLES },
  { to: '/audit', label: 'Audit log', icon: 'history', roles: MANAGER_ROLES },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const PLATFORM_NAV: NavItem[] = [
  { to: '/platform', label: 'Organisations', icon: 'domain' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

function useRefreshCountdown() {
  const qc = useQueryClient()
  const [left, setLeft] = useState(LIVE_REFRESH_MS / 1000)
  const lastRef = useRef(Date.now())
  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'success') lastRef.current = Date.now()
    })
    const t = setInterval(() => {
      setLeft(Math.max(0, Math.round((LIVE_REFRESH_MS - (Date.now() - lastRef.current)) / 1000)))
    }, 1000)
    return () => {
      unsub()
      clearInterval(t)
    }
  }, [qc])
  return left
}

function Header() {
  const { user, organisation, logout, hasRole } = useAuth()
  const { areas, area, setAreaId } = useArea()
  const location = useLocation()
  const fetching = useIsFetching()
  const left = useRefreshCountdown()
  const { data: activeAlerts } = useAlerts({ status: 'active', limit: 50 })
  const [menu, setMenu] = useState(false)
  const [areaMenu, setAreaMenu] = useState(false)
  const unread = hasRole('org_admin', 'manager') ? activeAlerts?.length ?? 0 : 0
  const platform = user?.role === 'platform_admin'

  useEffect(() => {
    setMenu(false)
    setAreaMenu(false)
  }, [location.pathname])

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-cream/10 bg-forest pr-5 pl-4 text-cream">
      <div className="flex w-[208px] items-center gap-2.5">
        <img src="/logo-64.png" alt="" className="h-9 w-9 rounded-full" />
        <div className="flex flex-col leading-tight">
          <span className="text-[16px] font-extrabold tracking-[0.14em]">PATROLIQ</span>
          <span className="text-[10px] font-medium tracking-[0.08em] text-cream/60">{platform ? 'zrGISsolutions' : organisation?.name}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1" />
      {!platform && areas.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setAreaMenu((v) => !v)}
            className="flex h-9 items-center gap-2 rounded-lg border border-cream/20 bg-cream/10 pr-2.5 pl-3 text-[13px] font-semibold"
            aria-haspopup="listbox"
            aria-expanded={areaMenu}
          >
            <Icon name="fence" size={16} className="text-emerald" />
            <span className="max-w-56 truncate">{area?.name ?? 'Choose area'}</span>
            <Icon name="expand_more" size={16} className="text-cream/70" />
          </button>
          {areaMenu && (
            <ul role="listbox" className="absolute top-11 right-0 w-72 overflow-hidden rounded-lg bg-white py-1 text-ink shadow-pop">
              {areas.map((a) => (
                <li key={a.id}>
                  <button
                    role="option"
                    aria-selected={a.id === area?.id}
                    onClick={() => {
                      setAreaId(a.id)
                      setAreaMenu(false)
                    }}
                    className={clsx('flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-mint', a.id === area?.id && 'bg-mint')}
                  >
                    <Icon name="fence" size={18} className="text-mid-green" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-small font-semibold">{a.name}</span>
                      <span className="truncate text-[12px] text-ink-3">{a.client_name ?? fmt.titleCase(a.area_type)}</span>
                    </span>
                    {a.status === 'draft' && <span className="rounded bg-black/5 px-1.5 text-[11px] font-bold uppercase text-ink-3">Draft</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!platform && (
        <div className="flex h-7 items-center gap-1.5 rounded-full bg-cream/10 px-2.5 text-[12px] font-semibold" aria-live="polite">
          <Icon name="refresh" size={14} className={clsx('text-emerald', fetching > 0 && 'animate-spin')} />
          {fetching > 0 ? 'Refreshing' : `Refresh in ${left}s`}
        </div>
      )}
      {!platform && (
        <NavLink to="/alerts" className="relative flex h-11 w-11 items-center justify-center rounded-lg hover:bg-cream/10" aria-label={`Alerts${unread ? `, ${unread} active` : ''}`}>
          <Icon name="notifications" size={22} />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-forest bg-danger px-1 text-[10px] font-bold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </NavLink>
      )}
      <div className="relative border-l border-cream/15 pl-3">
        <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2.5" aria-haspopup="menu" aria-expanded={menu}>
          {user && <Avatar name={user.full_name} color={roleColor[user.role]} size={32} />}
          <span className="flex flex-col text-left leading-tight">
            <span className="text-[13px] font-semibold">{user?.full_name}</span>
            <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-[#D7A9E0]">{user && roleLabel(user.role)}</span>
          </span>
          <Icon name="expand_more" size={18} className="text-cream/70" />
        </button>
        {menu && (
          <div role="menu" className="absolute top-12 right-0 w-56 overflow-hidden rounded-lg bg-white py-1 text-ink shadow-pop">
            <NavLink to="/settings" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-small hover:bg-mint">
              <Icon name="settings" size={18} /> Settings
            </NavLink>
            <button role="menuitem" onClick={() => void logout()} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-small hover:bg-mint">
              <Icon name="logout" size={18} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        clsx(
          'relative mx-2 flex h-11 items-center gap-3 rounded-lg px-4 text-[14px]',
          isActive ? 'bg-emerald/15 font-semibold text-cream' : 'font-medium text-cream/72 hover:bg-mint/10 hover:text-cream',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-emerald" />}
          <Icon name={item.icon} size={20} className={isActive ? 'text-emerald' : undefined} />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

function Sidebar() {
  const { user, organisation, licence, hasRole, hasModule } = useAuth()
  const visible = (i: NavItem) => (!i.roles || hasRole(...i.roles)) && (!i.module || hasModule(i.module))
  const platform = user?.role === 'platform_admin'
  const main = platform ? PLATFORM_NAV : MAIN_NAV.filter(visible)
  const admin = platform ? [] : ADMIN_NAV.filter(visible)
  return (
    <nav aria-label="Main" className="scroll-thin flex w-60 shrink-0 flex-col overflow-y-auto bg-forest pt-4">
      <div className="flex flex-col gap-0.5">{main.map((i) => <SideLink key={i.to} item={i} />)}</div>
      {admin.length > 0 && (
        <>
          <p className="px-6 pt-5 pb-2 text-[11px] font-semibold tracking-[0.08em] uppercase text-cream/45">Admin</p>
          <div className="flex flex-col gap-0.5">{admin.map((i) => <SideLink key={i.to} item={i} />)}</div>
        </>
      )}
      <div className="flex-1" />
      <div className="m-4 flex flex-col gap-1 rounded-lg bg-cream/6 p-3">
        <span className="text-[12px] font-bold tracking-[0.02em] text-cream">zrGISsolutions</span>
        <span className="text-[11px] text-cream/60">
          {platform ? 'Platform console' : `Licensed to ${organisation?.code ?? '—'} · ${fmt.titleCase(licence?.plan)} plan`}
        </span>
      </div>
    </nav>
  )
}

function Footer() {
  const { data: online } = { data: navigator.onLine }
  const host = (() => {
    try {
      return new URL(API_BASE).host
    } catch {
      return API_BASE
    }
  })()
  return (
    <footer className="flex h-8 shrink-0 items-center gap-5 bg-[#E9ECEF] px-5 text-[11px] text-ink-2">
      <span className="flex items-center gap-1.5">
        <span className="h-[7px] w-[7px] rounded-full" style={{ background: online ? '#27AE60' : '#E67E22' }} />
        {online ? 'Session active · expires after 8 h idle' : 'Offline — data may be out of date'}
      </span>
      <span className="flex-1" />
      <span className="flex items-center gap-1.5">
        <Icon name="dns" size={13} className="text-ink-3" />
        API {host}
      </span>
      <span>PATROLIQ · Slym Shanya · University of Zimbabwe</span>
    </footer>
  )
}

export function AppShell() {
  const { licence, organisation } = useAuth()
  const notice =
    organisation?.status === 'grace' || licence?.status === 'grace'
      ? { tone: 'warning' as const, text: `Your PatrolIQ licence has expired and is in its grace period. Renew with zrGISsolutions before ${fmt.date(licence?.expires_at)} + ${licence?.grace_days ?? 0} days.` }
      : null
  return (
    <div className="flex h-full min-h-[640px] min-w-[1180px] flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {notice && <div className="px-4 pt-3"><Banner tone={notice.tone}>{notice.text}</Banner></div>}
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  )
}
