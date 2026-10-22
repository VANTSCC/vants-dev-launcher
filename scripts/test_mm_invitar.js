// ============================================
// VANTS — test_mm_invitar.js
// --------------------------------------------
// Invitaciones flexibles (migra 32): validación estática de
// db/migrations/32-mm-invitar-nick.sql + de la UI del HUB.
//   A) SQL: email con '@' / nick sin '@', remitente excluido,
//      desempate determinista (creado_at DESC), guards intactos.
//   B) HUB: input acepta nick, mensajes claros de destino.
// Sin red, sin Neon: lectura de archivos + asserts.
// Uso: node scripts/test_mm_invitar.js → PASS/FAIL + exit code.
// ============================================
'use strict';
const fs = require('fs');
const path = require('path');

let pasan = 0;
let fallan = 0;
function ok(cond, nombre) {
  if (cond) { pasan += 1; console.log(`  PASS  ${nombre}`); }
  else { fallan += 1; console.log(`  FAIL  ${nombre}`); }
}

(async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '32-mm-invitar-nick.sql'), 'utf8');
  const mm = fs.readFileSync(
    path.join(__dirname, '..', 'desktop-electron', 'renderer', 'mm.js'), 'utf8');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'desktop-electron', 'renderer', 'index.html'), 'utf8');

  console.log('\n— A) Migra 32 · mm_invitar por email o nick —');
  ok(sql.includes('CREATE OR REPLACE FUNCTION mm_invitar'), 'mm_invitar re-emitida');
  ok((sql.match(/SECURITY DEFINER/g) || []).length >= 1, 'sigue SECURITY DEFINER');
  ok(/position\('@' in v_q\) > 0/.test(sql), "input con '@' → búsqueda por email");
  ok(/ELSE[\s\S]*lower\(btrim\(username\)\) = v_q OR lower\(btrim\(display_name\)\) = v_q/.test(sql), "input sin '@' → búsqueda por nick (username/display_name)");
  ok(/lower\(btrim\(email\)\) = v_q\s*\n?\s*AND auth0_sub IS NOT NULL AND auth0_sub <> v_from/.test(sql.replace(/\r/g, '')), 'email: remitente excluido del lookup');
  ok(/auth0_sub IS NOT NULL AND auth0_sub <> v_from[\s\S]{0,120}ORDER BY created_at DESC/.test(sql.replace(/\r/g, '')), 'desempate determinista: perfil más reciente');
  ok(sql.includes("'destino_es_tu_email'"), 'self-match detectado (destino_es_tu_email)');
  ok(sql.includes("'destino_no_encontrado'"), 'sin match → destino_no_encontrado');
  ok(/length\(v_q\) < 2/.test(sql), 'input mínimo 2 caracteres');
  ok((sql.match(/mm_jwt_sub\(\)/g) || []).length >= 1 && /v_from := mm_jwt_sub\(\)/.test(sql), 'guard de identidad JWT intacto (v_from := mm_jwt_sub)');
  ok(sql.includes("'sin_sesion'") && sql.includes("'no_elegible'") && sql.includes("'mode_invalido'"), 'errores previos conservados (compatibilidad)');
  ok(sql.includes("UPDATE mm_invites SET status = 'expirada'"), 'barrido de vencidos intacto');
  ok(sql.includes('ON CONFLICT') === false && sql.includes('reutilizada'), 'anti-duplicado por pareja+juego intacto (reutilizada)');
  ok(!/LIMIT 1;[\s\S]*lower\(email\) = lower/.test(sql), 'ya no hay LIMIT 1 ciego por email (migra 24)');

  console.log('\n— B) HUB · input y mensajes —');
  ok(/if \(!email \|\| email\.length < 2\)/.test(mm), 'mm.js ya no exige "@" (acepta nick)');
  ok(mm.includes('escribí el email o el nick del jugador'), 'mensaje: email o nick');
  ok(mm.includes('nadie con ese email o nick tiene perfil VANTS'), 'mensaje destino_no_encontrado accionable');
  ok(mm.includes('ese sos vos — invitá a tu amigo con SU email o nick'), 'mensaje destino_es_tu_email accionable');
  ok(html.includes('EMAIL O NICK DEL JUGADOR'), 'label del formulario actualizado');
  ok(html.includes('placeholder="jugador@correo.com o nick"'), 'placeholder del input actualizado');
  ok(html.includes('type="text" placeholder="jugador@correo.com o nick"'), 'input ya no es type=email (bloquearía nicks)');

  console.log(`\n============================================`);
  console.log(`  MM INVITAR · ${pasan} ✓ · ${fallan} ✗`);
  console.log(`============================================`);
  process.exit(fallan > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
