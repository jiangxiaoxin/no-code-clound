import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/apps/:id',
      name: 'app-workspace',
      component: () => import('../views/AppWorkspaceView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const userStore = useUserStore()
  const loggedIn = Boolean(userStore.accessToken)

  if (!loggedIn && !to.meta.guestOnly) {
    return { path: '/login' }
  }

  if (loggedIn && to.meta.guestOnly) {
    return { path: '/' }
  }

  return true
})

export default router
