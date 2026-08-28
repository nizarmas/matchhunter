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
