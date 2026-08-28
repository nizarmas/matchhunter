import { supabase } from './supabase'
import type { AppNotification, ChatMessage, Match, MatchStatus, Profile, Questionnaire, Transaction } from './types'

export function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

type ProfileRow = {
  id: string
  phone: string | null
  email: string | null
  name: string
  photo: string | null
  gender: Questionnaire['gender'] | null
  looking_for: Questionnaire['lookingFor'] | null
  age: number | null
  partner_age_min: number | null
  partner_age_max: number | null
  region: Questionnaire['region'] | null
  city: string | null
  faith: Questionnaire['faith'] | null
  open_to_other_faiths: boolean | null
  goal: Questionnaire['goal'] | null
  kids: Questionnaire['kids'] | null
  languages: string[] | null
  bio: string | null
  questionnaire: Questionnaire | Record<string, unknown> | null
  onboarding_complete: boolean | null
  membership_until: string | null
  chat_warnings: number | null
  chat_blocked: boolean | null
  account_blocked: boolean | null
  last_seen: string | null
  created_at: string
}

type MatchRow = {
  id: string
  user_id: string
  candidate_id: string
  score: number | null
  reasons: string[] | null
  status: MatchStatus
  paid_at: string | null
  approved_at: string | null
  share_email: boolean | null
  share_phone: boolean | null
  created_at: string
}

const fallbackQ = (row: ProfileRow): Questionnaire => {
  const q = (row.questionnaire ?? {}) as Partial<Questionnaire>
  return {
    gender: q.gender ?? row.gender ?? 'female',
    lookingFor: q.lookingFor ?? row.looking_for ?? 'male',
    age: q.age ?? row.age ?? 28,
    partnerAgeMin: q.partnerAgeMin ?? row.partner_age_min ?? 25,
    partnerAgeMax: q.partnerAgeMax ?? row.partner_age_max ?? 40,
    region: q.region ?? row.region ?? 'jerusalem',
    city: q.city ?? row.city ?? '',
    faith: q.faith ?? row.faith ?? 'jewish_traditional',
    openToOtherFaiths: q.openToOtherFaiths ?? row.open_to_other_faiths ?? false,
    goal: q.goal ?? row.goal ?? 'marriage',
    kids: q.kids ?? row.kids ?? 'open',
    languages: (q.languages as Questionnaire['languages']) ?? (row.languages as Questionnaire['languages']) ?? ['he'],
    bio: q.bio ?? row.bio ?? '',
  }
}

export function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    phone: row.phone ?? '',
    email: row.email ?? undefined,
    name: row.name,
    photo: row.photo ?? undefined,
    questionnaire: fallbackQ(row),
    onboardingComplete: Boolean(row.onboarding_complete),
    membershipUntil: row.membership_until ?? undefined,
    chatWarnings: row.chat_warnings ?? 0,
    chatBlocked: Boolean(row.chat_blocked),
    accountBlocked: Boolean(row.account_blocked),
    lastSeen: row.last_seen ?? undefined,
    createdAt: row.created_at,
  }
}

export function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    userId: row.user_id,
    candidateId: row.candidate_id,
    score: row.score ?? 0,
    reasons: row.reasons ?? [],
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    shareEmail: Boolean(row.share_email),
    sharePhone: Boolean(row.share_phone),
  }
}

export function matchFromRow(row: Record<string, unknown> | null | undefined): Match | null {
  if (!row?.id || !row.user_id || !row.candidate_id || !row.status) return null
  return rowToMatch(row as unknown as MatchRow)
}

export function noteFromRow(row: Record<string, unknown> | null | undefined): AppNotification | null {
  if (!row?.id || !row.user_id || !row.type) return null
  return {
    id: String(row.id),
    userId: String(row.user_id),
    matchId: row.match_id ? String(row.match_id) : undefined,
    type: (row.type as AppNotification['type']) ?? 'message',
    body: String(row.body ?? ''),
    read: Boolean(row.read),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export async function fetchCloudProfileIds(): Promise<Set<string>> {
  if (!supabase) return new Set()
  const { data, error } = await supabase.from('profiles').select('id')
  if (error || !data) return new Set()
  return new Set(data.map((row) => row.id as string))
}

export async function fetchCloudProfiles(): Promise<Profile[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('profiles').select('*')
  if (error) throw error
  return ((data ?? []) as ProfileRow[]).map(rowToProfile)
}

export async function fetchCloudMatches(userId: string): Promise<Match[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .or(`user_id.eq.${userId},candidate_id.eq.${userId}`)
  if (error) throw error
  return ((data ?? []) as MatchRow[]).map(rowToMatch)
}

export async function fetchCloudMatchesAll(): Promise<Match[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('matches').select('*')
  if (error || !data) return []
  return (data as MatchRow[]).map(rowToMatch)
}

export async function fetchCloudNotifications(userId: string): Promise<AppNotification[]> {
  if (!supabase || !isUuid(userId)) return []
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    matchId: (row.match_id as string | null) ?? undefined,
    type: (row.type as AppNotification['type']) ?? 'message',
    body: (row.body as string) ?? '',
    read: Boolean(row.read),
    createdAt: row.created_at as string,
  }))
}

export async function markCloudNotificationsRead(userId: string) {
  if (!supabase || !isUuid(userId)) return
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
}

export async function markCloudMatchMessagesRead(userId: string, matchId: string) {
  if (!supabase || !isUuid(userId) || !isUuid(matchId)) return
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('match_id', matchId)
    .in('type', ['message', 'approved'])
    .eq('read', false)
}

function rowToMessage(m: { id: string; match_id: string; sender_id: string; body: string; created_at: string }): ChatMessage {
  return {
    id: m.id,
    matchId: m.match_id,
    senderId: m.sender_id,
    body: m.body,
    createdAt: m.created_at,
  }
}

export async function fetchCloudMessages(matchId: string): Promise<ChatMessage[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as { id: string; match_id: string; sender_id: string; body: string; created_at: string }[]).map(rowToMessage)
}

export async function fetchVisibleCloudMessages(): Promise<ChatMessage[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as { id: string; match_id: string; sender_id: string; body: string; created_at: string }[]).map(rowToMessage)
}

export async function upsertCloudProfile(p: Profile) {
  if (!supabase) return
  const q = p.questionnaire
  const payload = {
    id: p.id,
    phone: p.phone,
    email: p.email ?? null,
    name: p.name,
    photo: p.photo ?? null,
    gender: q.gender,
    looking_for: q.lookingFor,
    age: q.age,
    partner_age_min: q.partnerAgeMin,
    partner_age_max: q.partnerAgeMax,
    region: q.region,
    city: q.city,
    faith: q.faith,
    open_to_other_faiths: q.openToOtherFaiths,
    goal: q.goal,
    kids: q.kids,
    languages: q.languages,
    bio: q.bio,
    questionnaire: q,
    onboarding_complete: p.onboardingComplete,
    membership_until: p.membershipUntil ?? null,
    chat_warnings: p.chatWarnings ?? 0,
    chat_blocked: p.chatBlocked ?? false,
    account_blocked: p.accountBlocked ?? false,
  }
  const first = await supabase.from('profiles').upsert(payload)
  if (!first.error) return
  const {
    membership_until: _until,
    chat_warnings: _w,
    chat_blocked: _b,
    account_blocked: _ab,
    ...legacy
  } = payload
  void _until
  void _w
  void _b
  void _ab
  const { error } = await supabase.from('profiles').upsert(legacy)
  if (error) throw error
}

export async function upsertCloudMatches(matches: Match[]) {
  if (!supabase) return
  const rows = matches.filter((m) => isUuid(m.candidateId) && isUuid(m.userId) && isUuid(m.id))
  if (rows.length === 0) return
  const payload = rows.map((m) => ({
    id: m.id,
    user_id: m.userId,
    candidate_id: m.candidateId,
    score: m.score,
    reasons: m.reasons,
    status: m.status,
    paid_at: m.paidAt ?? null,
    approved_at: m.approvedAt ?? null,
    share_email: Boolean(m.shareEmail),
    share_phone: Boolean(m.sharePhone),
  }))

  async function write(list: Array<Record<string, unknown> & { id: string }>) {
    for (const row of list) {
      const { id, ...rest } = row
      const updated = await supabase!.from('matches').update(rest).eq('id', id).select('id')
      if (updated.error) return updated.error
      if (updated.data && updated.data.length > 0) continue
      const inserted = await supabase!.from('matches').insert(row)
      if (!inserted.error) continue
      if (!/duplicate|unique/i.test(inserted.error.message ?? '')) return inserted.error
      const byPair = await supabase!
        .from('matches')
        .update(rest)
        .eq('user_id', row.user_id as string)
        .eq('candidate_id', row.candidate_id as string)
        .select('id')
      if (byPair.error) return byPair.error
    }
    return null
  }

  const err = await write(payload)
  if (!err) return
  const missingShare = /share_email|share_phone|schema cache/i.test(err.message ?? '')
  if (!missingShare) throw err
  const stripped = payload.map(({ share_email, share_phone, ...rest }) => {
    void share_email
    void share_phone
    return rest
  })
  const retry = await write(stripped)
  if (retry) throw retry
}

export async function insertCloudTransaction(tx: Transaction) {
  if (!supabase) return
  if (tx.matchId && !isUuid(tx.matchId)) return
  await supabase.from('transactions').insert({
    id: tx.id,
    user_id: tx.userId,
    match_id: tx.matchId && isUuid(tx.matchId) ? tx.matchId : null,
    amount: tx.amount,
    currency: tx.currency,
    gateway: tx.gateway,
    payment_gateway_id: tx.paymentGatewayId,
    status: tx.status,
  })
}

export async function respondCloudMatch(
  matchId: string,
  approve: boolean,
  share?: { email?: boolean; phone?: boolean },
) {
  if (!supabase || !isUuid(matchId)) throw new Error('no_cloud')
  const rpc = await supabase.rpc('respond_to_match', {
    p_match_id: matchId,
    p_approve: approve,
    p_share_email: Boolean(share?.email),
    p_share_phone: Boolean(share?.phone),
  })
  if (!rpc.error) return
  const patch: Record<string, unknown> = {
    status: approve ? 'partner_approved' : 'declined',
  }
  if (approve) {
    patch.approved_at = new Date().toISOString()
    patch.share_email = Boolean(share?.email)
    patch.share_phone = Boolean(share?.phone)
  }
  const first = await supabase.from('matches').update(patch).eq('id', matchId)
  if (!first.error) return
  if (!/share_email|share_phone|schema cache/i.test(first.error.message ?? '')) throw first.error
  const { error } = await supabase.from('matches').update({
    status: patch.status,
    approved_at: patch.approved_at ?? null,
  }).eq('id', matchId)
  if (error) throw error
}

export async function wipeCloudChats() {
  if (!supabase) return
  const { error } = await supabase.rpc('wipe_my_chat_messages')
  if (error) throw error
}

export async function insertCloudMessage(msg: ChatMessage): Promise<{ via: 'rpc' | 'row'; id: string }> {
  if (!supabase || !isUuid(msg.matchId)) throw new Error('no_cloud')
  const rpc = await supabase.rpc('send_chat_message', {
    p_match_id: msg.matchId,
    p_body: msg.body,
    p_id: msg.id,
  })
  if (!rpc.error && rpc.data) return { via: 'rpc', id: String(rpc.data) }
  const { error } = await supabase.from('messages').insert({
    id: msg.id,
    match_id: msg.matchId,
    sender_id: msg.senderId,
    body: msg.body,
  })
  if (!error) return { via: 'row', id: msg.id }
  if (/duplicate|unique/i.test(error.message ?? '')) return { via: 'row', id: msg.id }
  throw error
}

export async function insertCloudNotification(userId: string, matchId: string | undefined, type: string, body: string) {
  if (!supabase || !isUuid(userId)) return
  await supabase.from('notifications').insert({
    user_id: userId,
    match_id: matchId && isUuid(matchId) ? matchId : null,
    type,
    body,
  })
}

export async function fetchCloudTransactions(): Promise<Transaction[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('transactions').select('*')
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    matchId: (row.match_id as string | null) ?? undefined,
    amount: Number(row.amount),
    currency: 'ILS' as const,
    gateway: (row.gateway as Transaction['gateway']) ?? 'demo',
    paymentGatewayId: (row.payment_gateway_id as string) ?? '',
    status: row.status as Transaction['status'],
    createdAt: row.created_at as string,
  }))
}

export async function fetchLastSeenMap() {
  const map = new Map<string, string>()
  if (!supabase) return map
  const { data, error } = await supabase.from('profiles').select('id, last_seen')
  if (error || !data) return map
  for (const row of data) {
    const seen = row.last_seen as string | null
    if (row.id && seen) map.set(row.id as string, seen)
  }
  return map
}

export async function touchLastSeen(userId: string) {
  if (!supabase || !isUuid(userId)) return
  if (typeof document !== 'undefined' && document.hidden) return
  await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId)
}

export { supabase }
