'use strict';
// ============================================================
// LLM del AGENTE VANTS v2.1 — CEREBRO AGÉNTICO con function calling.
// Basta con AGENT_LLM_KEY (+ AGENT_LLM_MODEL opcional): sin AGENT_LLM_URL
// se usa la endpoint GLOBAL de GLM por defecto (api.z.ai). Con una key de
// bigmodel.cn el dueño define AGENT_LLM_URL apuntando al endpoint CN.
// El agente funciona en MODO AGENTE con GLM (o cualquier API OpenAI-
// compatible con tools): el modelo ELIGE y ENCADENA herramientas reales
// (estado, informe, incidentes, resolver, ciclo, desplegar_web, migrar)
// hasta responder. Sin key -> null y el cerebro cae al modo reglas
// (NLU local en español, siempre disponible, 0 dependencias).
// Endpoints GLM: https://api.z.ai/api/paas/v4 (global, por defecto) o
//                https://open.bigmodel.cn/api/paas/v4 (CN, vía AGENT_LLM_URL).
// ============================================================

const TIMEOUT_MS = 20000;
const MAX_PASOS = 5; // máximo de vueltas del bucle de herramientas (anti-bucle)

const URL_GLM_GLOBAL = 'https://api.z.ai/api/paas/v4';

function crearLlm(env = process.env, fetchImpl = fetch) {
  const url = String(env.AGENT_LLM_URL || '').trim() || URL_GLM_GLOBAL;
  const key = String(env.AGENT_LLM_KEY || '').trim();
  const model = env.AGENT_LLM_MODEL || 'glm-4.5-flash';
  if (!key) return null;

  // prompt del modo clásico (intención JSON) — usado por interpretar()
  const SISTEMA = [
    'Eres el Agente VANTS, el asistente de control de la plataforma VANTS GAMES (web en Cloudflare Workers, launcher Electron con auto-update, matchmaking en Neon, bot de Discord).',
    'Devuelve SIEMPRE un JSON valido con esta forma exacta: {"intencion":"estado|informe|ciclo|desplegar_web|migrar|incidentes|resolver|ayuda|desconocido","args":{}}.',
    'Para "resolver" usa args.id con el numero del incidente. Si no entiendes la orden usa "desconocido". No expliques nada fuera del JSON.',
  ].join(' ');

  // prompt del modo agéntico — el modelo decide qué herramientas usar
  const SISTEMA_AGENTE = [
    'Eres el Agente VANTS, el agente de control de la plataforma VANTS GAMES (web en Cloudflare Workers, worker de FACEIT, launcher Electron con auto-update, matchmaking en Neon, bot de Discord).',
    'Tienes HERRAMIENTAS REALES: cuando necesites datos o ejecutar una acción, LLAMA a la herramienta en vez de inventarte la respuesta. Puedes encadenar varias antes de responder.',
    'Reglas: responde SIEMPRE en español, directo y útil, máximo 8 líneas; marca con [!] lo crítico; si una herramienta devuelve un error, explícalo breve y sugiere qué hacer.',
    'Nunca reveles claves, tokens ni contenido de secretos. No inventes URLs ni números de incidente: usa los que devuelvan las herramientas.',
  ].join(' ');

  // llamada cruda /chat/completions. Devuelve el MESSAGE completo
  // (content + tool_calls) para soportar function calling.
  // Si falla, deja en ultimoFallo el motivo exacto (http_401 = key inválida,
  // http_404 = modelo inexistente, timeout, red:… ) para diagnóstico.
  let ultimoFallo = null;
  async function chat(mensajes, extra = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const cuerpo = { model, messages: mensajes, temperature: 0.2, max_tokens: 700 };
      if (extra.tools && extra.tools.length) cuerpo.tools = extra.tools;
      if (extra.forzarTexto) { cuerpo.tools = undefined; cuerpo.max_tokens = 400; }
      if (extra.maxTokens) cuerpo.max_tokens = extra.maxTokens;
      const r = await fetchImpl(url.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(cuerpo),
      });
      if (!r.ok) { ultimoFallo = `http_${r.status}`; return null; }
      const j = await r.json().catch(() => null);
      if (j && j.choices && j.choices[0] && j.choices[0].message) { ultimoFallo = null; return j.choices[0].message; }
      ultimoFallo = 'respuesta_invalida';
      return null;
    } catch (e) {
      ultimoFallo = ctrl.signal.aborted ? `timeout_${Math.round(TIMEOUT_MS / 1000)}s` : `red:${String((e && e.message) || e).slice(0, 60)}`;
      return null;
    } finally { clearTimeout(timer); }
  }

  return {
    activo: () => true,
    modelo: () => model,
    url: () => url,
    // ── diagnóstico: llamada mínima (≈8 tokens) que confirma que la key,
    // el modelo y la red funcionan; sin coste real ni efectos. ──
    async probar() {
      const msg = await chat([{ role: 'user', content: 'Responde solo: OK' }], { forzarTexto: true, maxTokens: 8 });
      return msg
        ? { ok: true, modelo: model, url }
        : { ok: false, motivo: ultimoFallo || 'desconocido', modelo: model, url };
    },
    // ── modo clásico: orden libre -> intención del cerebro ──
    async interpretar(texto) {
      const msg = await chat([{ role: 'system', content: SISTEMA }, { role: 'user', content: String(texto || '') }], { forzarTexto: true });
      const crudo = msg && msg.content;
      if (!crudo) return null; // el núcleo cae al NLU local
      const m = crudo.match(/\{[\s\S]*\}/);
      try {
        const j = JSON.parse(m[0]);
        if (j && j.intencion) return { intencion: j.intencion, args: j.args || {}, via: 'llm' };
      } catch {}
      return null;
    },
    // ── informe técnico -> texto amable para el dueño ──
    async narrar(informeTecnico) {
      const msg = await chat([
        { role: 'system', content: 'Eres el Agente VANTS. Resume el estado de la plataforma en maximo 6 lineas, tono directo y util, en espanol. Marca con [!] lo critico.' },
        { role: 'user', content: String(informeTecnico).slice(0, 3000) },
      ], { forzarTexto: true });
      return msg && msg.content ? msg.content : null;
    },
    // ── modo AGÉNTICO: bucle de herramientas reales ──
    // conversar(texto, herramientas, ctx) -> respuesta final en texto.
    // herramientas = { catalogo(), obtener(nombre) } (ver herramientas.js);
    // ctx = el contexto del núcleo (memoria, chequeos, acciones...).
    async conversar(texto, herramientas, ctx) {
      if (!herramientas || typeof herramientas.catalogo !== 'function') return null;
      const catalogo = herramientas.catalogo();
      const mensajes = [
        { role: 'system', content: SISTEMA_AGENTE },
        { role: 'user', content: String(texto || '') },
      ];
      for (let paso = 0; paso < MAX_PASOS; paso++) {
        const msg = await chat(mensajes, { tools: catalogo });
        if (!msg) return null; // API caída -> el núcleo cae al modo reglas
        const llamadas = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        if (!llamadas.length) {
          return typeof msg.content === 'string' && msg.content.trim() ? msg.content : null;
        }
        mensajes.push({ role: 'assistant', content: msg.content || null, tool_calls: llamadas });
        for (const tc of llamadas) {
          const nombre = tc && tc.function && tc.function.name;
          let args = {};
          try { args = JSON.parse((tc.function && tc.function.arguments) || '{}') || {}; } catch {}
          let salida;
          const h = herramientas.obtener(nombre);
          if (!h) salida = `Error: herramienta desconocida "${nombre}".`;
          else {
            try { salida = await h.ejecutar(args, ctx); }
            catch (e) { salida = `Error al ejecutar ${nombre}: ${String(e.message).slice(0, 200)}`; }
          }
          mensajes.push({ role: 'tool', tool_call_id: (tc && tc.id) || `c${paso}`, content: String(salida).slice(0, 3000) });
        }
      }
      // agotado el bucle: última llamada SIN tools para forzar respuesta final
      const final = await chat(mensajes, { forzarTexto: true });
      return final && typeof final.content === 'string' && final.content.trim() ? final.content : null;
    },
  };
}

module.exports = { crearLlm, MAX_PASOS, URL_GLM_GLOBAL };
