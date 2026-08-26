<template>
  <div class="data-select-root">
    <div v-if="!field.sourceFormId" class="data-select-hint">
      请配置数据源
    </div>
    <template v-else>
      <div
        class="data-select-trigger"
        :class="{
          'is-open': pickerVisible,
          'is-placeholder': !triggerText,
          'is-disabled': preview || disabled,
        }"
        @click="openPicker"
      >
        <span class="data-select-value">
          {{ triggerText || field.placeholder || '请选择' }}
        </span>
        <el-icon class="data-select-arrow"><ArrowDown /></el-icon>
      </div>
      <div v-if="previewRows.length" class="data-select-preview">
        <div
          v-for="item in previewRows"
          :key="item.key"
          class="data-select-preview-row"
        >
          {{ item.title }}：{{ item.text || '—' }}
        </div>
      </div>
      <el-dialog
        v-if="!preview"
        v-model="pickerVisible"
        title="选择数据"
        width="800px"
        align-center
        draggable
        destroy-on-close
        @open="onPickerOpen"
      >
        <el-table
          v-loading="listLoading"
          :data="records"
          border
          stripe
          size="small"
          height="360"
          highlight-current-row
          @row-click="onPick"
        >
          <el-table-column type="index" width="55" label="序号" />
          <el-table-column
            v-for="col in tableColumns"
            :key="col.key"
            :label="col.title"
            min-width="120"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ formatRecordField(col, row) }}
            </template>
          </el-table-column>
        </el-table>
        <div class="data-select-pager">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            @current-change="onPageChange"
          />
        </div>
      </el-dialog>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
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

const props = defineProps({
  field: { type: Object, required: true },
  appId: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  preview: { type: Boolean, default: false },
  modelValue: { default: undefined },
})

const emit = defineEmits(['fill', 'update:modelValue'])

/**
 * 选择数据是模拟select的样式和操作，实际上就是div
 */

const pickerVisible = ref(false)
const listLoading = ref(false)
const records = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const sourceFields = ref([])
const dictItemsByCode = ref({})
const selected = ref(null)
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
  if (displayColumns.value.length) {
    return displayColumns.value
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
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
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
    const result = await queryFormRecordsApi(
      props.appId,
      props.field.sourceFormId,
      { page: page.value, pageSize },
    )
    records.value = result?.items || []
    total.value = result?.total || 0
  } catch {
    records.value = []
    total.value = 0
  } finally {
    listLoading.value = false
  }
}

async function onPickerOpen() {
  page.value = 1
  await loadSource()
  await loadRecords()
}

function onPageChange(next) {
  page.value = next
  loadRecords()
}

function selectionKey(id) {
  return `${props.appId}:${props.field.sourceFormId}:${id}`
}

function onPick(row) {
  selected.value = row
  const id = row?.id || ''
  loadedKey = id ? selectionKey(id) : ''
  emit('update:modelValue', row?.id)
  const patches = {}
  for (const item of props.field.fillMappings || []) {
    if (!item?.sourceKey || !item?.targetKey) continue
    patches[item.targetKey] = cloneCopiedValue(row?.data?.[item.sourceKey])
  }
  emit('fill', patches)
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
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
