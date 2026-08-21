<template>
  <el-container class="home" direction="vertical">
    <AppHeader />
    <el-main class="home-body" v-loading="loading">
      <el-row class="home-toolbar" justify="space-between" align="middle">
        <el-col :xs="24" :md="8">
          <el-text class="home-title" tag="h1">我的应用</el-text>
        </el-col>
        <el-col :xs="24" :md="16">
          <el-space class="home-actions" :size="12" alignment="center">
            <el-input
              v-model="keyword"
              class="home-search"
              clearable
              placeholder="请输入名称搜索"
              :prefix-icon="Search"
            />
            <el-button type="primary" :icon="Plus" @click="openCreate">
              新建应用
            </el-button>
          </el-space>
        </el-col>
      </el-row>

      <el-empty
        v-if="!loading && visibleApps.length === 0"
        :description="keyword.trim() ? '没有匹配的应用' : '还没有应用，点击右上角新建'"
      />

      <el-space v-else class="app-grid" wrap :size="32">
        <el-card
          v-for="app in visibleApps"
          :key="app.id"
          class="app-card"
          shadow="never"
          @click="openApp(app)"
        >
          <el-space class="app-card-inner" direction="vertical" alignment="center" :size="12">
            <el-text class="app-icon" :style="{ background: app.icon }">
              {{ appInitial(app.name) }}
            </el-text>
            <el-text class="app-name" truncated>{{ app.name }}</el-text>
          </el-space>
        </el-card>
      </el-space>
    </el-main>
  </el-container>

  <el-dialog
    v-model="createVisible"
    title="新建应用"
    width="420px"
    align-center
    @closed="resetCreate"
  >
    <el-form
      ref="createFormRef"
      :model="createForm"
      :rules="createRules"
      label-position="top"
      @submit.prevent="onCreate"
    >
      <el-form-item label="应用名称" prop="name">
        <el-input
          v-model="createForm.name"
          maxlength="32"
          show-word-limit
          placeholder="请输入应用名称"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createVisible = false">取消</el-button>
      <el-button type="primary" :loading="creating" @click="onCreate">
        创建
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import AppHeader from '../components/AppHeader.vue'
import { createAppApi, listAppsApi } from '../api/apps'

const router = useRouter()
const keyword = ref('')
const loading = ref(false)
const apps = ref([])
const createVisible = ref(false)
const creating = ref(false)
const createFormRef = ref()
const createForm = reactive({ name: '' })
const createRules = {
  name: [
    { required: true, message: '请输入应用名称', trigger: 'blur' },
    { min: 1, max: 32, message: '应用名称最多 32 个字', trigger: 'blur' },
  ],
}

const visibleApps = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) {
    return apps.value
  }
  return apps.value.filter((app) => app.name.toLowerCase().includes(q))
})

function appInitial(name) {
  const text = String(name || '').trim()
  return text.slice(0, 1) || '应'
}

async function loadApps() {
  loading.value = true
  try {
    apps.value = (await listAppsApi()) || []
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
}

function openApp(app) {
  router.push(`/apps/${app.id}`)
}

function openCreate() {
  createVisible.value = true
}

function resetCreate() {
  createForm.name = ''
  createFormRef.value?.resetFields()
}

async function onCreate() {
  await createFormRef.value.validate()
  creating.value = true
  try {
    const created = await createAppApi({ name: createForm.name.trim() })
    apps.value = [created, ...apps.value]
    createVisible.value = false
    ElMessage.success('已创建应用')
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    creating.value = false
  }
}

onMounted(loadApps)
</script>

<style scoped lang="less">
.home {
  min-height: 100vh;
  background: var(--el-bg-color-page);
}

.home-body {
  padding: 28px 40px 48px;
  background: var(--el-bg-color);
}

.home-toolbar {
  margin-bottom: 28px;
  row-gap: 12px;
}

.home-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.home-actions {
  justify-content: flex-end;
  width: 100%;
}

.home-search {
  width: 280px;
}

.home-search :deep(.el-input__wrapper) {
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  box-shadow: none;
}

.app-grid {
  width: 100%;
}

.app-card {
  width: 156px;
  cursor: pointer;
  border: none;
  border-radius: 12px;
  box-shadow: none;
  transition: background-color 0.15s ease;
}

.app-card:hover {
  background-color: #f7f8fa;
}

.app-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 18px 16px;
}

.app-card-inner {
  width: 100%;
}

.app-card-inner :deep(.el-space__item) {
  display: flex;
  justify-content: center;
}

.app-icon {
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
}

.app-name {
  display: block;
  width: 100%;
  text-align: center;
  font-size: 14px;
  line-height: 1.4;
  color: var(--el-text-color-primary);
  font-weight: bold;
}
</style>
