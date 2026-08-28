import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { OnlineBadge } from '../components/OnlineBadge'
import { pairSharedContact } from '../lib/contact'
import { otherParty, pairMatchesForPerson, pickCanonicalMatch } from '../lib/pair'

export function ChatPage() {
  const { matchId } = useParams()
  const nav = useNavigate()
  const { t, user, allMatches, messages, profileById, sendMessage, markMatchRead } = useApp()
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState('')

  const opened = allMatches.find((m) => m.id === matchId)
  const otherId = opened && user ? otherParty(opened, user.id) : undefined
  const other = otherId ? profileById(otherId) : undefined
  const pair =
    user && other ? pairMatchesForPerson(allMatches, user.id, other, profileById) : []
  const match =
    user && otherId ? pickCanonicalMatch(allMatches, user.id, otherId, messages) ?? opened : opened
  const pairKey = pair.map((m) => m.id).join('|')
  const pairIds = useMemo(() => (pairKey ? pairKey.split('|') : []), [pairKey])

  const thread = useMemo(
    () =>
      messages
        .filter((m) => pairIds.includes(m.matchId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages, pairIds],
  )

  useEffect(() => {
    if (match && matchId && match.id !== matchId && match.status === 'partner_approved') {
      nav(`/app/chat/${match.id}`, { replace: true })
    }
  }, [match, matchId, nav])

  useEffect(() => {
    for (const id of pairIds) markMatchRead(id)
  }, [pairIds.join('|')])

  if (!match || match.status !== 'partner_approved' || !other || !user) {
    return (
      <div>
        <Link to="/app/approvals" className="mb-4 inline-block text-sm font-semibold text-wine">
          ← {t.backToInbox}
        </Link>
        <p className="text-ink/60">{t.waiting}</p>
      </div>
    )
  }

  const openId = match.id
  const blocked = Boolean(user.chatBlocked)
  const revealed = pairSharedContact(pair, other)

  async function onSend(e: FormEvent) {
    e.preventDefault()
    const result = await sendMessage(openId, body)
    if (result === 'ok') {
      setBody('')
      setNotice('')
      return
    }
    setNotice(result === 'blocked' ? t.chatBlocked : result === 'failed' ? t.chatSendFailed : t.chatWarn)
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-xl flex-col rounded-[32px] bg-card shadow-sm ring-1 ring-ink/5">
      <header className="border-b border-mist px-5 py-4">
        <Link to="/app/approvals" className="mb-2 inline-block text-sm font-semibold text-wine">
          ← {t.backToInbox}
        </Link>
        <h1 className="text-lg font-bold">{other.name}</h1>
        <OnlineBadge lastSeen={other.lastSeen} />
        {revealed.phone || revealed.email ? (
          <div className="mt-1 space-y-0.5 text-sm text-ink/70">
            {revealed.phone ? (
              <p>
                {t.phoneReveal}:{' '}
                <a className="font-semibold text-wine" href={`tel:${revealed.phone}`}>
                  {revealed.phone}
                </a>
              </p>
            ) : null}
            {revealed.email ? (
              <p>
                {t.emailReveal}:{' '}
                <a className="font-semibold text-wine" href={`mailto:${revealed.email}`}>
                  {revealed.email}
                </a>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink/55">{t.contactHidden}</p>
        )}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {thread.length === 0 && <p className="text-sm text-ink/45">{t.paidHint}</p>}
        {thread.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
              m.senderId === user.id ? 'ms-auto bg-wine text-paper' : 'bg-mist'
            }`}
          >
            {m.body}
          </div>
        ))}
      </div>
      {(notice || blocked) && (
        <p className="px-4 pb-2 text-sm font-semibold text-wine">{blocked ? t.chatBlocked : notice}</p>
      )}
      <form onSubmit={onSend} className="flex gap-2 border-t border-mist p-3">
        <input
          value={body}
          disabled={blocked}
          onChange={(e) => setBody(e.target.value)}
          placeholder={blocked ? t.chatBlocked : t.chatPh}
          className="flex-1 rounded-2xl bg-paper px-4 py-3 outline-none ring-wine focus:ring-2 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={blocked}
          className="rounded-2xl bg-wine px-4 font-bold text-paper disabled:opacity-50"
        >
          {t.send}
        </button>
      </form>
    </div>
  )
}
