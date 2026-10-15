// ============================================
// stripe-checkout — Neon Function
// Crea Sesiones de Checkout REALES de Stripe (modo live) y devuelve la URL
//   POST /api/checkout/start  { plan, period?, fee_cents?, name? }  (Bearer JWT Auth0) -> { url }
//   GET  /                    -> diagnostico: que claves faltan
// El pago se completa en el checkout hosted de Stripe; la web recibe el alta por
// el webhook (stripe-webhook). La clave secreta vive SOLO en esta funcion.
// Precios del catalogo live (se pueden sobreescribir por variable de entorno).
// ============================================

import { Pool } from 'pg';
import crypto from 'node:crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const AUTH0_DOMAIN = (process.env.AUTH0_DOMAIN ?? 'vants.eu.auth0.com').replace(/^https?:\/\//, '');
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE ?? '';
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? '';
const APP_URL = (process.env.VANTS_SITE_URL ?? 'https://feispla.github.io/Vants').replace(/\/$/, '');
const LOCAL_URL = 'http://localhost:8788';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';

const subt = (globalThis.crypto && globalThis.crypto.subtle) || crypto.webcrypto.subtle;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ------------------------------------------------------------
// Catalogo de precios (modo live, cuenta acct_1UHFf4EamHVhBbtr).
// Cada entrada se puede sobreescribir con STRIPE_PRICE_<PLAN>_<PERIODO>.
// ------------------------------------------------------------
const PRECIOS: Record<string, string> = {
  pro_mo: process.env.STRIPE_PRICE_PRO_MO ?? 'price_1UQbuSEamHVhBbtrZvi0ck4v',
  pro_yr: process.env.STRIPE_PRICE_PRO_YR ?? 'price_1UQbuSEamHVhBbtroeerOl5q',
  creator_mo: process.env.STRIPE_PRICE_CREATOR_MO ?? 'price_1UQbuSEamHVhBbtrYT9nich8',
  creator_yr: process.env.STRIPE_PRICE_CREATOR_YR ?? 'price_1UQbuSEamHVhBbtr699fCPMX',
  pase: process.env.STRIPE_PRICE_PASE ?? 'price_1UQbuSEamHVhBbtrzOfVkmPs',
};

// ------------------------------------------------------------
// JWT de Auth0: firma RS256 contra el JWKS del tenant (patron del linker)
// ------------------------------------------------------------
let jwksCache: { keys: Record<string, unknown>[]; t: number } | null = null;
async function jwks(): Promise<Record<string, unknown>[]> {
  if (jwksCache && Date.now() - jwksCache.t < 3600_000) return jwksCache.keys;
  const r = await fetch('https://' + AUTH0_DOMAIN + '/.well-known/jwks.json');
  const d = await r.json().catch(() => null);
  if (!d?.keys) throw new Error('jwks');
  jwksCache = { keys: d.keys, t: Date.now() };
  return d.keys;
}

const b64u = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

async function validarJWT(token: string): Promise<{ sub: string; email: string | null }> {
  const partes = token.split('.');
  if (partes.length !== 3) throw new Error('jwt_malo');
  const cab = JSON.parse(b64u(partes[0]));
  const cuerpo = JSON.parse(b64u(partes[1]));
  const llave = (await jwks()).find((k) => String((k as { kid?: string }).kid) === String(cab.kid));
  if (!llave) throw new Error('jwt_kid');
  const pub = await subt.importKey(
    'jwk',
    llave as unknown as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = new TextEncoder().encode(partes[0] + '.' + partes[1]);
  const sig = Buffer.from(partes[2], 'base64url');
  const ok = await subt.verify('RSASSA-PKCS1-v1_5', pub, sig, data);
  if (!ok) throw new Error('jwt_firma');
  if (cuerpo.iss !== 'https://' + AUTH0_DOMAIN + '/') throw new Error('jwt_iss');
  if (cuerpo.exp && cuerpo.exp * 1000 < Date.now()) throw new Error('jwt_exp');
  if (AUTH0_AUDIENCE && cuerpo.aud) {
    const auds = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
    const valeApi = auds.includes(AUTH0_AUDIENCE);
    const valeId = AUTH0_CLIENT_ID ? auds.includes(AUTH0_CLIENT_ID) : false;
    if (!valeApi && !valeId) throw new Error('jwt_aud');
  }
  return { sub: String(cuerpo.sub), email: typeof cuerpo.email === 'string' ? cuerpo.email : null };
}

function retornoSeguro(return_to: string): string {
  if (!return_to) return APP_URL + '/';
  try {
    const u = new URL(return_to);
    if (u.origin === APP_URL || u.origin === LOCAL_URL) return u.origin + u.pathname;
  } catch { /* invalida */ }
  return APP_URL + '/';
}

// ------------------------------------------------------------
// Stripe REST sin SDK (form-encoded, como pide la API)
// ------------------------------------------------------------
async function stripeCrearSesion(params: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('stripe_' + r.status + (d?.error?.message ? ': ' + d.error.message : ''));
  return d as Record<string, unknown>;
}

type Intento = {
  plan: string;
  period?: string;
  fee_cents?: number;
  name?: string;
  return_to?: string;
};

async function crearCheckout(sub: string, email: string | null, body: Intento): Promise<Response> {
  const plan = String(body?.plan ?? '');
  const period = plan === 'fee' ? 'one_time' : (body?.period === 'yr' ? 'yr' : 'mo');

  if (plan !== 'fee' && plan !== 'pase' && plan !== 'pro' && plan !== 'creator') {
    return json({ error: 'plan_desconocido', plan }, 400);
  }

  const return_to = retornoSeguro(String(body?.return_to ?? ''));
  const exito = return_to + '?paid=' + encodeURIComponent(plan);
  const fallo = return_to + '?paid=cancel';

  const params: Record<string, string> = {
    mode: plan === 'pase' || plan === 'fee' ? 'payment' : 'subscription',
    success_url: exito,
    cancel_url: fallo,
    client_reference_id: sub,
    'metadata[app]': 'vants-games',
    'metadata[plan]': plan,
    'metadata[period]': period,
    'line_items[0][quantity]': '1',
  };
  if (email) params['customer_email'] = email;
  // Para suscripciones el alta por renovacion llega con invoice.paid: el plan viaja
  // en la metadata de la suscripcion y del precio (el webhook lee cualquiera).
  if (params.mode === 'subscription') {
    params['subscription_data[metadata][app]'] = 'vants-games';
    params['subscription_data[metadata][plan]'] = plan;
    params['subscription_data[metadata][period]'] = period;
  }

  if (plan === 'fee') {
    // Fee de inscripcion: importe dinamico que manda la web (validado >= 0.50 EUR)
    const cents = Math.round(Number(body?.fee_cents ?? 0));
    if (!Number.isFinite(cents) || cents < 50 || cents > 10_000_00) {
      return json({ error: 'fee_invalido', detalle: 'El importe del fee esta fuera de rango' }, 400);
    }
    const nombre = 'Fee de inscripción · ' + String(body?.name ?? 'Torneo VANTS').slice(0, 80);
    params['line_items[0][price_data][currency]'] = 'eur';
    params['line_items[0][price_data][unit_amount]'] = String(cents);
    params['line_items[0][price_data][tax_behavior]'] = 'inclusive';
    params['line_items[0][price_data][product_data][name]'] = nombre;
    params['line_items[0][price_data][product_data][metadata][app]'] = 'vants-games';
    params['line_items[0][price_data][product_data][metadata][plan]'] = 'fee';
  } else {
    const precio = PRECIOS[plan + '_' + period] ?? PRECIOS[plan];
    if (!precio) return json({ error: 'precio_faltante', plan, period }, 500);
    params['line_items[0][price]'] = precio;
  }

  const sesion = await stripeCrearSesion(params);
  const url = (sesion as { url?: string }).url;
  if (!url) throw new Error('sin_url_checkout');
  return json({ ok: true, url });
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ruta = url.pathname.replace(/\/$/, '');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Diagnostico: que claves hay / faltan (abrir la URL de la funcion en el navegador)
  if (ruta === '' || ruta === '/') {
    const estado: Record<string, string> = {
      _version: 'v7-rk-live',
      _stripe_secret_key: STRIPE_SECRET_KEY
        ? /^(sk|rk)_live_/.test(STRIPE_SECRET_KEY) ? 'ok (live, sk/rk)' : 'cargada pero NO es live (revisar modo)'
        : 'falta STRIPE_SECRET_KEY (clave live sk_live_ o rk_live_ con permiso Checkout Sessions: Write)',
      _vants_site_url: 'ok (' + APP_URL + ')',
      _tabla: 'purchases + entitlements (migracion 05-pagos.sql)',
    };
    for (const [k, v] of Object.entries(PRECIOS)) estado['precio ' + k] = v ? 'ok (' + v.slice(0, 12) + '…)' : 'falta';
    return json({ ok: true, function: 'stripe-checkout', estado });
  }

  if (ruta === '/api/checkout/start' && req.method === 'POST') {
    if (!STRIPE_SECRET_KEY) {
      return json({ error: 'falta_clave', env: 'STRIPE_SECRET_KEY', nota: 'Cargar la clave live sk_live_... en las variables de esta funcion' }, 500);
    }
    try {
      const auth = req.headers.get('authorization') ?? '';
      if (!auth.startsWith('Bearer ')) return json({ error: 'sin_sesion' }, 401);
      const { sub, email } = await validarJWT(auth.slice(7));
      const body = await req.json().catch(() => ({}));
      return await crearCheckout(sub, email, body);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      const status = msg.startsWith('jwt_') ? 401 : 500;
      return json({ error: 'checkout_fallo', detalle: msg }, status);
    }
  }

  return json({ error: 'ruta_desconocida', ruta }, 404);
}