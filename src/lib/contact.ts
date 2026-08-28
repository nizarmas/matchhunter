import type { Match, Profile } from './types'

export function otherSharedContact(match: Match, other: Profile) {
  if (other.id !== match.candidateId) {
    return { phone: '', email: '' }
  }
  return {
    phone: match.sharePhone ? other.phone : '',
    email: match.shareEmail ? (other.email ?? '') : '',
  }
}

export function pairSharedContact(matches: Match[], other: Profile) {
  let phone = ''
  let email = ''
  for (const m of matches) {
    const c = otherSharedContact(m, other)
    if (c.phone) phone = c.phone
    if (c.email) email = c.email
  }
  return { phone, email }
}
