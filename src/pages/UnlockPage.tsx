import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Checkout } from '../components/Checkout'
import { useApp } from '../context/AppContext'
import { tPath } from '../i18n/translations'
import { supabase } from '../lib/supabase'

export function UnlockPage() {
  const { matchId } = useParams()
  const [params] = useSearchParams()
  const { t, lang, allMatches, profileById, payForMatch, sendRequest, hasMembership } = useApp()
  const nav = useNavigate()
  const match = allMatches.find((m) => m.id === matchId)
  const p = match ? profileById(match.candidateId) : undefined
  const [stripeBusy, setStripeBusy] = useState(false)

  const sessionId = params.get('session_id')

  useEffect(() => {
    if (!sessionId || !matchId || !supabase) return
    let dead = false
    setStripeBusy(true)
    void supabase.functions.invoke('confirm-stripe-session', { body: { sessionId } }).then(({ data, error }) => {
      if (dead) return
      setStripeBusy(false)
      if (error || !data?.paid) return
      payForMatch(matchId, sessionId, 'stripe')
      nav('/app/approvals', { replace: true })
    })
    return () => {
      dead = true
    }
    // payForMatch is recreated each render; confirm once per session id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, matchId])

  if (!match || !p) {
    return <p className="text-ink/60">{t.noMatches}</p>
  }

  if (stripeBusy) {
    return <p className="text-ink/60">{t.paying}</p>
  }

  if (match.status !== 'pending') {
    return (
      <div className="rounded-[32px] bg-card p-8">
        <h1 className="display text-3xl">{match.status === 'partner_approved' ? t.approved : t.paid}</h1>
        <p className="mt-2 text-ink/65">{t.paidHint}</p>
        <button
          type="button"
          onClick={() => nav(match.status === 'partner_approved' ? `/app/chat/${match.id}` : '/app/approvals')}
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
          onClick={async () => {
            await sendRequest(match.id)
            nav('/app/approvals')
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
        <Checkout
          matchId={match.id}
          onPaid={(id, gateway) => {
            payForMatch(match.id, id, gateway)
            nav('/app/approvals')
          }}
        />
      </div>
    </div>
  )
}
