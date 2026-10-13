// ============================================
// stripe-webhook — Neon Function
// Recibe webhooks de Stripe y activa entitlements/compras en la DB
// ============================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function verifyStripeSignature(payload: string, signature: string): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET) return true;
  return true; // TODO: implement HMAC-SHA256 verification
}

async function handleCheckoutSession(session: any) {
  const clientRef = session.client_reference_id;
  const email = session.customer_details?.email;
  const plan = session.metadata?.plan || session.line_items?.data?.[0]?.price?.metadata?.plan;

  if (!clientRef || !plan) {
    console.error('Missing client_reference_id or plan', { clientRef, plan });
    return;
  }

  const { rows: players } = await pool.query(
    `SELECT id FROM players WHERE auth_user_id = $1 LIMIT 1`,
    [clientRef]
  );
  const playerId = players[0]?.id;
  if (!playerId) {
    console.error('No player found for auth_user_id', clientRef);
    return;
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await pool.query(
    `INSERT INTO purchases (player_id, product, tier, amount_cents, currency, payment_provider, payment_status, external_id, created_at)
     VALUES ($1, $2, $3, $4, $5, 'stripe', 'paid', $6, $7)`,
    [playerId, `plan_${plan}`, plan, session.amount_total ?? 0, session.currency?.toUpperCase() ?? 'EUR', session.id, now]
  );

  await pool.query(
    `INSERT INTO entitlements (player_id, entitlement_type, tier, source, is_active, expires_at, created_at)
     VALUES ($1, 'plan', $2, 'purchase', true, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [playerId, plan, expiresAt, now]
  );

  await pool.query(
    `INSERT INTO audit_logs (actor_type, actor_id, action, metadata) VALUES ('system', $1, 'plan_activated', $2)`,
    [clientRef, JSON.stringify({ plan, session_id: session.id })]
  );
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const signature = req.headers.get('stripe-signature') ?? '';
    const payload = await req.text();

    if (!await verifyStripeSignature(payload, signature)) {
      return json({ error: 'invalid_signature' }, 401);
    }

    const event = JSON.parse(payload);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSession(event.data.object);
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    return json({ received: true });
  } catch (e) {
    console.error('stripe-webhook error:', e);
    return json({ error: 'internal_error' }, 500);
  }
}
