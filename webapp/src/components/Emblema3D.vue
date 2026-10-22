<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type * as T from 'three';

// Three se importa en diferido (solo las clases que usa, ver lib/three-min): la isla hidrata liviana y el motor
// 3D se descarga y arma recién cuando la página ya cargó y el hilo está libre.
let THREE: typeof import('../lib/three-min');

// Emblema 3D de VANTS — réplica del LOGO OFICIAL (apple-touch-icon.png):
// placa octogonal oscura con bisel rojo, "V" de dos trazos — izquierdo blanco
// degradado que afila al vértice, derecho rojo con corte horizontal — y la
// cuña roja flotante junto al vértice. Degradados por vértice (color attr).
//
// Rendimiento: el bucle solo corre cuando el emblema está en pantalla, la
// pestaña visible y el usuario no pidió reduced-motion (en ese caso se pinta
// UN fotograma quieto). DPR hasta 3 para que en 4K/retina no se vea borroso.
const host = ref<HTMLDivElement | null>(null);
const sinWebgl = ref(false);
let dispose = () => {};

type Pt = [number, number];
const MAX_DPR = 3;

const octagonShape = (w: number, c: number) => {
  const s = new THREE.Shape();
  s.moveTo(-w + c, -w);
  s.lineTo(w - c, -w);
  s.lineTo(w, -w + c);
  s.lineTo(w, w - c);
  s.lineTo(w - c, w);
  s.lineTo(-w + c, w);
  s.lineTo(-w, w - c);
  s.lineTo(-w, -w + c);
  s.closePath();
  return s;
};

const polygonShape = (pts: Pt[]) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
};

const extrude = (shape: T.Shape, depth: number, bevel = false) =>
  new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 1,
    curveSegments: 1,
  });

/** Extruye un shape y pinta un degradado vertical por vértice. */
const extrudeGradient = (
  shape: T.Shape,
  depth: number,
  top: string,
  bottom: string
) => {
  const geo = extrude(shape, depth);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const span = bb.max.y - bb.min.y || 1;
  const cTop = new THREE.Color(top);
  const cBot = new THREE.Color(bottom);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / span;
    tmp.copy(cBot).lerp(cTop, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
};

/** Ejecuta cb cuando la página ya cargó y el hilo principal está ocioso. */
const cuandoOcioso = (cb: () => void) => {
  const idle = () =>
    'requestIdleCallback' in window
      ? window.requestIdleCallback(cb, { timeout: 2500 })
      : window.setTimeout(cb, 250);
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
};

onMounted(() => {
  const el = host.value;
  if (!el) return;
  let cancelado = false;
  dispose = () => {
    cancelado = true;
  };
  cuandoOcioso(async () => {
    THREE = await import('../lib/three-min');
    if (cancelado || !el.isConnected) return;
    arrancar(el);
  });
});

const arrancar = (el: HTMLDivElement) => {
  let W = el.clientWidth || 240;
  let H = el.clientHeight || 240;

  let renderer: T.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    // Sin WebGL (navegador capado, GPU bloqueada): queda el símbolo SVG oficial.
    sinWebgl.value = true;
    return;
  }

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 50);
  cam.position.set(0, 0, 5.4);

  const aplicarDpr = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  aplicarDpr();
  renderer.setSize(W, H);
  el.appendChild(renderer.domElement);

  // ── Materiales de marca ──
  const matRim = new THREE.MeshStandardMaterial({
    color: 0xdb0f2a,
    metalness: 0.5,
    roughness: 0.35,
    emissive: 0x3a040c,
  });
  const matPlate = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.6,
    roughness: 0.38,
  });
  const matWhite = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.45,
    roughness: 0.22,
  });
  const matRed = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.35,
    roughness: 0.3,
  });

  // ── Bisel rojo + placa octogonal oscura (contorno del logo) ──
  // El bisel vive DENTRO del grosor de la placa: las dos caras (anverso y
  // reverso) muestran cara oscura + anillo rojo fino, como el logo real.
  const rim = new THREE.Mesh(extrude(octagonShape(1.44, 0.535), 0.14), matRim);
  rim.position.z = -0.1;

  const plate = new THREE.Mesh(
    extrudeGradient(octagonShape(1.27, 0.47), 0.16, '#262b33', '#0b0d10'),
    matPlate
  );
  plate.position.z = -0.08;

  // ── "V" oficial: trazo blanco + trazo rojo + cuña ──
  const strokes = new THREE.Group();

  const strokeWhite = new THREE.Mesh(
    extrudeGradient(
      polygonShape([
        [-0.93, 0.78],
        [0.0, -0.84],
        [-0.36, 0.78],
      ]),
      0.26,
      '#ffffff',
      '#878d97'
    ),
    matWhite
  );
  strokeWhite.position.z = -0.02;

  const strokeRed = new THREE.Mesh(
    extrudeGradient(
      polygonShape([
        [0.02, -0.19],
        [0.44, -0.19],
        [0.93, 0.78],
        [0.27, 0.78],
      ]),
      0.26,
      '#ff344b',
      '#b90d24'
    ),
    matRed
  );
  strokeRed.position.z = -0.02;

  const accentRed = new THREE.Mesh(
    extrudeGradient(
      polygonShape([
        [0.36, -0.34],
        [0.13, -0.39],
        [0.02, -0.8],
      ]),
      0.26,
      '#ff344b',
      '#b90d24'
    ),
    matRed
  );
  accentRed.position.z = -0.02;

  strokes.add(strokeWhite, strokeRed, accentRed);

  // La V también por detrás (badge atravesado): mitad del giro muestra el
  // reverso y sin esto no se vería la V ahí.
  const strokesBack = strokes.clone();
  strokesBack.rotation.y = Math.PI;
  strokesBack.position.z = 0;

  const g = new THREE.Group();
  g.add(rim, plate, strokes, strokesBack);
  scene.add(g);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.5, 3, 4);
  scene.add(key);
  const rimLight = new THREE.PointLight(0xff0d2e, 12, 14);
  rimLight.position.set(-3, -1.5, 3);
  scene.add(rimLight);
  // Relleno neutro desde atrás: sin esto el reverso (sin key light) queda
  // teñido rojo por el rimLight y la V espejada no se lee.
  const back = new THREE.DirectionalLight(0xffffff, 2.4);
  back.position.set(0, 2, -4);
  scene.add(back);

  // ── Bucle: solo gira si se ve, con pestaña visible y sin reduced-motion ──
  const clock = new THREE.Clock(false);
  let t = 0;
  let raf = 0;
  let enPantalla = true;
  let contextoPerdido = false;
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const pose = (tiempo: number) => {
    g.rotation.y = tiempo * 0.5;
    g.rotation.x = Math.sin(tiempo * 0.8) * 0.14;
  };
  const fotograma = () => {
    renderer.render(scene, cam);
  };
  const tick = () => {
    raf = requestAnimationFrame(tick);
    // Delta acotado: tras volver de una pestaña oculta el emblema no pega un salto.
    t += Math.min(clock.getDelta(), 0.05);
    pose(t);
    fotograma();
  };
  const debeAnimar = () =>
    enPantalla && !contextoPerdido && document.visibilityState !== 'hidden' && !mqReduce.matches;
  const sincronizar = () => {
    if (debeAnimar()) {
      if (!raf) {
        clock.start();
        clock.getDelta();
        tick();
      }
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clock.stop();
      if (mqReduce.matches && !contextoPerdido) {
        // Quieto pero con la pose del logo oficial (de frente, leve inclinación).
        pose(0.55);
        fotograma();
      }
    }
  };

  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            enPantalla = entries.some((e) => e.isIntersecting);
            sincronizar();
          },
          { rootMargin: '80px' }
        )
      : null;
  io?.observe(el);

  const onVisibilidad = () => sincronizar();
  document.addEventListener('visibilitychange', onVisibilidad);
  const onReduce = () => sincronizar();
  mqReduce.addEventListener?.('change', onReduce);

  const ro =
    'ResizeObserver' in window
      ? new ResizeObserver(() => {
          const w = el.clientWidth || W;
          const h = el.clientHeight || H;
          if (w === W && h === H) return;
          W = w;
          H = h;
          cam.aspect = W / H;
          cam.updateProjectionMatrix();
          aplicarDpr();
          renderer.setSize(W, H);
          if (!raf) fotograma();
        })
      : null;
  ro?.observe(el);

  const canvas = renderer.domElement;
  const onLost = (ev: Event) => {
    ev.preventDefault();
    contextoPerdido = true;
    sincronizar();
  };
  const onRestored = () => {
    contextoPerdido = false;
    sincronizar();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  sincronizar();

  dispose = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    io?.disconnect();
    ro?.disconnect();
    document.removeEventListener('visibilitychange', onVisibilidad);
    mqReduce.removeEventListener?.('change', onReduce);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material as T.Material | T.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    renderer.dispose();
    if (canvas.parentElement === el) el.removeChild(canvas);
  };
};

onBeforeUnmount(() => dispose());
</script>

<template>
  <div ref="host" class="h-full w-full">
    <svg v-if="sinWebgl" class="emblema-svg" viewBox="0 0 64 64" aria-hidden="true"><use href="#vmark" /></svg>
  </div>
</template>
