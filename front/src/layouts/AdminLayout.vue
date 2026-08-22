<template>
  <el-container class="admin-layout" direction="vertical">
    <el-header class="admin-header">
      <div class="admin-header-left">
        <el-button :icon="ArrowLeft" text @click="router.push('/')" title="返回工作台" />
        <h1 class="admin-title">管理后台</h1>
      </div>
      <div class="admin-user">
        <el-avatar :size="22" :icon="User" class="admin-user-avatar" />
        <span>{{ userStore.user?.displayName || userStore.user?.username }}</span>
      </div>
    </el-header>
    <el-container class="admin-body">
      <el-aside class="admin-aside" width="200px">
        <el-menu :default-active="activeMenu" router>
          <el-menu-item index="/admin/users">
            <el-icon><User /></el-icon>
            <span>人员管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/departments">
            <el-icon><OfficeBuilding /></el-icon>
            <span>部门管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/roles">
            <el-icon><Postcard /></el-icon>
            <span>角色管理</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      <el-main class="admin-main">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, OfficeBuilding, Postcard, User } from '@element-plus/icons-vue'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const activeMenu = computed(() => route.path)
</script>

<style scoped lang="less">
.admin-layout {
  height: 100vh;
  background: var(--el-bg-color-page);
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
}

.admin-header-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.admin-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.admin-user {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.admin-user-avatar {
  background-color: var(--el-color-primary);
  color: #fff;
}

.admin-body {
  flex: 1;
  min-height: 0;
}

.admin-aside {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
}

.admin-aside :deep(.el-menu) {
  border-right: none;
}

.admin-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
  background-color: white;
}
</style>
