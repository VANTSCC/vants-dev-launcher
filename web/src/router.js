import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import AccountView from './views/AccountView.vue'
import RankedView from './views/RankedView.vue'
import TournamentsView from './views/TournamentsView.vue'

// Rutas con hash (#/cuenta), igual que la web actual, para no romper enlaces ni GitHub Pages.
export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'inicio', component: HomeView },
    { path: '/cuenta', name: 'cuenta', component: AccountView },
    { path: '/ranked', name: 'ranked', component: RankedView },
    { path: '/torneos', name: 'torneos', component: TournamentsView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
