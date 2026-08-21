<template>
  <el-container class="workspace">
    <el-aside class="workspace-aside" width="280px" v-loading="loading">
      <div class="aside-head">
        <el-button
          :icon="ArrowLeft"
          text
          @click="router.push('/')"
        />
        <el-text truncated>{{ app?.name || ' ' }}</el-text>
      </div>

      <div class="aside-toolbar">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索分组或表单"
          :prefix-icon="Search"
        />
        <el-dropdown trigger="click" @command="onCreateCommand">
          <el-button :icon="Plus" circle />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="form">新建表单</el-dropdown-item>
              <el-dropdown-item command="group">新建分组</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <el-empty
        v-if="!loading && treeData.length === 0"
        :description="keyword.trim() ? '没有匹配的分组或表单' : '还没有分组和表单'"
      />
      <el-tree
        v-else
        ref="treeRef"
        class="aside-tree"
        :data="treeData"
        node-key="key"
        highlight-current
        default-expand-all
        :expand-on-click-node="true"
        :current-node-key="currentForm?.key"
        :props="{ label: 'name', children: 'children' }"
        @node-click="onNodeClick"
      >
        <template #default="{ data }">
          <div class="tree-node">
            <el-icon>
              <Folder v-if="data.nodeType === 'group'" />
              <Document v-else />
            </el-icon>
            <el-text truncated>{{ data.name }}</el-text>
            <el-dropdown
              trigger="click"
              popper-class="tree-node-menu"
              @command="(cmd) => onNodeCommand(cmd, data)"
            >
              <el-button text :icon="MoreFilled" @click.stop />
              <template #dropdown>
                <el-dropdown-menu v-if="data.nodeType === 'group'">
                  <el-dropdown-item command="create-form">新建表单</el-dropdown-item>
                  <el-dropdown-item command="rename">修改名称</el-dropdown-item>
                  <el-dropdown-item command="delete">删除分组</el-dropdown-item>
                </el-dropdown-menu>
                <el-dropdown-menu v-else>
                  <el-dropdown-item command="edit">编辑表单</el-dropdown-item>
                  <el-dropdown-item command="rename">修改名称</el-dropdown-item>
                  <el-dropdown-item command="delete">删除表单</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-tree>
    </el-aside>
    <AppWorkspaceMain :form="currentForm" />
  </el-container>

  <el-dialog
    v-model="nameVisible"
    :title="nameDialogTitle"
    width="420px"
    align-center
    @closed="resetNameDialog"
  >
    <el-form
      ref="nameFormRef"
      :model="nameForm"
      :rules="nameRules"
      label-position="top"
      @submit.prevent="onSubmitName"
    >
      <el-form-item label="名称" prop="name">
        <el-input
          v-model="nameForm.name"
          maxlength="32"
          show-word-limit
          placeholder="请输入名称"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="nameVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmitName">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Document,
  Folder,
  MoreFilled,
  Plus,
  Search,
} from '@element-plus/icons-vue'
import {
  createFormApi,
  createGroupApi,
  deleteFormApi,
  deleteGroupApi,
  getAppApi,
  getDirectoryApi,
  renameFormApi,
  renameGroupApi,
} from '../api/apps'
import AppWorkspaceMain from '../components/AppWorkspaceMain.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const app = ref(null)
const directory = ref({ groups: [], forms: [] })
const currentForm = ref(null)
const treeRef = ref()
const nameVisible = ref(false)
const nameFormRef = ref()
const nameForm = reactive({ name: '' })
const nameMode = ref('create-group')
const nameTargetId = ref(null)
const createFormGroupId = ref(null)
const nameRules = {
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { min: 1, max: 32, message: '名称最多 32 个字', trigger: 'blur' },
  ],
}

const appId = computed(() => Number(route.params.id))

const nameDialogTitle = computed(() => {
  if (nameMode.value === 'create-group') return '新建分组'
  if (nameMode.value === 'create-form') return '新建表单'
  if (nameMode.value === 'rename-group') return '修改名称'
  return '修改名称'
})

const filteredDirectory = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const groups = directory.value.groups || []
  const rootForms = directory.value.forms || []
  if (!q) {
    return { groups, forms: rootForms }
  }

  const nextGroups = []
  for (const group of groups) {
    const groupHit = String(group.name || '').toLowerCase().includes(q)
    const forms = groupHit
      ? group.forms || []
      : (group.forms || []).filter((form) =>
          String(form.name || '').toLowerCase().includes(q),
        )
    if (groupHit || forms.length) {
      nextGroups.push({ ...group, forms })
    }
  }

  return {
    groups: nextGroups,
    forms: rootForms.filter((form) =>
      String(form.name || '').toLowerCase().includes(q),
    ),
  }
})

const treeData = computed(() => {
  const groups = (filteredDirectory.value.groups || []).map((group) => ({
    key: `group:${group.id}`,
    id: group.id,
    name: group.name,
    nodeType: 'group',
    children: (group.forms || []).map(toFormNode),
  }))
  const forms = (filteredDirectory.value.forms || []).map(toFormNode)
  return [...groups, ...forms]
})

function toFormNode(form) {
  return {
    key: `form:${form.id}`,
    id: form.id,
    name: form.name,
    groupId: form.groupId ?? null,
    nodeType: 'form',
  }
}

function onNodeClick(data) {
  if (data.nodeType === 'form') {
    currentForm.value = data
    return
  }
  treeRef.value?.setCurrentKey(currentForm.value?.key ?? null)
}

function onCreateCommand(command) {
  if (command === 'group') {
    openNameDialog('create-group')
    return
  }
  openNameDialog('create-form', { groupId: null })
}

function onNodeCommand(command, data) {
  if (command === 'create-form') {
    openNameDialog('create-form', { groupId: data.id })
    return
  }
  if (command === 'edit') {
    router.push({
      name: 'form-design',
      params: { id: appId.value, formId: data.id },
    })
    return
  }
  if (command === 'rename') {
    openNameDialog(
      data.nodeType === 'group' ? 'rename-group' : 'rename-form',
      { id: data.id, name: data.name },
    )
    return
  }
  if (command === 'delete') {
    onDelete(data)
  }
}

function openNameDialog(mode, extra = {}) {
  nameMode.value = mode
  nameTargetId.value = extra.id ?? null
  createFormGroupId.value = extra.groupId ?? null
  nameForm.name = extra.name || ''
  nameVisible.value = true
}

function resetNameDialog() {
  nameForm.name = ''
  nameTargetId.value = null
  createFormGroupId.value = null
  nameFormRef.value?.resetFields()
}

async function onSubmitName() {
  await nameFormRef.value.validate()
  saving.value = true
  try {
    const name = nameForm.name.trim()
    const id = appId.value
    if (nameMode.value === 'create-group') {
      await createGroupApi(id, { name })
    } else if (nameMode.value === 'create-form') {
      const form = await createFormApi(id, {
        name,
        groupId: createFormGroupId.value,
      })
      nameVisible.value = false
      await loadDirectory()
      currentForm.value = toFormNode(form)
      await nextTick()
      treeRef.value?.setCurrentKey(currentForm.value.key)
      return
    } else if (nameMode.value === 'rename-group') {
      await renameGroupApi(id, nameTargetId.value, { name })
    } else {
      await renameFormApi(id, nameTargetId.value, { name })
      if (currentForm.value?.id === nameTargetId.value) {
        currentForm.value = { ...currentForm.value, name }
      }
    }
    nameVisible.value = false
    await loadDirectory()
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    saving.value = false
  }
}

async function onDelete(data) {
  if (data.nodeType === 'group' && (data.children || []).length > 0) {
    ElMessage.warning('请先删除分组内的表单')
    return
  }

  const isGroup = data.nodeType === 'group'
  try {
    await ElMessageBox.confirm(
      isGroup ? `确定删除分组「${data.name}」？` : `确定删除表单「${data.name}」？`,
      isGroup ? '删除分组' : '删除',
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
    if (isGroup) {
      await deleteGroupApi(appId.value, data.id)
    } else {
      await deleteFormApi(appId.value, data.id)
      if (currentForm.value?.id === data.id) {
        currentForm.value = null
      }
    }
    await loadDirectory()
  } catch {
    // 错误已由 http 拦截器提示
  }
}

async function loadDirectory() {
  directory.value = (await getDirectoryApi(appId.value)) || {
    groups: [],
    forms: [],
  }
}

async function loadWorkspace() {
  if (!Number.isInteger(appId.value) || appId.value <= 0) {
    router.replace('/')
    return
  }

  loading.value = true
  try {
    currentForm.value = null
    app.value = await getAppApi(appId.value)
    await loadDirectory()
  } catch (error) {
    if (error.response?.status !== 401) {
      router.replace('/')
    }
  } finally {
    loading.value = false
  }
}

watch(appId, loadWorkspace, { immediate: true })
</script>

<style scoped lang="less">
.workspace {
  height: 100vh;
  background: var(--el-bg-color-page);
}

.workspace-aside {
  display: flex;
  flex-direction: column;
  padding: 12px 12px 16px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  overflow: hidden;
}

.aside-head,
.aside-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.aside-head {
  gap: 4px;

  .el-text {
    flex: 1;
    min-width: 0;
    font-size: 16px;
    font-weight: 600;
  }
}

.aside-toolbar {
  gap: 8px;

  .el-input {
    flex: 1;
    min-width: 0;
  }
}

.aside-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;

  :deep(.el-tree-node__content) {
    width: 100%;
    height: auto;
  }
}

.tree-node {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 4px 4px 4px 0;

  > .el-icon {
    color: var(--el-text-color-secondary);
  }

  .el-text {
    flex: 1;
    min-width: 0;
  }
}
</style>
