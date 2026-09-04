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

      <div v-else class="app-grid">
        <el-card
          v-for="app in visibleApps"
          :key="app.id"
          class="app-card"
          :class="{ 'is-menu-open': openMenuAppId === app.id }"
          shadow="never"
          @click="openApp(app)"
        >
          <el-dropdown
            class="app-card-menu"
            trigger="click"
            placement="bottom"
            popper-class="app-card-dropdown"
            @command="onAppMenuCommand($event, app)"
            @visible-change="onAppMenuVisibleChange($event, app)"
          >
            <el-button
              class="app-card-settings"
              text
              :icon="Setting"
              @click.stop
            />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename" :icon="EditPen">
                  修改名称
                </el-dropdown-item>
                <el-dropdown-item command="delete" :icon="Delete">
                  删除应用
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <div class="app-card-inner">
            <span class="app-icon" :style="{ background: app.icon }">
              {{ appInitial(app.name) }}
            </span>
            <span class="app-name">{{ app.name }}</span>
          </div>
        </el-card>
      </div>
    </el-main>
  </el-container>

  <el-dialog
    v-model="createVisible"
    title="新建应用"
    width="420px"
    align-center
    draggable
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

  <el-dialog
    v-model="renameVisible"
    title="修改名称"
    width="420px"
    align-center
    draggable
    @closed="resetRename"
  >
    <el-form
      ref="renameFormRef"
      :model="renameForm"
      :rules="renameRules"
      label-position="top"
      @submit.prevent="onRename"
    >
      <el-form-item label="应用名称" prop="name">
        <el-input
          v-model="renameForm.name"
          maxlength="32"
          show-word-limit
          placeholder="请输入应用名称"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="renameVisible = false">取消</el-button>
      <el-button type="primary" :loading="renaming" @click="onRename">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, EditPen, Plus, Search, Setting } from '@element-plus/icons-vue'
import AppHeader from '../components/AppHeader.vue'
import { createAppApi, deleteAppApi, listAppsApi, renameAppApi } from '../api/apps'

const router = useRouter()
const keyword = ref('')
const loading = ref(false)
const apps = ref([])
const createVisible = ref(false)
const creating = ref(false)
const createFormRef = ref()
const createForm = reactive({ name: '' })
const renameVisible = ref(false)
const renaming = ref(false)
const renameFormRef = ref()
const renameTargetId = ref(0)
const renameForm = reactive({ name: '' })
const openMenuAppId = ref(null)
const nameRules = [
  { required: true, message: '请输入应用名称', trigger: 'blur' },
  { min: 1, max: 32, message: '应用名称最多 32 个字', trigger: 'blur' },
]
const createRules = { name: nameRules }
const renameRules = { name: nameRules }

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

function onAppMenuCommand(command, app) {
  if (command === 'rename') {
    openRename(app)
    return
  }
  if (command === 'delete') {
    onDeleteApp(app)
  }
}

function onAppMenuVisibleChange(visible, app) {
  openMenuAppId.value = visible ? app.id : null
}

function openRename(app) {
  renameTargetId.value = app.id
  renameForm.name = app.name
  renameVisible.value = true
}

function resetRename() {
  renameTargetId.value = 0
  renameForm.name = ''
  renameFormRef.value?.resetFields()
}

async function onRename() {
  await renameFormRef.value.validate()
  const name = renameForm.name.trim()
  if (!renameTargetId.value) {
    return
  }
  renaming.value = true
  try {
    const updated = await renameAppApi(renameTargetId.value, { name })
    const index = apps.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) {
      apps.value[index] = updated
    }
    renameVisible.value = false
    ElMessage.success('已修改应用名称')
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    renaming.value = false
  }
}

async function onDeleteApp(app) {
  try {
    await ElMessageBox.confirm(
      `确定删除应用「${app.name}」？删除后不可恢复。`,
      '删除应用',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  try {
    await deleteAppApi(app.id)
    apps.value = apps.value.filter((item) => item.id !== app.id)
    ElMessage.success('已删除应用')
  } catch {
    // 错误已由 http 拦截器提示
  }
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
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  width: 100%;
}

.app-card {
  position: relative;
  width: 156px;
  cursor: pointer;
  border: none;
  border-radius: 12px;
  box-shadow: none;
  transition: background-color 0.15s ease;
}

.app-card:hover,
.app-card.is-menu-open {
  background-color: #f7f8fa;
}

.app-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 18px 16px;
}

.app-card-menu {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  opacity: 0;
  pointer-events: none;
}

.app-card:hover .app-card-menu,
.app-card.is-menu-open .app-card-menu {
  opacity: 1;
  pointer-events: auto;
}

.app-card-settings {
  padding: 4px;
  color: var(--el-text-color-secondary);
}

.app-card-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
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
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.4;
  color: var(--el-text-color-primary);
  font-weight: bold;
}
</style>

<style lang="less">
.app-card-dropdown {
  min-width: 140px;

  .el-dropdown-menu {
    min-width: 140px;
  }

  .el-dropdown-menu__item {
    justify-content: flex-start;
    text-align: left;
    font-size: 13px;
  }
}
</style>
