import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { tPath } from '../i18n/translations'
import { OnlineBadge } from '../components/OnlineBadge'
import type { Match } from '../lib/types'

export function ApprovalsPage() {
  const { t, user, incoming, allMatches, messages, notifications } = useApp()
  const paid = incoming.filter((m) => m.status === 'selected_and_paid')
  const conversations = allMatches.filter(
    (m) =>
      m.status === 'partner_approved' &&
      user &&
      (m.userId === user.id || m.candidateId === user.id),
  )

  if (paid.length === 0 && conversations.length === 0) {
    return <p className="rounded-3xl bg-card p-8 text-ink/60">{t.emptyInbox}</p>
  }

  const sortedChats = [...conversations].sort((a, b) => {
    const la = lastMessage(messages, a.id)?.createdAt ?? a.approvedAt ?? a.createdAt
    const lb = lastMessage(messages, b.id)?.createdAt ?? b.approvedAt ?? b.createdAt
    return lb.localeCompare(la)
  })

  return (
    <div className="space-y-6">
      <h1 className="display text-3xl">{t.approvals}</h1>
      {paid.length > 0 && (
        <section className="space-y-4">
          {paid.map((m) => (
            <IncomingCard key={m.id} match={m} />
          ))}
        </section>
      )}
      {sortedChats.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{t.conversations}</h2>
          {sortedChats.map((m) => (
            <ConversationCard
              key={m.id}
              match={m}
              unread={notifications.filter((n) => n.type === 'message' && !n.read && n.matchId === m.id).length}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function lastMessage(messages: { matchId: string; createdAt: string }[], matchId: string) {
  return messages
    .filter((m) => m.matchId === matchId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

function IncomingCard({ match }: { match: Match }) {
  const { t, lang, profileById, decideIncoming, user } = useApp()
  const p = profileById(match.userId)
  const [shareEmail, setShareEmail] = useState(false)
  const [sharePhone, setSharePhone] = useState(false)
  if (!p) return null
  const canEmail = Boolean(user?.email)
  const canPhone = Boolean(user?.phone)

  return (
    <article className="rounded-[28px] bg-card p-5 shadow-sm ring-1 ring-ink/5">
      <p className="text-sm font-semibold text-gold">{t.incoming}</p>
      <h2 className="mt-1 text-xl font-bold">{p.name}</h2>
      <OnlineBadge lastSeen={p.lastSeen} />
      <p className="text-sm text-ink/60">
        {p.questionnaire.age} · {tPath(lang, `region.${p.questionnaire.region}`)} ·{' '}
        {tPath(lang, `faith.${p.questionnaire.faith}`)}
      </p>
      <p className="mt-3 text-[15px] text-ink/80">{p.questionnaire.bio}</p>
      <div className="mt-4 space-y-2 rounded-2xl bg-mist/80 p-4">
        <p className="text-sm font-semibold">{t.shareContactHint}</p>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-wine"
            checked={shareEmail}
            disabled={!canEmail}
            onChange={(e) => setShareEmail(e.target.checked)}
          />
          <span>
            {t.shareEmail}
            {user?.email ? ` · ${user.email}` : ` · ${t.noEmailOnAccount}`}
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-wine"
            checked={sharePhone}
            disabled={!canPhone}
            onChange={(e) => setSharePhone(e.target.checked)}
          />
          <span>
            {t.sharePhone}
            {user?.phone ? ` · ${user.phone}` : ` · ${t.noPhoneOnAccount}`}
          </span>
        </label>
        <p className="text-xs text-ink/55">{t.chatOnlyHint}</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => decideIncoming(match.id, true, { email: shareEmail && canEmail, phone: sharePhone && canPhone })}
          className="flex-1 rounded-2xl bg-olive py-3 font-bold text-paper"
        >
          {t.approve}
        </button>
        <button
          type="button"
          onClick={() => decideIncoming(match.id, false)}
          className="flex-1 rounded-2xl bg-mist py-3 font-bold"
        >
          {t.decline}
        </button>
      </div>
    </article>
  )
}

function ConversationCard({ match, unread }: { match: Match; unread: number }) {
  const { t, user, profileById, messages } = useApp()
  if (!user) return null
  const other = profileById(match.userId === user.id ? match.candidateId : match.userId)
  if (!other) return null
  const last = messages
    .filter((m) => m.matchId === match.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return (
    <Link
      to={`/app/chat/${match.id}`}
      className="block rounded-[28px] bg-card p-5 shadow-sm ring-1 ring-ink/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-olive">{t.conversations}</p>
          <h2 className="text-xl font-bold">{other.name}</h2>
          <OnlineBadge lastSeen={other.lastSeen} />
        </div>
        {unread > 0 && (
          <span className="rounded-full bg-wine px-2.5 py-1 text-xs font-bold text-paper">{unread}</span>
        )}
      </div>
      <p className={`mt-2 text-sm ${unread > 0 ? 'font-semibold text-ink' : 'text-ink/55'}`}>
        {last ? last.body : t.noMessagesYet}
      </p>
    </Link>
  )
}
