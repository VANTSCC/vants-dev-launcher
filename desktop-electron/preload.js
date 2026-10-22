// VANTS · puente seguro renderer ↔ main
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vantsHub', {
  sesion:      () => ipcRenderer.invoke('hub:sesion'),
  login:       () => ipcRenderer.invoke('hub:login'),
  logout:      () => ipcRenderer.invoke('hub:logout'),
  presencia:   (modo) => ipcRenderer.invoke('hub:presencia', modo),
  api:         (ruta, opts) => ipcRenderer.invoke('hub:api', Object.assign({ ruta }, opts || {})),
  biblioteca:  () => ipcRenderer.invoke('hub:biblioteca'),
  jugar:       (juego) => ipcRenderer.invoke('hub:jugar', juego),
  abrir:       (url) => ipcRenderer.invoke('hub:abrir', url),
  info:        () => ipcRenderer.invoke('hub:info'),
  ventana:     (acc) => ipcRenderer.invoke('hub:ventana', acc),
  onEstado:    (cb) => ipcRenderer.on('hub:estado', (e, d) => cb(d)),
  onActualizacion: (cb) => ipcRenderer.on('hub:update', (e, d) => cb(d)),
  actualizarInstalar: () => ipcRenderer.invoke('hub:actualizar-instalar'),
  captura:     (accion) => ipcRenderer.invoke('hub:captura', accion), // 'iniciar' | 'detener' | 'carpeta' | undefined = estado
  onCaptura:   (cb) => ipcRenderer.on('hub:captura-estado', (e, d) => cb(d)),
  exitlag:     (accion) => ipcRenderer.invoke('hub:exitlag', accion)  // 'activar' | 'desactivar' | 'recargar' | 'abrir-config' | undefined = estado
});
