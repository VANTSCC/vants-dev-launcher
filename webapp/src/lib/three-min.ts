/* Solo lo que usa Emblema3D.vue. Un `import('three')` dinámico arrastra el
   módulo entero (~740 KB); re-exportar nombres concretos deja que el bundler
   recorte el resto. Si el emblema necesita algo más de Three, se agrega acá. */
export {
  AmbientLight,
  BufferAttribute,
  Clock,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  Shape,
  WebGLRenderer,
} from 'three';
