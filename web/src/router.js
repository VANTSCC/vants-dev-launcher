import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import AccountView from './views/AccountView.vue'
import RankedView from './views/RankedView.vue'
import TournamentsView from './views/TournamentsView.vue'
import PlayersView from './views/PlayersView.vue'
import PlayerProfileView from './views/PlayerProfileView.vue'
import CalendarView from './views/CalendarView.vue'
 feat/web-vue-fase4
import PlansView from './views/PlansView.vue'

import AdminView from './views/AdminView.vue'
 main

// Rutas con hash (#/cuenta), igual que la web actual, para no romper enlaces ni GitHub Pages.
export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'inicio', component: HomeView },
    { path: '/cuenta', name: 'cuenta', component: AccountView },
    { path: '/ranked', name: 'ranked', component: RankedView },
    { path: '/torneos', name: 'torneos', component: TournamentsView },
    { path: '/jugadores', name: 'jugadores', component: PlayersView },
    { path: '/jugadores/:id', name: 'jugador', component: PlayerProfileView },
    { path: '/calendario', name: 'calendario', component: CalendarView },
 feat/web-vue-fase4
    { path: '/planes', name: 'planes', component: PlansView },

    { path: '/admin', name: 'admin', component: AdminView },
main
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
