<template>
  <div class="page">
    <div class="page-toolbar">
      <h2 class="page-title">使用范围</h2>
      <div class="toolbar-actions">
        <el-button @click="openDept">添加部门</el-button>
        <el-button @click="openRole">添加角色</el-button>
        <el-button type="primary" @click="openUser">添加人员</el-button>
      </div>
    </div>
    <p class="page-banner">
      在按表收权做完之前，开放范围等于把本应用所有表的全部数据开放给范围内的人。
    </p>
    <p class="page-hint">
      下面「始终可用」的人不用再加进范围。选部门时不含下级部门。
    </p>

    <h3 class="section-title">始终可用（不可移除）</h3>
    <div class="always-list">
      <div v-for="user in alwaysUsers" :key="user.id" class="always-item">
        <span>{{ user.displayName }}</span>
        <el-tag size="small" :type="user.reason === 'owner' ? 'warning' : ''">
          {{ user.reason === 'owner' ? '所有者' : '配置名单' }}
        </el-tag>
        <el-tag v-if="user.status === 'disabled'" size="small" type="info">
          已停用
        </el-tag>
      </div>
      <span v-if="!alwaysUsers.length" class="empty-hint">暂无</span>
    </div>

    <h3 class="section-title">开放范围</h3>
    <div class="table-wrap">
      <el-table v-loading="loading" :data="scopes" border stripe height="100%">
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ typeLabel(row.type) }}
          </template>
        </el-table-column>
        <el-table-column label="对象" min-width="240">
          <template #default="{ row }">
            {{ row.label }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link type="danger" @click="onRemove(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="deptVisible"
      title="添加部门"
      width="480px"
      draggable
      @closed="resetDept"
    >
      <p class="page-hint">不含下级部门。只开放你选中的这一级。</p>
      <el-tree-select
        v-model="deptId"
        class="field-full"
        :data="departments"
        :props="{ label: 'name', value: 'id', children: 'children' }"
        check-strictly
        clearable
        placeholder="选择部门"
      />
      <template #footer>
        <el-button @click="closeDept">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onAddDept">
          确定
        </el-button>
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
        <el-button type="primary" :loading="saving" @click="onAddUsers">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import FormMemberSelect from '../../components/form-fill/FormMemberSelect.vue'
import RolePicker from '../../components/workflow-design/RolePicker.vue'
import {
  addAccessScopeApi,
  listAccessScopesApi,
  removeAccessScopeApi,
} from '../../api/apps'
import { listOrgDepartmentsApi } from '../../api/org'

const route = useRoute()
const appId = computed(() => Number(route.params.id))
const loading = ref(false)
const saving = ref(false)
const alwaysUsers = ref([])
const scopes = ref([])
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

function typeLabel(type) {
  if (type === 'department') return '部门'
  if (type === 'role') return '角色'
  return '人员'
}

async function load() {
  loading.value = true
  try {
    const result = await listAccessScopesApi(appId.value)
    alwaysUsers.value = result?.always?.users || []
    scopes.value = result?.scopes || []
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
}

async function addScope(type, targetId) {
  const result = await addAccessScopeApi(appId.value, { type, targetId })
  const hints = result?.hints || []
  if (hints.length) {
    ElMessage.info(hints.join('；'))
  } else {
    ElMessage.success('已加入使用范围')
  }
  await load()
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

async function onAddDept() {
  const id = Number(deptId.value)
  if (!Number.isInteger(id) || id <= 0) {
    ElMessage.warning('请选择部门')
    return
  }
  saving.value = true
  try {
    await addScope('department', id)
    deptVisible.value = false
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    saving.value = false
  }
}

function openRole() {
  roleVisible.value = true
}

async function onAddRoles(ids) {
  const next = (ids || []).map(Number).filter((id) => id > 0)
  const existing = new Set(
    scopes.value.filter((row) => row.type === 'role').map((row) => row.targetId),
  )
  const added = next.filter((id) => !existing.has(id))
  if (!added.length) return
  saving.value = true
  try {
    for (const id of added) {
      await addScope('role', id)
    }
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    saving.value = false
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

async function onAddUsers() {
  const ids = (userIds.value || []).map(Number).filter((id) => id > 0)
  if (!ids.length) {
    ElMessage.warning('请选择人员')
    return
  }
  saving.value = true
  try {
    for (const id of ids) {
      await addScope('user', id)
    }
    userVisible.value = false
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    saving.value = false
  }
}

async function onRemove(row) {
  try {
    await ElMessageBox.confirm(
      `确定从使用范围移除「${row.label}」？`,
      '移除',
      { type: 'warning', confirmButtonText: '移除' },
    )
  } catch {
    return
  }
  try {
    await removeAccessScopeApi(appId.value, row.id)
    ElMessage.success('已移除')
    await load()
  } catch {
    // 错误已由 http 拦截器提示
  }
}

onMounted(load)
</script>

<style scoped lang="less">
@import '../../styles/admin-page.less';

.toolbar-actions {
  display: flex;
  align-items: center;
}

.page-banner {
  margin: 0 0 8px;
  padding: 8px 12px;
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
  border-radius: 4px;
  line-height: 1.5;
}

.page-hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.section-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.always-list {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.always-item {
  display: flex;
  align-items: center;
  margin: 0 12px 8px 0;
}

.always-item .el-tag {
  margin-left: 6px;
}

.empty-hint {
  color: var(--el-text-color-secondary);
}

.field-full {
  width: 100%;
}
</style>
