<template>
  <div class="data-select-root">
    <div v-if="!field.sourceFormId" class="data-select-hint">
      请配置数据源
    </div>
    <template v-else>
      <div class="data-select-trigger" :class="{
        'is-open': pickerVisible,
        'is-placeholder': !triggerText,
        'is-disabled': preview || disabled,
      }" @click="openPicker">
        <span class="data-select-value">
          {{ triggerText || field.placeholder || '请选择' }}
        </span>
        <el-icon class="data-select-arrow">
          <ArrowDown />
        </el-icon>
      </div>
      <div v-if="previewRows.length && !compact" class="data-select-preview">
        <div v-for="item in previewRows" :key="item.key" class="data-select-preview-row">
          {{ item.title }}：{{ item.text || '—' }}
        </div>
      </div>
      <el-dialog v-if="!preview" v-model="pickerVisible" title="选择数据" width="800px" align-center draggable
        destroy-on-close @open="onPickerOpen">
        <div class="data-select-toolbar">
          <el-input v-model="keyword" clearable placeholder="快捷搜索" @clear="onSearchNow" @keyup.enter="onSearchNow"
            size="small">
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>
        </div>
        <el-table ref="tableRef" v-loading="listLoading" :data="records" border stripe size="small" height="360"
          row-key="id" highlight-current-row class="data-select-table" :class="{ 'is-single': !multiple }"
          @row-click="onRowClick" @select="onSelect"
          @select-all="onSelectAll">
          <el-table-column type="selection" width="42" />
          <el-table-column type="index" width="55" label="序号" />
          <el-table-column v-for="col in tableColumns" :key="col.key" :label="col.title" min-width="120"
            show-overflow-tooltip>
            <template #default="{ row }">
              {{ formatRecordField(col, row) }}
            </template>
          </el-table-column>
        </el-table>

        <template #footer>
          <!-- 弹框内table选择数据，不显得突兀和堆叠 -->
          <div class="data-select-pager">
            <el-pagination background layout="total, sizes, prev, pager, next" :current-page="page"
              :page-size="pageSize" :page-sizes="PAGE_SIZES" :total="total" size="small" @current-change="onPageChange"
              @size-change="onPageSizeChange" />
            <div>
              <el-button @click="closePicker">取消</el-button>
              <el-button type="primary" :disabled="!canConfirm" @click="confirmPick">
                确定
              </el-button>
            </div>

          </div>

        </template>
      </el-dialog>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ArrowDown, Search } from '@element-plus/icons-vue'
import {
  getFormApi,
  getFormRecordApi,
  listDictionaryItemsByCodesApi,
  queryFormRecordsApi,
} from '../../api/apps'
import { isSelectType } from '../form-design/fieldTypes'
import {
  CREATED_AT_KEY,
  CREATED_BY_KEY,
  UPDATED_AT_KEY,
  UPDATED_BY_KEY,
} from '../form-workspace/columnPrefs'
import { cloneDisplayFieldKeys, displayFieldTitle, findDisplaySourceField } from '../form-design/dataSelect'
import { formatCellValue, isFillable } from './fillValues'
import { formatDateTime } from '../../utils/timeValue.js'
import { buildSourceQuery, mergeFilterQueries } from './tableOptions'
import { buildQuickSearchQuery } from '../form-workspace/quickSearch'
import { PAGE_SIZES } from '../../utils/pagination'

const props = defineProps({
  field: { type: Object, required: true },
  appId: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  preview: { type: Boolean, default: false }, // true-画布上用来占位的显示 false-真实的组件使用
  modelValue: { default: undefined },
  recordValues: { type: Object, default: () => ({}) },
  formFields: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['fill', 'update:modelValue', 'fill-rows'])

onMounted(() => {
  console.log('form data select 组件', props.preview);

})

/**
 * 选择数据是模拟select的样式和操作，实际上就是div
 */

const pickerVisible = ref(false)
const listLoading = ref(false)
const records = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZES[0])
const keyword = ref('')
const sourceFields = ref([])
const dictItemsByCode = ref({})
const selected = ref(null)
const tableRef = ref(null)
const draftRow = ref(null)
const draftRows = ref([])
const canConfirm = computed(() =>
  props.multiple
    ? draftRows.value.some((row) => row?.id)
    : Boolean(draftRow.value?.id),
)
let selectedSeq = 0
let loadedKey = ''

const displayColumns = computed(() => {
  const keys = cloneDisplayFieldKeys(props.field.displayFieldKeys)
  const fillable = sourceFields.value.filter(isFillable)
  return keys
    .map((key) => findDisplaySourceField(fillable, key))
    .filter(Boolean)
    .map((field) => ({
      key: field.key,
      title: field.title || field.key,
      field,
    }))
})

const tableColumns = computed(() => {
  const keys = cloneDisplayFieldKeys(props.field.pickerColumnKeys)
  if (keys.length) {
    return keys
      .map((key) => findDisplaySourceField(sourceFields.value, key))
      .filter(Boolean)
      .map((field) => ({
        key: field.key,
        title: field.title || field.key,
        field,
      }))
  }
  return sourceFields.value.filter(isFillable).map((field) => ({
    key: field.key,
    title: field.title || field.key,
    field,
  }))
})

const previewRows = computed(() => {
  const keys = cloneDisplayFieldKeys(props.field.displayFieldKeys)
  if (!keys.length) {
    return []
  }
  if (props.preview) {
    return keys.map((key) => {
      const col = displayColumns.value.find((item) => item.key === key)
      return {
        key,
        title: col?.title || displayFieldTitle(props.field, key),
        text: '—',
      }
    })
  }
  if (!selected.value) {
    return []
  }
  return keys.map((key) => {
    const col = displayColumns.value.find((item) => item.key === key)
    return {
      key,
      title: col?.title || displayFieldTitle(props.field, key),
      text: col ? formatRecordField(col, selected.value) : '—',
    }
  })
})

const triggerText = computed(() => {
  if (props.preview) {
    return ''
  }
  const first = previewRows.value.find((item) => item.text && item.text !== '—')
  return first?.text || (selected.value ? '已选择' : '')
})

function formatSystemTime(value) {
  return formatDateTime(value)
}

function formatRecordField(col, row) {
  if (col.key === CREATED_BY_KEY) {
    return row?.createdByName || ''
  }
  if (col.key === UPDATED_BY_KEY) {
    return row?.updatedByName || ''
  }
  if (col.key === CREATED_AT_KEY) {
    return formatSystemTime(row?.createdAt)
  }
  if (col.key === UPDATED_AT_KEY) {
    return formatSystemTime(row?.updatedAt)
  }
  return formatCellValue(
    col.field,
    row?.data?.[col.key],
    dictItemsByCode.value,
  )
}

function dictCodesOf(fields) {
  const codes = []
  const seen = new Set()
  for (const field of fields) {
    const usesDict =
      (field.type === 'radio' ||
        field.type === 'checkbox' ||
        isSelectType(field.type)) &&
      (field.optionSource || 'dictionary') === 'dictionary' &&
      field.dictCode
    if (!usesDict || seen.has(field.dictCode)) continue
    seen.add(field.dictCode)
    codes.push(field.dictCode)
  }
  return codes
}

function cloneCopiedValue(value) {
  if (Array.isArray(value)) return [...value]
  return value == null ? undefined : value
}

function openPicker() {
  if (props.preview || props.disabled || !props.field.sourceFormId) {
    return
  }
  pickerVisible.value = true
}

async function loadSource() {
  if (!props.appId || !props.field.sourceFormId) {
    sourceFields.value = []
    dictItemsByCode.value = {}
    return
  }
  try {
    const detail = await getFormApi(props.appId, props.field.sourceFormId)
    const fields = Array.isArray(detail?.fields) ? detail.fields : []
    sourceFields.value = fields.filter(isFillable)
    if (props.preview) {
      dictItemsByCode.value = {}
      return
    }
    const codes = dictCodesOf(sourceFields.value)
    if (!codes.length) {
      dictItemsByCode.value = {}
      return
    }
    const rows = (await listDictionaryItemsByCodesApi(props.appId, codes)) || []
    dictItemsByCode.value = Object.fromEntries(
      rows.map((row) => [row.code, row.items || []]),
    )
  } catch {
    sourceFields.value = []
    dictItemsByCode.value = {}
  }
}

watch(
  () => [props.preview, props.appId, props.field.sourceFormId],
  () => {
    if (props.preview && props.appId && props.field.sourceFormId) {
      loadSource()
    }
  },
  { immediate: true },
)

async function loadRecords() {
  if (!props.appId || !props.field.sourceFormId) {
    records.value = []
    total.value = 0
    return
  }
  listLoading.value = true
  try {
    const optionQuery = buildSourceQuery(
      props.field.optionFilters,
      props.recordValues,
      props.formFields,
      { page: page.value, pageSize: pageSize.value },
    )
    const searchQuery = buildQuickSearchQuery(
      tableColumns.value.map((col) => col.field).filter(Boolean),
      keyword.value,
      dictItemsByCode.value,
    )
    const result = await queryFormRecordsApi(
      props.appId,
      props.field.sourceFormId,
      {
        page: page.value,
        pageSize: pageSize.value,
        ...mergeFilterQueries(optionQuery, searchQuery),
      },
    )
    records.value = result?.items || []
    total.value = result?.total || 0
  } catch {
    records.value = []
    total.value = 0
  } finally {
    listLoading.value = false
  }
  await nextTick()
  restoreDraftSelection()
}

async function onPickerOpen() {
  page.value = 1
  keyword.value = ''
  draftRow.value = selected.value
  draftRows.value = selected.value ? [selected.value] : []
  await loadSource()
  await loadRecords()
}

function restoreDraftSelection() {
  const table = tableRef.value
  if (!table) return
  table.clearSelection()
  if (props.multiple) {
    const ids = new Set(draftRows.value.map((item) => item?.id).filter(Boolean))
    const next = []
    for (const row of records.value) {
      if (!ids.has(row.id)) continue
      table.toggleRowSelection(row, true)
      next.push(row)
    }
    draftRows.value = next.length ? next : draftRows.value
    return
  }
  const id = draftRow.value?.id
  if (!id) return
  const row = records.value.find((item) => item.id === id)
  if (!row) return
  table.toggleRowSelection(row, true)
  draftRow.value = row
}

function onSelect(selection, row) {
  if (props.multiple) {
    draftRows.value = selection || []
    draftRow.value = draftRows.value[0] || null
    return
  }
  const checked = (selection || []).some((item) => item.id === row.id)
  draftRow.value = checked ? row : null
  nextTick(() => {
    const table = tableRef.value
    if (!table) return
    table.clearSelection()
    if (checked) table.toggleRowSelection(row, true)
  })
}

function onSelectAll(selection) {
  if (props.multiple) {
    draftRows.value = selection || []
    draftRow.value = draftRows.value[0] || null
    return
  }
  draftRow.value = null
  tableRef.value?.clearSelection()
}

function onRowClick(row, column) {
  if (!row || column?.type === 'selection') return
  if (props.multiple) {
    const table = tableRef.value
    if (!table) return
    const exists = draftRows.value.some((item) => item.id === row.id)
    table.toggleRowSelection(row, !exists)
    draftRows.value = exists
      ? draftRows.value.filter((item) => item.id !== row.id)
      : [...draftRows.value, row]
    draftRow.value = draftRows.value[0] || null
    return
  }
  draftRow.value = row
  const table = tableRef.value
  if (!table) return
  table.clearSelection()
  table.toggleRowSelection(row, true)
}

function closePicker() {
  pickerVisible.value = false
}

function onSearchNow() {
  page.value = 1
  loadRecords()
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

function selectionKey(id) {
  return `${props.appId}:${props.field.sourceFormId}:${id}`
}

function patchesOf(row) {
  const patches = {}
  for (const item of props.field.fillMappings || []) {
    if (!item?.sourceKey || !item?.targetKey) continue
    patches[item.targetKey] = cloneCopiedValue(row?.data?.[item.sourceKey])
  }
  return patches
}

function confirmPick() {
  if (props.multiple) {
    const picked = draftRows.value.filter((row) => row?.id)
    if (!picked.length) return
    const first = picked[0]
    selected.value = first
    loadedKey = selectionKey(first.id)
    emit('update:modelValue', first.id)
    emit('fill', patchesOf(first))
    emit(
      'fill-rows',
      picked.map((row) => ({ id: row.id, patches: patchesOf(row) })),
    )
    pickerVisible.value = false
    return
  }
  const row = draftRow.value
  if (!row?.id) return
  selected.value = row
  loadedKey = selectionKey(row.id)
  emit('update:modelValue', row.id)
  const patches = patchesOf(row)
  emit('fill', patches)
  emit('fill-rows', [{ id: row.id, patches }])
  pickerVisible.value = false
}

async function loadSelected() {
  const seq = ++selectedSeq
  if (props.preview) {
    selected.value = null
    loadedKey = ''
    return
  }
  const id =
    typeof props.modelValue === 'string' ? props.modelValue.trim() : ''
  if (!id || !props.appId || !props.field.sourceFormId) {
    selected.value = null
    loadedKey = ''
    return
  }
  const key = selectionKey(id)
  if (loadedKey === key && selected.value?.id === id) {
    return
  }
  try {
    await loadSource()
    if (seq !== selectedSeq) return
    if (loadedKey === key && selected.value?.id === id) return
    const row = await getFormRecordApi(
      props.appId,
      props.field.sourceFormId,
      id,
      { silent404: true },
    )
    if (seq !== selectedSeq) return
    selected.value = row
    loadedKey = key
  } catch {
    if (seq !== selectedSeq) return
    selected.value = null
    loadedKey = ''
  }
}

watch(
  () => [props.modelValue, props.appId, props.field.sourceFormId, props.preview],
  loadSelected,
  { immediate: true },
)
</script>

<style scoped lang="less">
.data-select-root {
  width: 100%;
}

.data-select-hint {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  line-height: 32px;
}

.data-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 11px;
  box-sizing: border-box;
  font-size: 14px;
  line-height: 30px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.data-select-trigger:hover:not(.is-disabled) {
  border-color: var(--el-border-color-hover);
}

.data-select-trigger.is-open:not(.is-disabled) {
  border-color: var(--el-color-primary);
}

.data-select-trigger.is-disabled {
  color: var(--el-disabled-text-color);
  cursor: not-allowed;
  background: var(--el-disabled-bg-color);
  border-color: var(--el-disabled-border-color);
}

.data-select-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-select-trigger.is-placeholder .data-select-value {
  color: var(--el-text-color-placeholder);
}

.data-select-trigger.is-disabled.is-placeholder .data-select-value {
  color: var(--el-disabled-text-color);
}

.data-select-arrow {
  flex-shrink: 0;
  margin-left: 8px;
  color: var(--el-text-color-placeholder);
}

.data-select-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-text-color-regular);
}

.data-select-pager {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
}

.data-select-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 12px;
}

.data-select-toolbar .el-input {
  width: 260px;
}

.data-select-table.is-single :deep(th.el-table-column--selection .el-checkbox) {
  display: none;
}
</style>
