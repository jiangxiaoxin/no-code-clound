<template>
  <el-container class="workspace">
    <el-aside class="workspace-aside" width="280px" v-loading="loading">
      <div class="aside-head">
        <el-button :icon="ArrowLeft" text @click="router.push('/')" />
        <el-text truncated>{{ app?.name || ' ' }}</el-text>
      </div>

      <div class="aside-inbox">
        <button type="button" class="aside-inbox-item" :class="{ 'is-active': inboxKind === 'todo' }"
          @click="openInbox('todo')">
          我的待办
          <span v-if="appTodoCount" class="aside-inbox-count">{{ appTodoCount }}</span>
        </button>
        <button type="button" class="aside-inbox-item" :class="{ 'is-active': inboxKind === 'mine' }"
          @click="openInbox('mine')">
          我发起的
        </button>
        <button type="button" class="aside-inbox-item" :class="{ 'is-active': inboxKind === 'done' }"
          @click="openInbox('done')">
          我处理的
        </button>
        <button type="button" class="aside-inbox-item" :class="{ 'is-active': inboxKind === 'cc' }"
          @click="openInbox('cc')">
          抄送我的
        </button>
      </div>

      <div class="aside-toolbar">
        <el-input v-model="keyword" clearable placeholder="搜索分组或表单" :prefix-icon="Search" />
        <el-dropdown v-if="canConfigure" trigger="click" @command="onCreateCommand">
          <el-button :icon="Plus" circle />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="form">新建表单</el-dropdown-item>
              <el-dropdown-item command="group">新建分组</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="aside-body">
        <el-empty v-if="!loading && treeData.length === 0" :description="keyword.trim() ? '没有匹配的分组或表单' : '还没有分组和表单'" />
        <el-tree v-else ref="treeRef" class="aside-tree" :data="treeData" node-key="key" highlight-current
          :default-expand-all="true" :expand-on-click-node="true" :current-node-key="currentForm?.key"
          :props="{ label: 'name', children: 'children' }" @node-click="onNodeClick">
          <template #default="{ data }">
            <div class="tree-node">
              <el-icon :class="treeNodeIconClass(data)">
                <Folder v-if="data.nodeType === 'group'" />
                <Share v-else-if="data.formKind === 'workflow'" />
                <Document v-else />
              </el-icon>
              <el-text truncated>{{ data.name }}</el-text>
              <el-dropdown v-if="canConfigure" trigger="click" popper-class="tree-node-menu"
                @command="(cmd) => onNodeCommand(cmd, data)">
                <el-button text :icon="MoreFilled" @click.stop />
                <template #dropdown>
                  <el-dropdown-menu v-if="data.nodeType === 'group'">
                    <el-dropdown-item command="create-form">新建表单</el-dropdown-item>
                    <el-dropdown-item command="rename">修改名称</el-dropdown-item>
                    <el-dropdown-item command="delete">删除分组</el-dropdown-item>
                  </el-dropdown-menu>
                  <el-dropdown-menu v-else>
                    <el-dropdown-item command="edit">编辑表单</el-dropdown-item>
                    <el-dropdown-item v-if="data.formKind !== 'workflow'" command="convert-workflow">
                      转为流程表单
                    </el-dropdown-item>
                    <el-dropdown-item command="rename">修改名称</el-dropdown-item>
                    <el-dropdown-item command="delete">删除表单</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-tree>
      </div>
      <div class="aside-footer"  v-if="canConfigure">
        <el-button class="aside-backend" text :icon="Setting" @click="goBackend">
          应用后台
        </el-button>
      </div>
    </el-aside>
    <WorkflowInboxList v-if="inboxKind" class="workspace-inbox" :kind="inboxKind" :app-id="appId"
      @changed="onInboxChanged" />
    <AppWorkspaceMain v-else :app-id="appId" :form="currentForm" :can-configure="canConfigure" />
  </el-container>

  <router-view />

  <el-dialog v-model="nameVisible" :title="nameDialogTitle" width="420px" align-center draggable
    @closed="resetNameDialog">
    <el-form ref="nameFormRef" :model="nameForm" :rules="nameRules" label-position="top"
      @submit.prevent="submitNameDialog">
      <el-form-item label="名称" prop="name">
        <el-input v-model="nameForm.name" maxlength="32" show-word-limit placeholder="请输入名称" />
      </el-form-item>
      <el-form-item v-if="nameMode === 'create-form'" label="表单类型">
        <div>
          <el-radio-group v-model="nameForm.formKind">
            <el-radio value="normal">普通表单</el-radio>
            <el-radio value="workflow">流程表单</el-radio>
          </el-radio-group>
          <p class="form-kind-hint">
            {{ formKindHint }}
          </p>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="closeNameDialog">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submitNameDialog">
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
  Setting,
  Share,
} from '@element-plus/icons-vue'
import {
  convertFormKindApi,
  createFormApi,
  createGroupApi,
  deleteFormApi,
  deleteGroupApi,
  getAppApi,
  getDirectoryApi,
  queryFormRecordsApi,
  renameFormApi,
  renameGroupApi,
} from '../api/apps'
import AppWorkspaceMain from '../components/AppWorkspaceMain.vue'
import WorkflowInboxList from '../components/workflow-inbox/WorkflowInboxList.vue'
import { getWorkflowInboxCountApi } from '../api/workflow'
import { useDocumentTitle } from '../utils/documentTitle.js'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const app = ref(null)
const directory = ref({ groups: [], forms: [] })
const currentForm = ref(null)
const appTodoCount = ref(0)
const INBOX_KINDS = new Set(['todo', 'mine', 'done', 'cc'])
const inboxKind = computed(() => {
  const value = route.query.inbox
  return typeof value === 'string' && INBOX_KINDS.has(value) ? value : ''
})
const treeRef = ref()
const nameVisible = ref(false)
const nameFormRef = ref()
const nameForm = reactive({ name: '', formKind: 'normal' })
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
const canConfigure = computed(() => Boolean(app.value?.canConfigure))
useDocumentTitle(() => app.value?.name)
const formId = computed(() => {
  const n = Number(route.params.formId)
  return Number.isInteger(n) && n > 0 ? n : null
})

function goBackend() {
  router.push({ name: 'app-dictionaries', params: { id: appId.value } })
}

const nameDialogTitle = computed(() => {
  if (nameMode.value === 'create-group') return '新建分组'
  if (nameMode.value === 'create-form') return '新建表单'
  if (nameMode.value === 'rename-group') return '修改名称'
  return '修改名称'
})

const formKindHint = computed(() => {
  if (nameForm.formKind === 'workflow') {
    return '填完点提交进入审批，要先发布流程才能填。'
  }
  return '填完点保存就是正式数据。'
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
    formKind: form.formKind === 'workflow' ? 'workflow' : 'normal',
    workflowPublished: Boolean(form.workflowPublished),
    workflowEnabled: Boolean(form.workflowEnabled),
    nodeType: 'form',
  }
}

function treeNodeIconClass(data) {
  if (data.nodeType === 'group') return 'is-group'
  if (data.formKind === 'workflow') return 'is-form-workflow'
  return 'is-form-normal'
}

function findFormNode(id) {
  for (const form of directory.value.forms || []) {
    if (form.id === id) {
      return toFormNode(form)
    }
  }
  for (const group of directory.value.groups || []) {
    for (const form of group.forms || []) {
      if (form.id === id) {
        return toFormNode(form)
      }
    }
  }
  return null
}

function syncTreeCurrent(formNode) {
  nextTick(() => {
    if (formNode?.groupId != null) {
      treeRef.value?.getNode(`group:${formNode.groupId}`)?.expand()
    }
    treeRef.value?.setCurrentKey(formNode?.key ?? null)
  })
}

function applyFormFromRoute() {
  if (inboxKind.value) {
    currentForm.value = null
    syncTreeCurrent(null)
    return
  }
  if (!formId.value) {
    currentForm.value = null
    syncTreeCurrent(null)
    return
  }
  const node = findFormNode(formId.value)
  if (!node) {
    currentForm.value = null
    router.replace({ name: 'app-workspace', params: { id: appId.value } })
    return
  }
  currentForm.value = node
  syncTreeCurrent(node)
}

function openInbox(kind) {
  router.push({
    name: 'app-workspace',
    params: { id: appId.value },
    query: { inbox: kind },
  })
}

function onInboxChanged() {
  loadAppTodoCount()
  // 顶栏的待办角标也监听这个事件，一起刷新
  window.dispatchEvent(new Event('workflow-inbox-changed'))
}

async function loadAppTodoCount() {
  try {
    const result = await getWorkflowInboxCountApi(appId.value)
    appTodoCount.value = Number(result?.todo) || 0
  } catch {
    // 刷新失败时保留旧数字，闪成 0 会误导
  }
}

function onNodeClick(data) {
  if (data.nodeType === 'form') {
    if (formId.value === data.id && !inboxKind.value) {
      return
    }
    // 模拟路由跳转
    // 虽然是进了新路由，但新路由配置render 为null，所以并不会因为路由跳转了而显示新内容
    // 右侧的表单功能区域依然由组件实现，通过props传入参数
    // 刷新后由本组件从route 上取参数还原选择
    const query = { ...route.query }
    delete query.inbox
    // tab 是上一张表留下的：换表后让新表按自己配置的默认页签打开
    delete query.tab
    router.push({
      name: 'app-workspace-form',
      params: { id: appId.value, formId: data.id },
      query,
    })
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
  if (command === 'convert-workflow') {
    onConvertToWorkflow(data)
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
  nameForm.formKind = 'normal'
  nameVisible.value = true
}

function closeNameDialog() {
  nameVisible.value = false
}

function resetNameDialog() {
  nameForm.name = ''
  nameForm.formKind = 'normal'
  nameTargetId.value = null
  createFormGroupId.value = null
  nameFormRef.value?.resetFields()
}

async function submitNameDialog() {
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
        formKind: nameForm.formKind,
      })
      nameVisible.value = false
      await loadDirectory()
      router.push({
        name: 'form-design',
        params: { id, formId: form.id },
      })
      return
    } else if (nameMode.value === 'rename-group') {
      await renameGroupApi(id, nameTargetId.value, { name })
    } else {
      await renameFormApi(id, nameTargetId.value, { name })
    }
    nameVisible.value = false
    await loadDirectory()
    applyFormFromRoute()
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    saving.value = false
  }
}

async function countFormRecords(formId) {
  try {
    const result = await queryFormRecordsApi(appId.value, formId, {
      page: 1,
      pageSize: 1,
    })
    const total = Number(result?.total)
    return Number.isInteger(total) && total >= 0 ? total : null
  } catch {
    return null
  }
}

async function onConvertToWorkflow(data) {
  const total = await countFormRecords(data.id)
  const countText =
    total == null ? '已有数据' : `已有的 ${total} 条数据`
  try {
    await ElMessageBox.confirm(
      `${countText}将记为已通过，且发布流程之前不能再填报。确定把「${data.name}」转为流程表单？`,
      '转为流程表单',
      {
        confirmButtonText: '转为流程表单',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    await convertFormKindApi(appId.value, data.id)
    ElMessage.success('已转为流程表单')
    await loadDirectory()
    applyFormFromRoute()
  } catch {
    // 错误已由 http 拦截器提示
  }
}

async function onDelete(data) {
  if (data.nodeType === 'group' && (data.children || []).length > 0) {
    ElMessage.warning('请先删除分组内的表单')
    return
  }

  const isGroup = data.nodeType === 'group'
  let formDeleteMessage = `确定删除表单「${data.name}」？`
  if (!isGroup) {
    const total = await countFormRecords(data.id)
    const countText =
      total == null ? '已填报的数据' : `该表单已填报的 ${total} 条数据`
    formDeleteMessage = `将同时删除${countText}，不可恢复。确定删除表单「${data.name}」？`
  }
  try {
    await ElMessageBox.confirm(
      isGroup ? `确定删除分组「${data.name}」？` : formDeleteMessage,
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
    }
    await loadDirectory()
    applyFormFromRoute()
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
    app.value = await getAppApi(appId.value)
    await loadDirectory()
    await loadAppTodoCount()
    applyFormFromRoute()
  } catch (error) {
    if (error.response?.status !== 401) {
      router.replace('/')
    }
  } finally {
    loading.value = false
  }
}

watch(appId, loadWorkspace, { immediate: true })

watch([formId, inboxKind], () => {
  if (loading.value) {
    return
  }
  applyFormFromRoute()
})
</script>

<style scoped lang="less">
.workspace {
  height: 100vh;
  background: var(--el-bg-color-page);
}

.workspace-aside {
  display: flex;
  flex-direction: column;
  padding: 12px 0 16px 12px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  overflow: hidden;
}

.aside-head,
.aside-toolbar,
.aside-inbox {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  margin-right: 6px;
}

.aside-inbox {
  flex-direction: column;
  align-items: stretch;
}

.aside-inbox-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  color: var(--el-text-color-regular);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}

.aside-inbox-item.is-active,
.aside-inbox-item:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.aside-inbox-count {
  padding: 0 6px;
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  background: var(--el-color-danger);
  border-radius: 9px;
}

.workspace-inbox {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--el-bg-color);
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

.aside-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.aside-tree {
  min-height: 0;

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

  >.el-icon {
    flex-shrink: 0;
    color: var(--el-text-color-secondary);

    &.is-form-normal {
      color: var(--el-color-primary);
    }

    &.is-form-workflow {
      color: var(--el-color-warning);
    }
  }

  .el-text {
    flex: 1;
    min-width: 0;
  }
}

.aside-footer {
  flex-shrink: 0;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color);
}

.aside-backend {
  width: 100%;
  justify-content: flex-start;
}

.form-kind-hint {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
