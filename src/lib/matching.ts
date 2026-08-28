import { ADJACENT_REGIONS } from './regions'
import { FAITH_FAMILY } from './seed'
import type { Match, Profile, Questionnaire } from './types'

function uid() {
  return crypto.randomUUID()
}

function jewishDistance(a: string, b: string) {
  const order = ['jewish_secular', 'jewish_traditional', 'jewish_religious', 'jewish_haredi']
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  if (i < 0 || j < 0) return 99
  return Math.abs(i - j)
}

function digits(phone: string) {
  return phone.replace(/\D/g, '')
}

export function isSamePerson(me: Profile, them: Profile) {
  if (them.id === me.id) return true
  const a = digits(me.phone)
  const b = digits(them.phone)
  if (a.length >= 9 && a === b) return true
  if (me.email && them.email && me.email.toLowerCase() === them.email.toLowerCase()) return true
  return false
}

export function scoreMatch(me: Questionnaire, them: Profile) {
  const t = them.questionnaire
  const reasons: string[] = []
  let score = 0

  if (t.gender !== me.lookingFor || t.lookingFor !== me.gender) {
    return { score: 0, reasons, eligible: false }
  }

  if (t.age < me.partnerAgeMin - 12 || t.age > me.partnerAgeMax + 12) {
    return { score: 0, reasons, eligible: false }
  }
  if (t.age >= me.partnerAgeMin && t.age <= me.partnerAgeMax) {
    score += 28
    reasons.push('age')
  } else {
    score += 10
  }

  if (me.age >= t.partnerAgeMin && me.age <= t.partnerAgeMax) {
    score += 12
  }

  if (t.region === me.region) {
    score += 26
    reasons.push('region')
  } else if (ADJACENT_REGIONS[me.region].includes(t.region)) {
    score += 14
    reasons.push('nearby')
  }

  const sameFaith = t.faith === me.faith
  const sameFamily = FAITH_FAMILY[t.faith] === FAITH_FAMILY[me.faith]
  if (sameFaith) {
    score += 24
    reasons.push('faith')
  } else if (sameFamily && jewishDistance(me.faith, t.faith) === 1) {
    score += 14
    reasons.push('faith-close')
  } else if (sameFamily && jewishDistance(me.faith, t.faith) === 2) {
    score += 4
  } else if (!sameFamily && (me.openToOtherFaiths || t.openToOtherFaiths)) {
    score += 2
  } else if (!sameFamily) {
    score -= 20
  }

  if (t.goal === me.goal) {
    score += 16
    reasons.push('goal')
  } else if ((me.goal === 'marriage' && t.goal === 'serious') || (me.goal === 'serious' && t.goal === 'marriage')) {
    score += 8
  }

  const kidsOk =
    me.kids === 'open' || t.kids === 'open' || me.kids === t.kids || (me.kids === 'want' && t.kids === 'have') || (me.kids === 'have' && t.kids === 'want')
  if (me.kids === 'no' && t.kids === 'want') score -= 8
  else if (kidsOk) {
    score += 10
    reasons.push('kids')
  }

  const langOverlap = me.languages.filter((l) => t.languages.includes(l)).length
  if (langOverlap) {
    score += langOverlap * 5
    reasons.push('language')
  }

  return { score: Math.max(0, score), reasons, eligible: score >= 30 }
}

export function curateMatches(me: Profile, pool: Profile[], existing: Match[]): Match[] {
  const mine = existing.filter((m) => m.userId === me.id)
  const taken = new Set(mine.map((m) => m.candidateId))
  const scored = pool
    .filter((p) => !p.id.startsWith('seed-') && !isSamePerson(me, p) && p.onboardingComplete)
    .map((p) => ({ p, ...scoreMatch(me.questionnaire, p) }))
    .sort((a, b) => b.score - a.score)

  const ranked = [
    ...scored.filter((x) => x.eligible),
    ...scored.filter((x) => !x.eligible && x.p.questionnaire.gender === me.questionnaire.lookingFor && x.score > 0),
  ]

  const kept = mine.filter((m) => {
    const other = pool.find((p) => p.id === m.candidateId)
    if (other && isSamePerson(me, other)) return false
    return m.status !== 'declined' && m.status !== 'pending'
  })
  const pendingKeep = mine.filter((m) => m.status === 'pending' && ranked.some((r) => r.p.id === m.candidateId))

  const result = [...kept, ...pendingKeep]
  const have = new Set(result.map((m) => m.candidateId))

  for (const row of ranked) {
    if (result.length >= 4) break
    if (have.has(row.p.id) || taken.has(row.p.id)) continue
    result.push({
      id: uid(),
      userId: me.id,
      candidateId: row.p.id,
      score: row.score,
      reasons: row.reasons.length ? row.reasons : ['age'],
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
    have.add(row.p.id)
  }

  return result.slice(0, 4)
}
