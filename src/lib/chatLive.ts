import type { ChatMessage, Match, Profile } from './types'
import { pairMatchesForPerson } from './pair'

export function pairChannelName(a: string, b: string) {
  return `mh-pair-${[a, b].sort().join('-')}`
}

export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) return existing
  const map = new Map(existing.map((m) => [m.id, m]))
  let changed = false
  for (const msg of incoming) {
    if (map.has(msg.id)) continue
    const dup = [...map.values()].find(
      (m) =>
        m.senderId === msg.senderId &&
        m.matchId === msg.matchId &&
        m.body === msg.body &&
        Math.abs(Date.parse(m.createdAt) - Date.parse(msg.createdAt)) < 20000,
    )
    if (dup) {
      map.delete(dup.id)
      changed = true
    }
    map.set(msg.id, msg)
    changed = true
  }
  return changed ? [...map.values()] : existing
}

export function threadMatchIds(
  matches: Match[],
  messages: ChatMessage[],
  me: string,
  other: Profile,
  profileById: (id: string) => Profile | undefined,
) {
  const ids = new Set(pairMatchesForPerson(matches, me, other, profileById).map((m) => m.id))
  for (const m of messages) {
    if (m.senderId === other.id) ids.add(m.matchId)
  }
  return ids
}

export function messageFromRow(row: Record<string, unknown> | null | undefined): ChatMessage | null {
  if (!row?.id || !row.match_id || !row.sender_id || row.body == null) return null
  return {
    id: String(row.id),
    matchId: String(row.match_id),
    senderId: String(row.sender_id),
    body: String(row.body),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}
