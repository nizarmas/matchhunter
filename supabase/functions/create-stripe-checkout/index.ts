import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secret) {
    return json({ error: 'stripe_not_configured' }, 501)
  }

  const auth = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const successUrl = String(body.successUrl ?? '')
  const cancelUrl = String(body.cancelUrl ?? '')
  if (!matchId || !successUrl || !cancelUrl) return json({ error: 'invalid_body' }, 400)

  const { data: settings } = await supabase.rpc('get_payment_settings')
  const mode = (settings as { mode?: string } | null)?.mode
  if (mode !== 'live') return json({ error: 'simulation_mode' }, 400)

  const amount = 3900
  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  params.set('client_reference_id', userData.user.id)
  params.set('metadata[user_id]', userData.user.id)
  params.set('metadata[match_id]', matchId)
  params.set('line_items[0][quantity]', '1')
  params.set('line_items[0][price_data][currency]', 'ils')
  params.set('line_items[0][price_data][unit_amount]', String(amount))
  params.set('line_items[0][price_data][product_data][name]', 'MatchHunter membership 6 months')

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })
  const session = await stripeRes.json()
  if (!stripeRes.ok || !session.url) return json({ error: session.error?.message ?? 'stripe_error' }, 400)
  return json({ url: session.url, id: session.id })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
