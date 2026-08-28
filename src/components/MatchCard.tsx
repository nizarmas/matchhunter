import { Link, useNavigate } from 'react-router-dom'
import { OnlineBadge } from './OnlineBadge'
import { useApp } from '../context/AppContext'
import type { Match } from '../lib/types'
import { tPath } from '../i18n/translations'

export function MatchCard({ match }: { match: Match }) {
  const { t, lang, profileById } = useApp()
  const p = profileById(match.candidateId)
  if (!p) return null
  const q = p.questionnaire
  const pct = Math.min(99, Math.round((match.score / 120) * 100))

  const statusLabel =
    match.status === 'selected_and_paid'
      ? t.waiting
      : match.status === 'partner_approved'
        ? t.approved
        : match.status === 'declined'
          ? t.declined
          : null

  return (
    <article className="card-lift flex flex-col rounded-[28px] bg-card p-5 shadow-sm ring-1 ring-ink/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-2xl bg-wine text-2xl font-bold text-paper">
            {p.photo ?? p.name.slice(0, 1)}
          </div>
          <div>
            <h3 className="text-lg font-bold">{p.name}</h3>
            <OnlineBadge lastSeen={p.lastSeen} />
            <p className="text-sm text-ink/60">
              {q.age} · {tPath(lang, `region.${q.region}`)}
              {q.city ? ` · ${q.city}` : ''}
            </p>
          </div>
        </div>
        <div className="rounded-full bg-olive/10 px-3 py-1 text-sm font-semibold text-olive">
          {pct}% {t.score}
        </div>
      </div>

      <p className="mt-4 min-h-12 text-[15px] leading-relaxed text-ink/80">{q.bio}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip>{tPath(lang, `faith.${q.faith}`)}</Chip>
        <Chip>{tPath(lang, `goal.${q.goal}`)}</Chip>
        {match.reasons.slice(0, 3).map((r) => (
          <Chip key={r}>{tPath(lang, `reason.${r}`)}</Chip>
        ))}
      </div>

      <div className="mt-5">
        {match.status === 'pending' && (
          <PendingActions matchId={match.id} />
        )}
        {match.status === 'selected_and_paid' && (
          <div className="rounded-2xl bg-mist py-3 text-center text-sm font-semibold text-ink/70">
            {statusLabel}
          </div>
        )}
        {match.status === 'partner_approved' && (
          <Link
            to={`/app/chat/${match.id}`}
            className="relative block rounded-2xl bg-olive py-3 text-center text-sm font-bold text-paper"
          >
            {match.shareEmail || match.sharePhone ? `${t.chat} · ${t.contact}` : t.chat}
            <UnreadDot matchId={match.id} />
          </Link>
        )}
        {match.status === 'declined' && (
          <div className="rounded-2xl bg-mist py-3 text-center text-sm font-semibold text-ink/50">
            {t.declined}
          </div>
        )}
      </div>
    </article>
  )
}

function PendingActions({ matchId }: { matchId: string }) {
  const { t, hasMembership, sendRequest } = useApp()
  const nav = useNavigate()
  return (
    <div className="grid gap-2">
      {hasMembership ? (
        <button
          type="button"
          onClick={() => {
            sendRequest(matchId)
            nav('/app/approvals')
          }}
          className="w-full rounded-2xl bg-wine py-3 text-sm font-bold text-paper"
        >
          {t.sendRequest}
        </button>
      ) : (
        <Link
          to={`/app/unlock/${matchId}`}
          className="block rounded-2xl bg-wine py-3 text-center text-sm font-bold text-paper"
        >
          {t.unlock} · {t.price}
        </Link>
      )}
      <RejectButton matchId={matchId} />
    </div>
  )
}

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-ink/75">{children}</span>
  )
}

function RejectButton({ matchId }: { matchId: string }) {
  const { t, rejectMatch } = useApp()
  return (
    <button
      type="button"
      onClick={() => rejectMatch(matchId)}
      className="w-full rounded-2xl border border-mist py-2 text-sm font-semibold text-ink/60"
    >
      {t.reject}
    </button>
  )
}

function UnreadDot({ matchId }: { matchId: string }) {
  const { notifications } = useApp()
  const n = notifications.filter((x) => x.type === 'message' && !x.read && x.matchId === matchId).length
  if (!n) return null
  return (
    <span className="absolute -top-2 inline-flex min-w-5 rounded-full bg-wine px-1.5 text-[10px] font-bold leading-5 text-paper end-3">
      {n}
    </span>
  )
}
