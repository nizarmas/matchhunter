import type { ChatMessage, Match, Profile } from './types'
import { isSamePerson } from './matching'

export function otherParty(match: Match, me: string) {
  return match.userId === me ? match.candidateId : match.userId
}

export function samePair(a: Match, b: Match) {
  return (
    (a.userId === b.userId && a.candidateId === b.candidateId) ||
    (a.userId === b.candidateId && a.candidateId === b.userId)
  )
}

export function involvesPair(match: Match, a: string, b: string) {
  return (
    (match.userId === a && match.candidateId === b) || (match.userId === b && match.candidateId === a)
  )
}

const rank: Record<Match['status'], number> = {
  declined: -1,
  pending: 0,
  selected_and_paid: 1,
  partner_approved: 2,
}

export function pairMatches(matches: Match[], me: string, other: string) {
  return matches.filter((m) => involvesPair(m, me, other))
}

export function pairMatchesForPerson(
  matches: Match[],
  me: string,
  other: Profile,
  profileById: (id: string) => Profile | undefined,
) {
  return matches.filter((m) => {
    if (m.userId !== me && m.candidateId !== me) return false
    const oid = otherParty(m, me)
    if (oid === other.id) return true
    const p = profileById(oid)
    return p ? isSamePerson(p, other) : false
  })
}

export function pickCanonicalMatch(matches: Match[], me: string, other: string, messages: ChatMessage[] = []) {
  const pair = pairMatches(matches, me, other).filter((m) => m.status !== 'declined')
  if (pair.length === 0) return undefined
  const counts = (id: string) => messages.filter((x) => x.matchId === id).length
  return [...pair].sort((a, b) => {
    const rs = (rank[b.status] ?? 0) - (rank[a.status] ?? 0)
    if (rs) return rs
    const mc = counts(b.id) - counts(a.id)
    if (mc) return mc
    return (b.approvedAt ?? b.createdAt).localeCompare(a.approvedAt ?? a.createdAt)
  })[0]
}

export function uniqueByOther(
  matches: Match[],
  me: string,
  profileById: (id: string) => Profile | undefined,
  messages: ChatMessage[] = [],
) {
  const out: Match[] = []
  const seen = new Set<string>()
  for (const m of matches) {
    const otherId = otherParty(m, me)
    if (seen.has(otherId)) continue
    const person = profileById(otherId)
    if (
      person &&
      out.some((x) => {
        const p = profileById(otherParty(x, me))
        return p ? isSamePerson(person, p) : false
      })
    ) {
      continue
    }
    const chosen = pickCanonicalMatch(matches, me, otherId, messages) ?? m
    seen.add(otherId)
    out.push(chosen)
  }
  return out
}

export function engagedIds(matches: Match[], me: string) {
  const ids = new Set<string>()
  for (const m of matches) {
    if (m.status === 'declined' || m.status === 'pending') continue
    if (m.userId !== me && m.candidateId !== me) continue
    ids.add(otherParty(m, me))
  }
  return ids
}

export function chattingIds(matches: Match[], me: string) {
  const ids = new Set<string>()
  for (const m of matches) {
    if (m.status !== 'partner_approved') continue
    if (m.userId !== me && m.candidateId !== me) continue
    ids.add(otherParty(m, me))
  }
  return ids
}

export function overlapsKnown(
  person: Profile,
  knownIds: Set<string>,
  profileById: (id: string) => Profile | undefined,
) {
  if (knownIds.has(person.id)) return true
  for (const id of knownIds) {
    const q = profileById(id)
    if (q && isSamePerson(person, q)) return true
  }
  return false
}
