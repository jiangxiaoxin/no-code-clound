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
      path: '/inbox/:kind',
      name: 'workflow-inbox',
      component: () => import('../views/WorkflowInboxView.vue'),
    },
    {
      path: '/apps/:id/forms/:formId/design',
      name: 'form-design',
      component: () => import('../views/FormDesignView.vue'),
    },
    {
      path: '/apps/:id',
      component: () => import('../views/AppWorkspaceView.vue'),
      children: [
        {
          path: '',
          name: 'app-workspace',
          component: { render: () => null },
        },
        {
          path: 'forms/:formId',
          name: 'app-workspace-form',
          component: { render: () => null },
        },
      ],
    },
    {
      path: '/apps/:id/backend',
      component: () => import('../layouts/AppBackendLayout.vue'),
      redirect: (to) => ({
        name: 'app-dictionaries',
        params: { id: to.params.id },
      }),
      children: [
        {
          path: 'dictionaries',
          name: 'app-dictionaries',
          component: () => import('../views/app-backend/AppDictionariesView.vue'),
        },
        {
          path: 'configurators',
          name: 'app-configurators',
          component: () => import('../views/app-backend/AppConfiguratorsView.vue'),
        },
        {
          path: 'access-scopes',
          name: 'app-access-scopes',
          component: () => import('../views/app-backend/AppAccessScopesView.vue'),
        },
      ],
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

router.beforeEach(async (to) => {
  const userStore = useUserStore()

  if (userStore.accessToken && !userStore.user) {
    await userStore.restore()
  }

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
