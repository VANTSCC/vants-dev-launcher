// ============================================================
// VANTS · update-ui.js — banner de auto-actualización
// ------------------------------------------------------------
// Módulo independiente (patrón Fase 2 del plan): no toca app.js
// ni mm.js. Escucha los eventos hub:update que emite el proceso
// principal (electron-updater) y muestra un banner discreto con
// estados: disponible → descargando (%) → lista para instalar.
// El botón "REINICIAR Y ACTUALIZAR" llama hub:actualizar-instalar;
// si el usuario lo ignora, la actualización se instala sola al
// cerrar el HUB (autoInstallOnAppQuit). Errores: solo consola.
// ============================================================
(function () {
  'use strict';
  if (window.__VANTS_UPD_UI) return; // guarda anti-doble-carga
  window.__VANTS_UPD_UI = true;

  const H = window.vantsHub;
  if (!H || typeof H.onActualizacion !== 'function') return;

  const once = (fn) => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); };

  once(function () {
    // ---------- estilos propios (prefijo upd-, opt-in) ----------
    if (!$('#vants-upd-styles')) {
      const st = document.createElement('style');
      st.id = 'vants-upd-styles';
      st.textContent = [
        '.upd-banner{position:fixed;right:16px;bottom:16px;z-index:9900;display:none;align-items:center;gap:12px;',
          'background:#131318;border:1px solid #2c2c36;border-left:3px solid #ff4655;border-radius:10px;',
          'padding:10px 14px;box-shadow:0 8px 28px rgba(0,0,0,.45);max-width:420px;',
          'font:600 12px/1.45 inherit;color:#e8e8ee;animation:upd-in .25s ease}',
        '.upd-banner.ok{border-left-color:#39d98a}',
        '.upd-banner .upd-tit{font-weight:800;letter-spacing:.06em;font-size:11px;color:#8b8b96;text-transform:uppercase}',
        '.upd-banner .upd-txt{margin-top:2px;font-size:12px}',
        '.upd-bar{margin-top:6px;height:4px;border-radius:2px;background:#26262e;overflow:hidden;min-width:180px}',
        '.upd-bar>i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#ff4655,#ff8a5c);transition:width .3s ease}',
        '.upd-btn{background:#ff4655;border:0;color:#fff;font:800 11px/1 inherit;letter-spacing:.08em;',
          'padding:9px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}',
        '.upd-btn:hover{filter:brightness(1.1)}',
        '@keyframes upd-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
        '@media (prefers-reduced-motion: reduce){.upd-banner{animation:none}}'
      ].join('');
      document.head.appendChild(st);
    }

    // ---------- banner único reutilizado entre estados ----------
    let banner = null, txtEl = null, barEl = null, btnEl = null, estado = null;

    function asegurar(clase) {
      if (banner) { banner.className = 'upd-banner' + (clase ? ' ' + clase : ''); banner.style.display = 'flex'; return; }
      banner = document.createElement('div');
      banner.className = 'upd-banner' + (clase ? ' ' + clase : '');
      const caja = document.createElement('div');
      const tit = document.createElement('div');
      tit.className = 'upd-tit';
      tit.textContent = 'VANTS';
      txtEl = document.createElement('div');
      txtEl.className = 'upd-txt';
      barEl = document.createElement('div');
      barEl.className = 'upd-bar';
      const barra = document.createElement('i');
      barEl.appendChild(barra);
      barEl.style.display = 'none';
      caja.appendChild(tit); caja.appendChild(txtEl); caja.appendChild(barEl);
      btnEl = document.createElement('button');
      btnEl.className = 'upd-btn';
      btnEl.style.display = 'none';
      btnEl.addEventListener('click', function () {
        btnEl.disabled = true;
        btnEl.textContent = 'REINICIANDO…';
        try { H.actualizarInstalar(); } catch (e) {}
      });
      banner.appendChild(caja); banner.appendChild(btnEl);
      document.body.appendChild(banner);
    }

    function quitarBarra() { if (barEl) { barEl.style.display = 'none'; barEl.firstChild.style.width = '0%'; } }
    function sinBoton() { if (btnEl) { btnEl.style.display = 'none'; btnEl.disabled = false; } }
    function ocultar() { if (banner) banner.style.display = 'none'; }

    // ---------- eventos del proceso principal ----------
    H.onActualizacion(function (d) {
      const tipo = d && d.tipo;
      if (!tipo) return;
      switch (tipo) {
        case 'chequeando':
          break; // silencioso: no molestar en cada arranque
        case 'disponible':
          estado = tipo;
          asegurar('');
          sinBoton(); quitarBarra();
          txtEl.textContent = 'Nueva versión ' + (d.version || '') + ' disponible. Se está descargando en segundo plano…';
          break;
        case 'progreso':
          estado = 'disponible';
          asegurar('');
          sinBoton();
          barEl.style.display = 'block';
          barEl.firstChild.style.width = Math.max(0, Math.min(100, d.pct || 0)) + '%';
          txtEl.textContent = 'Descargando actualización… ' + (d.pct || 0) + '% (' + (d.mb || '0') + ' / ' + (d.total || '?') + ' MB)';
          break;
        case 'lista':
          estado = tipo;
          asegurar('ok');
          quitarBarra();
          btnEl.style.display = 'inline-block';
          btnEl.disabled = false;
          btnEl.textContent = 'REINICIAR Y ACTUALIZAR';
          txtEl.textContent = 'Actualización ' + (d.version || '') + ' lista. Se instalará sola cuando cierres el HUB, o adelante ahora.';
          break;
        case 'sin-novedad':
          // cerrar solo si quedaba un banner sin acción pendiente ('lista' se conserva)
          if (estado !== 'lista') { ocultar(); estado = null; }
          break;
        case 'error':
          // silencioso por diseño: el usuario no necesita saber de un fallo de red
          // del chequeo (sin conexión, proxy, etc.); queda en el log principal.
          break;
      }
    });
  });

  function $(s) { return document.querySelector(s); }
})();
