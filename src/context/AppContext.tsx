import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  fetchCloudMatches,
  fetchCloudMatchesAll,
  fetchCloudNotifications,
  fetchCloudTransactions,
  fetchVisibleCloudMessages,
  fetchCloudProfileIds,
  fetchCloudProfiles,
  fetchLastSeenMap,
  touchLastSeen,
  insertCloudMessage,
  insertCloudNotification,
  insertCloudTransaction,
  markCloudNotificationsRead,
  markCloudMatchMessagesRead,
  matchFromRow,
  noteFromRow,
  respondCloudMatch,
  upsertCloudMatches,
  upsertCloudProfile,
  wipeCloudChats,
} from '../lib/db'
import { fetchIsCurrentUserAdmin, fetchPaymentSettings, setCloudAdminEmail, setCloudPaymentSettings, cloudDeleteCustomer, cloudRevokeMembership, cloudResetAllMemberships } from '../lib/admin'
import { addMembershipPeriod, isMemberActive, MEMBER_PRICE_ILS } from '../lib/membership'
import { isOffensive } from '../lib/moderation'
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from '../lib/payments'
import { curateMatches } from '../lib/matching'
import { dropPairChat, mergeChatMessages, messageFromRow, pairChannelName, reconcileCloudMessages } from '../lib/chatLive'
import { chattingIds, engagedIds, involvesPair, otherParty, overlapsKnown, pairIsOpen, pickCanonicalMatch, uniqueByOther } from '../lib/pair'
import { SEED_PROFILES } from '../lib/seed'
import { holdInbox, isInboxHeld, isLiveMatch, loadStore, releaseInbox, rememberEmail, saveStore, type Store } from '../lib/store'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type {
  AppNotification,
  ChatMessage,
  Lang,
  Match,
  Profile,
  Questionnaire,
  Transaction,
} from '../lib/types'
import { translations } from '../i18n/translations'

type Dict = (typeof translations)['he']

function blankQuestionnaire(lang: Lang): Questionnaire {
  return {
    gender: 'female',
    lookingFor: 'male',
    age: 28,
    partnerAgeMin: 25,
    partnerAgeMax: 40,
    region: 'jerusalem',
    city: '',
    faith: 'jewish_traditional',
    openToOtherFaiths: false,
    goal: 'marriage',
    kids: 'open',
    languages: [lang],
    bio: '',
  }
}

function mergeMatchList(cloud: Match[], local: Match[]) {
  const rank: Record<Match['status'], number> = {
    declined: -1,
    pending: 0,
    selected_and_paid: 1,
    partner_approved: 2,
  }
  const map = new Map<string, Match>()
  for (const m of local) map.set(m.id, m)
  for (const c of cloud) {
    const l = map.get(c.id)
    if (!l) {
      map.set(c.id, c)
      continue
    }
    const richer = (rank[c.status] ?? 0) >= (rank[l.status] ?? 0) ? c : l
    const declinedWins =
      (c.status === 'declined' && l.status !== 'partner_approved') ||
      (l.status === 'declined' && c.status !== 'partner_approved')
    const chosen = declinedWins ? (c.status === 'declined' ? c : l) : richer
    map.set(c.id, {
      ...chosen,
      shareEmail: Boolean(l.shareEmail || c.shareEmail),
      sharePhone: Boolean(l.sharePhone || c.sharePhone),
    })
  }
  return [...map.values()].filter((m) => !m.candidateId.startsWith('seed-'))
}

function applyApprovalNotes(matches: Match[], notes: { type: string; matchId?: string }[]): Match[] {
  const ids = new Set(notes.filter((n) => n.type === 'approved' && n.matchId).map((n) => n.matchId as string))
  if (ids.size === 0) return matches
  const approved = matches.filter((m) => ids.has(m.id))
  return matches.map((m) => {
    if (m.status === 'partner_approved' || m.status === 'declined') return m
    const hit =
      ids.has(m.id) ||
      approved.some((a) => involvesPair(a, m.userId, m.candidateId))
    return hit ? { ...m, status: 'partner_approved' as const, approvedAt: m.approvedAt ?? new Date().toISOString() } : m
  })
}

function laterIso(a?: string, b?: string) {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

function mergeProfiles(cloud: Profile[], local: Profile[], me?: string) {
  const map = new Map<string, Profile>()
  const localById = new Map(local.map((p) => [p.id, p]))
  for (const p of SEED_PROFILES) map.set(p.id, p)
  for (const p of cloud) {
    const loc = localById.get(p.id) ?? map.get(p.id)
    map.set(p.id, { ...p, membershipUntil: laterIso(p.membershipUntil, loc?.membershipUntil) })
  }
  const phones = new Set(cloud.map((p) => p.phone.replace(/\D/g, '')).filter((x) => x.length >= 9))
  const emails = new Set(cloud.map((p) => p.email?.toLowerCase()).filter((x): x is string => Boolean(x)))
  for (const p of local) {
    if (p.id.startsWith('seed-')) continue
    const cur = map.get(p.id)
    if (cur) {
      map.set(p.id, { ...cur, membershipUntil: laterIso(cur.membershipUntil, p.membershipUntil) })
      continue
    }
    const ph = p.phone.replace(/\D/g, '')
    if (ph.length >= 9 && phones.has(ph)) continue
    if (p.email && emails.has(p.email.toLowerCase())) continue
    if (me && p.id === me) map.set(p.id, p)
  }
  return [...map.values()]
}

function dropGoneMatches(
  matches: Match[],
  alive: Set<string>,
  cloudMatchIds: Set<string>,
  uid: string,
) {
  return matches.filter((m) => {
    if (m.candidateId.startsWith('seed-')) return false
    const userOk = m.userId === uid || m.userId.startsWith('seed-') || alive.has(m.userId)
    const otherOk = m.candidateId === uid || alive.has(m.candidateId)
    if (!userOk || !otherOk) return false
    if (cloudMatchIds.has(m.id)) return true
    return m.status === 'pending' && m.userId === uid
  })
}

function dropGoneThread(
  matches: Match[],
  messages: ChatMessage[],
  notifications: AppNotification[],
) {
  const matchIds = new Set(matches.map((m) => m.id))
  return {
    messages: messages.filter((m) => matchIds.has(m.matchId)),
    notifications: notifications.filter((n) => n.type === 'admin' || !n.matchId || matchIds.has(n.matchId)),
  }
}

function mergeNotes(local: AppNotification[], cloud: AppNotification[]) {
  const cloudIds = new Set(cloud.map((n) => n.id))
  const map = new Map<string, AppNotification>()
  for (const n of local) {
    if (n.type === 'message' && !cloudIds.has(n.id)) continue
    map.set(n.id, n)
  }
  for (const n of cloud) map.set(n.id, n)
  return [...map.values()]
}

function withoutSessionChat(s: Store): Store {
  return {
    ...s,
    currentUserId: null,
    messages: [],
    notifications: s.notifications.filter((n) => n.type !== 'message'),
  }
}

type AppCtx = {
  lang: Lang
  setLang: (l: Lang) => void
  dir: 'rtl' | 'ltr'
  t: Dict
  cloud: boolean
  user: Profile | null
  profiles: Profile[]
  matches: Match[]
  allMatches: Match[]
  incoming: Match[]
  outgoingWaiting: Match[]
  notifications: AppNotification[]
  messages: ChatMessage[]
  register: (name: string, phone: string, email?: string, password?: string) => Promise<Profile>
  login: (email: string, password: string) => Promise<Profile>
  logout: () => void
  saveQuestionnaire: (q: Questionnaire) => void
  refreshMatches: () => void
  rejectMatch: (matchId: string) => void
  profileById: (id: string) => Profile | undefined
  hasMembership: boolean
  sendRequest: (matchId: string) => Promise<void>
  payForMatch: (matchId: string, gatewayId: string, gateway: Transaction['gateway']) => void
  decideIncoming: (matchId: string, approve: boolean, share?: { email: boolean; phone: boolean }) => Promise<string | undefined>
  sendMessage: (matchId: string, body: string) => Promise<'ok' | 'warned' | 'blocked' | 'failed'>
  isAdmin: boolean
  paymentSettings: PaymentSettings
  transactions: Transaction[]
  adminSetBlocked: (profileId: string, blocked: boolean) => void
  adminGrantPaid: (profileId: string) => void
  adminMessage: (profileId: string, body: string) => void
  adminChangeEmail: (nextEmail: string) => Promise<void>
  adminSavePayments: (next: PaymentSettings) => Promise<void>
  adminDeleteCustomer: (profileId: string) => Promise<void>
  adminRevokeMembership: (profileId: string) => Promise<void>
  adminResetAllMemberships: () => Promise<void>
  markNotificationsRead: () => void
  markMatchRead: (matchId: string) => void
  setOpenChat: (otherId: string | null) => void
  inboxBadge: number
}

const Ctx = createContext<AppCtx | null>(null)

function applyDoc(lang: Lang) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => loadStore())
  const [isAdmin, setIsAdmin] = useState(false)
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS)
  const [openChatOtherId, setOpenChat] = useState<string | null>(null)
  const openChatRef = useRef<string | null>(null)
  openChatRef.current = openChatOtherId
  const pairChannelsRef = useRef(new Map<string, ReturnType<NonNullable<typeof supabase>['channel']>>())
  const realtimeOkRef = useRef(false)
  const syncBusyRef = useRef(false)

  useEffect(() => {
    applyDoc(store.lang)
    const t = window.setTimeout(() => saveStore(store), 400)
    return () => window.clearTimeout(t)
  }, [store])

  function patch(fn: (s: Store) => Store) {
    setStore((s) => fn(s))
  }

  function ingestMessages(uid: string, msgs: ChatMessage[]) {
    if (msgs.length === 0) return
    patch((s) => {
      const messages = mergeChatMessages(s.messages, msgs)
      const other = openChatRef.current
      if (!other) return messages === s.messages ? s : { ...s, messages }
      const openIds = new Set(
        s.matches
          .filter((m) => m.userId === uid || m.candidateId === uid)
          .filter((m) => otherParty(m, uid) === other)
          .map((m) => m.id),
      )
      for (const msg of msgs) {
        if (msg.senderId === other) openIds.add(msg.matchId)
      }
      const notifications = s.notifications.map((n) =>
        n.userId === uid && (n.type === 'message' || n.type === 'approved') && n.matchId && openIds.has(n.matchId)
          ? { ...n, read: true }
          : n,
      )
      for (const id of openIds) void markCloudMatchMessagesRead(uid, id)
      return { ...s, messages, notifications }
    })
  }

  function ingestMatch(row: Match) {
    patch((s) => {
      const uid = s.currentUserId
      if (!uid || (row.userId !== uid && row.candidateId !== uid)) return s
      let matches = mergeMatchList([row], s.matches)
      matches = applyApprovalNotes(matches, s.notifications)
      if (isInboxHeld()) matches = matches.filter(isLiveMatch)
      return { ...s, matches }
    })
  }

  function ingestNote(note: AppNotification) {
    patch((s) => {
      if (!s.currentUserId || note.userId !== s.currentUserId) return s
      const noteMap = new Map(s.notifications.map((n) => [n.id, n]))
      noteMap.set(note.id, note)
      const notifications = [...noteMap.values()]
      return { ...s, notifications, matches: applyApprovalNotes(s.matches, notifications) }
    })
  }

  const ingestMessagesRef = useRef(ingestMessages)
  const ingestMatchRef = useRef(ingestMatch)
  ingestMessagesRef.current = ingestMessages
  ingestMatchRef.current = ingestMatch

  async function hydrate(userId: string) {
    let admin = false
    try {
      admin = await fetchIsCurrentUserAdmin()
    } catch {
      admin = false
    }
    setIsAdmin(admin)
    try {
      setPaymentSettings(await fetchPaymentSettings())
    } catch {
      setPaymentSettings(DEFAULT_PAYMENT_SETTINGS)
    }

    try {
      const cloudProfiles = await fetchCloudProfiles()
      const meCloud = cloudProfiles.find((p) => p.id === userId)
      if (meCloud?.accountBlocked) {
        try {
          await wipeCloudChats()
        } catch {
          /* still leave */
        }
        setIsAdmin(false)
        void supabase?.auth.signOut()
        patch(withoutSessionChat)
        return
      }
      const [cloudMatches, cloudTx, cloudNotes, cloudMsgs] = await Promise.all([
        admin ? fetchCloudMatchesAll() : fetchCloudMatches(userId),
        fetchCloudTransactions(),
        fetchCloudNotifications(userId),
        fetchVisibleCloudMessages(),
      ])
      patch((s) => {
        const profiles = mergeProfiles(cloudProfiles, s.profiles, userId)
        const alive = new Set(cloudProfiles.map((p) => p.id))
        const notifications = mergeNotes(s.notifications, cloudNotes)
        let matches = applyApprovalNotes(mergeMatchList(cloudMatches, s.matches), notifications)
        matches = dropGoneMatches(matches, alive, new Set(cloudMatches.map((m) => m.id)), userId)
        if (isInboxHeld()) matches = matches.filter(isLiveMatch)
        const thread = dropGoneThread(matches, reconcileCloudMessages(s.messages, cloudMsgs), notifications)
        const txMap = new Map(s.transactions.map((t) => [t.id, t]))
        for (const t of cloudTx) txMap.set(t.id, t)
        return {
          ...s,
          profiles,
          matches,
          transactions: [...txMap.values()],
          notifications: thread.notifications,
          messages: thread.messages,
          currentUserId: userId,
        }
      })
    } catch {
      patch((s) => ({ ...s, currentUserId: userId }))
    }
  }

  useEffect(() => {
    if (!supabase) return
    let dead = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!dead && data.session) void hydrate(data.session.user.id)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void hydrate(session.user.id)
      else {
        setIsAdmin(false)
        patch((s) => ({ ...s, currentUserId: null }))
      }
    })
    return () => {
      dead = true
      data.subscription.unsubscribe()
    }
  }, [])

  const livePartnersKey = store.currentUserId
    ? [...engagedIds(store.matches, store.currentUserId)].sort().join('|')
    : ''

  useEffect(() => {
    if (!supabase || !store.currentUserId) return
    const client = supabase
    const uid = store.currentUserId
    let dead = false

    async function syncLite() {
      if (syncBusyRef.current || document.visibilityState === 'hidden') return
      syncBusyRef.current = true
      try {
        const [cloudMatches, cloudNotes, cloudMsgs, alive] = await Promise.all([
          fetchCloudMatches(uid),
          fetchCloudNotifications(uid),
          fetchVisibleCloudMessages(),
          fetchCloudProfileIds(),
        ])
        if (dead) return
        patch((s) => {
          const noteMap = new Map(mergeNotes(s.notifications, cloudNotes).map((n) => [n.id, n]))
          let matches = applyApprovalNotes(mergeMatchList(cloudMatches, s.matches), [...noteMap.values()])
          matches = dropGoneMatches(matches, alive, new Set(cloudMatches.map((m) => m.id)), uid)
          if (isInboxHeld()) matches = matches.filter(isLiveMatch)
          const ahead = matches.filter((m) => {
            const c = cloudMatches.find((x) => x.id === m.id)
            return m.status === 'partner_approved' && c && c.status !== 'partner_approved'
          })
          if (ahead.length) void upsertCloudMatches(ahead)
          const other = openChatRef.current
          if (other) {
            const openIds = new Set(
              matches
                .filter((m) => m.userId === uid || m.candidateId === uid)
                .filter((m) => otherParty(m, uid) === other)
                .map((m) => m.id),
            )
            for (const msg of cloudMsgs) {
              if (msg.senderId === other) openIds.add(msg.matchId)
            }
            for (const [id, n] of noteMap) {
              if (n.userId === uid && (n.type === 'message' || n.type === 'approved') && n.matchId && openIds.has(n.matchId) && !n.read) {
                noteMap.set(id, { ...n, read: true })
                void markCloudMatchMessagesRead(uid, n.matchId)
              }
            }
          }
          const thread = dropGoneThread(matches, reconcileCloudMessages(s.messages, cloudMsgs), [...noteMap.values()])
          return {
            ...s,
            profiles: s.profiles.filter((p) => p.id === uid || p.id.startsWith('seed-') || alive.has(p.id)),
            matches,
            notifications: thread.notifications,
            messages: thread.messages,
          }
        })
      } catch {
        /* keep local */
      } finally {
        syncBusyRef.current = false
      }
    }

    async function syncPresence() {
      if (document.visibilityState === 'hidden') return
      try {
        const lastSeen = await fetchLastSeenMap()
        if (dead) return
        patch((s) => ({
          ...s,
          profiles: s.profiles.map((p) => (lastSeen.has(p.id) ? { ...p, lastSeen: lastSeen.get(p.id) } : p)),
        }))
      } catch {
        /* keep local */
      }
    }

    void syncLite()
    void syncPresence()
    const lite = window.setInterval(() => {
      if (realtimeOkRef.current) return
      void syncLite()
    }, 2500)
    const safety = window.setInterval(() => void syncLite(), 10000)
    const presence = window.setInterval(() => void syncPresence(), 15000)

    const live = client
      .channel(`mh-live-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = String((payload.old as { id?: string } | null)?.id ?? '')
          if (!id) return
          patch((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== id) }))
          return
        }
        const msg = messageFromRow(payload.new as Record<string, unknown>)
        if (msg && msg.senderId !== uid) ingestMessagesRef.current(uid, [msg])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = String((payload.old as { id?: string } | null)?.id ?? '')
          if (!id) return
          patch((s) => {
            const matches = s.matches.filter((m) => m.id !== id)
            const thread = dropGoneThread(matches, s.messages, s.notifications)
            return { ...s, matches, messages: thread.messages, notifications: thread.notifications }
          })
          return
        }
        const row = matchFromRow(payload.new as Record<string, unknown>)
        if (row) ingestMatchRef.current(row)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, (payload) => {
        const id = String((payload.old as { id?: string } | null)?.id ?? '')
        if (!id || id === uid) return
        patch((s) => {
          const profiles = s.profiles.filter((p) => p.id !== id)
          const matches = s.matches.filter((m) => m.userId !== id && m.candidateId !== id)
          const thread = dropGoneThread(matches, s.messages, s.notifications)
          return { ...s, profiles, matches, messages: thread.messages, notifications: thread.notifications }
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = String((payload.old as { id?: string } | null)?.id ?? '')
          if (!id) return
          patch((s) => ({ ...s, notifications: s.notifications.filter((n) => n.id !== id) }))
          return
        }
        const note = noteFromRow(payload.new as Record<string, unknown>)
        if (note) ingestNote(note)
      })
      .subscribe((status) => {
        realtimeOkRef.current = status === 'SUBSCRIBED'
        if (status === 'SUBSCRIBED') void syncLite()
      })

    return () => {
      dead = true
      realtimeOkRef.current = false
      window.clearInterval(lite)
      window.clearInterval(safety)
      window.clearInterval(presence)
      void client.removeChannel(live)
    }
  }, [store.currentUserId])

  useEffect(() => {
    if (!supabase || !store.currentUserId) return
    const client = supabase
    const uid = store.currentUserId
    const wanted = new Set(livePartnersKey ? livePartnersKey.split('|') : [])
    const have = pairChannelsRef.current
    for (const [other, ch] of [...have]) {
      if (wanted.has(other)) continue
      void client.removeChannel(ch)
      have.delete(other)
    }
    for (const other of wanted) {
      if (have.has(other)) continue
      const ch = client.channel(pairChannelName(uid, other), {
        config: { broadcast: { ack: false } },
      })
      ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
        const msg = payload as ChatMessage
        if (!msg?.id || !msg.body || msg.senderId === uid) return
        ingestMessagesRef.current(uid, [msg])
      })
      ch.on('broadcast', { event: 'wipe' }, ({ payload }) => {
        const by = String((payload as { by?: string } | null)?.by ?? '')
        if (!by || by === uid) return
        patch((s) => ({
          ...s,
          messages: dropPairChat(s.messages, s.matches, by),
          notifications: s.notifications.filter((n) => {
            if (n.type !== 'message') return true
            const match = s.matches.find((m) => m.id === n.matchId)
            return !match || (match.userId !== by && match.candidateId !== by)
          }),
        }))
      })
      ch.on('broadcast', { event: 'match' }, ({ payload }) => {
        const row = payload as Match
        if (row?.id) ingestMatchRef.current(row)
      })
      ch.subscribe()
      have.set(other, ch)
    }
    return () => {
      /* keep channels; next run adds/removes. full clear on logout below */
    }
  }, [store.currentUserId, livePartnersKey])

  useEffect(() => {
    if (store.currentUserId) return
    const client = supabase
    if (!client) return
    for (const ch of pairChannelsRef.current.values()) void client.removeChannel(ch)
    pairChannelsRef.current.clear()
  }, [store.currentUserId])

  useEffect(() => {
    if (!supabase || !store.currentUserId) return
    const uid = store.currentUserId
    function beat() {
      void touchLastSeen(uid)
    }
    beat()
    const n = window.setInterval(beat, 20000)
    document.addEventListener('visibilitychange', beat)
    return () => {
      window.clearInterval(n)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [store.currentUserId])

  const user = store.profiles.find((p) => p.id === store.currentUserId) ?? null

  const matches = useMemo(() => {
    const me = store.currentUserId
    if (!me) return []
    const byId = (id: string) => store.profiles.find((p) => p.id === id)
    const busy = engagedIds(store.matches, me)
    const rejected = new Set<string>()
    for (const m of store.matches) {
      if (m.status !== 'declined') continue
      if (m.userId === me) rejected.add(m.candidateId)
      if (m.candidateId === me) rejected.add(m.userId)
    }
    const pending = store.matches.filter((m) => {
      if (m.userId !== me || m.status !== 'pending' || m.candidateId.startsWith('seed-')) return false
      if (rejected.has(m.candidateId)) return false
      const person = byId(m.candidateId)
      return person ? !overlapsKnown(person, busy, byId) : !busy.has(m.candidateId)
    })
    return uniqueByOther(pending, me, byId, store.messages).slice(0, 4)
  }, [store.matches, store.currentUserId, store.profiles, store.messages])

  const incoming = useMemo(() => {
    const me = store.currentUserId
    if (!me) return []
    const byId = (id: string) => store.profiles.find((p) => p.id === id)
    const chatting = chattingIds(store.matches, me)
    const paid = store.matches.filter((m) => {
      if (m.candidateId !== me || m.status !== 'selected_and_paid') return false
      const person = byId(m.userId)
      return person ? !overlapsKnown(person, chatting, byId) : !chatting.has(m.userId)
    })
    return uniqueByOther(paid, me, byId, store.messages)
  }, [store.matches, store.currentUserId, store.profiles, store.messages])

  const outgoingWaiting = useMemo(() => {
    const me = store.currentUserId
    if (!me) return []
    const byId = (id: string) => store.profiles.find((p) => p.id === id)
    const chatting = chattingIds(store.matches, me)
    const sent = store.matches.filter((m) => {
      if (m.userId !== me || m.status !== 'selected_and_paid') return false
      const person = byId(m.candidateId)
      return person ? !overlapsKnown(person, chatting, byId) : !chatting.has(m.candidateId)
    })
    return uniqueByOther(sent, me, byId, store.messages)
  }, [store.matches, store.currentUserId, store.profiles, store.messages])

  const unreadChat = store.notifications.filter((n) => {
    if (n.userId !== store.currentUserId || n.read) return false
    if (n.type !== 'message' && n.type !== 'approved') return false
    if (!openChatOtherId || !store.currentUserId || !n.matchId) return true
    const match = store.matches.find((m) => m.id === n.matchId)
    if (match && otherParty(match, store.currentUserId) === openChatOtherId) return false
    if (store.messages.some((m) => m.matchId === n.matchId && m.senderId === openChatOtherId)) return false
    return true
  }).length
  const waitingRequests = incoming.filter((m) => m.status === 'selected_and_paid').length
  const inboxBadge = waitingRequests + unreadChat

  const lastPayment = store.transactions
    .filter((tx) => tx.userId === store.currentUserId && tx.status === 'success')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  const hasMembership = isMemberActive(user?.membershipUntil, lastPayment?.createdAt)

  function broadcastChatWipe(uid: string) {
    for (const m of store.matches) {
      if (m.userId !== uid && m.candidateId !== uid) continue
      void pairChannelsRef.current.get(otherParty(m, uid))?.send({
        type: 'broadcast',
        event: 'wipe',
        payload: { by: uid },
      })
    }
  }

  async function leaveSystem() {
    const uid = store.currentUserId
    if (uid) broadcastChatWipe(uid)
    try {
      await wipeCloudChats()
    } catch {
      /* still leave */
    }
    setIsAdmin(false)
    void supabase?.auth.signOut()
    patch(withoutSessionChat)
  }

  useEffect(() => {
    if (!user?.accountBlocked) return
    void leaveSystem()
    // leaveSystem reads current store; run once when the account is blocked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.accountBlocked])

  const value: AppCtx = {
    lang: store.lang,
    setLang: (l) => patch((s) => ({ ...s, lang: l })),
    dir: store.lang === 'en' ? 'ltr' : 'rtl',
    t: translations[store.lang] as Dict,
    cloud: isSupabaseConfigured,
    isAdmin,
    paymentSettings,
    transactions: store.transactions,
    user,
    profiles: store.profiles,
    matches,
    allMatches: store.matches,
    incoming,
    outgoingWaiting,
    inboxBadge,
    setOpenChat,
    notifications: store.notifications.filter((n) => n.userId === store.currentUserId),
    messages: store.messages,
    register: async (name, phone, email, password) => {
      if (supabase && email && password) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, phone } },
        })
        if (error) {
          const retry = await supabase.auth.signInWithPassword({ email, password })
          if (retry.error) throw new Error(retry.error.message)
        } else if (data.user && !data.session) {
          throw new Error('כבו Confirm email: Authentication → Providers → Email')
        }
        const uid = data.user?.id ?? (await supabase.auth.getUser()).data.user?.id
        if (!uid) throw new Error('no user')
        const profile: Profile = {
          id: uid,
          name,
          phone,
          email,
          onboardingComplete: false,
          createdAt: new Date().toISOString(),
          questionnaire: blankQuestionnaire(store.lang),
        }
        const existing = (await fetchCloudProfiles()).find((p) => p.id === uid)
        const resolved = existing ?? profile
        if (!existing || !existing.name) await upsertCloudProfile({ ...resolved, name, phone, email })
        await hydrate(uid)
        rememberEmail(email)
        return resolved
      }

      const existing = store.profiles.find((p) => p.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))
      if (existing) {
        patch((s) => ({ ...s, currentUserId: existing.id }))
        return existing
      }
      const profile: Profile = {
        id: crypto.randomUUID(),
        name,
        phone,
        email,
        onboardingComplete: false,
        createdAt: new Date().toISOString(),
        questionnaire: blankQuestionnaire(store.lang),
      }
      patch((s) => ({ ...s, profiles: [...s.profiles, profile], currentUserId: profile.id }))
      return profile
    },
    login: async (email, password) => {
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message)
        const uid = (await supabase.auth.getUser()).data.user?.id
        if (!uid) throw new Error('no user')
        rememberEmail(email)
        await hydrate(uid)
        const cloud = await fetchCloudProfiles()
        const found = cloud.find((p) => p.id === uid)
        if (found?.accountBlocked) {
          void supabase.auth.signOut()
          throw new Error('blocked')
        }
        if (found) return found
        return {
          id: uid,
          name: email.split('@')[0] ?? email,
          phone: '',
          email,
          onboardingComplete: false,
          createdAt: new Date().toISOString(),
          questionnaire: blankQuestionnaire(store.lang),
        }
      }
      const found = store.profiles.find((p) => p.email?.toLowerCase() === email.toLowerCase())
      if (!found) throw new Error('not found')
      if (found.accountBlocked) throw new Error('blocked')
      rememberEmail(email)
      patch((s) => {
        if (!found.onboardingComplete) return { ...s, currentUserId: found.id }
        return { ...s, currentUserId: found.id }
      })
      return found
    },
    logout: () => {
      void leaveSystem()
    },
    saveQuestionnaire: (q) => {
      if (!user) return
      const updated: Profile = { ...user, questionnaire: q, onboardingComplete: true }
      patch((s) => {
        const profiles = s.profiles.map((p) => (p.id === user.id ? updated : p))
        void upsertCloudProfile(updated)
        if (isInboxHeld()) return { ...s, profiles }
        const me = profiles.find((p) => p.id === user.id)!
        const others = s.matches.filter((m) => m.userId !== me.id)
        const curated = curateMatches(me, profiles, s.matches)
        void upsertCloudMatches(curated)
        return { ...s, profiles, matches: [...others, ...curated] }
      })
    },
    refreshMatches: () => {
      if (!user) return
      releaseInbox()
      void (async () => {
        let cloudProfiles: Profile[] = []
        let cloudMatches: Match[] = []
        try {
          cloudProfiles = await fetchCloudProfiles()
          cloudMatches = await fetchCloudMatches(user.id)
        } catch {
          /* use local */
        }
        patch((s) => {
          const me = (cloudProfiles.length ? mergeProfiles(cloudProfiles, s.profiles, user.id) : s.profiles).find(
            (p) => p.id === user.id,
          )
          if (!me) return s
          const profiles = cloudProfiles.length ? mergeProfiles(cloudProfiles, s.profiles, user.id) : s.profiles
          const merged = cloudMatches.length
            ? dropGoneMatches(
                mergeMatchList(cloudMatches, s.matches),
                new Set(cloudProfiles.map((p) => p.id)),
                new Set(cloudMatches.map((m) => m.id)),
                me.id,
              )
            : s.matches
          const others = merged.filter((m) => m.userId !== me.id && !m.candidateId.startsWith('seed-'))
          const curated = curateMatches(me, profiles, merged)
          void upsertCloudMatches(curated)
          return { ...s, profiles, matches: [...others, ...curated] }
        })
      })()
    },
    rejectMatch: (matchId) => {
      if (!user) return
      const match = store.matches.find((m) => m.id === matchId)
      if (!match) return
      const otherId = match.candidateId
      patch((s) => {
        const me = s.profiles.find((p) => p.id === user.id)
        if (!me) return s
        const marked = s.matches.map((m) =>
          involvesPair(m, user.id, otherId) && m.status !== 'partner_approved'
            ? { ...m, status: 'declined' as const }
            : m,
        )
        const declined = marked.filter(
          (m) => involvesPair(m, user.id, otherId) && m.status === 'declined',
        )
        if (declined.length) void upsertCloudMatches(declined)
        const others = marked.filter((m) => m.userId !== me.id)
        const curated = curateMatches(me, s.profiles, marked)
        void upsertCloudMatches(curated)
        return { ...s, matches: [...others, ...curated] }
      })
      void pairChannelsRef.current.get(otherId)?.send({
        type: 'broadcast',
        event: 'match',
        payload: { ...match, status: 'declined' },
      })
    },
    profileById: (id) => store.profiles.find((p) => p.id === id),
    hasMembership,
    sendRequest: async (matchId) => {
      if (!user) return
      const match = store.matches.find((m) => m.id === matchId)
      if (!match || match.status !== 'pending') return
      if (pairIsOpen(store.matches, user.id, match.candidateId)) return
      const paid: Match = { ...match, status: 'selected_and_paid', paidAt: new Date().toISOString() }
      const note: AppNotification = {
        id: crypto.randomUUID(),
        userId: match.candidateId,
        matchId,
        type: 'interest',
        body: user.name,
        read: false,
        createdAt: new Date().toISOString(),
      }
      const reversePending = store.matches.filter(
        (m) => m.userId === match.candidateId && m.candidateId === user.id && m.status === 'pending',
      )
      const declined = reversePending.map((m) => ({ ...m, status: 'declined' as const }))
      patch((s) => ({
        ...s,
        notifications: [...s.notifications, note],
        matches: s.matches.map((m) => {
          if (m.id === matchId) return paid
          if (m.userId === match.candidateId && m.candidateId === user.id && m.status === 'pending') {
            return { ...m, status: 'declined' as const }
          }
          return m
        }),
      }))
      void pairChannelsRef.current.get(match.candidateId)?.send({ type: 'broadcast', event: 'match', payload: paid })
      await upsertCloudMatches([paid, ...declined])
      await insertCloudNotification(match.candidateId, matchId, 'interest', user.name)
    },
    payForMatch: (matchId, gatewayId, gateway) => {
      if (!user) return
      if (paymentSettings.mode === 'live' && gateway === 'demo') return
      if (store.transactions.some((tx) => tx.paymentGatewayId === gatewayId && tx.status === 'success')) return
      const until = addMembershipPeriod(user.membershipUntil)
      const updated: Profile = { ...user, membershipUntil: until }
      const tx: Transaction = {
        id: crypto.randomUUID(),
        userId: user.id,
        matchId,
        amount: MEMBER_PRICE_ILS,
        currency: 'ILS',
        gateway,
        paymentGatewayId: gatewayId,
        status: 'success',
        createdAt: new Date().toISOString(),
      }
      const match = store.matches.find((m) => m.id === matchId)
      const sendIt = match && match.status === 'pending' && !pairIsOpen(store.matches, user.id, match.candidateId)
      const paid = sendIt ? { ...match, status: 'selected_and_paid' as const, paidAt: new Date().toISOString() } : null
      const note: AppNotification | null =
        sendIt && match && paid
          ? {
              id: crypto.randomUUID(),
              userId: match.candidateId,
              matchId,
              type: 'interest',
              body: user.name,
              read: false,
              createdAt: new Date().toISOString(),
            }
          : null
      const reversePending =
        sendIt && match
          ? store.matches.filter(
              (m) => m.userId === match.candidateId && m.candidateId === user.id && m.status === 'pending',
            )
          : []
      void upsertCloudProfile(updated)
      void insertCloudTransaction(tx)
      patch((s) => ({
        ...s,
        profiles: s.profiles.map((p) => (p.id === user.id ? updated : p)),
        transactions: [...s.transactions, tx],
        notifications: note ? [...s.notifications, note] : s.notifications,
        matches: paid
          ? s.matches.map((m) => {
              if (m.id === matchId) return paid
              if (match && m.userId === match.candidateId && m.candidateId === user.id && m.status === 'pending') {
                return { ...m, status: 'declined' as const }
              }
              return m
            })
          : s.matches,
      }))
      if (paid) {
        void (async () => {
          await upsertCloudMatches([paid, ...reversePending.map((m) => ({ ...m, status: 'declined' as const }))])
          if (sendIt && match) await insertCloudNotification(match.candidateId, matchId, 'interest', user.name)
        })()
      }
    },
    decideIncoming: async (matchId, approve, share) => {
      if (!user) return undefined
      const match = store.matches.find((m) => m.id === matchId)
      if (!match) return undefined
      const otherId = match.userId
      const updated: Match = {
        ...match,
        status: approve ? 'partner_approved' : 'declined',
        approvedAt: approve ? new Date().toISOString() : match.approvedAt,
        shareEmail: approve ? Boolean(share?.email) : false,
        sharePhone: approve ? Boolean(share?.phone) : false,
      }
      const extras = store.matches
        .filter(
          (m) =>
            m.id !== matchId &&
            involvesPair(m, user.id, otherId) &&
            m.status !== 'declined' &&
            m.status !== 'partner_approved',
        )
        .map((m) => ({
          ...m,
          status: approve ? ('partner_approved' as const) : ('declined' as const),
          approvedAt: approve ? new Date().toISOString() : m.approvedAt,
        }))
      const note: AppNotification = {
        id: crypto.randomUUID(),
        userId: match.userId,
        matchId,
        type: approve ? 'approved' : 'declined',
        body: user.name,
        read: false,
        createdAt: new Date().toISOString(),
      }
      patch((s) => ({
        ...s,
        notifications: [...s.notifications, note],
        matches: s.matches.map((m) => {
          if (m.id === matchId) return updated
          const extra = extras.find((x) => x.id === m.id)
          return extra ?? m
        }),
      }))
      void pairChannelsRef.current.get(otherId)?.send({ type: 'broadcast', event: 'match', payload: updated })
      for (const extra of extras) {
        void pairChannelsRef.current.get(otherId)?.send({ type: 'broadcast', event: 'match', payload: extra })
      }
      try {
        await respondCloudMatch(matchId, approve, share)
        for (const extra of extras) {
          try {
            await respondCloudMatch(extra.id, approve, extra.id === matchId ? share : undefined)
          } catch {
            /* pair row may already be updated */
          }
        }
        await insertCloudNotification(match.userId, matchId, approve ? 'approved' : 'declined', user.name)
      } catch {
        try {
          await upsertCloudMatches([updated, ...extras])
          await insertCloudNotification(match.userId, matchId, approve ? 'approved' : 'declined', user.name)
        } catch {
          void upsertCloudMatches([updated, ...extras])
        }
      }
      return approve ? updated.id : undefined
    },
    sendMessage: async (matchId, body) => {
      if (!user || !body.trim()) return 'ok'
      if (user.chatBlocked) return 'blocked'
      if (isOffensive(body)) {
        const warnings = (user.chatWarnings ?? 0) + 1
        const blocked = warnings >= 2
        const updated: Profile = { ...user, chatWarnings: warnings, chatBlocked: blocked }
        void upsertCloudProfile(updated)
        patch((s) => ({
          ...s,
          profiles: s.profiles.map((p) => (p.id === user.id ? updated : p)),
        }))
        return blocked ? 'blocked' : 'warned'
      }
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        matchId,
        senderId: user.id,
        body: body.trim(),
        createdAt: new Date().toISOString(),
      }
      const raw = store.matches.find((m) => m.id === matchId)
      const otherId = raw ? otherParty(raw, user.id) : null
      const canonical = otherId ? pickCanonicalMatch(store.matches, user.id, otherId, store.messages) : raw
      const match = canonical ?? raw
      msg.matchId = match?.id ?? matchId
      patch((s) => ({ ...s, messages: mergeChatMessages(s.messages, [msg]) }))
      if (otherId) {
        void pairChannelsRef.current.get(otherId)?.send({ type: 'broadcast', event: 'msg', payload: msg })
      }
      try {
        if (match) void upsertCloudMatches([match])
        const saved = await insertCloudMessage(msg)
        const confirmed = { ...msg, id: saved.id, matchId: msg.matchId }
        patch((s) => ({
          ...s,
          messages: mergeChatMessages(
            s.messages.filter((m) => m.id !== msg.id),
            [confirmed],
          ),
        }))
        if (saved.via === 'row' && otherId) {
          void insertCloudNotification(otherId, confirmed.matchId, 'message', msg.body.slice(0, 80))
        }
        return 'ok'
      } catch {
        patch((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== msg.id) }))
        return 'failed'
      }
    },
    adminSetBlocked: (profileId, blocked) => {
      if (!user || !isAdmin || profileId === user.id) return
      patch((s) => {
        const profiles = s.profiles.map((p) =>
          p.id === profileId ? { ...p, accountBlocked: blocked, chatBlocked: blocked } : p,
        )
        const target = profiles.find((p) => p.id === profileId)
        if (target) void upsertCloudProfile(target)
        return { ...s, profiles }
      })
    },
    adminGrantPaid: (profileId) => {
      if (!user || !isAdmin) return
      const target = store.profiles.find((p) => p.id === profileId)
      const until = addMembershipPeriod(target?.membershipUntil)
      const tx: Transaction = {
        id: crypto.randomUUID(),
        userId: profileId,
        amount: MEMBER_PRICE_ILS,
        currency: 'ILS',
        gateway: 'admin',
        paymentGatewayId: `admin-${user.id}`,
        status: 'success',
        createdAt: new Date().toISOString(),
      }
      patch((s) => {
        const profiles = s.profiles.map((p) => (p.id === profileId ? { ...p, membershipUntil: until } : p))
        const target = profiles.find((p) => p.id === profileId)
        if (target) void upsertCloudProfile(target)
        void insertCloudTransaction(tx)
        return { ...s, profiles, transactions: [...s.transactions, tx] }
      })
    },
    adminMessage: (profileId, body) => {
      if (!user || !isAdmin || !body.trim()) return
      const note: AppNotification = {
        id: crypto.randomUUID(),
        userId: profileId,
        type: 'admin',
        body: body.trim(),
        read: false,
        createdAt: new Date().toISOString(),
      }
      void insertCloudNotification(profileId, undefined, 'admin', body.trim())
      patch((s) => ({ ...s, notifications: [...s.notifications, note] }))
    },
    adminChangeEmail: async (nextEmail) => {
      if (!user || !isAdmin) throw new Error('not_admin')
      await setCloudAdminEmail(nextEmail)
      setIsAdmin(await fetchIsCurrentUserAdmin())
    },
    adminSavePayments: async (next) => {
      if (!user || !isAdmin) throw new Error('not_admin')
      await setCloudPaymentSettings(next)
      setPaymentSettings(next)
    },
    adminRevokeMembership: async (profileId) => {
      if (!user || !isAdmin) return
      await cloudRevokeMembership(profileId)
      patch((s) => ({
        ...s,
        profiles: s.profiles.map((p) => (p.id === profileId ? { ...p, membershipUntil: undefined } : p)),
        transactions: s.transactions.filter((tx) => tx.userId !== profileId),
        matches: s.matches.map((m) =>
          m.userId === profileId && (m.status === 'selected_and_paid' || m.status === 'partner_approved')
            ? { ...m, status: 'pending' as const, paidAt: undefined, approvedAt: undefined }
            : m,
        ),
      }))
    },
    adminDeleteCustomer: async (profileId) => {
      if (!user || !isAdmin || profileId === user.id) throw new Error('cannot_delete_self')
      await cloudDeleteCustomer(profileId)
      patch((s) => {
        const matches = s.matches.filter((m) => m.userId !== profileId && m.candidateId !== profileId)
        const matchIds = new Set(matches.map((m) => m.id))
        return {
          ...s,
          profiles: s.profiles.filter((p) => p.id !== profileId),
          transactions: s.transactions.filter((tx) => tx.userId !== profileId),
          notifications: s.notifications.filter((n) => n.userId !== profileId),
          matches,
          messages: s.messages.filter((msg) => matchIds.has(msg.matchId)),
        }
      })
    },
    adminResetAllMemberships: async () => {
      if (!user || !isAdmin) throw new Error('not_admin')
      holdInbox()
      patch((s) => ({
        ...s,
        profiles: s.profiles.map((p) => ({ ...p, membershipUntil: undefined })),
        transactions: [],
        matches: [],
        messages: [],
      }))
      await cloudResetAllMemberships()
    },
    markNotificationsRead: () => {
      if (!user) return
      void markCloudNotificationsRead(user.id)
      patch((s) => ({
        ...s,
        notifications: s.notifications.map((n) => (n.userId === user.id ? { ...n, read: true } : n)),
      }))
    },
    markMatchRead: (matchId) => {
      if (!user) return
      void markCloudMatchMessagesRead(user.id, matchId)
      patch((s) => {
        let changed = false
        const notifications = s.notifications.map((n) => {
          if (n.userId === user.id && n.matchId === matchId && (n.type === 'message' || n.type === 'approved') && !n.read) {
            changed = true
            return { ...n, read: true }
          }
          return n
        })
        return changed ? { ...s, notifications } : s
      })
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp')
  return ctx
}
