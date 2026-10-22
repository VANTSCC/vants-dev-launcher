// ============================================================
// VANTS · menu-data.ts — fuente única del menú, estilo MYKD
// (data/menu-datas.ts): cada entrada con id, title, link y
// sub_menu opcional. Nav.astro renderiza esto; para agregar
// una sección solo se edita este archivo.
// ============================================================

export interface SubMenu {
  title: string;
  link: string;
}

export interface MenuData {
  id: number;
  title: string;
  link: string;
  sub_menu?: SubMenu[];
}

export const menu_data: MenuData[] = [
  {
    id: 1,
    title: 'SALA',
    link: 'jugadores.html',
    sub_menu: [
      { title: 'Sala de jugadores', link: 'jugadores.html' },
      { title: 'Equipos del circuito', link: 'equipos.html' },
      { title: 'Equipo VANTS DE 5', link: 'equipo.html' },
    ],
  },
  {
    id: 2,
    title: 'PARTIDOS',
    link: 'partidos.html',
    sub_menu: [
      { title: 'Agenda en vivo', link: 'partidos.html' },
      { title: 'Resultados', link: 'resultados.html' },
      { title: 'Calendario', link: 'calendario.html' },
    ],
  },
  {
    id: 3,
    title: 'RANKING',
    link: 'ranking.html',
    sub_menu: [
      { title: 'Ranking global', link: 'ranking.html' },
      { title: 'Rangos', link: 'rangos.html' },
    ],
  },
  {
    id: 4,
    title: 'TORNEOS',
    link: 'torneos.html',
    sub_menu: [
      { title: 'Calendario abierto', link: 'torneos.html' },
      { title: 'Torneo actual · Ascensión S4', link: 'torneo.html' },
      { title: 'Llaves · Bracket', link: 'llaves.html' },
    ],
  },
  /* D24: el tab LLAVES salió del nav (el dueño lo pidió: ya vive en el
     submenú de TORNEOS → "Llaves · Bracket"). llaves.html sigue existiendo. */
  { id: 6, title: 'TIENDA', link: 'tienda.html' },
  { id: 7, title: 'DESCARGAR', link: 'descargar.html' },
  {
    id: 8,
    title: 'CLIPS',
    link: 'clips.html',
    sub_menu: [
      { title: 'Momentos destacados', link: 'clips.html' },
      { title: 'Historia', link: 'historia.html' },
      { title: 'Guía de la arena', link: 'guia.html' },
    ],
  },
  /* D24: la sección NOTICIAS salió COMPLETA del sitio (página borrada y tab
     fuera) — el dueño no quiere que el nav mande a páginas fuera de la
     principal; noticias.html/noticia.html fueron eliminadas. */
];
