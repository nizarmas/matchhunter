import { supabase } from './supabase'

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
