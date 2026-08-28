import { HeartHandshake, Inbox, LayoutGrid, LogOut, Shield, UserRound } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { LanguageSwitcher } from './LanguageSwitcher'

const item = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col md:flex-row items-center gap-1 md:gap-2 rounded-2xl px-3 py-2 text-xs md:text-sm font-semibold transition ${
    isActive ? 'bg-wine text-paper' : 'text-ink/70 hover:bg-mist'
  }`

export function Shell() {
  const { t, inboxBadge, logout, isAdmin } = useApp()
  const nav = useNavigate()

  return (
    <div className="noise min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex items-center gap-2">
          <HeartHandshake className="size-6 text-wine" />
          <span className="display text-xl font-semibold">{t.brand}</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <button
            type="button"
            onClick={() => {
              logout()
              nav('/')
            }}
            className="rounded-full bg-mist px-3 py-1.5 text-sm font-semibold text-wine"
          >
            <span className="inline-flex items-center gap-1">
              <LogOut className="size-4" />
              {t.logout}
            </span>
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 md:grid-cols-[220px_1fr] md:px-8 md:pb-10">
        <aside className="hidden md:block">
          <nav className="sticky top-6 flex flex-col gap-1 rounded-3xl bg-card p-3 shadow-sm">
            <NavLink to="/app" end className={item}>
              <LayoutGrid className="size-4" />
              {t.matches}
            </NavLink>
            <NavLink to="/app/approvals" className={item}>
              <Inbox className="size-4" />
              {t.approvals}
              {inboxBadge > 0 && (
                <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] text-ink">{inboxBadge}</span>
              )}
            </NavLink>
            <NavLink to="/app/profile" className={item}>
              <UserRound className="size-4" />
              {t.profile}
            </NavLink>
            {isAdmin && (
              <NavLink to="/app/admin" className={item}>
                <Shield className="size-4" />
                {t.admin}
              </NavLink>
            )}
            <button
              type="button"
              onClick={() => {
                logout()
                nav('/')
              }}
              className="mt-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-wine hover:bg-mist"
            >
              <LogOut className="size-4" />
              {t.logout}
            </button>
          </nav>
        </aside>
        <main>
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-mist bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg justify-around px-2 py-2">
          <NavLink to="/app" end className={item}>
            <LayoutGrid className="size-5" />
            {t.matches}
          </NavLink>
          <NavLink to="/app/approvals" className={item}>
            <span className="relative">
              <Inbox className="size-5" />
              {inboxBadge > 0 && (
                <span className="absolute -end-2 -top-1 min-w-4 rounded-full bg-wine px-1 text-center text-[10px] font-bold leading-4 text-paper">
                  {inboxBadge}
                </span>
              )}
            </span>
            {t.approvals}
          </NavLink>
          <NavLink to="/app/profile" className={item}>
            <UserRound className="size-5" />
            {t.profile}
          </NavLink>
          {isAdmin && (
            <NavLink to="/app/admin" className={item}>
              <Shield className="size-5" />
              {t.admin}
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  )
}
