import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { MEMBER_MONTHS, MEMBER_PRICE_ILS } from '../lib/membership'

const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined

export function PayPalUnlock({
  matchId,
  onPaid,
}: {
  matchId: string
  onPaid: (gatewayId: string, gateway: 'paypal' | 'demo') => void
}) {
  const { t } = useApp()
  const [busy, setBusy] = useState(false)

  function demoPay() {
    setBusy(true)
    window.setTimeout(() => {
      onPaid(`demo-${matchId}-${Date.now()}`, 'demo')
      setBusy(false)
    }, 700)
  }

  return (
    <div className="space-y-3">
      {clientId ? (
        <PayPalScriptProvider
          options={{
            clientId,
            currency: 'ILS',
            intent: 'capture',
            components: 'buttons',
          }}
        >
          <p className="text-sm font-semibold text-ink/70">{t.payPal}</p>
          <PayPalButtons
            style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' }}
            createOrder={(_, actions) =>
              actions.order.create({
                intent: 'CAPTURE',
                purchase_units: [
                  {
                    amount: { currency_code: 'ILS', value: MEMBER_PRICE_ILS.toFixed(2) },
                    description: `MatchHunter ${MEMBER_MONTHS}-month membership ₪${MEMBER_PRICE_ILS}`,
                  },
                ],
              })
            }
            onApprove={async (_, actions) => {
              const details = await actions.order?.capture()
              onPaid(details?.id ?? `paypal-${Date.now()}`, 'paypal')
            }}
          />
        </PayPalScriptProvider>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={demoPay}
          className="w-full rounded-2xl bg-gold py-3 font-bold text-ink disabled:opacity-60"
        >
          {busy ? t.paying : t.demoPay}
        </button>
      )}
    </div>
  )
}
