import type { ChatMessage, Match, Profile } from './types'
import { pairMatchesForPerson } from './pair'

export function pairChannelName(a: string, b: string) {
  return `mh-pair-${[a, b].sort().join('-')}`
}

function sameBubble(a: ChatMessage, b: ChatMessage) {
  if (a.senderId !== b.senderId) return false
  if (a.body.trim() !== b.body.trim()) return false
  return Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) < 10 * 60 * 1000
}

export function dedupeChatMessages(list: ChatMessage[]) {
  if (list.length < 2) return list
  const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const kept: ChatMessage[] = []
  const seenId = new Set<string>()
  for (const msg of sorted) {
    if (seenId.has(msg.id)) continue
    const dupAt = kept.findIndex((m) => sameBubble(m, msg))
    if (dupAt >= 0) {
      const prev = kept[dupAt]
      kept[dupAt] = {
        ...prev,
        createdAt: prev.createdAt <= msg.createdAt ? prev.createdAt : msg.createdAt,
      }
      seenId.add(msg.id)
      continue
    }
    seenId.add(msg.id)
    kept.push(msg)
  }
  return kept
}

export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) return dedupeChatMessages(existing)
  const map = new Map(existing.map((m) => [m.id, m]))
  for (const msg of incoming) {
    if (!map.has(msg.id)) map.set(msg.id, msg)
  }
  const next = dedupeChatMessages([...map.values()])
  return next
}

export function reconcileCloudMessages(local: ChatMessage[], cloud: ChatMessage[]) {
  const cloudIds = new Set(cloud.map((m) => m.id))
  const pending = local.filter((m) => {
    if (cloudIds.has(m.id)) return false
    const age = Date.now() - Date.parse(m.createdAt)
    return Number.isFinite(age) && age >= 0 && age < 20_000
  })
  return mergeChatMessages(cloud, pending)
}

export function dropPairChat(messages: ChatMessage[], matches: Match[], by: string) {
  const dropIds = new Set(
    matches.filter((m) => m.userId === by || m.candidateId === by).map((m) => m.id),
  )
  return messages.filter((m) => m.senderId !== by && !dropIds.has(m.matchId))
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
