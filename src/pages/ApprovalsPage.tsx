import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { tPath } from '../i18n/translations'

export function ApprovalsPage() {
  const { t, lang, incoming, profileById, decideIncoming } = useApp()
  const paid = incoming.filter((m) => m.status === 'selected_and_paid')
  const done = incoming.filter((m) => m.status === 'partner_approved')

  if (incoming.length === 0) {
    return <p className="rounded-3xl bg-card p-8 text-ink/60">{t.emptyInbox}</p>
  }

  return (
    <div className="space-y-4">
      <h1 className="display text-3xl">{t.approvals}</h1>
      {paid.map((m) => {
        const p = profileById(m.userId)
        if (!p) return null
        return (
          <article key={m.id} className="rounded-[28px] bg-card p-5 shadow-sm ring-1 ring-ink/5">
            <p className="text-sm font-semibold text-gold">{t.incoming}</p>
            <h2 className="mt-1 text-xl font-bold">{p.name}</h2>
            <p className="text-sm text-ink/60">
              {p.questionnaire.age} · {tPath(lang, `region.${p.questionnaire.region}`)} ·{' '}
              {tPath(lang, `faith.${p.questionnaire.faith}`)}
            </p>
            <p className="mt-3 text-[15px] text-ink/80">{p.questionnaire.bio}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => decideIncoming(m.id, true)}
                className="flex-1 rounded-2xl bg-olive py-3 font-bold text-paper"
              >
                {t.approve}
              </button>
              <button
                type="button"
                onClick={() => decideIncoming(m.id, false)}
                className="flex-1 rounded-2xl bg-mist py-3 font-bold"
              >
                {t.decline}
              </button>
            </div>
          </article>
        )
      })}
      {done.map((m) => {
        const p = profileById(m.userId)
        if (!p) return null
        return (
          <article key={m.id} className="rounded-[28px] bg-card p-5">
            <p className="text-sm text-olive">{t.approved}</p>
            <h2 className="text-xl font-bold">{p.name}</h2>
            <Link to={`/app/chat/${m.id}`} className="mt-3 inline-block font-semibold text-wine">
              {t.chat}
            </Link>
          </article>
        )
      })}
    </div>
  )
}
