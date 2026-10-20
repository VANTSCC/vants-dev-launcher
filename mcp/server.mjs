// VANTS MCP Server — Model Context Protocol sobre stdio, sin dependencias.
// Expone el estado de la arena a agentes (Claude, GLM, etc.):
//   tools: estado_db · torneos · jugadores · partidos
// Registro en el cliente MCP (ej. claude_desktop_config.json):
//   { "command": "node", "args": ["<ruta>/mcp/server.mjs"] }
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';

const VERSION = '1.0.0';
const RAW_ESTADO = 'https://raw.githubusercontent.com/feispla/Vants/estado-db/estado-db.json';
const WORKER = 'https://vants.vants.workers.dev';

async function jget(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'vants-mcp' } });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text.slice(0, 4000); }
    return { status: r.status, data };
  } finally {
    clearTimeout(t);
  }
}

const TOOLS = [
  {
    name: 'estado_db',
    description: 'Estado real de la base Neon de VANTS (publicado por el workflow neon-migrate): tablas, filas y versión del esquema.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const { status, data } = await jget(RAW_ESTADO);
      return { status, data };
    },
  },
  {
    name: 'torneos',
    description: 'Torneos publicados en la web de VANTS (API pública del Worker).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => jget(`${WORKER}/api/tournaments`),
  },
  {
    name: 'jugadores',
    description: 'Jugadores del circuito VANTS (API pública, sin datos personales).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => jget(`${WORKER}/api/players`),
  },
  {
    name: 'partidos',
    description: 'Partidos y agenda del circuito VANTS (API pública del Worker).',
    inputSchema: {
      type: 'object',
      properties: { juego: { type: 'string', enum: ['valorant', 'cs2'], description: 'filtro opcional de juego' } },
      additionalProperties: false,
    },
    run: async (args) => {
      const q = args && typeof args.juego === 'string' ? `?juego=${encodeURIComponent(args.juego)}` : '';
      return jget(`${WORKER}/api/matches${q}`);
    },
  },
];

function write(obj) {
  stdout.write(JSON.stringify(obj) + '\n');
}

function resultOf(id, payload) {
  return { jsonrpc: '2.0', id, result: payload };
}

const rl = createInterface({ input: stdin, terminal: false });
rl.on('line', (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return; }
  const { id, method, params } = msg || {};

  switch (method) {
    case 'initialize':
      write(resultOf(id, {
        protocolVersion: params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'vants-mcp', version: VERSION },
      }));
      break;
    case 'notifications/initialized':
      break; // sin respuesta
    case 'ping':
      write(resultOf(id, {}));
      break;
    case 'tools/list':
      write(resultOf(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }));
      break;
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) {
        write({ jsonrpc: '2.0', id, error: { code: -32602, message: `Tool desconocido: ${params?.name}` } });
        break;
      }
      tool.run(params?.arguments || {})
        .then(({ status, data }) => write(resultOf(id, {
          content: [{ type: 'text', text: JSON.stringify({ status, data }, null, 2) }],
          isError: status >= 400,
        })))
        .catch((e) => write(resultOf(id, {
          content: [{ type: 'text', text: `Error: ${e && e.message ? e.message : String(e)}` }],
          isError: true,
        })));
      break;
    }
    default:
      if (id !== undefined) {
        write({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } });
      }
  }
});
