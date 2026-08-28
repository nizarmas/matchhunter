import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { OnlineBadge } from '../components/OnlineBadge'
import { pairSharedContact } from '../lib/contact'
import { dedupeChatMessages, threadMatchIds } from '../lib/chatLive'
import { involvesPair, otherParty, pairMatchesForPerson, pickCanonicalMatch } from '../lib/pair'

export function ChatPage() {
  const { matchId } = useParams()
  const nav = useNavigate()
  const { t, user, allMatches, messages, notifications, profileById, sendMessage, markMatchRead, setOpenChat, decideIncoming } =
    useApp()
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  const opened = allMatches.find((m) => m.id === matchId)
  const otherId = opened && user ? otherParty(opened, user.id) : undefined
  const other = otherId ? profileById(otherId) : undefined
  const pair = user && other ? pairMatchesForPerson(allMatches, user.id, other, profileById) : []
  const approved =
    user && otherId
      ? allMatches.find((m) => involvesPair(m, user.id, otherId) && m.status === 'partner_approved')
      : undefined
  const match =
    approved ??
    (user && otherId ? pickCanonicalMatch(allMatches, user.id, otherId, messages) ?? opened : opened)
  const threadIds = useMemo(() => {
    if (!user) return new Set<string>()
    if (other) return threadMatchIds(allMatches, messages, user.id, other, profileById)
    const ids = new Set<string>()
    if (opened) ids.add(opened.id)
    if (otherId) {
      for (const m of allMatches) {
        if (
          (m.userId === user.id && m.candidateId === otherId) ||
          (m.userId === otherId && m.candidateId === user.id)
        ) {
          ids.add(m.id)
        }
      }
      for (const msg of messages) {
        if (msg.senderId === otherId) ids.add(msg.matchId)
      }
    }
    return ids
  }, [allMatches, messages, user, other, otherId, opened, profileById])
  const threadKey = [...threadIds].sort().join('|')
  const unreadHere = notifications.filter(
    (n) => (n.type === 'message' || n.type === 'approved') && !n.read && n.matchId && threadIds.has(n.matchId),
  ).length

  const thread = useMemo(
    () =>
      dedupeChatMessages(
        messages.filter((m) => threadIds.has(m.matchId) || (other && m.senderId === other.id)),
      ),
    [messages, threadIds, other],
  )

  useEffect(() => {
    setOpenChat(otherId ?? null)
    return () => setOpenChat(null)
  }, [otherId, setOpenChat])

  useEffect(() => {
    if (match && matchId && match.id !== matchId && match.status === 'partner_approved') {
      nav(`/app/chat/${match.id}`, { replace: true })
    }
  }, [match, matchId, nav])

  useEffect(() => {
    for (const id of threadIds) markMatchRead(id)
  }, [threadKey, unreadHere])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [thread.at(-1)?.id])

  const noteApproved = notifications.some(
    (n) => n.type === 'approved' && n.matchId && (threadIds.has(n.matchId) || n.matchId === opened?.id || n.matchId === match?.id),
  )

  if (!user || !match) {
    return (
      <div>
        <Link to="/app/approvals" className="mb-4 inline-block text-sm font-semibold text-wine">
          ← {t.backToInbox}
        </Link>
        <p className="text-ink/60">{t.waiting}</p>
      </div>
    )
  }

  if (match.status === 'selected_and_paid' && match.candidateId === user.id) {
    return (
      <div>
        <Link to="/app/approvals" className="mb-4 inline-block text-sm font-semibold text-wine">
          ← {t.backToInbox}
        </Link>
        <p className="mt-4 text-ink/70">{t.incoming}</p>
        <h1 className="mt-1 text-2xl font-bold">{other?.name ?? t.them}</h1>
        <button
          type="button"
          className="mt-6 w-full max-w-sm rounded-2xl bg-olive py-3 font-bold text-paper"
          onClick={async () => {
            const chatId = await decideIncoming(match.id, true)
            if (chatId) nav(`/app/chat/${chatId}`, { replace: true })
          }}
        >
          {t.approve}
        </button>
      </div>
    )
  }

  if (match.status !== 'partner_approved' && !noteApproved) {
    return (
      <div>
        <Link to="/app/approvals" className="mb-4 inline-block text-sm font-semibold text-wine">
          ← {t.backToInbox}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{other?.name ?? t.waiting}</h1>
        <p className="mt-2 text-ink/60">{t.waitingAutoOpen}</p>
      </div>
    )
  }

  const displayName = other?.name ?? t.them
  const openId = match.id
  const blocked = Boolean(user.chatBlocked)
  const revealed = other ? pairSharedContact(pair, other) : { phone: '', email: '' }

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
        <h1 className="text-lg font-bold">{displayName}</h1>
        {other ? <OnlineBadge lastSeen={other.lastSeen} /> : null}
        <p className="mt-1 text-xs text-ink/45">{t.chatEphemeral}</p>
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
      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto p-4">
        {thread.length === 0 && <p className="text-sm text-ink/45">{t.noMessagesYet}</p>}
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
