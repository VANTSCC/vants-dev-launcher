<script setup lang="ts">
// ============================================================
// VANTS · IntroJett — intro 3D estilo MYKD/valotracker
//   · Al ENTRAR: overlay de carga con el cuchillo (kunai de
//     Jett, Blade Storm) VOLANDO/girando + contador %.
//   · Al CARGAR: el cuchillo aterriza y queda FLOTANDO junto
//     al hero (#heroDock). En móvil se desvanece al revelar.
//   · "SALTAR" lo pasa rápido; segunda visita del ciclo de
//     sesión va directo al cuchillo anclado (sin overlay).
//   Nota: no existe modelo 3D público de Jett (Riot), así que
//   el cuchillo se modela proceduralmente con Three.js.
// ============================================================
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';

type Phase = 'load' | 'reveal' | 'docked' | 'off' | 'gone';

const phase = ref<Phase>('load');
const pct = ref(0);
const host = ref<HTMLDivElement | null>(null);

let raf = 0;
let renderer: THREE.WebGLRenderer | null = null;
let scene = new THREE.Scene();
let cam = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
let knife = new THREE.Group();
let disposed = false;
let revealT = 0;
let fast = false;
const clock = new THREE.Clock();

const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const seen = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vjIntro') === '1';
let windowLoaded = typeof document !== 'undefined' && document.readyState === 'complete';
const onLoad = () => { windowLoaded = true; };

function buildKnife(): THREE.Group {
  const g = new THREE.Group();

  // Hoja kunai: perfil 2D extruido
  const s = new THREE.Shape();
  s.moveTo(0, 1.5);
  s.quadraticCurveTo(0.38, 0.45, 0.3, 0.02);
  s.lineTo(0.11, -0.26);
  s.lineTo(-0.11, -0.26);
  s.lineTo(-0.3, 0.02);
  s.quadraticCurveTo(-0.38, 0.45, 0, 1.5);
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    }),
    new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.95, roughness: 0.18 })
  );
  blade.position.z = -0.035;

  // guarda + mango + envoltura roja VANTS + anillo pommel
  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.06, 24),
    new THREE.MeshStandardMaterial({ color: 0x1a1e26, metalness: 0.6, roughness: 0.4 })
  );
  guard.position.y = -0.33;
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.1, 0.78, 20),
    new THREE.MeshStandardMaterial({ color: 0x171a20, metalness: 0.3, roughness: 0.7 })
  );
  grip.position.y = -0.75;
  const wrapMat = new THREE.MeshStandardMaterial({ color: 0xff0d2e, metalness: 0.35, roughness: 0.5 });
  const wraps: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 10, 26), wrapMat);
    w.rotation.x = Math.PI / 2;
    w.position.y = -0.55 - i * 0.16;
    wraps.push(w);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 12, 30), wrapMat);
  ring.position.y = -1.22;

  // estela cian de Jett
  const glow = new THREE.PointLight(0x6fe3ff, 6, 7);
  glow.position.set(0.6, 0.7, 1.4);

  g.add(blade, guard, grip, ...wraps, ring, glow);
  return g;
}

function mountRenderer(w: number, h: number) {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  cam.aspect = w / h;
  cam.position.set(0, 0, 4.6);
  cam.updateProjectionMatrix();
  return renderer;
}

function sizeFrom(el: HTMLElement): [number, number] {
  return [el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight];
}

function resize() {
  if (!renderer || !host.value) return;
  const parentEl = renderer.domElement.parentElement;
  if (!parentEl) return;
  const [w, h] = sizeFrom(parentEl);
  renderer.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}

function dockTarget(): HTMLElement | null {
  const d = document.getElementById('heroDock');
  if (!d) return null;
  // display:none => offsetParent null (móvil)
  return d.offsetParent ? d : null;
}

function dock() {
  if (!renderer) { phase.value = 'gone'; return; }
  const d = dockTarget();
  const cvs = renderer.domElement;
  if (d) {
    cvs.style.position = 'absolute';
    cvs.style.inset = '0';
    cvs.style.width = '100%';
    cvs.style.height = '100%';
    d.appendChild(cvs);
    resize();
    phase.value = 'docked';
  } else {
    // móvil: el cuchillo se desvanece con el overlay
    phase.value = 'off';
    window.setTimeout(() => { if (!disposed) phase.value = 'gone'; }, 500);
  }
}

function startReveal(now = false) {
  if (phase.value !== 'load') return;
  fast = now;
  revealT = 0;
  pct.value = 100;
  phase.value = 'reveal';
  try { sessionStorage.setItem('vjIntro', '1'); } catch { /* noop */ }
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function tick() {
  if (disposed) return;
  raf = requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  if (phase.value === 'load') {
    const target = windowLoaded || reduced ? 100 : Math.min(92, 100 * (1 - Math.exp(-t / 1.1)));
    pct.value = Math.floor(target);
    knife.rotation.y = t * 2.4;
    knife.rotation.z = 0.22;
    knife.position.y = Math.sin(t * 1.6) * 0.12;
    if (target >= 100) startReveal();
  } else if (phase.value === 'reveal') {
    revealT += dt / (fast ? 0.25 : 1.15);
    const k = ease(Math.min(1, revealT));
    knife.rotation.y = (t * 2.4) * (1 - k);
    knife.rotation.z = 0.22 * (1 - k) + 0.12 * k;
    knife.position.set(0, 0, 0);
    const sc = 1 - 0.58 * k;
    knife.scale.setScalar(sc);
    if (revealT >= 1) dock();
  } else if (phase.value === 'docked') {
    knife.rotation.y = -0.5 + Math.sin(t * 0.6) * 0.25;
    knife.rotation.z = 0.12;
    knife.position.y = Math.sin(t * 1.2) * 0.07;
  }

  renderer?.render(scene, cam);
}

onMounted(() => {
  const el = host.value;
  if (!el) return;
  window.addEventListener('load', onLoad);

  // ya vio la intro esta sesión, reduce-motion o sin overlay: directo al dock
  if (seen || reduced) {
    phase.value = 'load';
    pct.value = 100;
  }

  const [w, h] = sizeFrom(el);
  renderer = mountRenderer(w, h);
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  knife = buildKnife();
  scene.add(knife);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.5, 3, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0x6fe3ff, 18, 16);
  rim.position.set(-3, 1, -2.5);
  scene.add(rim);

  window.addEventListener('resize', resize);

  if (seen || reduced) {
    // sin overlay: anclar de una vez
    phase.value = 'load';
    startReveal(true);
  }

  clock.start();
  tick();
});

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(raf);
  window.removeEventListener('load', onLoad);
  window.removeEventListener('resize', resize);
  renderer?.domElement.remove();
  renderer?.dispose();
});
</script>

<template>
  <div
    ref="host"
    class="ij"
    :class="{ done: phase === 'docked' || phase === 'off' || phase === 'gone', off: phase === 'off' || phase === 'gone', instant: seen || reduced }"
    aria-hidden="true"
  >
    <div v-if="phase === 'load' || phase === 'reveal'" class="ij-bg"></div>
    <div v-if="phase === 'load'" class="ij-ui">
      <p class="ij-brand">VANT<em>S</em><small>GAMES</small></p>
      <p class="ij-tag">DONDE NACE LA VENTAJA</p>
      <span class="ij-pct mono">{{ pct }}%</span>
      <button class="ij-skip" type="button" @click="startReveal(true)">SALTAR →</button>
    </div>
  </div>
</template>

<style>
.ij {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
}
.ij.ij-done,
.ij.done {
  z-index: 6;
  pointer-events: none;
}
.ij.off {
  display: none;
}
/* sin overlay en visitas repetidas / reduced-motion: nada de flash */
.ij.instant .ij-bg {
  display: none;
}
.ij .ij-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(1200px 700px at 50% 42%, #0b0d13 0%, #05060a 62%, #030407 100%);
  opacity: 1;
  transition: opacity 0.9s ease;
  pointer-events: auto;
}
.ij.done .ij-bg {
  opacity: 0;
  pointer-events: none;
}
.ij canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
.ij .ij-ui {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 26px 30px;
  pointer-events: none;
}
.ij .ij-brand {
  position: absolute;
  top: 26px;
  left: 30px;
  font: 900 20px/1 'Archivo Black', Archivo, sans-serif;
  letter-spacing: 0.04em;
  color: #fff;
  margin: 0;
}
.ij .ij-brand em {
  font-style: normal;
  color: #ff0d2e;
}
.ij .ij-brand small {
  display: block;
  font: 700 8px 'JetBrains Mono', monospace;
  letter-spacing: 0.5em;
  color: #8a93a0;
  margin-top: 5px;
}
.ij .ij-tag {
  position: absolute;
  top: 30px;
  right: 30px;
  font: 700 9px 'JetBrains Mono', monospace;
  letter-spacing: 0.34em;
  color: #5d6673;
  margin: 0;
}
.ij .ij-pct {
  font: 800 74px/1 'JetBrains Mono', monospace;
  letter-spacing: -0.03em;
  color: #fff;
  text-shadow: 0 0 34px rgba(111, 227, 255, 0.35);
}
.ij .ij-pct::after {
  content: '';
  display: block;
  width: 120px;
  height: 2px;
  margin-top: 14px;
  background: linear-gradient(90deg, #ff0d2e, #6fe3ff);
}
.ij .ij-skip {
  position: absolute;
  right: 30px;
  bottom: 34px;
  pointer-events: auto;
  background: transparent;
  border: 1px solid #2b313c;
  color: #aab2bd;
  font: 700 10px 'JetBrains Mono', monospace;
  letter-spacing: 0.22em;
  padding: 9px 14px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.ij .ij-skip:hover {
  border-color: #ff0d2e;
  color: #fff;
}
/* el canvas anclado dentro del hero */
.hero-dock canvas,
.ij .hero-dock canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
