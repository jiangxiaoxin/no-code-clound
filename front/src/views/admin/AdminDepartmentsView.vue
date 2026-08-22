<template>
  <div class="page">
    <div class="page-toolbar">
      <h2 class="page-title">部门管理</h2>
      <el-button
        v-if="userStore.hasPermission('departments.create')"
        type="primary"
        @click="openCreate(null)"
      >
        新增根部门
      </el-button>
    </div>

    <div class="table-wrap">
    <el-table
      v-loading="loading"
      :data="tree"
      row-key="id"
      :tree-props="{ children: 'children' }"
      default-expand-all
      border
      stripe
      height="100%"
    >
      <el-table-column prop="name" label="部门名称" min-width="200" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="memberCount" label="直接成员" width="100" />
      <el-table-column prop="childCount" label="子部门" width="90" />
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="userStore.hasPermission('departments.create') && row.status === 'active'"
            link
            type="primary"
            @click="openCreate(row.id)"
          >
            新增子部门
          </el-button>
          <el-button
            v-if="userStore.hasPermission('departments.update')"
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="userStore.hasPermission('departments.update')"
            link
            type="primary"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </el-button>
          <el-button
            v-if="userStore.hasPermission('departments.delete')"
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

    <DepartmentForm
      v-model:visible="formVisible"
      :tree="tree"
      :department="editing"
      :default-parent-id="defaultParentId"
      :saving="saving"
      @submit="onSubmit"
    />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DepartmentForm from '../../components/admin/DepartmentForm.vue'
import {
  createDepartmentApi,
  deleteDepartmentApi,
  listDepartmentsApi,
  updateDepartmentApi,
} from '../../api/admin'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const tree = ref([])
const formVisible = ref(false)
const editing = ref(null)
const defaultParentId = ref(null)

async function loadTree() {
  loading.value = true
  try {
    tree.value = (await listDepartmentsApi()) || []
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
}

function openCreate(parentId) {
  editing.value = null
  defaultParentId.value = parentId
  formVisible.value = true
}

function openEdit(row) {
  editing.value = row
  defaultParentId.value = row.parentId
  formVisible.value = true
}

async function onSubmit(payload) {
  saving.value = true
  try {
    if (editing.value) {
      await updateDepartmentApi(editing.value.id, payload)
      ElMessage.success('已保存部门')
    } else {
      await createDepartmentApi(payload)
      ElMessage.success('已创建部门')
    }
    formVisible.value = false
    await loadTree()
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
    await updateDepartmentApi(row.id, { status: next })
    ElMessage.success(next === 'disabled' ? '已停用' : '已启用')
    await loadTree()
  } catch {
    // 取消或接口错误
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除部门「${row.name}」？`, '删除部门', {
      type: 'warning',
    })
    await deleteDepartmentApi(row.id)
    ElMessage.success('已删除部门')
    await loadTree()
  } catch {
    // 取消或接口错误
  }
}

onMounted(loadTree)
</script>

<style scoped lang="less">
@import '../../styles/admin-page.less';
</style>
