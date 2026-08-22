import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
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
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/apps/:id',
      name: 'app-workspace',
      component: () => import('../views/AppWorkspaceView.vue'),
    },
    {
      path: '/apps/:id/forms/:formId',
      name: 'form-design',
      component: () => import('../views/FormDesignView.vue'),
    },
    {
      path: '/admin',
      component: () => import('../layouts/AdminLayout.vue'),
      redirect: '/admin/users',
      meta: { permission: 'admin.access' },
      children: [
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/admin/AdminUsersView.vue'),
          meta: { permission: 'admin.access' },
        },
        {
          path: 'departments',
          name: 'admin-departments',
          component: () => import('../views/admin/AdminDepartmentsView.vue'),
          meta: { permission: 'admin.access' },
        },
        {
          path: 'roles',
          name: 'admin-roles',
          component: () => import('../views/admin/AdminRolesView.vue'),
          meta: { permission: 'admin.access' },
        },
      ],
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

  if (to.meta.permission && !userStore.hasPermission(to.meta.permission)) {
    ElMessage.warning('无权访问管理后台')
    return { path: '/' }
  }

  return true
})

export default router
