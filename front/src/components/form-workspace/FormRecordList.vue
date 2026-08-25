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
          <el-button :icon="Refresh" link @click="onRefresh">刷新</el-button>
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
            :width="isTimeColumnKey(col.key) ? TIME_COL_WIDTH : undefined"
            :min-width="isTimeColumnKey(col.key) ? undefined : normalizeColWidth(col.minWidth)"
            :resizable="!isTimeColumnKey(col.key)"
            :fixed="col.fixed || undefined"
            :class-name="isDataColumn(col.key) ? 'record-data-col' : undefined"
            :show-overflow-tooltip="!isDataColumn(col.key)"
          >
            <template #default="{ row }">
              <template v-if="col.key === CREATED_AT_KEY">
                {{ formatTime(row.createdAt) }}
              </template>
              <template v-else-if="col.key === UPDATED_AT_KEY">
                {{ formatTime(row.updatedAt) }}
              </template>
              <template v-else-if="col.key === CREATED_BY_KEY">
                {{ row.createdByName }}
              </template>
              <template v-else-if="col.key === UPDATED_BY_KEY">
                {{ row.updatedByName }}
              </template>
              <FormRecordCell
                v-else-if="fieldByKey[col.key]"
                :app-id="appId"
                :form-id="form.id"
                :row="row"
                :field="fieldByKey[col.key]"
                :dict-items-by-code="dictItemsByCode"
                :editing="editingCell === cellKey(row.id, col.key)"
                @start="editingCell = cellKey(row.id, col.key)"
                @close="onCellClose(row.id, col.key)"
                @saved="upsertRecord"
              />
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
import { Refresh } from '@element-plus/icons-vue'
import { deleteFormRecordApi, queryFormRecordsApi } from '../../api/apps'
import { isFillable } from '../form-fill/fillValues.js'
import FormRecordCell from './FormRecordCell.vue'
import FormRecordColumnSetup from './FormRecordColumnSetup.vue'
import {
  CREATED_AT_KEY,
  UPDATED_AT_KEY,
  CREATED_BY_KEY,
  UPDATED_BY_KEY,
  TIME_COL_WIDTH,
  isTimeColumnKey,
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
const editingCell = ref('')
// 切换表单时作废进行中的请求，避免把上一张表的记录写进来
const loadSession = ref(0)

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

function isDataColumn(key) {
  return Boolean(fieldByKey.value[key])
}

function cellKey(rowId, fieldKey) {
  return `${rowId}:${fieldKey}`
}

function onCellClose(rowId, fieldKey) {
  if (editingCell.value === cellKey(rowId, fieldKey)) {
    editingCell.value = ''
  }
}

function onRecordRowClick(row, _column, event) {
  if (
    event?.target?.closest(
      '.el-table-column--selection, .record-cell-edit, .record-cell.is-editing',
    )
  ) {
    return
  }
  emit('row-click', row)
}

async function loadRecords() {
  const session = loadSession.value
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
    if (session !== loadSession.value) return
    records.value = result?.items || []
    total.value = result?.total || 0
  } catch {
    if (session !== loadSession.value) return
    records.value = []
    total.value = 0
  } finally {
    if (session === loadSession.value) {
      listLoading.value = false
    }
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

function onRefresh() {
  editingCell.value = ''
  loadRecords()
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
    loadSession.value += 1
    page.value = 1
    selectedRecords.value = []
    records.value = []
    total.value = 0
    editingCell.value = ''
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

:deep(td.record-data-col .cell) {
  overflow: visible;
}
</style>
