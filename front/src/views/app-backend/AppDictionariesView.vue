<template>
  <div class="page">
    <div class="page-toolbar">
      <h2 class="page-title">字典管理</h2>
      <el-button type="primary" @click="openCreate">新增字典</el-button>
    </div>

    <div class="filters">
      <el-input
        v-model="keyword"
        clearable
        placeholder="搜索名称或编码"
        @clear="reloadFirstPage"
        @keyup.enter="reloadFirstPage"
      />
      <el-select v-model="status" clearable placeholder="状态" @change="reloadFirstPage">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="reloadFirstPage">查询</el-button>
      <el-button class="filter-reset" :icon="RefreshLeft" @click="resetFilters">重置</el-button>
    </div>

    <div class="table-wrap">
      <div class="pane">
        <el-table
          v-loading="loading"
          :data="dictionaries"
          border
          stripe
          height="100%"
          row-key="id"
          highlight-current-row
          :current-row-key="selectedId"
          @row-click="onSelectDictionary"
        >
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="code" label="编码"  />
          <el-table-column label="状态" >
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ row.status === 'active' ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="itemCount" label="项数量"  />
          <el-table-column label="操作"  fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openEdit(row)">编辑</el-button>
              <el-button link type="primary" @click.stop="toggleStatus(row)">
                {{ row.status === 'active' ? '停用' : '启用' }}
              </el-button>
              <el-button link type="danger" @click.stop="onDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="pane pane-items">
        <template v-if="selectedId">
          <div class="items-head">
            <span class="items-title">字典项 · {{ selectedName }}</span>
            <div class="items-actions">
              <el-button size="small" @click="addItem">添加选项</el-button>
              <el-button type="primary" size="small" :loading="itemsSaving" @click="saveItems">
                保存
              </el-button>
            </div>
          </div>
          <div class="pane-table" v-loading="itemsLoading">
            <el-table :data="items" border stripe size="small" height="100%">
              <el-table-column label="名称">
                <template #default="{ row }">
                  <el-input v-model="row.label" size="small" maxlength="64" placeholder="请输入名称" />
                </template>
              </el-table-column>
              <el-table-column label="值">
                <template #default="{ row }">
                  <el-input v-model="row.value" size="small" maxlength="64" placeholder="请输入值" />
                </template>
              </el-table-column>
              <el-table-column label="排序" >
                <template #default="{ row }">
                  <el-input-number
                    v-model="row.sortOrder"
                    class="sort-input"
                    size="small"
                    :controls="false"
                    :precision="0"
                  />
                </template>
              </el-table-column>
              <el-table-column label="状态" >
                <template #default="{ row }">
                  <el-select v-model="row.status" size="small">
                    <el-option label="启用" value="active" />
                    <el-option label="停用" value="disabled" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="操作" >
                <template #default="{ $index }">
                  <el-button link type="danger" size="small" @click="items.splice($index, 1)">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>
        <el-empty v-else description="请选择字典" />
      </div>
    </div>

    <div class="pager">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next"
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>

    <DictionaryForm
      v-model:visible="formVisible"
      :dictionary="editing"
      :saving="saving"
      @submit="onSubmit"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshLeft, Search } from '@element-plus/icons-vue'
import DictionaryForm from '../../components/app-backend/DictionaryForm.vue'
import {
  createDictionaryApi,
  deleteDictionaryApi,
  getDictionaryApi,
  listDictionariesApi,
  updateDictionaryApi,
} from '../../api/apps'

const route = useRoute()
const appId = computed(() => Number(route.params.id))
const loading = ref(false)
const saving = ref(false)
const dictionaries = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const status = ref('')
const formVisible = ref(false)
const editing = ref(null)
const selectedId = ref(null)
const selectedName = ref('')
const items = ref([])
const itemsSnapshot = ref('[]')
const itemsLoading = ref(false)
const itemsSaving = ref(false)

function emptyItem() {
  return { label: '', value: '', sortOrder: 0, status: 'active' }
}

function normalizeItems(rows) {
  return rows.map((item) => ({
    label: (item.label || '').trim(),
    value: (item.value || '').trim(),
    sortOrder: Number(item.sortOrder) || 0,
    status: item.status || 'active',
  }))
}

function itemsDirty() {
  return JSON.stringify(normalizeItems(items.value)) !== itemsSnapshot.value
}

function clearSelection() {
  selectedId.value = null
  selectedName.value = ''
  items.value = []
  itemsSnapshot.value = '[]'
}

async function confirmLeaveItems() {
  if (!itemsDirty()) {
    return true
  }
  try {
    await ElMessageBox.confirm(
      '字典项有未保存的修改，切换后将丢失。确定继续？',
      '未保存',
      { type: 'warning' },
    )
    return true
  } catch {
    return false
  }
}

async function loadItems(id, name) {
  itemsLoading.value = true
  try {
    const detail = await getDictionaryApi(appId.value, id)
    selectedId.value = detail.id
    selectedName.value = name || detail.name
    items.value = (detail.items || []).map((item) => ({
      label: item.label,
      value: item.value,
      sortOrder: item.sortOrder ?? 0,
      status: item.status || 'active',
    }))
    itemsSnapshot.value = JSON.stringify(normalizeItems(items.value))
  } catch {
    clearSelection()
  } finally {
    itemsLoading.value = false
  }
}

async function onSelectDictionary(row) {
  if (selectedId.value === row.id) {
    return
  }
  if (!(await confirmLeaveItems())) {
    return
  }
  await loadItems(row.id, row.name)
}

function addItem() {
  items.value.push(emptyItem())
}

async function saveItems() {
  const payload = normalizeItems(items.value)
  if (payload.some((item) => !item.label || !item.value)) {
    ElMessage.error('请填写字典项名称和值')
    return
  }
  const values = payload.map((item) => item.value)
  if (new Set(values).size !== values.length) {
    ElMessage.error('同一请求里选项值不能重复')
    return
  }
  itemsSaving.value = true
  try {
    await updateDictionaryApi(appId.value, selectedId.value, { items: payload })
    ElMessage.success('已保存字典项')
    await loadDictionaries()
    await loadItems(selectedId.value, selectedName.value)
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    itemsSaving.value = false
  }
}

async function loadDictionaries() {
  loading.value = true
  try {
    const result = await listDictionariesApi(appId.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      status: status.value || undefined,
    })
    dictionaries.value = result?.items || []
    total.value = result?.total || 0
    if (selectedId.value) {
      const current = dictionaries.value.find((row) => row.id === selectedId.value)
      if (current) {
        selectedName.value = current.name
      }
    }
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
}

function reloadFirstPage() {
  page.value = 1
  loadDictionaries()
}

function onPageChange(next) {
  if (page.value === next) {
    return
  }
  page.value = next
  loadDictionaries()
}

function onPageSizeChange(size) {
  pageSize.value = size
  page.value = 1
  loadDictionaries()
}

function resetFilters() {
  keyword.value = ''
  status.value = ''
  page.value = 1
  loadDictionaries()
}

function openCreate() {
  editing.value = null
  formVisible.value = true
}

async function openEdit(row) {
  try {
    editing.value = await getDictionaryApi(appId.value, row.id)
    formVisible.value = true
  } catch {
    // 错误已由 http 拦截器提示
  }
}

async function onSubmit(payload) {
  saving.value = true
  try {
    if (editing.value) {
      await updateDictionaryApi(appId.value, editing.value.id, payload)
      ElMessage.success('已保存字典')
      formVisible.value = false
      await loadDictionaries()
      if (selectedId.value === editing.value.id) {
        await loadItems(editing.value.id, payload.name)
      }
    } else {
      const created = await createDictionaryApi(appId.value, payload)
      ElMessage.success('已创建字典')
      formVisible.value = false
      await loadDictionaries()
      if (created?.id) {
        await loadItems(created.id, created.name)
      }
    }
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
      next === 'disabled'
        ? '停用后，已引用本字典的功能可能发生错误。确定停用吗？'
        : `确定启用「${row.name}」？`,
      '确认',
      { type: 'warning' },
    )
    await updateDictionaryApi(appId.value, row.id, { status: next })
    ElMessage.success(next === 'disabled' ? '已停用' : '已启用')
    await loadDictionaries()
  } catch {
    // 取消或接口错误
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `删除后不可恢复，本应用已引用该字典的表单可能显示为空。确定删除「${row.name}」？`,
      '删除字典',
      { type: 'warning' },
    )
    await deleteDictionaryApi(appId.value, row.id)
    ElMessage.success('已删除字典')
    if (selectedId.value === row.id) {
      clearSelection()
    }
    await loadDictionaries()
  } catch {
    // 取消或接口错误
  }
}

watch(appId, () => {
  page.value = 1
  clearSelection()
  loadDictionaries()
})
onMounted(loadDictionaries)
</script>

<style scoped lang="less">
@import '../../styles/admin-page.less';

.filter-reset.el-button {
  margin-left: 0;
}

.pager {
  justify-content: center;
}

.table-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pane {
  flex: 1;
  min-height: 0;
}

.pane-items {
  display: flex;
  flex-direction: column;
}

.items-head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.items-title {
  font-size: 14px;
  font-weight: 600;
}

.items-actions {
  display: flex;
  gap: 8px;
}

.pane-table {
  flex: 1;
  min-height: 0;
}

.sort-input {
  width: 100%;
}

.sort-input :deep(.el-input) {
  width: 100%;
}

.pane-items :deep(.el-empty) {
  flex: 1;
}
</style>
