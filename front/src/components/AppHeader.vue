<template>
  <el-header class="app-header">
    <div class="header-left">
      <b class="app-title">简简单单搞个低代码</b>
      <nav class="header-nav">
        <button
          type="button"
          class="header-nav-item"
          :class="{ 'is-active': nav === 'apps' }"
          @click="goHome"
        >
          <el-icon><Grid /></el-icon>
          <span>我的应用</span>
        </button>
        <button
          type="button"
          class="header-nav-item"
          :class="{ 'is-active': nav === 'todo' }"
          @click="goInbox('todo')"
        >
          <el-icon><Tickets /></el-icon>
          <span>我的待办</span>
          <span v-if="todoCount" class="header-nav-count">{{ todoCount }}</span>
        </button>
        <button
          type="button"
          class="header-nav-item"
          :class="{ 'is-active': nav === 'mine' }"
          @click="goInbox('mine')"
        >
          <el-icon><EditPen /></el-icon>
          <span>我发起的</span>
        </button>
        <button
          type="button"
          class="header-nav-item"
          :class="{ 'is-active': nav === 'done' }"
          @click="goInbox('done')"
        >
          <el-icon><Finished /></el-icon>
          <span>我处理的</span>
        </button>
        <button
          type="button"
          class="header-nav-item"
          :class="{ 'is-active': nav === 'cc' }"
          @click="goInbox('cc')"
        >
          <el-icon><ChatDotRound /></el-icon>
          <span>抄送我的</span>
        </button>
      </nav>
    </div>
    <el-dropdown
      trigger="hover"
      placement="bottom-end"
      popper-class="user-menu"
      @command="onCommand"
    >
      <div class="user-entry">
        <el-avatar :size="22" :icon="User" class="user-avatar" />
        <span class="username">{{ userStore.user?.username }}</span>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="settings" :icon="Setting">个人设置</el-dropdown-item>
          <el-dropdown-item
            v-if="userStore.hasPermission('admin.access')"
            command="admin"
            :icon="Monitor"
          >
            管理后台
          </el-dropdown-item>
          <el-dropdown-item command="logout" :icon="SwitchButton" divided>退出</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </el-header>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  ChatDotRound,
  EditPen,
  Finished,
  Grid,
  Monitor,
  Setting,
  SwitchButton,
  Tickets,
  User,
} from '@element-plus/icons-vue'
import { logoutApi } from '../api/auth'
import { getWorkflowInboxCountApi } from '../api/workflow'
import { useUserStore } from '../stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const todoCount = ref(0)

const nav = computed(() => {
  if (route.name === 'workflow-inbox') {
    const kind = route.params.kind
    return kind === 'mine' || kind === 'done' || kind === 'cc' ? kind : 'todo'
  }
  if (route.name === 'home') return 'apps'
  return ''
})

function goHome() {
  router.push({ name: 'home' })
}

function goInbox(kind) {
  router.push({ name: 'workflow-inbox', params: { kind } })
}

async function loadCount() {
  try {
    const result = await getWorkflowInboxCountApi()
    todoCount.value = Number(result?.todo) || 0
  } catch {
    todoCount.value = 0
  }
}

function onCommand(command) {
  if (command === 'admin') {
    router.push('/admin/users')
    return
  }
  if (command === 'logout') {
    onLogout()
  }
}

async function onLogout() {
  try {
    await ElMessageBox.confirm('确定退出登录？', '退出', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await logoutApi()
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    userStore.logout()
    router.push('/login')
  }
}

onMounted(() => {
  loadCount()
  window.addEventListener('workflow-inbox-changed', loadCount)
})

onUnmounted(() => {
  window.removeEventListener('workflow-inbox-changed', loadCount)
})

watch(
  () => route.fullPath,
  () => {
    if (route.name === 'home' || route.name === 'workflow-inbox') {
      loadCount()
    }
  },
)
</script>

<style scoped lang="less">
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
}

.header-left {
  display: flex;
  align-items: center;
  min-width: 0;
}

.header-nav {
  display: flex;
  align-items: center;
  margin-left: 24px;
}

.header-nav-item {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  margin-right: 4px;
  color: var(--el-text-color-regular);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  gap: 2px;
  position: relative;
}

.header-nav-item.is-active,
.header-nav-item:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.header-nav-count {
  margin-left: 6px;
  padding: 0 6px;
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  background: var(--el-color-danger);
  border-radius: 9px;
  position: absolute;
  top: 0;
  right: 0;
  transform: translate(50%, -50%);
}

.app-header :deep(.el-tooltip__trigger) {
  display: flex;
  outline: none;
}

.user-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.app-title {
  font-size: 16px;
}

.username {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.user-avatar {
  background-color: var(--el-color-primary);
  color: #fff;
}
</style>

<style lang="less">
.user-menu {
  min-width: 160px;

  .el-dropdown-menu {
    min-width: 160px;
  }

  .el-dropdown-menu__item {
    justify-content: flex-start;
    text-align: left;
    font-size: 12px;
  }
}
</style>
