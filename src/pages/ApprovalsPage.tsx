import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { tPath } from '../i18n/translations'
import type { Match } from '../lib/types'

export function ApprovalsPage() {
  const { t, incoming } = useApp()
  const paid = incoming.filter((m) => m.status === 'selected_and_paid')
  const done = incoming.filter((m) => m.status === 'partner_approved')

  if (incoming.length === 0) {
    return <p className="rounded-3xl bg-card p-8 text-ink/60">{t.emptyInbox}</p>
  }

  return (
    <div className="space-y-4">
      <h1 className="display text-3xl">{t.approvals}</h1>
      {paid.map((m) => (
        <IncomingCard key={m.id} match={m} />
      ))}
      {done.map((m) => (
        <ApprovedCard key={m.id} match={m} />
      ))}
    </div>
  )
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

function ApprovedCard({ match }: { match: Match }) {
  const { t, profileById } = useApp()
  const p = profileById(match.userId)
  if (!p) return null
  return (
    <article className="rounded-[28px] bg-card p-5">
      <p className="text-sm text-olive">{t.approved}</p>
      <h2 className="text-xl font-bold">{p.name}</h2>
      <SharedSummary match={match} />
      <Link to={`/app/chat/${match.id}`} className="mt-3 inline-block font-semibold text-wine">
        {t.chat}
      </Link>
    </article>
  )
}

function SharedSummary({ match }: { match: Match }) {
  const { t } = useApp()
  const parts = [
    match.sharePhone ? t.phoneReveal : null,
    match.shareEmail ? t.emailReveal : null,
  ].filter(Boolean)
  return (
    <p className="mt-1 text-sm text-ink/60">
      {parts.length > 0 ? `${t.youShared} ${parts.join(' · ')}` : t.chatOnlyHint}
    </p>
  )
}
