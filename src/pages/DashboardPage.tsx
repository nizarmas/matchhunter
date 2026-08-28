import { MatchCard } from '../components/MatchCard'
import { useApp } from '../context/AppContext'

export function DashboardPage() {
  const { t, matches, refreshMatches, hasMembership, notifications, markNotificationsRead } = useApp()
  const adminNotes = notifications.filter((n) => n.type === 'admin' && !n.read)
  return (
    <div>
      {adminNotes.length > 0 && (
        <div className="mb-4 space-y-2">
          {adminNotes.map((n) => (
            <div key={n.id} className="rounded-2xl bg-wine/10 px-4 py-3 text-sm">
              <p className="font-bold">{t.adminMsg}</p>
              <p className="mt-1">{n.body}</p>
            </div>
          ))}
          <button type="button" onClick={markNotificationsRead} className="text-xs font-semibold text-wine">
            {t.continue}
          </button>
        </div>
      )}
      {!hasMembership && (
        <p className="mb-4 rounded-2xl bg-gold/20 px-4 py-3 text-sm font-semibold">{t.unlockExplain}</p>
      )}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl md:text-4xl">{t.curated}</h1>
          <p className="mt-1 max-w-lg text-sm text-ink/60">{t.inboxHint}</p>
        </div>
        <button
          type="button"
          onClick={refreshMatches}
          className="rounded-full bg-mist px-4 py-2 text-sm font-semibold"
        >
          {t.refresh}
        </button>
      </div>
      {matches.length === 0 ? (
        <div className="rounded-3xl bg-card p-8 text-ink/60">{t.noMatches}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}
