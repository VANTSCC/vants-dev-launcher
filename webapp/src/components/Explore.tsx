import { useEffect, useState } from 'react';

export type Cat = {
  key: string;
  href: string;
  icon: string;
  title: string;
  small: string;
  color: string;
  desc: string;
  items: string[];
};

const PERFIL: Cat = {
  key: 'perfil',
  href: '#',
  icon: 'user',
  title: 'PERFIL DE JUGADOR',
  small: 'Tu ficha, tu rango y tu cuenta',
  color: '#ff0d2e',
  desc: 'Tu ficha única y editable: banner, datos, equipo, cuentas conectadas, progreso APEX, FACEIT, clips, membresía y estado en vivo.',
  items: ['Ficha editable en un solo lugar', 'Cuentas conectadas (Google, Discord, Kick)', 'XP FACEIT y progreso APEX en tiempo real'],
};

const COLS: { label: string; cats: Cat[] }[] = [
  {
    label: 'COMPETIR',
    cats: [
      { key: 'partidos', href: 'partidos.html', icon: 'swords', title: 'PARTIDOS', small: 'Agenda en vivo', color: '#ff0d2e', desc: 'La agenda del circuito: partidos por jugarse, en curso y resultados, con los equipos enlazados a su ficha.', items: ['Agenda en vivo y resultados', 'Equipos enlazados a su ficha'] },
      { key: 'ranking', href: 'ranking.html', icon: 'bar-chart-3', title: 'RANKING', small: 'Líderes del circuito', color: '#22d3ee', desc: 'La tabla de líderes por VANTS RATING: XP, series ganadas, racha y posición de cada jugador.', items: ['VANTS RATING 2.0 / 2.1', 'XP y series verificadas'] },
      { key: 'llaves', href: 'llaves.html', icon: 'git-fork', title: 'LLAVES', small: 'Bracket principal', color: '#eab308', desc: 'El bracket de la temporada: fase de grupos, elimination y gran final, ronda por ronda.', items: ['Doble eliminación', 'Avance automático por ronda'] },
      { key: 'torneos', href: 'torneos.html', icon: 'trophy', title: 'TORNEOS', small: 'Calendario abierto', color: '#ff0d2e', desc: 'Calendario de torneos abiertos con fechas, formato, pozo e inscripción directa desde la web.', items: ['Inscripción con tu equipo', 'Fecha, pozo y formato por evento'] },
      { key: 'rangos', href: 'rangos.html', icon: 'medal', title: 'RANGOS', small: 'De FUNDICIÓ' + 'N a APEX', color: '#22d3ee', desc: 'El sistema de rangos propio: refleja los puntos que ganás en FACEIT y Valorant, de FUNDICIÓ' + 'N a APEX.', items: ['Puntos FACEIT y Valorant', 'De FUNDICIÓ' + 'N a APEX'] },
    ],
  },
  {
    label: 'COMUNIDAD',
    cats: [
      { key: 'jugadores', href: 'jugadores.html', icon: 'users', title: 'SALA', small: 'Identidades del circuito', color: '#eab308', desc: 'La sala de jugadores: las identidades verificadas del circuito con su ficha completa.', items: ['Fichas públicas', 'Insignias y verificación'] },
      { key: 'equipo', href: 'equipo.html', icon: 'shield', title: 'EQUIPO', small: 'VANTS DE 5', color: '#ff0d2e', desc: 'VANTS DE 5, el equipo oficial de la marca: roster, resultados y participación en el circuito.', items: ['Roster oficial', 'Partidos del equipo'] },
      { key: 'clips', href: 'clips.html', icon: 'clapperboard', title: 'CLIPS', small: 'Momentos destacados', color: '#22d3ee', desc: 'Los momentos destacados de la arena: clutches, aces y jugadas del circuito.', items: ['Moments del circuito', 'Envío de clips de la comunidad'] },
      { key: 'historia', href: 'historia.html', icon: 'book-open', title: 'HISTORIA', small: 'De la marca', color: '#eab308', desc: 'De dónde viene VANTS: la historia de la marca, temporada por temporada.', items: ['Origen y temporadas', 'Campeones de cada edición'] },
      { key: 'guia', href: 'guia.html', icon: 'compass', title: 'GUÍA', small: 'Cómo funciona VANTS', color: '#ff0d2e', desc: 'Cómo funciona la arena de punta a punta: registro, equipos, series, rating y premios.', items: ['Reglas del circuito', 'Formato de series y ratings'] },
    ],
  },
  {
    label: 'VANTS',
    cats: [
      { key: 'membresias', href: 'membresias.html', icon: 'crown', title: 'MEMBRESÍAS', small: 'Planes, insignias y pase', color: '#eab308', desc: 'VANTS PRO y CREATOR: insignias, ventajas en torneos y el pase de temporada.', items: ['VANTS PRO', 'VANTS CREATOR', 'Pase de temporada'] },
      { key: 'tienda', href: 'tienda.html', icon: 'shopping-bag', title: 'TIENDA', small: 'Oficial × VegaStore', color: '#22d3ee', desc: 'La tienda oficial VANTS × VegaStore: jerseys, accesorios y la identidad visual de la arena.', items: ['Jerseys oficiales', 'Pagos seguros por Stripe'] },
      { key: 'descargar', href: 'descargar.html', icon: 'monitor-down', title: 'DESCARGAR', small: 'App para Windows', color: '#ff0d2e', desc: 'El VANTS HUB para Windows: la arena en tu escritorio con avisos de partidas y torneos.', items: ['Instalador para Windows', 'Avisos en vivo del circuito'] },
    ],
  },
];

function Preview({ cat }: { cat: Cat }) {
  return (
    <>
      <p className="md-label" style={{ color: cat.color }}>{'/// ' + cat.title}</p>
      <h3 className="mt-1 text-[15px] font-extrabold tracking-wide text-white">{cat.title}</h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[#9aa3ad]">{cat.desc}</p>
      <ul className="mt-3 space-y-1.5">
        {cat.items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-[11px] leading-snug text-[#c8cdd4]">
            <span className="mt-[5px] inline-block h-[5px] w-[5px] shrink-0 rotate-45" style={{ background: cat.color }} />
            {it}
          </li>
        ))}
      </ul>
      <a className="btn btn-ghost btn-sm mt-4 inline-flex" href={cat.href}>
        ABRIR {cat.title} <span aria-hidden="true">→</span>
      </a>
    </>
  );
}

export default function Explore() {
  const [active, setActive] = useState<Cat>(PERFIL);
  /* React #418: arena.js corre lucide.createIcons() en tiempo de evaluación
     (antes de que hidrate este módulo). Si el SSR trae data-lucide, lucide
     reemplaza esos <i> por <svg> y la hidratación no coincide. El atributo se
     añade recién después del montaje: el HTML inicial no tiene nada que
     lucide pueda tocar y React hidrata limpio. */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const w = window as unknown as { lucide?: { createIcons?: () => void } };
    w.lucide?.createIcons?.();
  }, [active, mounted]);

  function abrirPerfil(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const w = window as unknown as {
      VANTS_AUTH?: { sub?: string; playerId?: string | number };
      VANTS_ME?: { player?: unknown } | null;
      VANTS_PLAYERS?: { id: string | number }[];
      openPlayerProfile?: (p: unknown) => void;
      toast?: (msg: string, kind?: string) => void;
    };
    try {
      const a = w.VANTS_AUTH;
      if (a?.sub && w.openPlayerProfile) {
        let mio = w.VANTS_ME?.player ?? null;
        if (!mio && a.playerId) {
          mio = (w.VANTS_PLAYERS ?? []).find((x) => String(x.id) === String(a.playerId)) ?? null;
        }
        if (mio) { w.openPlayerProfile(mio); return; }
      }
    } catch { /* sin sesión */ }
    const lb = document.getElementById('arenaLoginBtn');
    if (lb && !lb.hidden) { lb.click(); return; }
    try { w.toast?.('Ingresá para abrir tu perfil de jugador', 'info'); } catch { /* noop */ }
  }

  return (
    <section className="sec alt home-cats" id="explorar">
      <div className="wrap">
        <div className="sec-head reveal">
          <div>
            <span className="kicker">/// EXPLORAR</span>
            <h2>Categorías de la arena</h2>
          </div>
          <p className="sec-note">
            Pasá el mouse por cualquier opción para ver qué hay dentro de cada sección. <b>Clic para entrar.</b>
          </p>
        </div>
        <div className="hc-grid reveal">
          <div className="hc-list">
            <a
              className="hc-row hc-perfil transition-all duration-200"
              href={PERFIL.href}
              onMouseEnter={() => setActive(PERFIL)}
              onClick={abrirPerfil}
            >
              <i {...(mounted ? { 'data-lucide': 'user' } : {})}></i>
              <span className="md-txt">PERFIL DE JUGADOR<small>{PERFIL.small}</small></span>
              <i {...(mounted ? { 'data-lucide': 'chevron-right' } : {})} className="md-go"></i>
            </a>
            <div className="hc-cols">
              {COLS.map((col) => (
                <div className="hc-col" key={col.label}>
                  <p className="md-label">{col.label}</p>
                  {col.cats.map((c) => (
                    <a
                      key={c.key}
                      className="hc-row transition-all duration-200"
                      href={c.href}
                      onMouseEnter={() => setActive(c)}
                    >
                      <i {...(mounted ? { 'data-lucide': c.icon } : {})}></i>
                      <span className="md-txt">{c.title}<small>{c.small}</small></span>
                      <i {...(mounted ? { 'data-lucide': 'chevron-right' } : {})} className="md-go"></i>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <aside className="hc-preview" id="hcPreview" aria-live="polite">
            <Preview cat={active} />
          </aside>
        </div>
      </div>
    </section>
  );
}
