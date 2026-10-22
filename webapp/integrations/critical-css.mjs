/* CSS crítico de la home.
   arena.css (93 KB) y vants-shop.css (17 KB) son el sistema base de las 33
   páginas estáticas y bloqueaban el primer pintado de la home, que usa ~12 %.
   Al terminar el build se inyecta en dist/index.html, como <style>, solo las
   reglas cuyos selectores existen en el HTML generado (con sus @media), y las
   hojas completas pasan a cargarse sin bloquear (preload + onload, con
   <noscript> de respaldo). Se recalcula en cada build: no hay nada a mano. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, parse, walk } from 'css-tree';
import { parseHTML } from 'linkedom';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Pseudo-clases de estado: se quitan para comprobar si el selector apunta a
// algo que existe en el HTML (`.btn:hover` cuenta si hay un `.btn`).
const ESTADO = /^(hover|focus|focus-visible|focus-within|active|visited|target|checked|disabled|enabled|placeholder-shown|empty|link|any-link)$/;

const selectorEstatico = (selector) => {
  const copia = parse(generate(selector), { context: 'selector' });
  walk(copia, {
    visit: 'Selector',
    enter(sel) {
      sel.children = sel.children.filter(
        (n) => !(n.type === 'PseudoElementSelector' || (n.type === 'PseudoClassSelector' && ESTADO.test(n.name)))
      );
    },
  });
  return generate(copia).trim();
};

/* Lo que el runtime agrega al DOM en cuanto corre (antes de que llegue la hoja
   completa en una red lenta) no está en el HTML pero sí tiene que estar en el
   CSS crítico, o la portada salta al aplicarse arena.css:
   - nav-movil.js marca <header class="nav-js"> y crea el .nav-burger,
   - arena.js llena el ticker de <span> y el feed EN VIVO con .lf .fa/.fb,
   - lucide cambia cada <i data-lucide> por un <svg>.
   El E2E "primer pintado estable sin la hoja completa" avisa si falta algo. */
const RUNTIME = new Set(['nav-js', 'nav-burger', 'lf', 'fa', 'fb', 'span', 'svg', 'path', 'line', 'circle', 'polyline', 'rect', 'polygon']);

const seleccionable = (p) => p.replace(/([^\w-])/g, '\\$1');

const existe = (document, selector) => {
  const s = selectorEstatico(selector);
  if (!s || s === ':root' || s === 'html' || s === 'body') return true;
  try {
    if (document.querySelector(s) !== null) return true;
  } catch {
    return true; // selector que linkedom no entiende: mejor incluirlo de más
  }
  const partes = [];
  walk(parse(s, { context: 'selector' }), (n) => {
    if (n.type === 'ClassSelector' || n.type === 'IdSelector') partes.push(n.name);
    else if (n.type === 'TypeSelector' && n.name !== '*') partes.push(n.name.toLowerCase());
  });
  return partes.length > 0 && partes.every((p) => RUNTIME.has(p) || document.querySelector('.' + seleccionable(p) + ',#' + seleccionable(p) + ',' + p));
};

/** Devuelve el CSS mínimo de `css` que aplica al `document`. */
export const extraerCritico = (css, document) => {
  const ast = parse(css);
  const animaciones = new Set();
  const filtrar = (lista) =>
    lista.filter((nodo) => {
      if (nodo.type === 'Rule') {
        nodo.prelude.children = nodo.prelude.children.filter((sel) => existe(document, sel));
        if (nodo.prelude.children.isEmpty) return false;
        walk(nodo.block, {
          visit: 'Declaration',
          enter(d) {
            if (/^animation(-name)?$/.test(d.property)) {
              walk(d.value, { visit: 'Identifier', enter(i) { animaciones.add(i.name); } });
            }
          },
        });
        return true;
      }
      if (nodo.type === 'Atrule') {
        if (nodo.name === 'font-face' || nodo.name === 'import') return true;
        if (nodo.name === 'keyframes') return false; // se resuelven abajo
        if (nodo.block) {
          nodo.block.children = filtrar(nodo.block.children);
          return !nodo.block.children.isEmpty;
        }
      }
      return false;
    });
  const keyframes = [];
  walk(ast, {
    visit: 'Atrule',
    enter(n) {
      if (n.name === 'keyframes') keyframes.push(n);
    },
  });
  ast.children = filtrar(ast.children);
  for (const k of keyframes) if (animaciones.has(generate(k.prelude).trim())) ast.children.push(k);
  return generate(ast);
};

export default function criticalCss() {
  return {
    name: 'vants:critical-css',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const ruta = join(fileURLToPath(dir), 'index.html');
        let html = readFileSync(ruta, 'utf8');
        const { document } = parseHTML(html);
        const re = /<link rel="stylesheet" href="(\.\/assets\/css\/[^"?]+)(\?v=\d+)?">/g;
        const links = [...html.matchAll(re)];
        if (!links.length) return;
        let critico = '';
        for (const [, href] of links) {
          critico += extraerCritico(readFileSync(join(RAIZ, href.slice(2)), 'utf8'), document);
        }
        let primero = true;
        html = html.replace(re, (tag, href, v = '') => {
          const url = href + v;
          const asinc =
            `<link rel="preload" as="style" href="${url}" onload="this.onload=null;this.rel='stylesheet'">` +
            `<noscript><link rel="stylesheet" href="${url}"></noscript>`;
          if (!primero) return asinc;
          primero = false;
          return `<style data-critico>${critico}</style>` + asinc;
        });
        writeFileSync(ruta, html);
        logger.info(`CSS crítico inyectado en index.html: ${(critico.length / 1024).toFixed(1)} KB de ${links.length} hojas`);
      },
    },
  };
}
