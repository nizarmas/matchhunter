import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { MEMBER_MONTHS, MEMBER_PRICE_ILS } from '../lib/membership'
import { supabase } from '../lib/supabase'

export function Checkout({
  matchId,
  onPaid,
}: {
  matchId: string
  onPaid: (gatewayId: string, gateway: 'paypal' | 'stripe' | 'demo') => void
}) {
  const { t, paymentSettings } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const live = paymentSettings.mode === 'live'
  const paypalId = paymentSettings.paypalClientId.trim()
  const stripePk = paymentSettings.stripePublishableKey.trim()

  function demoPay() {
    if (live) return
    setBusy(true)
    window.setTimeout(() => {
      onPaid(`demo-${matchId}-${Date.now()}`, 'demo')
      setBusy(false)
    }, 700)
  }

  async function payStripe() {
    if (!supabase || !stripePk) return
    setBusy(true)
    setError('')
    const origin = window.location.origin
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    const path = `${origin}${base}/app/unlock/${matchId}`
    const { data, error: fnErr } = await supabase.functions.invoke('create-stripe-checkout', {
      body: {
        matchId,
        successUrl: `${path}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: path,
      },
    })
    if (fnErr || !data?.url) {
      setError(t.stripeNotReady)
      setBusy(false)
      return
    }
    window.location.href = data.url as string
  }

  if (!live) {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl bg-gold/20 px-4 py-3 text-sm font-semibold">{t.simulationBanner}</p>
        <button
          type="button"
          disabled={busy}
          onClick={demoPay}
          className="w-full rounded-2xl bg-gold py-3 font-bold text-ink disabled:opacity-60"
        >
          {busy ? t.paying : t.demoPay}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {paypalId ? (
        <PayPalScriptProvider
          options={{
            clientId: paypalId,
            currency: 'ILS',
            intent: 'capture',
            components: 'buttons',
          }}
        >
          <p className="text-sm font-semibold text-ink/70">
            {t.payPal} · {paymentSettings.paypalEmail}
          </p>
          <PayPalButtons
            style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' }}
            createOrder={(_, actions) =>
              actions.order.create({
                intent: 'CAPTURE',
                purchase_units: [
                  {
                    amount: { currency_code: 'ILS', value: MEMBER_PRICE_ILS.toFixed(2) },
                    description: `MatchHunter ${MEMBER_MONTHS}-month membership ₪${MEMBER_PRICE_ILS}`,
                    payee: { email_address: paymentSettings.paypalEmail },
                  },
                ],
              })
            }
            onApprove={async (_, actions) => {
              const details = await actions.order?.capture()
              onPaid(details?.id ?? `paypal-${Date.now()}`, 'paypal')
            }}
            onError={() => setError(t.payFailed)}
          />
        </PayPalScriptProvider>
      ) : (
        <p className="rounded-2xl bg-mist px-4 py-3 text-sm">{t.paypalNotConfigured}</p>
      )}

      {stripePk ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void payStripe()}
          className="w-full rounded-2xl bg-ink py-3 font-bold text-paper disabled:opacity-60"
        >
          {busy ? t.paying : t.stripePay}
        </button>
      ) : (
        <p className="text-xs text-ink/45">{t.stripeSoon}</p>
      )}
      {error && <p className="text-sm text-wine">{error}</p>}
    </div>
  )
}
