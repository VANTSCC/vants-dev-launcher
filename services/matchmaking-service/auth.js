// ============================================
// VANTS — auth.js · Fase 4 (Competición real)
// --------------------------------------------
// Verificación de JWT de Auth0 (RS256) por JWKS, SIN dependencias externas:
//  · Descarga https://<domain>/.well-known/jwks.json y cachea (1h, refresco
//    automático si llega un kid desconocido).
//  · Verifica firma (RS256, crypto.createVerify), exp, iss y (opcional) aud.
//  · Inyectable: crearAuthVerifier({ jwksProvider }) para tests.
// Devuelve { ok, sub, claims } — el sub (auth0|...) es la identidad que
// guarda matchmaking (columna sub del ticket; Fase 4 la persiste en Neon).
// ============================================
'use strict';
const crypto = require('crypto');

function b64urlJSON(part) {
  const json = Buffer.from(part, 'base64url').toString('utf8');
  return JSON.parse(json);
}

function findJwk(jwks, kid) {
  return (jwks.keys || []).find((k) => k.kid === kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256')) || null;
}

function jwkToPem(jwk) {
  const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return keyObject.export({ type: 'spki', format: 'pem' });
}

/**
 * crearAuthVerifier(opts)
 *  opts.domain      → 'vants.eu.auth0.com' (validación iss)
 *  opts.audience    → si se define, el token debe llevar aud == audience
 *  opts.jwksProvider→ opcional, async () => jwks (para tests)
 */
function crearAuthVerifier(opts = {}) {
  const domain = opts.domain || process.env.AUTH0_DOMAIN || 'vants.eu.auth0.com';
  const audience = opts.audience || process.env.AUTH0_AUDIENCE || null;
  const jwksProvider = opts.jwksProvider || null;

  let jwksCache = null;
  let jwksAt = 0;
  const TTL = 60 * 60 * 1000; // 1h

  async function getJwks(force) {
    if (jwksProvider) return jwksProvider();
    if (!force && jwksCache && Date.now() - jwksAt < TTL) return jwksCache;
    const res = await fetch(`https://${domain}/.well-known/jwks.json`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`JWKS ${res.status}`);
    jwksCache = await res.json();
    jwksAt = Date.now();
    return jwksCache;
  }

  /**
   * verify(token) → { ok:true, sub, claims } | { ok:false, error }
   * Nunca lanza: devuelve resultado para que el servicio responda 401 limpio.
   */
  async function verify(token) {
    try {
      if (!token || typeof token !== 'string') return { ok: false, error: 'token ausente' };
      const parts = token.split('.');
      if (parts.length !== 3) return { ok: false, error: 'formato inválido' };
      const header = b64urlJSON(parts[0]);
      const claims = b64urlJSON(parts[1]);
      if (header.alg !== 'RS256') return { ok: false, error: 'alg no soportado' };

      let jwks = await getJwks(false);
      let jwk = findJwk(jwks, header.kid);
      if (!jwk) { // rotación de clave: refresco forzado
        jwks = await getJwks(true);
        jwk = findJwk(jwks, header.kid);
      }
      if (!jwk) return { ok: false, error: 'kid desconocido' };

      const data = `${parts[0]}.${parts[1]}`;
      const signature = Buffer.from(parts[2], 'base64url');
      const ok = crypto.createVerify('RSA-SHA256').update(data).verify(jwkToPem(jwk), signature);
      if (!ok) return { ok: false, error: 'firma inválida' };

      const now = Math.floor(Date.now() / 1000);
      if (!claims.exp || claims.exp < now - 30) return { ok: false, error: 'expirado' };
      const iss = claims.iss ? String(claims.iss) : '';
      if (iss !== `https://${domain}/` && iss !== `https://${domain}`) return { ok: false, error: 'iss inválido' };
      if (audience && claims.aud !== audience) return { ok: false, error: 'aud inválido' };

      return { ok: true, sub: claims.sub, claims };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'verificación fallida' };
    }
  }

  return { verify, getJwks, domain };
}

module.exports = { crearAuthVerifier };
