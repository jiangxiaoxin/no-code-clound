<template>
  <el-container class="admin-layout" direction="vertical">
    <el-header class="admin-header">
      <div class="admin-header-left">
        <el-button
          :icon="ArrowLeft"
          text
          title="返回工作台"
          @click="router.push({ name: 'app-workspace', params: { id: appId } })"
        />
        <h1 class="admin-title">{{ appName }}</h1>
      </div>
    </el-header>
    <el-container class="admin-body">
      <el-aside class="admin-aside" width="200px">
        <el-menu :default-active="activeMenu" router>
          <el-menu-item :index="`/apps/${appId}/backend/dictionaries`">
            <el-icon><CollectionTag /></el-icon>
            <span>字典管理</span>
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
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, CollectionTag } from '@element-plus/icons-vue'
import { getAppApi } from '../api/apps'

const route = useRoute()
const router = useRouter()
const appName = ref('')
const appId = computed(() => Number(route.params.id))
const activeMenu = computed(() => route.path)

async function loadApp() {
  if (!Number.isInteger(appId.value) || appId.value <= 0) {
    router.replace('/')
    return
  }
  try {
    const app = await getAppApi(appId.value)
    appName.value = app?.name || ''
  } catch (error) {
    if (error.response?.status !== 401) {
      router.replace('/')
    }
  }
}

watch(appId, loadApp, { immediate: true })
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
