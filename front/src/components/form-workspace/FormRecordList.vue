<template>
  <div class="form-work-body list-body">
    <el-empty
      v-if="!schemaLoading && fields.length === 0"
      description="请先保存表单设计"
    />
    <template v-else>
      <div class="list-toolbar">
        <div class="list-toolbar-actions">
          <el-button type="primary" @click="$emit('create')">新增</el-button>
          <el-button type="danger" :disabled="!selectedRecords.length" @click="onDeleteSelected">
            删除
          </el-button>
        </div>
        <div class="list-toolbar-extra">
          <FormRecordColumnSetup v-model="columnPrefs" />
        </div>
      </div>
      <div class="table-wrap">
        <el-table
          v-loading="listLoading"
          :data="records"
          border
          stripe
          height="100%"
          size="small"
          row-key="id"
          @row-click="onRecordRowClick"
          @selection-change="selectedRecords = $event"
        >
          <el-table-column type="selection" width="42" fixed="left" />
          <el-table-column type="index" width="55" label="序号" fixed="left" />
          <el-table-column
            v-for="col in visibleColumns"
            :key="col.key"
            :label="col.title"
            :min-width="normalizeColWidth(col.minWidth)"
            :fixed="col.fixed || undefined"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <template v-if="col.key === CREATED_AT_KEY">
                {{ formatTime(row.createdAt) }}
              </template>
              <template v-else-if="col.key === UPDATED_AT_KEY">
                {{ formatTime(row.updatedAt) }}
              </template>
              <template v-else>
                {{ formatCellValue(fieldByKey[col.key], row.data?.[col.key], dictItemsByCode) }}
              </template>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          size="small"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, toRef, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteFormRecordApi, queryFormRecordsApi } from '../../api/apps'
import { formatCellValue, isFillable } from '../form-fill/fillValues.js'
import FormRecordColumnSetup from './FormRecordColumnSetup.vue'
import {
  CREATED_AT_KEY,
  UPDATED_AT_KEY,
  normalizeColWidth,
  useColumnPrefs,
} from './columnPrefs'

const props = defineProps({
  appId: { type: Number, required: true },
  form: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  schemaLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['create', 'row-click'])

const listLoading = ref(false)
const records = ref([])
const selectedRecords = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const tableFields = computed(() => props.fields.filter(isFillable))
const fieldByKey = computed(() =>
  Object.fromEntries(tableFields.value.map((field) => [field.key, field])),
)

const { columnPrefs, visibleColumns } = useColumnPrefs({
  appId: toRef(props, 'appId'),
  formId: computed(() => props.form?.id),
  tableFields,
  schemaLoading: toRef(props, 'schemaLoading'),
})

function formatTime(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function onRecordRowClick(row, _column, event) {
  if (event?.target?.closest('.el-table-column--selection')) {
    return
  }
  emit('row-click', row)
}

async function loadRecords() {
  if (!props.form?.id || !props.appId) {
    records.value = []
    total.value = 0
    return
  }
  listLoading.value = true
  try {
    const result = await queryFormRecordsApi(props.appId, props.form.id, {
      page: page.value,
      pageSize: pageSize.value,
    })
    records.value = result?.items || []
    total.value = result?.total || 0
  } catch {
    records.value = []
    total.value = 0
  } finally {
    listLoading.value = false
  }
}

function onPageChange(next) {
  page.value = next
  loadRecords()
}

function onPageSizeChange(next) {
  pageSize.value = next
  page.value = 1
  loadRecords()
}

async function onDeleteSelected() {
  if (!selectedRecords.value.length) {
    ElMessage.warning('请先选择要删除的数据')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedRecords.value.length} 条数据？`,
      '删除',
      { type: 'warning' },
    )
  } catch {
    return
  }
  const ids = selectedRecords.value.map((row) => row.id)
  const removed = records.value.length === ids.length
  try {
    await Promise.all(
      ids.map((id) => deleteFormRecordApi(props.appId, props.form.id, id)),
    )
    ElMessage.success('已删除')
    selectedRecords.value = []
    if (removed && page.value > 1) {
      page.value -= 1
    }
    await loadRecords()
  } catch {
    await loadRecords()
  }
}

async function reload({ resetPage = false } = {}) {
  if (resetPage) {
    page.value = 1
  }
  await loadRecords()
}

function upsertRecord(updated) {
  const index = records.value.findIndex((item) => item.id === updated.id)
  if (index >= 0) {
    records.value[index] = updated
  }
}

watch(
  () => [props.appId, props.form?.id],
  () => {
    page.value = 1
    selectedRecords.value = []
    loadRecords()
  },
  { immediate: true },
)

defineExpose({ reload, upsertRecord })
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';

.list-body {
  padding: 12px 16px 16px;
}

.list-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.list-toolbar-actions,
.list-toolbar-extra {
  display: flex;
  align-items: center;
}

.table-wrap {
  flex: 1;
  min-height: 0;
}

.pager {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  padding-top: 12px;
}
</style>
