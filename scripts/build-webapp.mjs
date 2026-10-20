// Conecta el build de Astro (webapp/dist) con el deploy actual:
// - index.html compilado -> raíz + public/ + vants-server/public/
// - islands de Astro (_astro/) -> _astro/ en los tres árboles
// Uso: node scripts/build-webapp.mjs
//      node scripts/build-webapp.mjs --check   (solo verifica espejo ×3; exit 1 si hay drift)
//
// El espejo ×3 (raíz / public/ / vants-server/public/) se sincronizaba a mano
// y ya produjo drift en producción (menu-preview.js pisando el preview de la
// isla React). --check lo vigila desde CI (fullstack.yml).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Entradas del espejo que DEBEN ser idénticas en los 3 árboles
const ENTRADAS_ESPEJO = ['index.html', '_astro', 'assets', 'sw.js', 'robots.txt', 'sitemap.xml'];

const root = process.cwd();
const dist = join(root, 'webapp', 'dist');
const MODO_CHECK = process.argv.includes('--check');
if (!MODO_CHECK && !existsSync(join(dist, 'index.html'))) {
  console.error('No existe webapp/dist/index.html. Corré primero: npm run build (en webapp/)');
  process.exit(1);
}

const targets = [root, join(root, 'public'), join(root, 'vants-server', 'public')];

// ── MODO CHECK: verifica sincronía del espejo ×3 sin escribir ──
if (MODO_CHECK) {
  let drift = [];
  const comoClave = (base, rel) => {
    const full = join(base, rel);
    if (!existsSync(full)) return 'AUSENTE';
    if (statSync(full).isDirectory()) return 'DIR';
    // hash de CONTENIDO (mtime miente: cada checkout cambia fechas)
    return createHash('sha1').update(readFileSync(full)).digest('hex');
  };
  const recorrer = (base, rel, out) => {
    const full = join(base, rel);
    if (!existsSync(full)) return;
    if (statSync(full).isDirectory()) {
      for (const e of readdirSync(full)) recorrer(base, join(rel, e), out);
    } else out.add(rel);
  };
  const relativos = new Set();
  // Referencia = public/ completo: cubre TODOS los archivos espejados
  // (34 HTML + assets + _astro + sw/robots/sitemap), no solo los típicos.
  recorrer(targets[1], '', relativos);
  for (const rel of relativos) {
    const firmas = targets.map((b) => comoClave(b, rel));
    if (new Set(firmas).size > 1) drift.push({ rel, firmas });
  }
  if (drift.length) {
    console.error('❌ ESPEJO ×3 DESINCRONIZADO (' + drift.length + ' archivos):');
    for (const d of drift.slice(0, 20)) console.error('   -', d.rel, '->', d.firmas.join(' | '));
    console.error('Corré: node scripts/build-webapp.mjs  y sincronizá assets/ a mano (o ampliá este script).');
    process.exit(1);
  }
  console.log('✅ Espejo ×3 sincronizado (' + relativos.size + ' archivos verificados)');
  process.exit(0);
}

for (const t of targets) {
  // index compilado
  cpSync(join(dist, 'index.html'), join(t, 'index.html'));
  // islands
  const srcAstro = join(dist, '_astro');
  if (existsSync(srcAstro)) {
    const dstAstro = join(t, '_astro');
    rmSync(dstAstro, { recursive: true, force: true });
    mkdirSync(dstAstro, { recursive: true });
    for (const f of readdirSync(srcAstro)) {
      cpSync(join(srcAstro, f), join(dstAstro, f));
    }
  }
  console.log('deploy ->', t.replace(root, '.') || '.');
}
console.log('webapp compilado y copiado a los 3 árboles');
