export type PaymentMode = 'simulation' | 'live'

export type PaymentSettings = {
  mode: PaymentMode
  paypalEmail: string
  paypalClientId: string
  stripePublishableKey: string
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  mode: 'simulation',
  paypalEmail: 'nizarmas@gmail.com',
  paypalClientId: '',
  stripePublishableKey: '',
}

export function parsePaymentSettings(raw: unknown): PaymentSettings {
  const row = (raw ?? {}) as Record<string, unknown>
  const mode = row.mode === 'live' ? 'live' : 'simulation'
  return {
    mode,
    paypalEmail: String(row.paypal_email ?? DEFAULT_PAYMENT_SETTINGS.paypalEmail),
    paypalClientId: String(row.paypal_client_id ?? import.meta.env.VITE_PAYPAL_CLIENT_ID ?? ''),
    stripePublishableKey: String(row.stripe_publishable_key ?? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? ''),
  }
}
