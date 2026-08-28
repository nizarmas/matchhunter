import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fetchCloudMatches,
  fetchCloudMatchesAll,
  fetchCloudNotifications,
  fetchCloudTransactions,
  fetchVisibleCloudMessages,
  fetchCloudProfiles,
  insertCloudMessage,
  insertCloudNotification,
  insertCloudTransaction,
  markCloudNotificationsRead,
  upsertCloudMatches,
  upsertCloudProfile,
} from '../lib/db'
import { fetchIsCurrentUserAdmin, fetchPaymentSettings, setCloudAdminEmail, setCloudPaymentSettings, cloudDeleteCustomer, cloudRevokeMembership, cloudResetAllMemberships } from '../lib/admin'
import { addMembershipPeriod, isMemberActive, MEMBER_PRICE_ILS } from '../lib/membership'
import { isOffensive } from '../lib/moderation'
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from '../lib/payments'
import { curateMatches } from '../lib/matching'
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

function mergeProfiles(cloud: Profile[], local: Profile[]) {
  const map = new Map<string, Profile>()
  for (const p of SEED_PROFILES) map.set(p.id, p)
  for (const p of cloud) map.set(p.id, p)
  const phones = new Set(cloud.map((p) => p.phone.replace(/\D/g, '')).filter((x) => x.length >= 9))
  const emails = new Set(cloud.map((p) => p.email?.toLowerCase()).filter((x): x is string => Boolean(x)))
  for (const p of local) {
    if (p.id.startsWith('seed-')) continue
    if (map.has(p.id)) continue
    const ph = p.phone.replace(/\D/g, '')
    if (ph.length >= 9 && phones.has(ph)) continue
    if (p.email && emails.has(p.email.toLowerCase())) continue
    map.set(p.id, p)
  }
  return [...map.values()]
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
  sendRequest: (matchId: string) => void
  payForMatch: (matchId: string, gatewayId: string, gateway: Transaction['gateway']) => void
  demoApprove: (matchId: string) => void
  decideIncoming: (matchId: string, approve: boolean, share?: { email: boolean; phone: boolean }) => void
  sendMessage: (matchId: string, body: string) => 'ok' | 'warned' | 'blocked'
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

  useEffect(() => {
    applyDoc(store.lang)
    saveStore(store)
  }, [store])

  function patch(fn: (s: Store) => Store) {
    setStore((s) => fn(s))
  }

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
        setIsAdmin(false)
        void supabase?.auth.signOut()
        patch((s) => ({ ...s, currentUserId: null }))
        return
      }
      const [cloudMatches, cloudTx, cloudNotes, cloudMsgs] = await Promise.all([
        admin ? fetchCloudMatchesAll() : fetchCloudMatches(userId),
        fetchCloudTransactions(),
        fetchCloudNotifications(userId),
        fetchVisibleCloudMessages(),
      ])
      patch((s) => {
        const profiles = mergeProfiles(cloudProfiles, s.profiles)
        const unique = new Map(cloudMatches.map((m) => [m.id, m]))
        let matches = [...unique.values()].filter((m) => !m.candidateId.startsWith('seed-'))
        if (isInboxHeld()) matches = matches.filter(isLiveMatch)
        const txMap = new Map(s.transactions.map((t) => [t.id, t]))
        for (const t of cloudTx) txMap.set(t.id, t)
        const noteMap = new Map(s.notifications.map((n) => [n.id, n]))
        for (const n of cloudNotes) noteMap.set(n.id, n)
        const msgMap = new Map(s.messages.map((m) => [m.id, m]))
        for (const m of cloudMsgs) msgMap.set(m.id, m)
        return {
          ...s,
          profiles,
          matches,
          transactions: [...txMap.values()],
          notifications: [...noteMap.values()],
          messages: [...msgMap.values()],
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

  useEffect(() => {
    if (!supabase || !store.currentUserId) return
    const client = supabase
    const uid = store.currentUserId
    async function tick() {
      try {
        const [cloudMatches, cloudNotes, cloudMsgs] = await Promise.all([
          fetchCloudMatches(uid),
          fetchCloudNotifications(uid),
          fetchVisibleCloudMessages(),
        ])
        patch((s) => {
          const unique = new Map(cloudMatches.map((m) => [m.id, m]))
          let matches = [...unique.values()].filter((m) => !m.candidateId.startsWith('seed-'))
          if (isInboxHeld()) matches = matches.filter(isLiveMatch)
          const noteMap = new Map(s.notifications.map((n) => [n.id, n]))
          for (const n of cloudNotes) noteMap.set(n.id, n)
          const msgMap = new Map(s.messages.map((m) => [m.id, m]))
          for (const m of cloudMsgs) msgMap.set(m.id, m)
          return {
            ...s,
            matches,
            notifications: [...noteMap.values()],
            messages: [...msgMap.values()],
          }
        })
      } catch {
        /* keep local */
      }
    }
    const n = window.setInterval(() => void tick(), 3000)
    const channel = client
      .channel(`mh-live-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => void tick())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => void tick())
      .subscribe()
    return () => {
      window.clearInterval(n)
      void client.removeChannel(channel)
    }
  }, [store.currentUserId])

  const user = store.profiles.find((p) => p.id === store.currentUserId) ?? null

  const matches = useMemo(
    () =>
      store.matches
        .filter((m) => m.userId === store.currentUserId && m.status !== 'declined' && !m.candidateId.startsWith('seed-'))
        .slice(0, 4),
    [store.matches, store.currentUserId],
  )

  const incoming = useMemo(
    () =>
      store.matches.filter(
        (m) => m.candidateId === store.currentUserId && (m.status === 'selected_and_paid' || m.status === 'partner_approved'),
      ),
    [store.matches, store.currentUserId],
  )

  const lastPayment = store.transactions
    .filter((tx) => tx.userId === store.currentUserId && tx.status === 'success')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  const hasMembership = isMemberActive(user?.membershipUntil, lastPayment?.createdAt)

  useEffect(() => {
    if (!user?.accountBlocked) return
    void supabase?.auth.signOut()
    patch((s) => ({ ...s, currentUserId: null }))
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
      setIsAdmin(false)
      void supabase?.auth.signOut()
      patch((s) => ({ ...s, currentUserId: null }))
    },
    saveQuestionnaire: (q) => {
      if (!user) return
      const updated: Profile = { ...user, questionnaire: q, onboardingComplete: true }
      patch((s) => {
        const profiles = s.profiles.map((p) => (p.id === user.id ? updated : p))
        void upsertCloudProfile(updated)
        if (isInboxHeld()) return { ...s, profiles }
        const me = profiles.find((p) => p.id === user.id)!
        const mine = s.matches.filter((m) => m.userId === me.id)
        const others = s.matches.filter((m) => m.userId !== me.id)
        const curated = curateMatches(me, profiles, mine)
        void upsertCloudMatches(curated)
        return { ...s, profiles, matches: [...others, ...curated] }
      })
    },
    refreshMatches: () => {
      if (!user) return
      releaseInbox()
      patch((s) => {
        const me = s.profiles.find((p) => p.id === user.id)
        if (!me) return s
        const mine = s.matches.filter((m) => m.userId === me.id && !m.candidateId.startsWith('seed-'))
        const others = s.matches.filter((m) => m.userId !== me.id && !m.candidateId.startsWith('seed-'))
        const curated = curateMatches(me, s.profiles, mine)
        void upsertCloudMatches(curated)
        return { ...s, matches: [...others, ...curated] }
      })
    },
    rejectMatch: (matchId) => {
      if (!user) return
      patch((s) => {
        const me = s.profiles.find((p) => p.id === user.id)
        if (!me) return s
        const marked = s.matches.map((m) => (m.id === matchId ? { ...m, status: 'declined' as const } : m))
        const declined = marked.find((m) => m.id === matchId)
        if (declined) void upsertCloudMatches([declined])
        const mine = marked.filter((m) => m.userId === me.id)
        const others = marked.filter((m) => m.userId !== me.id)
        const curated = curateMatches(me, s.profiles, mine)
        void upsertCloudMatches(curated)
        return { ...s, matches: [...others, ...curated] }
      })
    },
    profileById: (id) => store.profiles.find((p) => p.id === id),
    hasMembership,
    sendRequest: (matchId) => {
      if (!user) return
      const match = store.matches.find((m) => m.id === matchId)
      if (!match || match.status !== 'pending') return
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
      void upsertCloudMatches([paid])
      void insertCloudNotification(match.candidateId, matchId, 'interest', user.name)
      patch((s) => ({
        ...s,
        notifications: [...s.notifications, note],
        matches: s.matches.map((m) => (m.id === matchId ? paid : m)),
      }))
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
      const paid = match ? { ...match, status: 'selected_and_paid' as const, paidAt: new Date().toISOString() } : null
      const note: AppNotification | null =
        match && paid
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
      void upsertCloudProfile(updated)
      void insertCloudTransaction(tx)
      if (paid) void upsertCloudMatches([paid])
      if (match) void insertCloudNotification(match.candidateId, matchId, 'interest', user.name)
      patch((s) => ({
        ...s,
        profiles: s.profiles.map((p) => (p.id === user.id ? updated : p)),
        transactions: [...s.transactions, tx],
        notifications: note ? [...s.notifications, note] : s.notifications,
        matches: paid ? s.matches.map((m) => (m.id === matchId ? paid : m)) : s.matches,
      }))
    },
    demoApprove: (matchId) => {
      patch((s) => {
        const next = s.matches.map((m) =>
          m.id === matchId
            ? {
                ...m,
                status: 'partner_approved' as const,
                approvedAt: new Date().toISOString(),
                shareEmail: false,
                sharePhone: false,
              }
            : m,
        )
        const found = next.find((m) => m.id === matchId)
        if (found) void upsertCloudMatches([found])
        return { ...s, matches: next }
      })
    },
    decideIncoming: (matchId, approve, share) => {
      if (!user) return
      patch((s) => {
        const match = s.matches.find((m) => m.id === matchId)
        const note: AppNotification | null = match
          ? {
              id: crypto.randomUUID(),
              userId: match.userId,
              matchId,
              type: approve ? 'approved' : 'declined',
              body: user.name,
              read: false,
              createdAt: new Date().toISOString(),
            }
          : null
        const next = s.matches.map((m) =>
          m.id === matchId
            ? {
                ...m,
                status: (approve ? 'partner_approved' : 'declined') as Match['status'],
                approvedAt: approve ? new Date().toISOString() : m.approvedAt,
                shareEmail: approve ? Boolean(share?.email) : false,
                sharePhone: approve ? Boolean(share?.phone) : false,
              }
            : m,
        )
        const found = next.find((m) => m.id === matchId)
        if (found) void upsertCloudMatches([found])
        if (match) void insertCloudNotification(match.userId, matchId, approve ? 'approved' : 'declined', user.name)
        return {
          ...s,
          notifications: note ? [...s.notifications, note] : s.notifications,
          matches: next,
        }
      })
    },
    sendMessage: (matchId, body) => {
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
      void (async () => {
        try {
          await insertCloudMessage(msg)
        } catch {
          /* local copy still kept */
        }
        try {
          const cloudMsgs = await fetchVisibleCloudMessages()
          patch((s) => {
            const msgMap = new Map(s.messages.map((m) => [m.id, m]))
            for (const m of cloudMsgs) msgMap.set(m.id, m)
            return { ...s, messages: [...msgMap.values()] }
          })
        } catch {
          /* keep local */
        }
      })()
      patch((s) => ({ ...s, messages: [...s.messages, msg] }))
      return 'ok'
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
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp')
  return ctx
}
