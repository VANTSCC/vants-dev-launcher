// Conecta el build de Astro (webapp/dist) con el deploy actual:
// - index.html compilado -> raíz + public/ + vants-server/public/
// - islands de Astro (_astro/) -> _astro/ en los tres árboles
// Uso: node scripts/build-webapp.mjs
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'webapp', 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('No existe webapp/dist/index.html. Corré primero: npm run build (en webapp/)');
  process.exit(1);
}

const targets = [root, join(root, 'public'), join(root, 'vants-server', 'public')];

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
