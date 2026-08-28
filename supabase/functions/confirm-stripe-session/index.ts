import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secret) return json({ error: 'stripe_not_configured' }, 501)

  const auth = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const sessionId = String(body.sessionId ?? '')
  if (!sessionId.startsWith('cs_')) return json({ error: 'invalid_session' }, 400)

  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const session = await stripeRes.json()
  if (!stripeRes.ok) return json({ error: 'stripe_error' }, 400)
  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return json({ error: 'not_paid' }, 402)
  }
  if (session.metadata?.user_id && session.metadata.user_id !== userData.user.id) {
    return json({ error: 'mismatch' }, 403)
  }
  return json({
    paid: true,
    sessionId: session.id,
    matchId: session.metadata?.match_id ?? null,
  })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
