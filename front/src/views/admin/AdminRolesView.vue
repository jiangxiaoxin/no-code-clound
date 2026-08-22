<template>
  <div class="page">
    <div class="page-toolbar">
      <h2 class="page-title">角色管理</h2>
      <el-button
        v-if="userStore.hasPermission('roles.create')"
        type="primary"
        @click="openCreate"
      >
        新增角色
      </el-button>
    </div>

    <div class="filters">
      <el-input v-model="keyword" clearable placeholder="搜索名称或代码" @clear="loadRoles" @keyup.enter="loadRoles" />
      <el-select v-model="status" clearable placeholder="状态" @change="loadRoles">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="loadRoles">查询</el-button>
    </div>

    <div class="table-wrap">
    <el-table v-loading="loading" :data="roles" border stripe height="100%">
      <el-table-column prop="name" label="角色名称" min-width="140">
        <template #default="{ row }">
          <span>{{ row.name }}</span>
          <el-tag v-if="row.builtIn" size="small" class="built-in">内置</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="code" label="代码" min-width="140" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="memberCount" label="人员数量" width="100" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="userStore.hasPermission('roles.update')"
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="userStore.hasPermission('roles.update') && !row.builtIn"
            link
            type="primary"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </el-button>
          <el-button
            v-if="userStore.hasPermission('roles.delete') && !row.builtIn"
            link
            type="danger"
            @click="onDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <RoleForm
      v-model:visible="formVisible"
      :role="editing"
      :groups="groups"
      :can-assign="userStore.hasPermission('roles.assign_permissions')"
      :saving="saving"
      @submit="onSubmit"
    />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import RoleForm from '../../components/admin/RoleForm.vue'
import {
  createRoleApi,
  deleteRoleApi,
  listPermissionsApi,
  listRolesApi,
  updateRoleApi,
} from '../../api/admin'
import { Search } from '@element-plus/icons-vue'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const roles = ref([])
const groups = ref([])
const keyword = ref('')
const status = ref('')
const formVisible = ref(false)
const editing = ref(null)

async function loadRoles() {
  loading.value = true
  try {
    roles.value =
      (await listRolesApi({
        keyword: keyword.value || undefined,
        status: status.value || undefined,
      })) || []
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
}

async function loadGroups() {
  try {
    groups.value = (await listPermissionsApi()) || []
  } catch {
    // 错误已由 http 拦截器提示
  }
}

function openCreate() {
  editing.value = null
  formVisible.value = true
}

function openEdit(row) {
  editing.value = row
  formVisible.value = true
}

async function onSubmit(payload) {
  saving.value = true
  try {
    if (editing.value) {
      await updateRoleApi(editing.value.id, payload)
      ElMessage.success('已保存角色')
    } else {
      await createRoleApi(payload)
      ElMessage.success('已创建角色')
    }
    formVisible.value = false
    await loadRoles()
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  const next = row.status === 'active' ? 'disabled' : 'active'
  try {
    await ElMessageBox.confirm(
      next === 'disabled' ? `确定停用「${row.name}」？` : `确定启用「${row.name}」？`,
      '确认',
      { type: 'warning' },
    )
    await updateRoleApi(row.id, { status: next })
    ElMessage.success(next === 'disabled' ? '已停用' : '已启用')
    await loadRoles()
  } catch {
    // 取消或接口错误
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除角色「${row.name}」？`, '删除角色', {
      type: 'warning',
    })
    await deleteRoleApi(row.id)
    ElMessage.success('已删除角色')
    await loadRoles()
  } catch {
    // 取消或接口错误
  }
}

onMounted(() => {
  loadRoles()
  loadGroups()
})
</script>

<style scoped lang="less">
@import '../../styles/admin-page.less';

.built-in {
  margin-left: 8px;
}
</style>
