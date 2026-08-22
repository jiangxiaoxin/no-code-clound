<template>
  <el-header class="app-header">
    <b class="app-title">No-Code Cloud</b>
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
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Monitor, Setting, SwitchButton, User } from '@element-plus/icons-vue'
import { logoutApi } from '../api/auth'
import { useUserStore } from '../stores/user'

const router = useRouter()
const userStore = useUserStore()

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
</script>

<style scoped lang="less">
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
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
