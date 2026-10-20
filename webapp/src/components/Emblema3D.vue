<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';

const host = ref<HTMLDivElement | null>(null);
let raf = 0;
let dispose = () => {};

onMounted(() => {
  const el = host.value;
  if (!el) return;
  const W = el.clientWidth || 240;
  const H = el.clientHeight || 240;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 50);
  cam.position.set(0, 0, 5.4);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.appendChild(renderer.domElement);

  // Placa octogonal de la marca VANTS
  const w = 1.35;
  const c = 0.5;
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
  const plate = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }),
    new THREE.MeshStandardMaterial({ color: 0x1b1f26, metalness: 0.75, roughness: 0.35 })
  );
  plate.position.z = -0.11;

  // V roja (prismas)
  const matRed = new THREE.MeshStandardMaterial({ color: 0xff0d2e, metalness: 0.45, roughness: 0.3 });
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.7, 0.28), matRed);
  left.position.set(-0.42, 0.18, 0.05);
  left.rotation.z = -0.42;
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.28), matRed);
  right.position.set(0.5, 0.62, 0.05);
  right.rotation.z = 0.5;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.28), matRed);
  foot.position.set(0.1, -0.62, 0.05);

  const g = new THREE.Group();
  g.add(plate, left, right, foot);
  scene.add(g);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 3, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0xff0d2e, 30, 14);
  rim.position.set(-3, -1.5, 3);
  scene.add(rim);

  const clock = new THREE.Clock();
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    g.rotation.y = t * 0.5;
    g.rotation.x = Math.sin(t * 0.8) * 0.14;
    renderer.render(scene, cam);
  };
  tick();

  dispose = () => {
    cancelAnimationFrame(raf);
    renderer.dispose();
    if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
  };
});

onBeforeUnmount(() => dispose());
</script>

<template>
  <div ref="host" class="h-full w-full"></div>
</template>
