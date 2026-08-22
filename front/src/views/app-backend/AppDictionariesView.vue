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
        @clear="loadDictionaries"
        @keyup.enter="loadDictionaries"
      />
      <el-select v-model="status" clearable placeholder="状态" @change="loadDictionaries">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="loadDictionaries">查询</el-button>
    </div>

    <div class="table-wrap">
      <el-table v-loading="loading" :data="dictionaries" border stripe height="100%">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="code" label="编码" min-width="140" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="itemCount" label="项数量" width="100" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
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
import { Search } from '@element-plus/icons-vue'
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
const keyword = ref('')
const status = ref('')
const formVisible = ref(false)
const editing = ref(null)

async function loadDictionaries() {
  loading.value = true
  try {
    dictionaries.value =
      (await listDictionariesApi(appId.value, {
        keyword: keyword.value || undefined,
        status: status.value || undefined,
      })) || []
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    loading.value = false
  }
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
    } else {
      await createDictionaryApi(appId.value, payload)
      ElMessage.success('已创建字典')
    }
    formVisible.value = false
    await loadDictionaries()
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
    await loadDictionaries()
  } catch {
    // 取消或接口错误
  }
}

watch(appId, loadDictionaries)
onMounted(loadDictionaries)
</script>

<style scoped lang="less">
@import '../../styles/admin-page.less';
</style>
