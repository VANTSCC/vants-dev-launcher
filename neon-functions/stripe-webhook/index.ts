// ============================================
// stripe-webhook — Neon Function
// Recibe webhooks de Stripe y activa entitlements/compras en la DB.
//   checkout.session.completed         -> alta de compra + entitlement activo
//   invoice.paid (renovacion)          -> extiende la vigencia del entitlement
//   customer.subscription.deleted      -> desactiva el entitlement
// Seguridad: verifica la firma HMAC-SHA256 del webhook (stripe-signature).
// Sin STRIPE_WEBHOOK_SECRET cargado la funcion RECHAZA todo (fail closed).
// ============================================

import { Pool } from 'pg';
import crypto from 'node:crypto';

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

// ------------------------------------------------------------
// Verificacion de firma (Stripe: t=<ts>,v1=<hex> sobre "<ts>.<payload>")
// ------------------------------------------------------------
function verificarFirma(payload: string, header: string): { ok: boolean; motivo?: string } {
  if (!header) return { ok: false, motivo: 'sin_firma' };
  let t = '';
  const v1s: string[] = [];
  for (const parte of header.split(',')) {
    const i = parte.indexOf('=');
    if (i <= 0) continue;
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  }
  if (!t || v1s.length === 0) return { ok: false, motivo: 'firma_malformada' };
  const edad = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(edad) || edad > 300) return { ok: false, motivo: 'timestamp_viejo' };
  const esperado = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(t + '.' + payload).digest();
  for (const v of v1s) {
    const recibido = Buffer.from(v, 'hex');
    if (recibido.length === esperado.length && crypto.timingSafeEqual(esperado, recibido)) return { ok: true };
  }
  return { ok: false, motivo: 'firma_invalida' };
}

// ------------------------------------------------------------
// Jugador: identidad = sub de Auth0. Tolerante al esquema real de players
// (usa auth0_sub; si la columna no existe prueba auth_user_id, patron linker).
// ------------------------------------------------------------
async function playerIdDeSub(sub: string): Promise<string | null> {
  try {
    const { rows } = await pool.query('SELECT id FROM players WHERE auth0_sub = $1 LIMIT 1', [sub]);
    if (rows[0]?.id) return rows[0].id;
  } catch { /* la columna puede no existir: probamos la alternativa */ }
  try {
    const { rows } = await pool.query('SELECT id FROM players WHERE auth_user_id = $1 LIMIT 1', [sub]);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

function sumaVencimiento(desde: Date, period: string | null): Date {
  const dias = period === 'yr' ? 365 : 30;
  return new Date(desde.getTime() + dias * 24 * 60 * 60 * 1000);
}

async function registrarAuditoria(actorId: string, action: string, meta: unknown): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, metadata) VALUES ('system', $1, $2, $3)`,
      [actorId, action, JSON.stringify(meta ?? {})]
    );
  } catch (e) {
    console.error('audit_logs no disponible:', String((e as Error).message ?? e));
  }
}

async function handleCheckoutSession(session: any): Promise<void> {
  const clientRef = session.client_reference_id;
  const plan = session.metadata?.plan || session.line_items?.data?.[0]?.price?.metadata?.plan;
  const period = session.metadata?.period || null;
  const subscriptionId = session.mode === 'subscription' ? session.subscription : null;

  if (!clientRef || !plan) {
    console.error('Missing client_reference_id or plan', { clientRef, plan });
    return;
  }

  const playerId = await playerIdDeSub(clientRef);
  if (!playerId) {
    console.error('No player found for auth0 sub', clientRef);
    return; // 200 igual: el checkout estuvo bien; sin jugador no hay que reintentar
  }

  const now = new Date();
  const expiresAt = period === 'one_time' ? null : sumaVencimiento(now, period);

  // Compra registrada (idempotente por session id: los reintentos no duplican)
  try {
    await pool.query(
      `INSERT INTO purchases (player_id, auth0_sub, product, tier, amount_cents, currency, payment_provider, payment_status, external_id, period, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'stripe', 'paid', $7, $8, $9)
       ON CONFLICT (external_id) DO NOTHING`,
      [playerId, clientRef, `plan_${plan}`, plan, session.amount_total ?? 0, session.currency?.toUpperCase() ?? 'EUR', session.id, period, now.toISOString()]
    );
  } catch (e) {
    console.error('purchases insert fallo:', String((e as Error).message ?? e));
  }

  // Entitlement activo (upsert: reactivar o extender si ya existia)
  try {
    await pool.query(
      `INSERT INTO entitlements (player_id, auth0_sub, entitlement_type, tier, source, is_active, expires_at, external_id, period, created_at, updated_at)
       VALUES ($1, $2, 'plan', $3, 'purchase', true, $4, $5, $6, $7, $7)
       ON CONFLICT (player_id, entitlement_type, tier) DO UPDATE
         SET is_active = true,
             auth0_sub = EXCLUDED.auth0_sub,
             external_id = COALESCE(EXCLUDED.external_id, entitlements.external_id),
             period = EXCLUDED.period,
             expires_at = CASE
               WHEN entitlements.expires_at IS NULL THEN EXCLUDED.expires_at
               WHEN EXCLUDED.expires_at IS NULL THEN entitlements.expires_at
               ELSE GREATEST(entitlements.expires_at, EXCLUDED.expires_at) END,
             updated_at = now()`,
      [playerId, clientRef, plan, expiresAt, subscriptionId ?? session.id, period, now.toISOString()]
    );
  } catch (e) {
    console.error('entitlements upsert fallo:', String((e as Error).message ?? e));
  }

  await registrarAuditoria(clientRef, 'plan_activated', { plan, period, session_id: session.id, subscription_id: subscriptionId });
}

async function handleInvoicePaid(invoice: any): Promise<void> {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return; // facturas de pago unico no renuevan entitlement
  const dias = invoice.lines?.data?.[0]?.price?.recurring?.interval === 'year' ? 365 : 30;
  try {
    const { rowCount } = await pool.query(
      `UPDATE entitlements
         SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(days => $2),
             is_active = true,
             updated_at = now()
       WHERE external_id = $1 AND is_active = true`,
      [subscriptionId, dias]
    );
    if (!rowCount) console.error('Renovacion sin entitlement para', subscriptionId);
  } catch (e) {
    console.error('invoice.paid fallo:', String((e as Error).message ?? e));
  }
}

async function handleSubscriptionDeleted(subscription: any): Promise<void> {
  try {
    await pool.query(
      `UPDATE entitlements SET is_active = false, updated_at = now() WHERE external_id = $1`,
      [subscription.id]
    );
  } catch (e) {
    console.error('subscription.deleted fallo:', String((e as Error).message ?? e));
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!STRIPE_WEBHOOK_SECRET) {
    // Fail closed: en produccion no se acepta ningun evento sin clave de firma
    return json({ error: 'falta_webhook_secret', env: 'STRIPE_WEBHOOK_SECRET' }, 503);
  }

  try {
    const signature = req.headers.get('stripe-signature') ?? '';
    const payload = await req.text();

    const firma = verificarFirma(payload, signature);
    if (!firma.ok) {
      console.error('Firma Stripe rechazada:', firma.motivo);
      return json({ error: 'invalid_signature', motivo: firma.motivo }, 401);
    }

    const event = JSON.parse(payload);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSession(event.data.object);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
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