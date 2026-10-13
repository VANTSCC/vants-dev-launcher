// VANTS Desktop — Frontend (usa los comandos Tauri de Auth0)
// Se comunica con Rust via window.__TAURI__.invoke

const { invoke } = window.__TAURI__;
const { listen } = window.__TAURI__.event;

// ---------- Estado ----------
let session = null;
let currentView = 'dashboard';

// ---------- Elementos ----------
const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const appView = $('app-view');
const loginBtn = $('login-btn');
const logoutBtn = $('logout-btn');
const loginStatus = $('login-status');
const userAvatar = $('user-avatar');
const userName = $('user-name');
const userEmail = $('user-email');
const tokenBox = $('token-box');
const dashboardContent = $('dashboard-content');
const rankedContent = $('ranked-content');
const socialsContent = $('socials-content');

// ---------- Auth0 Login ----------
loginBtn.addEventListener('click', async () => {
  loginBtn.disabled = true;
  loginStatus.textContent = 'Abriendo navegador para login…';
  loginStatus.className = 'status';
  try {
    const authUrl = await invoke('auth0_login');
    loginStatus.textContent = 'Esperando callback de Auth0…';
  } catch (e) {
    loginStatus.textContent = 'Error: ' + e;
    loginStatus.className = 'status error';
    loginBtn.disabled = false;
  }
});

// Escuchar eventos de Auth0 desde Rust
await listen('auth0-logged-in', (event) => {
  session = { accessToken: event.payload };
  loginStatus.textContent = '¡Sesión iniciada!';
  loginStatus.className = 'status success';
  setTimeout(showApp, 500);
});

await listen('auth0-error', (event) => {
  loginStatus.textContent = 'Error de login: ' + event.payload;
  loginStatus.className = 'status error';
  loginBtn.disabled = false;
});

// ---------- Restaurar sesión al abrir la app ----------
async function restoreSession() {
  try {
    const token = await invoke('auth0_restore_session');
    if (token) {
      session = { accessToken: token };
      showApp();
    }
  } catch (e) {
    console.log('No hay sesión guardada');
  }
}

// ---------- Mostrar la app ----------
function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  tokenBox.textContent = session.accessToken;
  loadUserData();
  loadRankedData();
  loadSocialsData();
}

// ---------- Cargar datos del usuario ----------
async function loadUserData() {
  try {
    const userinfo = await fetch('https://vants.eu.auth0.com/userinfo', {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    }).then((r) => r.json());

    userName.textContent = userinfo.name || userinfo.nickname || userinfo.email?.split('@')[0] || 'Jugador';
    userEmail.textContent = userinfo.email || '—';
    if (userinfo.picture) {
      userAvatar.innerHTML = `<img src="${userinfo.picture}" alt="">`;
    } else {
      userAvatar.textContent = (userinfo.name || userinfo.nickname || '?').slice(0, 2).toUpperCase();
    }

    const playerData = await invoke('neon_query', {
      table: 'players',
      select: 'id,username,display_name,avatar_url,region,main_game,verified,created_at',
      filters: [`auth_user_id.eq.${userinfo.sub}`],
    });
    const player = Array.isArray(playerData) ? playerData[0] : null;

    if (player) {
      dashboardContent.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <div style="width:64px;height:64px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;">
            ${player.avatar_url ? `<img src="${player.avatar_url}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : (player.display_name || player.username || '?').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 style="margin:0 0 4px">${player.display_name || player.username}</h3>
            <p style="margin:0;color:#8b97a3;font-size:13px">@${player.username} · ${player.region || '—'} · ${player.main_game || '—'}</p>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div style="background:#0a0f14;padding:12px;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:900;color:#3ddc84">${player.verified ? '✓' : '—'}</div>
            <div style="font-size:11px;color:#8b97a3">Verificado</div>
          </div>
          <div style="background:#0a0f14;padding:12px;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:900;color:#ff4655">${new Date(player.created_at).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}</div>
            <div style="font-size:11px;color:#8b97a3">Miembro desde</div>
          </div>
        </div>`;
    } else {
      dashboardContent.innerHTML = '<p style="color:#8b97a3">Tu perfil de jugador se está creando. Recarga en unos segundos.</p>';
    }
  } catch (e) {
    dashboardContent.innerHTML = `<p style="color:#ff4655">Error cargando datos: ${e}</p>`;
  }
}

// ---------- Cargar ranked ----------
async function loadRankedData() {
  try {
    const userinfo = await fetch('https://vants.eu.auth0.com/userinfo', {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    }).then((r) => r.json());

    const playerData = await invoke('neon_query', {
      table: 'players',
      select: 'id',
      filters: [`auth_user_id.eq.${userinfo.sub}`],
    });
    const player = Array.isArray(playerData) ? playerData[0] : null;
    if (!player) {
      rankedContent.innerHTML = '<p style="color:#8b97a3">Tu perfil aún no está listo.</p>';
      return;
    }

    const stats = await invoke('neon_query', {
      table: 'season_player_stats',
      select: 'mmr,rank,wins,losses,placement_done,season:seasons(name,season_number,status)',
      filters: [`player_id.eq.${player.id}`],
    });

    const cur = Array.isArray(stats) ? stats.find((s) => s.season?.status === 'active') || stats[0] : null;
    if (!cur) {
      rankedContent.innerHTML = `
        <p style="color:#8b97a3;margin-bottom:16px">Aún no tienes rango. Juega tus 5 partidas de placement para obtener tu rango inicial.</p>
        <a href="#/ranked" class="btn btn-primary" style="text-decoration:none;display:block;text-align:center">Jugar placements</a>`;
      return;
    }

    const totalW = stats.reduce((a, s) => a + (s.wins || 0), 0);
    const totalL = stats.reduce((a, s) => a + (s.losses || 0), 0);
    const winrate = totalW + totalL > 0 ? Math.round((totalW / (totalW + totalL)) * 100) : 0;

    rankedContent.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;font-weight:900;color:#ff4655">${cur.mmr}</div>
        <div style="font-size:12px;color:#8b97a3">MMR actual</div>
        <div style="margin-top:8px;font-size:14px;color:#e8eef5">${cur.rank || 'Sin rango'} · ${cur.season?.name || 'Temporada actual'}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">
        <div style="background:#0a0f14;padding:12px;border-radius:8px;">
          <div style="font-size:20px;font-weight:900;color:#3ddc84">${totalW}</div>
          <div style="font-size:11px;color:#8b97a3">Victorias</div>
        </div>
        <div style="background:#0a0f14;padding:12px;border-radius:8px;">
          <div style="font-size:20px;font-weight:900;color:#ff4655">${totalL}</div>
          <div style="font-size:11px;color:#8b97a3">Derrotas</div>
        </div>
        <div style="background:#0a0f14;padding:12px;border-radius:8px;">
          <div style="font-size:20px;font-weight:900;color:#ffb547">${winrate}%</div>
          <div style="font-size:11px;color:#8b97a3">Winrate</div>
        </div>
      </div>`;
  } catch (e) {
    rankedContent.innerHTML = `<p style="color:#ff4655">Error: ${e}</p>`;
  }
}

// ---------- Cargar redes sociales ----------
async function loadSocialsData() {
  try {
    const userinfo = await fetch('https://vants.eu.auth0.com/userinfo', {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    }).then((r) => r.json());

    const accounts = await invoke('neon_query', {
      table: 'user_game_accounts',
      select: 'game,handle,display_name,avatar_url,profile_url,verified',
      filters: [`user_id.eq.${userinfo.sub}`],
    });

    const discordAccounts = await invoke('neon_query', {
      table: 'player_discord_accounts',
      select: 'discord_id,discord_username,avatar_url',
      filters: [`player_id.in.(${userinfo.sub})`],
    });

    const socials = [
      { id: 'discord', name: 'Discord', color: '#5865F2', data: discordAccounts[0] || null },
      { id: 'steam', name: 'Steam', color: '#1b2838', data: accounts.find((a) => a.game === 'steam') || null },
      { id: 'kick', name: 'Kick', color: '#53FC18', data: accounts.find((a) => a.game === 'kick') || null },
    ];

    socialsContent.innerHTML = socials.map((s) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#0a0f14;border-radius:8px;margin-bottom:8px;border-left:3px solid ${s.color}">
        <div style="width:32px;height:32px;border-radius:8px;background:${s.color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;">${s.name[0]}</div>
        <div style="flex:1">
          <div style="font-weight:700;color:#fff">${s.name}</div>
          <div style="font-size:12px;color:#8b97a3">${s.data ? (s.data.display_name || s.data.discord_username || s.data.handle || 'Vinculado') : 'No vinculado'}</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:${s.data ? '#3ddc84' : '#8b97a3'}">${s.data ? 'VINCULADO' : 'NO VINCULADO'}</div>
      </div>
    `).join('');
  } catch (e) {
    socialsContent.innerHTML = `<p style="color:#ff4655">Error: ${e}</p>`;
  }
}

// ---------- Navegación por pestañas ----------
document.querySelectorAll('.nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    currentView = view;
    document.querySelectorAll('.nav button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    ['dashboard', 'ranked', 'socials'].forEach((v) => {
      const el = $(v + '-view');
      if (el) el.classList.toggle('hidden', v !== view);
    });
  });
});

// ---------- Logout ----------
logoutBtn.addEventListener('click', async () => {
  await invoke('auth0_logout');
  session = null;
  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
  loginStatus.textContent = 'Sesión cerrada.';
  loginStatus.className = 'status';
  loginBtn.disabled = false;
});

// ---------- Arranque ----------
restoreSession();
