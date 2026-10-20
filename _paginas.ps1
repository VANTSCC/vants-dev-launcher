$ErrorActionPreference='Stop'
$root = (Get-Location).Path
$idx = [System.IO.File]::ReadAllText((Join-Path $root 'index.html'))

function Extraer($id) {
  $m = [regex]::Match($idx, '<section[^>]*id="' + $id + '"[^>]*>[\s\S]*?</section>')
  if (-not $m.Success) { throw "seccion no encontrada: $id" }
  return $m.Value
}
$SEC = @{
  partidos    = Extraer 'partidos'
  ranking     = Extraer 'ranking'
  bracket     = Extraer 'bracket'
  torneos     = Extraer 'torneos'
  pro         = Extraer 'pro'
  patrocinios = Extraer 'patrocinios'
}

$tpl = [System.IO.File]::ReadAllText((Join-Path $root 'jugadores.html'))

$navLinks = @'
    <nav class="nav-links">
      <a href="jugadores.html">SALA</a>
      <a href="partidos.html">PARTIDOS</a>
      <a href="ranking.html">RANKING</a>
      <a href="torneos.html">TORNEOS</a>
      <a href="llaves.html">LLAVES</a>
      <a href="tienda.html">TIENDA</a>
      <a href="descargar.html" class="nav-dl">DESCARGAR</a>
    </nav>
'@

$drawer = @'
<aside class="mdrawer" id="menuDrawer" aria-label="Menú de categorías">
  <div class="md-head">
    <a href="index.html" class="nav-logo" data-md-close>
      <svg class="mark"><use href="#vmark"/></svg>
      <span class="wordmark"><b>VANT<em>S</em></b><small>GAMES</small></span>
    </a>
    <button class="d-x" id="menuClose" aria-label="Cerrar menú"><i data-lucide="x"></i></button>
  </div>
  <nav class="md-body">
    <a class="md-row" href="#" id="mdPerfil" data-md-close><i data-lucide="user"></i><span class="md-txt">PERFIL DE JUGADOR<small>Tu ficha, tu rango y tu cuenta</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <p class="md-label">COMPETIR</p>
    <a class="md-row" href="partidos.html" data-md-close><i data-lucide="swords"></i><span class="md-txt">PARTIDOS<small>Agenda en vivo</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="ranking.html" data-md-close><i data-lucide="bar-chart-3"></i><span class="md-txt">RANKING<small>Líderes del circuito</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="llaves.html" data-md-close><i data-lucide="git-fork"></i><span class="md-txt">LLAVES<small>Bracket principal</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="torneos.html" data-md-close><i data-lucide="trophy"></i><span class="md-txt">TORNEOS<small>Calendario abierto</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="rangos.html" data-md-close><i data-lucide="medal"></i><span class="md-txt">RANGOS<small>VANTS RANKED</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <p class="md-label">COMUNIDAD</p>
    <a class="md-row" href="jugadores.html" data-md-close><i data-lucide="users"></i><span class="md-txt">SALA<small>Identidades del circuito</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="equipo.html" data-md-close><i data-lucide="shield"></i><span class="md-txt">EQUIPO<small>VANTS DE 5</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="clips.html" data-md-close><i data-lucide="clapperboard"></i><span class="md-txt">CLIPS<small>Momentos destacados</small></span><span class="md-new">NUEVO</span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="historia.html" data-md-close><i data-lucide="book-open"></i><span class="md-txt">HISTORIA<small>De la marca</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="guia.html" data-md-close><i data-lucide="compass"></i><span class="md-txt">GUÍA<small>Cómo funciona VANTS</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <p class="md-label">VANTS</p>
    <a class="md-row" href="membresias.html" data-md-close><i data-lucide="crown"></i><span class="md-txt">MEMBRESÍAS<small>Planes, insignias y pase</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="tienda.html" data-md-close><i data-lucide="shopping-bag"></i><span class="md-txt">TIENDA<small>Oficial × VegaStore</small></span><i data-lucide="chevron-right" class="md-go"></i></a>
    <a class="md-row" href="descargar.html" data-md-close><i data-lucide="monitor-down"></i><span class="md-txt">DESCARGAR<small>App para Windows</small></span><span class="md-new">NUEVO</span><i data-lucide="chevron-right" class="md-go"></i></a>
  </nav>
  <div class="md-foot">
    <a href="preguntas-frecuentes.html" data-md-close>Preguntas frecuentes</a>
    <a href="terminos-de-servicio.html" data-md-close>Términos</a>
    <a href="politica-de-privacidad.html" data-md-close>Privacidad</a>
  </div>
</aside>
'@

$cols = @'
      <div class="f-col"><h5>COMPETIR</h5><a href="torneos.html">Torneos abiertos</a><a href="llaves.html">Brackets</a><a href="gpr.html">Global Power Rankings</a><a href="ranking.html">Ranking global</a><a href="rangos.html">VANTS RANKED</a><a href="clips.html">Clips · Momentos destacados</a><a href="guia.html">Guía de la arena</a></div>
      <div class="f-col"><h5>IDENTIDAD</h5><a href="jugadores.html">Sala de jugadores</a><a href="equipo.html">Equipo VANTS DE 5</a><a href="identidad.html">Tienda de identidad</a><a href="historia.html">Historia de la marca</a><a href="membresias.html">Programa de socios</a></div>
      <div class="f-col"><h5>MEMBRESÍA</h5><a href="membresias.html">VANTS PRO</a><a href="membresias.html">VANTS CREATOR</a><a href="torneos.html">Torneos abiertos</a><a href="tienda.html">Tienda oficial × VegaStore</a><a href="membresias.html">Patrocinios y colaboradores</a></div>
'@

function Normalizar($c) {
  $c = [regex]::Replace($c, '<nav class="nav-links">[\s\S]*?</nav>', { param($m) $navLinks })
  $c = [regex]::Replace($c, '<aside class="mdrawer" id="menuDrawer"[\s\S]*?</aside>', { param($m) $drawer })
  $c = [regex]::Replace($c, '<div class="f-col"><h5>COMPETIR</h5>[\s\S]*?</div>\s*<div class="f-col"><h5>IDENTIDAD</h5>[\s\S]*?</div>\s*<div class="f-col"><h5>MEMBRESÍA</h5>[\s\S]*?</div>', { param($m) $cols })
  $c = $c.Replace('<button class="btn btn-ghost btn-sm" id="plansBtn"><i data-lucide="crown"></i>MEMBRESÍAS</button>', '<a class="btn btn-ghost btn-sm" href="membresias.html"><i data-lucide="crown"></i>MEMBRESÍAS</a>')
  return $c
}

$paginas = @(
  @{f='partidos.html';   t='Partidos · VANTS GAMES';     d='Agenda real de VALORANT y CS2: partidos del día, horarios y resultados en vivo.'; sec=($SEC.partidos); init='if(window.agendaEnVivo)agendaEnVivo();if(window.renderMatches)renderMatches();'},
  @{f='ranking.html';    t='Ranking · VANTS GAMES';      d='Ranking global del circuito VANTS: rating, RR, partidos y winrate de los jugadores reales.'; sec=($SEC.ranking); init='if(window.renderLbHead)renderLbHead();if(window.renderLbBody)renderLbBody();'},
  @{f='llaves.html';     t='Llaves · VANTS GAMES';       d='Bracket principal del circuito: cuartos, semifinales y final actualizados en vivo.'; sec=($SEC.bracket); init='if(window.renderBracket)renderBracket();'},
  @{f='torneos.html';    t='Torneos · VANTS GAMES';      d='Calendario de torneos abiertos: inscripción por equipo, premios y fechas.'; sec=($SEC.torneos); init='if(window.renderTournaments)renderTournaments();'},
  @{f='membresias.html'; t='Membresías · VANTS GAMES';   d='VANTS FREE, PRO y CREATOR: insignias verificables, stats avanzadas y contenido premium.'; sec=($SEC.pro + "`r`n`r`n" + $SEC.patrocinios); init=''}
)
foreach ($pg in $paginas) {
  $c = $tpl
  $c = [regex]::Replace($c, '<title>[^<]*</title>', '<title>' + $pg.t + '</title>')
  $c = [regex]::Replace($c, '<meta name="description" content="[^"]*">', '<meta name="description" content="' + $pg.d + '">')
  $c = [regex]::Replace($c, '<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="https://vants.vants.workers.dev/' + $pg.f + '">')
  $c = [regex]::Replace($c, '<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="' + $pg.t + '">')
  $c = [regex]::Replace($c, '<meta property="og:url" content="[^"]*">', '<meta property="og:url" content="https://vants.vants.workers.dev/' + $pg.f + '">')
  $c = [regex]::Replace($c, '<section class="sec alt" id="jugadores">[\s\S]*?</section>', { param($m) $pg.sec })
  if ($pg.init -ne '') {
    $hook = "<script>`r`nwindow.addEventListener('load',function(){setTimeout(function(){try{" + $pg.init + "}catch(e){}},250);});`r`n</script>`r`n</body>"
    $c = $c.Replace('</body>', $hook)
  }
  $c = Normalizar $c
  [System.IO.File]::WriteAllText((Join-Path $root $pg.f), $c)
  "creada: " + $pg.f
}

$newIdx = $idx
foreach ($id in @('partidos','ranking','bracket','torneos','pro','patrocinios')) {
  $newIdx = [regex]::Replace($newIdx, '<section[^>]*id="' + $id + '"[^>]*>[\s\S]*?</section>\s*', '')
}
$newIdx = $newIdx.Replace('<a class="btn btn-ghost" href="#bracket"><i data-lucide="git-fork"></i>VER BRACKET</a>', '<a class="btn btn-ghost" href="llaves.html"><i data-lucide="git-fork"></i>VER BRACKET</a>')
$newIdx = Normalizar $newIdx
[System.IO.File]::WriteAllText((Join-Path $root 'index.html'), $newIdx)
"index reducido a inicio"

$otras = @('jugadores.html','rangos.html','equipo.html','clips.html','historia.html','guia.html','gpr.html','identidad.html','tienda.html','descargar.html')
foreach ($f in $otras) {
  $p = Join-Path $root $f
  if (-not (Test-Path $p)) { "falta: $f"; continue }
  $c = [System.IO.File]::ReadAllText($p)
  $c2 = Normalizar $c
  if ($c2 -ne $c) { [System.IO.File]::WriteAllText($p, $c2); "$f : nav/cajon/footer normalizados" } else { "$f : sin cambios" }
}
