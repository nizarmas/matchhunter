import { useNavigate, useParams } from 'react-router-dom'
import { PayPalUnlock } from '../components/PayPalUnlock'
import { useApp } from '../context/AppContext'
import { tPath } from '../i18n/translations'

export function UnlockPage() {
  const { matchId } = useParams()
  const { t, lang, matches, profileById, payForMatch, sendRequest, hasMembership } = useApp()
  const nav = useNavigate()
  const match = matches.find((m) => m.id === matchId)
  const p = match ? profileById(match.candidateId) : undefined

  if (!match || !p) {
    return <p className="text-ink/60">{t.noMatches}</p>
  }

  if (match.status !== 'pending') {
    return (
      <div className="rounded-[32px] bg-card p-8">
        <h1 className="display text-3xl">{match.status === 'partner_approved' ? t.approved : t.paid}</h1>
        <p className="mt-2 text-ink/65">{t.paidHint}</p>
        <button
          type="button"
          onClick={() => nav(match.status === 'partner_approved' ? `/app/chat/${match.id}` : '/app')}
          className="mt-6 rounded-2xl bg-wine px-5 py-3 font-bold text-paper"
        >
          {t.continue}
        </button>
      </div>
    )
  }

  if (hasMembership) {
    return (
      <div className="mx-auto max-w-lg rounded-[32px] bg-card p-7 shadow-sm ring-1 ring-ink/5">
        <p className="text-sm font-semibold text-gold">{t.memberActive}</p>
        <h1 className="display mt-2 text-3xl">{p.name}</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink/70">{t.paidHint}</p>
        <button
          type="button"
          onClick={() => {
            sendRequest(match.id)
            nav('/app')
          }}
          className="mt-6 w-full rounded-2xl bg-wine py-3 font-bold text-paper"
        >
          {t.sendRequest}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg rounded-[32px] bg-card p-7 shadow-sm ring-1 ring-ink/5">
      <p className="text-sm font-semibold text-gold">{t.unlockFor}</p>
      <h1 className="display mt-2 text-3xl">{p.name}</h1>
      <p className="mt-1 text-ink/60">
        {p.questionnaire.age} · {tPath(lang, `region.${p.questionnaire.region}`)}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-ink/70">{t.unlockExplain}</p>
      <div className="mt-6">
        <PayPalUnlock
          matchId={match.id}
          onPaid={(id, gateway) => {
            payForMatch(match.id, id, gateway)
            nav('/app')
          }}
        />
      </div>
    </div>
  )
}
