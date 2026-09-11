<template>
  <el-main class="publish-panel">
    <div class="publish-layout">
      <el-menu
        :default-active="activeSetting"
        class="publish-menu"
        @select="onSettingSelect"
      >
        <el-menu-item index="workspace">工作区设置</el-menu-item>
        <el-menu-item index="records">数据管理</el-menu-item>
        <el-menu-item index="access">谁可以看</el-menu-item>
      </el-menu>
      <section class="publish-content">
        <el-card v-if="activeSetting === 'workspace'" class="publish-card" shadow="never">
          <template #header>
            <div class="publish-card-title">工作区显示设置</div>
          </template>
          <el-form label-position="top">
            <el-form-item label="数据管理页 Tab 显示顺序">
              <el-radio-group v-model="tabOrder">
                <el-radio-button value="create-first">添加数据 → 数据管理</el-radio-button>
                <el-radio-button value="list-first">数据管理 → 添加数据</el-radio-button>
              </el-radio-group>
              <p class="publish-desc publish-desc-inline">
                本配置存在本机浏览器缓存，只在当前电脑、当前浏览器生效。换电脑或清除缓存后，恢复为「添加数据 → 数据管理」。
              </p>
            </el-form-item>
          </el-form>
          <div class="publish-actions">
            <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
          </div>
        </el-card>
        <el-card v-else-if="activeSetting === 'records'" class="publish-card" shadow="never">
          <template #header>
            <div class="publish-card-title">数据管理按钮</div>
          </template>
          <p class="publish-desc">新增、编辑、删除默认开启；导入、导出、下载导入模版默认关闭。关闭后数据管理页不显示对应按钮。导出暂未开放。</p>
          <p v-if="isWorkflowForm" class="publish-desc">
            流程表单不能导入。改已通过的数据会重新进入审批，通过之前不能再被别的表选到。
          </p>
          <div class="action-list">
            <el-checkbox v-model="actions.create">新增</el-checkbox>
            <el-checkbox v-model="actions.edit">编辑</el-checkbox>
            <el-checkbox v-model="actions.delete">删除</el-checkbox>
            <el-checkbox v-model="actions.import" :disabled="isWorkflowForm">导入</el-checkbox>
            <el-checkbox v-model="actions.export">导出</el-checkbox>
            <el-checkbox v-model="actions.downloadTemplate" :disabled="isWorkflowForm">
              下载导入模版
            </el-checkbox>
          </div>
          <div class="publish-actions">
            <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
          </div>
        </el-card>
        <el-card v-else class="publish-card" shadow="never">
          <template #header>
            <div class="publish-card-title">谁可以看</div>
          </template>
          <p class="publish-desc">
            所有者和配置名单始终能看全部表、全部行。没有应用使用权的审批人不能靠「参与过」来翻表，只能走待办看那一条。
          </p>
          <h3 class="access-title">这张表谁能看见</h3>
          <p class="publish-desc">
            名单为空时，能进本应用的人都能看见这张表。加了任意一条后，普通使用人必须命中才看得见。
          </p>
          <div class="access-toolbar">
            <el-button type="primary" @click="openDept">添加部门</el-button>
            <el-button type="primary" @click="openRole">添加角色</el-button>
            <el-button type="primary" @click="openUser">添加人员</el-button>
          </div>
          <el-table :data="viewers" border stripe empty-text="不限制，能进应用的人都能看见">
            <el-table-column label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="typeTagType(row.type)">
                  {{ typeLabel(row.type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="对象">
              <template #default="{ row }">
                {{ row.label || fallbackLabel(row) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button link type="danger" @click="onRemoveViewer(row)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <h3 class="access-title">数据范围</h3>
          <p class="publish-desc">
            只约束普通使用人。默认「与自己相关」：普通表看自己创建的；流程表再加上派给自己批过或正在批、抄送给自己的单。
          </p>
          <el-radio-group v-model="rowScope">
            <el-radio
              v-for="item in rowScopeOptions"
              :key="item.value"
              :value="item.value"
            >
              {{ item.label }}
            </el-radio>
          </el-radio-group>
          <div class="publish-actions">
            <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
          </div>
        </el-card>
      </section>
    </div>

    <el-dialog
      v-model="deptVisible"
      title="添加部门"
      width="480px"
      draggable
      @closed="resetDept"
    >
      <p class="publish-desc">不含下级部门。只开放你选中的这一级。</p>
      <el-tree-select
        v-model="deptId"
        class="field-full"
        :data="departments"
        :props="{ label: 'name', value: 'id', children: 'children' }"
        check-strictly
        clearable
        placeholder="选择部门"
        :default-expand-all="true"
      />
      <template #footer>
        <el-button @click="closeDept">取消</el-button>
        <el-button type="primary" @click="onAddDept">确定</el-button>
      </template>
    </el-dialog>

    <RolePicker
      v-model="roleVisible"
      v-model:model-value-ids="roleIds"
      @confirm="onAddRoles"
    />

    <el-dialog
      v-model="userVisible"
      title="添加人员"
      width="840px"
      draggable
      destroy-on-close
      @closed="resetUser"
    >
      <FormMemberSelect
        :field="memberField"
        :model-value="userIds"
        @update:model-value="onPickUsers"
      />
      <template #footer>
        <el-button @click="closeUser">取消</el-button>
        <el-button type="primary" @click="onAddUsers">确定</el-button>
      </template>
    </el-dialog>
  </el-main>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFormConfigApi, saveFormConfigApi } from '../api/apps'
import { listOrgDepartmentsApi } from '../api/org'
import { normalizeRecordActions } from '../utils/recordActions'
import {
  normalizeFormViewers,
  normalizeRowScope,
  ROW_SCOPE_OPTIONS,
} from '../utils/formDataAccess.js'
import { useUserStore } from '../stores/user'
import FormMemberSelect from './form-fill/FormMemberSelect.vue'
import RolePicker from './workflow-design/RolePicker.vue'
import {
  readWorkspaceTabOrder,
  workspaceTabOrderFromMode,
  workspaceTabOrderToMode,
  writeWorkspaceTabOrder,
} from './form-workspace/workspaceTabOrder.js'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  form: { type: Object, default: null },
})

const userStore = useUserStore()
const tabOrder = ref('create-first')
const actions = reactive(normalizeRecordActions())
const viewers = ref([])
const rowScope = ref('related')
const rowScopeOptions = ROW_SCOPE_OPTIONS
const saving = ref(false)
const activeSetting = ref('workspace')
const isWorkflowForm = computed(() => props.form?.formKind === 'workflow')
const deptVisible = ref(false)
const roleVisible = ref(false)
const userVisible = ref(false)
const departments = ref([])
const deptId = ref(null)
const roleIds = ref([])
const userIds = ref([])
const memberField = {
  type: 'member-multiple',
  placeholder: '选择人员',
}

function applyActions(raw) {
  const next = normalizeRecordActions(raw)
  if (isWorkflowForm.value) {
    next.import = false
    next.downloadTemplate = false
  }
  for (const key of Object.keys(next)) {
    actions[key] = next[key]
  }
}

function onSettingSelect(index) {
  activeSetting.value = index
}

function loadTabOrder() {
  tabOrder.value = workspaceTabOrderToMode(
    readWorkspaceTabOrder(userStore.user?.id, props.appId, props.formId),
  )
}

function typeLabel(type) {
  if (type === 'department') return '部门'
  if (type === 'role') return '角色'
  return '人员'
}

function typeTagType(type) {
  if (type === 'department') return 'primary'
  if (type === 'role') return 'warning'
  return 'success'
}

function fallbackLabel(row) {
  return `${typeLabel(row.type)}#${row.targetId}`
}

function hasViewer(type, targetId) {
  return viewers.value.some(
    (row) => row.type === type && row.targetId === targetId,
  )
}

function addViewer(type, targetId, label) {
  if (hasViewer(type, targetId)) {
    ElMessage.info('已经加过了')
    return false
  }
  viewers.value = [
    ...viewers.value,
    { type, targetId, label: label || fallbackLabel({ type, targetId }), effective: true },
  ]
  return true
}

function findDeptName(nodes, id) {
  for (const node of nodes || []) {
    if (Number(node.id) === id) return node.name
    const child = findDeptName(node.children, id)
    if (child) return child
  }
  return ''
}

function openDept() {
  deptVisible.value = true
  listOrgDepartmentsApi()
    .then((tree) => {
      departments.value = tree || []
    })
    .catch(() => {
      departments.value = []
    })
}

function closeDept() {
  deptVisible.value = false
}

function resetDept() {
  deptId.value = null
}

function onAddDept() {
  const id = Number(deptId.value)
  if (!Number.isInteger(id) || id <= 0) {
    ElMessage.warning('请选择部门')
    return
  }
  if (addViewer('department', id, findDeptName(departments.value, id))) {
    deptVisible.value = false
  }
}

function openRole() {
  roleVisible.value = true
}

function onAddRoles(ids) {
  const next = (ids || []).map(Number).filter((id) => id > 0)
  for (const id of next) {
    addViewer('role', id, `角色#${id}`)
  }
}

function openUser() {
  userVisible.value = true
}

function closeUser() {
  userVisible.value = false
}

function resetUser() {
  userIds.value = []
}

function onPickUsers(value) {
  userIds.value = Array.isArray(value) ? value : []
}

function onAddUsers() {
  const ids = (userIds.value || []).map(Number).filter((id) => id > 0)
  if (!ids.length) {
    ElMessage.warning('请选择人员')
    return
  }
  for (const id of ids) {
    addViewer('user', id, `人员#${id}`)
  }
  userVisible.value = false
}

function onRemoveViewer(row) {
  viewers.value = viewers.value.filter(
    (item) => !(item.type === row.type && item.targetId === row.targetId),
  )
}

async function loadConfig() {
  if (!props.appId || !props.formId) return
  loadTabOrder()
  try {
    const config = await getFormConfigApi(props.appId, props.formId)
    applyActions(config?.recordActions)
    viewers.value = normalizeFormViewers(config?.formViewers)
    rowScope.value = normalizeRowScope(config?.rowScope)
  } catch {
    applyActions()
    viewers.value = []
    rowScope.value = 'related'
  }
}

watch(
  () => [props.appId, props.formId, userStore.user?.id],
  loadConfig,
  { immediate: true },
)

function accessPayload() {
  return {
    formViewers: viewers.value.map((row) => ({
      type: row.type,
      targetId: row.targetId,
    })),
    rowScope: normalizeRowScope(rowScope.value),
  }
}

async function save() {
  if (!props.form?.id) return
  if (activeSetting.value === 'workspace') {
    writeWorkspaceTabOrder(
      userStore.user?.id,
      props.appId,
      props.formId,
      workspaceTabOrderFromMode(tabOrder.value),
    )
    ElMessage.success('已保存在本机')
    return
  }
  saving.value = true
  try {
    const recordActions = { ...actions }
    if (isWorkflowForm.value) {
      recordActions.import = false
      recordActions.downloadTemplate = false
    }
    await saveFormConfigApi(props.appId, props.formId, {
      recordActions,
      ...accessPayload(),
    })
    await loadConfig()
    ElMessage.success('保存成功')
  } catch {
    return
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="less">
.publish-panel {
  display: flex;
  padding: 24px;
  background: var(--el-bg-color-page);
}

.publish-layout {
  display: flex;
  width: min(1080px, 100%);
  min-height: 100%;
  margin: 0 auto;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
}

.publish-menu {
  flex: none;
  width: 190px;
  border-right: 1px solid var(--el-border-color-light);
}

.publish-content {
  flex: 1;
  min-width: 0;
  padding: 20px 24px;
}

.publish-card {
  width: 100%;
  height: fit-content;
}

.publish-card-title {
  font-size: 16px;
  font-weight: 600;
}

.publish-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-text-color-secondary);
}

.publish-desc-inline {
  margin: 8px 0 0;
}

.action-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.action-list .el-checkbox {
  margin-right: 16px;
  margin-bottom: 8px;
}

.access-title {
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.access-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.field-full {
  width: 100%;
}

.publish-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
