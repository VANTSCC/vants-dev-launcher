'use strict';
// ============================================================
// SANDBOX del AGENTE VANTS — ejecución aislada y auditada.
// La sandbox "autoalojada" del agente es el entorno efímero donde
// ya corre: el runner de GitHub Actions (autoalojado para nosotros,
// 0 €) o la máquina local. NUNCA servicios de pago (Railway/Render).
//
// Reglas de seguridad (defensa en profundidad):
//   1. ALLOWLIST por segmento de pipeline: solo comandos de lectura y
//      node/npm/python3 para scripts del propio repo.
//   2. DENYLIST dura: rm/sudo/ssh/git push/curl POST/secretos...
//   3. Prohibidos: backticks, $(...), redirecciones > y >>, varios
//      comandos con ; o &&, background &.
//   4. Timeout (defecto 10 s, máx 30 s) y salida recortada (32 KB).
//   5. TODO queda auditado en agent_sandbox_execs (Neon/RAM).
// ============================================================

const { spawn } = require('child_process');

const SEGMENTOS_PERMITIDOS = /^(node|npm|npx|python3|pip3?|ls|cat|head|tail|wc|grep|rg|find|echo|date|uname|df|du|ps|sleep|sort|uniq|cut|awk|sed -n|jq)\b/;
const DENYLIST = /\b(rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)|sudo|su\s|ssh|scp|killall|shutdown|reboot|mkfs|dd\s|chmod\s+777|chown|curl\s+[^|]*-X\s*(POST|PUT|DELETE|PATCH)|wget|gh\s+(secret|auth)|git\s+(push|reset\s+--hard|clean|checkout\s+--|rm)|npm\s+(publish|logout)|eval\b)/i;
const SECRETES = /(ghp_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{20,}|xox[bap]-|AKIA[0-9A-Z]{16}|-----BEGIN)/;

function crearSandbox(opciones = {}) {
  const memoria = opciones.memoria; // auditoría (opcional; tests pueden omitir)
  const cwd = opciones.cwd || process.cwd();
  const execImpl = opciones.execImpl || null; // inyectable para tests
  const timeoutMsDefecto = Number(opciones.timeoutMs || 10000);
  const timeoutMsMax = 30000;
  const maxSalida = Number(opciones.maxSalida || 32768);

  // valida la cadena completa: segmentos de pipeline contra allowlist+denylist
  function validar(comando) {
    const c = String(comando || '').trim();
    if (!c) return 'comando vacío';
    if (c.length > 2000) return 'comando demasiado largo (máx 2000)';
    if (/`|\$\(|;|&|\{\s*\/|\n/.test(c)) return 'no se permiten múltiples comandos ni sustituciones (`/$(...)/;/&)';
    if (/>|</.test(c)) return 'no se permiten redirecciones (> <)';
    if (DENYLIST.test(c)) return 'comando bloqueado por la denylist de seguridad';
    if (SECRETES.test(c)) return 'el comando parece contener un secreto; nunca pegues claves';
    const segmentos = c.split('|').map((s) => s.trim()).filter(Boolean);
    for (const seg of segmentos) {
      if (!SEGMENTOS_PERMITIDOS.test(seg)) return `comando no permitido en la allowlist: "${seg.split(/\s+/)[0]}"`;
    }
    return null;
  }

  function ejecutarReal(comando, timeoutMs) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const child = spawn('bash', ['-c', comando], { cwd, env: { ...process.env, CI: process.env.CI || '' }, detached: false });
      let stdout = '', stderr = '', recortado = false, terminado = false;
      const acumula = (buf, esSalida) => {
        const trozo = buf.toString('utf8');
        if (esSalida) stdout += trozo; else stderr += trozo;
        if (stdout.length + stderr.length > maxSalida) {
          stdout = stdout.slice(0, maxSalida); stderr = stderr.slice(0, Math.max(0, maxSalida - stdout.length));
          recortado = true;
        }
      };
      child.stdout.on('data', (b) => acumula(b, true));
      child.stderr.on('data', (b) => acumula(b, false));
      const timer = setTimeout(() => { if (!terminado) { terminado = true; try { child.kill('SIGKILL'); } catch {} } }, timeoutMs);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (terminado) return resolve({ exitCode: 124, stdout, stderr: stderr + '\n[sandbox] TIMEOUT de ' + timeoutMs + ' ms', duracionMs: Date.now() - t0, timeout: true, recortado });
        if (recortado) stdout += '\n[sandbox] salida recortada al límite de ' + maxSalida + ' bytes';
        resolve({ exitCode: code, stdout, stderr, duracionMs: Date.now() - t0, timeout: false, recortado });
      });
      child.on('error', (e) => { clearTimeout(timer); resolve({ exitCode: 127, stdout, stderr: String(e.message), duracionMs: Date.now() - t0, timeout: false, recortado }); });
    });
  }

  return {
    tipo: () => 'sandbox-autoalojada',
    donde: () => ({ cwd, host: process.env.RUNNER_NAME || 'local', runner: process.env.ImageOS || require('os').type() }),
    // valida sin ejecutar (para tests y para el eco del ciclo)
    validar,
    // ejecuta: valida → corre → audita → devuelve resumen en texto
    async ejecutar(comando, o = {}) {
      const motivo = validar(comando);
      if (motivo) return { permitido: false, exitCode: null, texto: `[sandbox] RECHAZADO: ${motivo}` };
      const timeoutMs = Math.max(1000, Math.min(timeoutMsMax, Number(o.timeoutMs) || timeoutMsDefecto));
      const r = execImpl
        ? await execImpl(comando, timeoutMs, cwd)
        : await ejecutarReal(comando, timeoutMs);
      if (memoria) {
        try { await memoria.sandboxRegistrar({ comando, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, duracionMs: r.duracionMs, runId: o.runId || null }); } catch {}
      }
      const pedazo = (s) => String(s || '').trim().slice(0, maxSalida);
      const texto = [
        `[sandbox] exit=${r.exitCode} · ${r.duracionMs} ms${r.timeout ? ' · TIMEOUT' : ''}`,
        r.stdout ? `salida:\n${pedazo(r.stdout)}` : '',
        r.stderr ? `errores:\n${pedazo(r.stderr)}` : '',
        !r.stdout && !r.stderr ? '(sin salida)' : '',
      ].filter(Boolean).join('\n');
      return { permitido: true, exitCode: r.exitCode, duracionMs: r.duracionMs, timeout: !!r.timeout, texto };
    },
  };
}

module.exports = { crearSandbox, SEGMENTOS_PERMITIDOS, DENYLIST };
