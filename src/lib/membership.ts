export const MEMBER_PRICE_ILS = 39
export const MEMBER_MONTHS = 6

export function addMembershipPeriod(existingUntil?: string) {
  const now = new Date()
  const existing = existingUntil ? new Date(existingUntil) : now
  const from = existing.getTime() > now.getTime() ? existing : now
  const d = new Date(from)
  d.setMonth(d.getMonth() + MEMBER_MONTHS)
  return d.toISOString()
}

export function isMemberActive(membershipUntil?: string, lastPaymentAt?: string) {
  if (membershipUntil && new Date(membershipUntil).getTime() > Date.now()) return true
  if (lastPaymentAt) {
    const end = new Date(lastPaymentAt)
    end.setMonth(end.getMonth() + MEMBER_MONTHS)
    return end.getTime() > Date.now()
  }
  return false
}
