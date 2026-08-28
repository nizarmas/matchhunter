import { SEED_PROFILES } from './seed'
import type { AppNotification, ChatMessage, Lang, Match, Profile, Transaction } from './types'

const KEY = 'matchhunter.v2'

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

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Store
    const seedIds = new Set(SEED_PROFILES.map((p) => p.id))
    const custom = parsed.profiles.filter((p) => !seedIds.has(p.id))
    return {
      ...empty(),
      ...parsed,
      profiles: [...SEED_PROFILES, ...custom],
    }
  } catch {
    return empty()
  }
}

export function saveStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}

const EMAIL_KEY = 'matchhunter.lastEmail'

export function rememberEmail(email: string) {
  if (email) localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase())
}

export function lastEmail() {
  return localStorage.getItem(EMAIL_KEY) ?? ''
}
