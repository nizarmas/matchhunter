import { SEED_PROFILES } from './seed'
import type { AppNotification, ChatMessage, Lang, Match, Profile, Transaction } from './types'

const KEY = 'matchhunter.v3'
const OLD_KEY = 'matchhunter.v2'
const HOLD_INBOX = 'matchhunter.hold-inbox'
const MIGRATED = 'matchhunter.migrated-v3'
const EMAIL_KEY = 'matchhunter.lastEmail'

export type Store = {
  lang: Lang
  profiles: Profile[]
  matches: Match[]
  transactions: Transaction[]
  messages: ChatMessage[]
  notifications: AppNotification[]
  currentUserId: string | null
}

function empty(): Store {
  return {
    lang: 'he',
    profiles: SEED_PROFILES,
    matches: [],
    transactions: [],
    messages: [],
    notifications: [],
    currentUserId: null,
  }
}

function withSeeds(parsed: Store): Store {
  const seedIds = new Set(SEED_PROFILES.map((p) => p.id))
  const custom = parsed.profiles.filter((p) => !seedIds.has(p.id))
  return {
    ...empty(),
    ...parsed,
    profiles: [...SEED_PROFILES, ...custom],
  }
}

export function isLiveMatch(m: Match) {
  return m.status === 'selected_and_paid' || m.status === 'partner_approved'
}

export function isInboxHeld() {
  return localStorage.getItem(HOLD_INBOX) === '1'
}

export function holdInbox() {
  localStorage.setItem(HOLD_INBOX, '1')
}

export function releaseInbox() {
  localStorage.removeItem(HOLD_INBOX)
}

export function loadStore(): Store {
  try {
    localStorage.removeItem(OLD_KEY)

    if (!localStorage.getItem(MIGRATED)) {
      localStorage.setItem(MIGRATED, '1')
      holdInbox()
      const raw = localStorage.getItem(KEY)
      if (!raw) return empty()
      return { ...withSeeds(JSON.parse(raw) as Store), matches: [], messages: [], transactions: [] }
    }

    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const next = { ...withSeeds(JSON.parse(raw) as Store), messages: [] as ChatMessage[] }
    if (isInboxHeld()) {
      return { ...next, matches: (next.matches ?? []).filter(isLiveMatch) }
    }
    return next
  } catch {
    return empty()
  }
}

export function saveStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify({ ...store, messages: [] }))
}

export function rememberEmail(email: string) {
  if (email) localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase())
}

export function lastEmail() {
  return localStorage.getItem(EMAIL_KEY) ?? ''
}
