'use strict';
// ============================================================
// LLM del AGENTE VANTS — la capa de IA (OPCIONAL, enchufable).
// Si el dueno define AGENT_LLM_URL + AGENT_LLM_KEY (+ AGENT_LLM_MODEL),
// el agente interpreta ordenes en lenguaje libre y narra los informes
// con un modelo real (GLM, OpenAI, Groq, Ollama local... cualquiera
// compatible con /chat/completions). Sin key -> null y el cerebro
// funciona en modo reglas (siempre disponible, 0 dependencias).
// ============================================================

const TIMEOUT_MS = 20000;

function crearLlm(env = process.env, fetchImpl = fetch) {
  const url = env.AGENT_LLM_URL || '';
  const key = env.AGENT_LLM_KEY || '';
  const model = env.AGENT_LLM_MODEL || 'glm-4-flash';
  if (!url || !key) return null;

  const SISTEMA = [
    'Eres el Agente VANTS, el asistente de control de la plataforma VANTS GAMES (web en Cloudflare Workers, launcher Electron con auto-update, matchmaking en Neon, bot de Discord).',
    'Devuelve SIEMPRE un JSON valido con esta forma exacta: {"intencion":"estado|informe|ciclo|desplegar_web|migrar|incidentes|resolver|ayuda|desconocido","args":{}}.',
    'Para "resolver" usa args.id con el numero del incidente. Si no entiendes la orden usa "desconocido". No expliques nada fuera del JSON.',
  ].join(' ');

  async function chat(mensajes) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetchImpl(url.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: mensajes, temperature: 0.2, max_tokens: 400 }),
      });
      const j = await r.json().catch(() => null);
      return j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : null;
    } catch { return null; } finally { clearTimeout(timer); }
  }

  return {
    activo: () => true,
    modelo: () => model,
    // orden libre -> intencion del cerebro
    async interpretar(texto) {
      const crudo = await chat([{ role: 'system', content: SISTEMA }, { role: 'user', content: String(texto || '') }]);
      if (!crudo) return null; // el nucleo cae al NLU local
      const m = crudo.match(/\{[\s\S]*\}/);
      try {
        const j = JSON.parse(m[0]);
        if (j && j.intencion) return { intencion: j.intencion, args: j.args || {}, via: 'llm' };
      } catch {}
      return null;
    },
    // informe tecnico -> texto amable para el dueno
    async narrar(informeTecnico) {
      const crudo = await chat([
        { role: 'system', content: 'Eres el Agente VANTS. Resume el estado de la plataforma en maximo 6 lineas, tono directo y util, en espanol. Marca con [!] lo critico.' },
        { role: 'user', content: String(informeTecnico).slice(0, 3000) },
      ]);
      return crudo;
    },
  };
}

module.exports = { crearLlm };
