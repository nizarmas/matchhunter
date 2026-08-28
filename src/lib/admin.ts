import { supabase } from './supabase'
import { DEFAULT_PAYMENT_SETTINGS, parsePaymentSettings, type PaymentSettings } from './payments'

function truthyAdmin(data: unknown) {
  return data === true || data === 'true' || data === 't'
}

async function rpcAdminFlag(name: 'is_current_user_admin' | 'is_admin') {
  if (!supabase) return { ok: false as const, value: false }
  const { data, error } = await supabase.rpc(name)
  if (error) return { ok: false as const, value: false }
  return { ok: true as const, value: truthyAdmin(data) }
}

export async function fetchIsCurrentUserAdmin() {
  if (!supabase) return false
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return false

  const primary = await rpcAdminFlag('is_current_user_admin')
  if (primary.ok) return primary.value

  const fallback = await rpcAdminFlag('is_admin')
  if (fallback.ok) return fallback.value

  return false
}

export async function setCloudAdminEmail(newEmail: string) {
  if (!supabase) throw new Error('cloud')
  const { error } = await supabase.rpc('set_admin_email', { new_email: newEmail.trim().toLowerCase() })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_admin')) throw new Error('not_admin')
    if (msg.includes('invalid_email')) throw new Error('invalid_email')
    if (msg.includes('email_not_registered')) throw new Error('email_not_registered')
    throw new Error(msg || 'admin_error')
  }
}

export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  if (!supabase) return DEFAULT_PAYMENT_SETTINGS
  const { data, error } = await supabase.rpc('get_payment_settings')
  if (error || !data) return DEFAULT_PAYMENT_SETTINGS
  return parsePaymentSettings(data)
}

export async function setCloudPaymentSettings(next: PaymentSettings) {
  if (!supabase) throw new Error('cloud')
  const { error } = await supabase.rpc('set_payment_settings', {
    new_mode: next.mode,
    new_paypal_email: next.paypalEmail,
    new_paypal_client_id: next.paypalClientId,
    new_stripe_publishable_key: next.stripePublishableKey,
  })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_admin')) throw new Error('not_admin')
    if (msg.includes('invalid_email')) throw new Error('invalid_email')
    throw new Error(msg || 'admin_error')
  }
}

export async function cloudDeleteCustomer(profileId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_delete_customer', { target_id: profileId })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('cannot_delete_self')) throw new Error('cannot_delete_self')
    if (msg.includes('cannot_delete_admin')) throw new Error('cannot_delete_admin')
    throw new Error(msg || 'admin_error')
  }
}

export async function cloudRevokeMembership(profileId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_revoke_membership', { target_id: profileId })
  if (error) throw new Error(error.message || 'admin_error')
}

export async function cloudResetAllMemberships() {
  if (!supabase) return
  const rpc = await supabase.rpc('reset_customer_memberships')
  if (!rpc.error) return

  const a = await supabase.from('profiles').update({ membership_until: null }).neq('id', '00000000-0000-0000-0000-000000000000')
  const b = await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const c = await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  if (a.error || b.error || c.error) {
    throw new Error(rpc.error.message || a.error?.message || b.error?.message || c.error?.message || 'admin_error')
  }
}
