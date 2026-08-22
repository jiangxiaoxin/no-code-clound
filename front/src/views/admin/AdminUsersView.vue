<template>
  <div class="page">
    <div class="page-toolbar">
      <h2 class="page-title">人员管理</h2>
      <el-button
        v-if="userStore.hasPermission('users.create')"
        type="primary"
        @click="openCreate"
      >
        新增人员
      </el-button>
    </div>

    <div class="filters">
      <el-input
        v-model="filters.keyword"
        clearable
        placeholder="搜索姓名、账号或邮箱"
        @clear="reloadFirstPage"
        @keyup.enter="reloadFirstPage"
      />
      <el-tree-select
        v-model="filters.departmentId"
        :data="departments"
        :props="{ label: 'name', value: 'id', children: 'children' }"
        check-strictly
        clearable
        placeholder="部门"
        @change="reloadFirstPage"
      />
      <el-select
        v-model="filters.roleId"
        clearable
        placeholder="角色"
        @change="reloadFirstPage"
      >
        <el-option
          v-for="role in roles"
          :key="role.id"
          :label="role.name"
          :value="role.id"
        />
      </el-select>
      <el-select
        v-model="filters.status"
        clearable
        placeholder="状态"
        @change="reloadFirstPage"
      >
        <el-option label="启用" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button @click="reloadFirstPage" type="primary" :icon="Search">查询</el-button>
    </div>

    <div class="table-wrap">
    <el-table v-loading="loading" :data="items" border stripe height="100%">
      <el-table-column label="姓名 / 账号" min-width="160">
        <template #default="{ row }">
          <div class="user-cell">
            <span class="user-name">{{ row.displayName }}</span>
            <span class="user-account">{{ row.username }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="email" label="邮箱" min-width="180" />
      <el-table-column label="部门" min-width="180">
        <template #default="{ row }">
          <div class="tag-wrap">
            <el-tag
              v-for="item in row.departments"
              :key="item.id"
              size="small"
            >
              {{ item.name }}
            </el-tag>
            <span v-if="!row.departments?.length">-</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="角色" min-width="180">
        <template #default="{ row }">
          <div class="tag-wrap">
            <el-tag
              v-for="item in row.roles"
              :key="item.id"
              size="small"
              type="info"
            >
              {{ item.name }}
            </el-tag>
            <span v-if="!row.roles?.length">-</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatTime(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="userStore.hasPermission('users.update')"
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="userStore.hasPermission('users.change_status') && row.id !== userStore.user?.id"
            link
            type="primary"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </el-button>
          <el-button
            v-if="userStore.hasPermission('users.reset_password')"
            link
            type="primary"
            @click="openReset(row)"
          >
            重置密码
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <div class="pager">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @current-change="onPageChange"
      />
    </div>

    <AdminUserForm
      v-model:visible="formVisible"
      :user="editing"
      :departments="departments"
      :roles="roles"
      :can-assign-departments="userStore.hasPermission('users.assign_departments')"
      :can-assign-roles="userStore.hasPermission('users.assign_roles')"
      :saving="saving"
      @submit="onSubmit"
    />

    <el-dialog
      v-model="resetVisible"
      title="重置密码"
      width="420px"
      align-center
      destroy-on-close
    >
      <el-form ref="resetFormRef" :model="resetForm" :rules="resetRules" label-position="top">
        <el-form-item label="新密码" prop="password">
          <el-input v-model="resetForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirm">
          <el-input v-model="resetForm.confirm" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="onReset">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AdminUserForm from '../../components/admin/AdminUserForm.vue'
import {
  createAdminUserApi,
  listAdminUsersApi,
  listDepartmentsApi,
  listRolesApi,
  resetAdminUserPasswordApi,
  updateAdminUserApi,
  updateAdminUserStatusApi,
} from '../../api/admin'
import { useUserStore } from '../../stores/user'
import { Search } from '@element-plus/icons-vue'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const resetting = ref(false)
const items = ref([])
const departments = ref([])
const roles = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const formVisible = ref(false)
const editing = ref(null)
const resetVisible = ref(false)
const resetTarget = ref(null)
const resetFormRef = ref()
const filters = reactive({
  keyword: '',
  departmentId: undefined,
  roleId: undefined,
  status: '',
})
const resetForm = reactive({
  password: '',
  confirm: '',
})
const resetRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 72, message: '密码须为 6–72 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== resetForm.password) {
          callback(new Error('两次输入的密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

function formatTime(value) {
  if (!value) {
    return '-'
  }
  return new Date(value).toLocaleString()
}

async function loadUsers() {
  loading.value = true
  try {
    const result = await listAdminUsersApi({
      page: page.value,
      pageSize,
      keyword: filters.keyword || undefined,
      departmentId: filters.departmentId || undefined,
      roleId: filters.roleId || undefined,
      status: filters.status || undefined,
    })
    items.value = result?.items || []
    total.value = result?.total || 0
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
}

function reloadFirstPage() {
  page.value = 1
  loadUsers()
}

function onPageChange(next) {
  page.value = next
  loadUsers()
}

async function loadOptions() {
  try {
    const [deptTree, roleList] = await Promise.all([
      listDepartmentsApi(),
      listRolesApi(),
    ])
    departments.value = deptTree || []
    roles.value = roleList || []
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
      await updateAdminUserApi(editing.value.id, payload)
      ElMessage.success('已保存人员')
    } else {
      await createAdminUserApi(payload)
      ElMessage.success('已创建人员')
    }
    formVisible.value = false
    await loadUsers()
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
      next === 'disabled' ? `确定停用「${row.displayName}」？` : `确定启用「${row.displayName}」？`,
      '确认',
      { type: 'warning' },
    )
    await updateAdminUserStatusApi(row.id, next)
    ElMessage.success(next === 'disabled' ? '已停用' : '已启用')
    await loadUsers()
  } catch {
    // 取消或接口错误
  }
}

function openReset(row) {
  resetTarget.value = row
  resetForm.password = ''
  resetForm.confirm = ''
  resetVisible.value = true
}

async function onReset() {
  await resetFormRef.value.validate()
  resetting.value = true
  try {
    await resetAdminUserPasswordApi(resetTarget.value.id, resetForm.password)
    ElMessage.success('已重置密码')
    resetVisible.value = false
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    resetting.value = false
  }
}

onMounted(() => {
  loadOptions()
  loadUsers()
})
</script>

<style scoped lang="less">
@import '../../styles/admin-page.less';

.user-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 600;
}

.user-account {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.tag-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
