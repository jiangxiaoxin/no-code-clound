<template>
  <div
    ref="rootRef"
    class="record-cell"
    :class="{ 'is-editing': editing }"
    @click="onCellClick"
  >
    <template v-if="editing">
      <el-input
        v-if="field.type === 'input'"
        ref="inputRef"
        v-model="draft"
        size="small"
        :maxlength="field.maxLength || undefined"
        :placeholder="field.placeholder"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="cancel"
      />
      <el-input
        v-else-if="field.type === 'textarea'"
        ref="inputRef"
        v-model="draft"
        type="textarea"
        :rows="2"
        size="small"
        :maxlength="field.maxLength || undefined"
        :placeholder="field.placeholder"
        @keydown.esc.prevent="cancel"
        @keydown.ctrl.enter.prevent="commit"
      />
      <el-input-number
        v-else-if="field.type === 'number'"
        ref="inputRef"
        v-model="draft"
        class="record-cell-control"
        size="small"
        align="left"
        :controls="false"
        :precision="field.precision"
        :min="field.rangeEnabled ? field.min : undefined"
        :max="field.rangeEnabled ? field.max : undefined"
        :placeholder="field.placeholder"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="cancel"
      />
      <el-select
        v-else-if="usesSelectEditor"
        v-model="draft"
        class="record-cell-control"
        size="small"
        filterable
        clearable
        :multiple="field.type === 'checkbox' || field.type === 'select-multiple'"
        :placeholder="field.placeholder || '请选择'"
        @keydown.esc.prevent="cancel"
        @visible-change="onSelectVisible"
        @change="onSelectChange"
      >
        <el-option
          v-for="item in options"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <el-date-picker
        v-else-if="field.type === 'date'"
        v-model="draft"
        class="record-cell-control"
        size="small"
        :type="field.format || 'date'"
        value-format="YYYY-MM-DD"
        :placeholder="field.placeholder || '请选择'"
        @keydown.esc.prevent="cancel"
        @change="commit"
      />
      <el-time-picker
        v-else-if="field.type === 'time'"
        v-model="draft"
        class="record-cell-control"
        size="small"
        :format="field.format || 'HH:mm:ss'"
        :value-format="field.format || 'HH:mm:ss'"
        :placeholder="field.placeholder || '请选择'"
        @keydown.esc.prevent="cancel"
        @change="commit"
      />
      <el-date-picker
        v-else-if="field.type === 'datetime'"
        v-model="draft"
        class="record-cell-control"
        size="small"
        type="datetime"
        :format="field.format || 'YYYY-MM-DD HH:mm:ss'"
        :placeholder="field.placeholder || '请选择'"
        @keydown.esc.prevent="cancel"
        @change="commit"
      />
      <FormAddressSelect
        v-else-if="field.type === 'address'"
        class="record-cell-control"
        :field="field"
        :model-value="draft"
        size="small"
        @update:model-value="onAddressDraft"
      />
    </template>
    <template v-else-if="field.type === 'image'">
      <div class="record-cell-images">
        <el-image
          v-for="(url, index) in imageUrls"
          :key="url"
          class="record-cell-thumb"
          :src="url"
          :preview-src-list="imageUrls"
          :initial-index="index"
          fit="cover"
          preview-teleported
          @click.prevent.stop
        >
          <template #toolbar="toolbar">
            <FormImageViewerToolbar
              v-bind="toolbar"
              :urls="imageUrls"
            />
          </template>
        </el-image>
        <!-- 不禁用事件会继续冒泡导致打开详情抽屉 -->
      </div>
    </template>
    <template v-else-if="field.type === 'file'">
      <div class="record-cell-files" :title="fileTitle">
        <span
          v-for="item in fileItems"
          :key="item.url"
          class="record-cell-file"
          :class="{ 'is-link': canDownloadFile }"
          @click.stop="onDownloadFile(item)"
        >
          {{ item.name }}
        </span>
      </div>
    </template>
    <template v-else>
      <span class="record-cell-text" :title="display">{{ display }}</span>
      <button
        v-if="editable"
        class="record-cell-edit"
        type="button"
        title="编辑"
        @click.stop="startEdit"
      >
        <el-icon><EditPen /></el-icon>
      </button>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import { queryFormRecordsApi, updateFormRecordApi } from '../../api/apps'
import { isSelectType } from '../form-design/fieldTypes'
import {
  cloneCellValue,
  formatCellValue,
  isInlineEditable,
  serializeValue,
  validateRequired,
  valuesEqual,
} from '../form-fill/fillValues.js'
import {
  downloadFile,
  fileDownloadable,
  fileItemsOf,
} from '../form-fill/fileField.js'
import { imageUrlsOf } from '../form-fill/imageField.js'
import { addressHasDetail } from '../form-fill/addressField.js'
import { buildSourceQuery, recordsToSelectItems } from '../form-fill/tableOptions'
import FormAddressSelect from '../form-fill/FormAddressSelect.vue'
import FormImageViewerToolbar from '../form-fill/FormImageViewerToolbar.vue'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  row: { type: Object, required: true },
  field: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  editing: { type: Boolean, default: false },
})

const emit = defineEmits(['start', 'close', 'saved'])

const rootRef = ref(null)
const inputRef = ref(null)
const draft = ref()
const tableItems = ref([])
const saving = ref(false)
let opened = false

const editable = computed(
  () => Boolean(props.field) && isInlineEditable(props.field),
)

const usesSelectEditor = computed(() => {
  const type = props.field?.type
  return (
    type === 'radio' ||
    type === 'checkbox' ||
    type === 'select' ||
    type === 'select-multiple'
  )
})

const display = computed(() =>
  formatCellValue(
    props.field,
    props.row.data?.[props.field?.key],
    props.dictItemsByCode,
  ),
)

const imageUrls = computed(() => imageUrlsOf(props.row.data?.[props.field?.key]))

const fileItems = computed(() => fileItemsOf(props.row.data?.[props.field?.key]))
const fileTitle = computed(() => fileItems.value.map((item) => item.name).join('、'))
const canDownloadFile = computed(() => fileDownloadable(props.field))

async function onDownloadFile(item) {
  if (!canDownloadFile.value) return
  try {
    await downloadFile(item)
  } catch {
    ElMessage.error('下载失败')
  }
}

const options = computed(() => {
  const field = props.field
  if (!field) return []
  if (
    isSelectType(field.type) &&
    field.optionSource === 'table_data'
  ) {
    return tableItems.value
  }
  return props.dictItemsByCode[field.dictCode] || []
})

function resolveSourceFormId(field) {
  const n = Number(field.sourceFormId)
  return Number.isInteger(n) && n > 0 ? n : 0
}

async function loadTableItems() {
  const field = props.field
  if (
    !field ||
    !isSelectType(field.type) ||
    field.optionSource !== 'table_data' ||
    !resolveSourceFormId(field) ||
    !field.sourceFieldKey
  ) {
    tableItems.value = []
    return
  }
  try {
    const result = await queryFormRecordsApi(
      props.appId,
      resolveSourceFormId(field),
      buildSourceQuery(field.optionFilters, props.row.data, props.fields),
    )
    tableItems.value = recordsToSelectItems(
      result?.items,
      field.sourceFieldKey,
    )
  } catch {
    tableItems.value = []
  }
}

function startEdit() {
  emit('start')
}

function onCellClick(event) {
  if (props.editing) {
    event.stopPropagation()
  }
}

function isMultiSelect() {
  const type = props.field?.type
  return type === 'checkbox' || type === 'select-multiple'
}

function onSelectChange() {
  if (!isMultiSelect()) {
    commit()
  }
}

function onAddressDraft(value) {
  draft.value = value
  if (!addressHasDetail(props.field)) {
    commit()
  }
}

function onSelectVisible(open) {
  if (!open && isMultiSelect()) {
    commit()
  }
}

function onDocMouseDown(event) {
  if (!props.editing || saving.value) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (rootRef.value?.contains(target)) return
  if (
    target.closest(
      '.el-popper, .el-select-dropdown, .el-picker-panel, .el-time-panel, .el-cascader__dropdown',
    )
  ) {
    return
  }
  commit()
}

async function open() {
  opened = true
  draft.value = cloneCellValue(props.field, props.row.data?.[props.field.key])
  await loadTableItems()
  document.addEventListener('mousedown', onDocMouseDown, true)
  await nextTick()
  const el = inputRef.value
  el?.focus?.()
  el?.select?.()
}

function teardown() {
  document.removeEventListener('mousedown', onDocMouseDown, true)
  opened = false
}

function cancel() {
  if (saving.value) return
  teardown()
  emit('close')
}

async function commit() {
  if (!props.editing || saving.value || !props.field) return
  const field = props.field
  const current = props.row.data?.[field.key]
  if (valuesEqual(field, draft.value, current)) {
    teardown()
    emit('close')
    return
  }
  const message = validateRequired([field], { [field.key]: draft.value })
  if (message) {
    ElMessage.warning(message)
    return
  }
  saving.value = true
  try {
    const next = serializeValue(field, draft.value)
    const updated = await updateFormRecordApi(
      props.appId,
      props.formId,
      props.row.id,
      { [field.key]: next === undefined ? null : next },
    )
    emit('saved', updated)
    teardown()
    emit('close')
  } catch {
    return
  } finally {
    saving.value = false
  }
}

watch(
  () => props.editing,
  (on) => {
    if (on) {
      open()
      return
    }
    if (opened) {
      teardown()
    }
  },
)

onUnmounted(() => {
  teardown()
})
</script>

<style scoped lang="less">
.record-cell {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 24px;
}

.record-cell.is-editing {
  align-items: flex-start;
}

.record-cell :deep(.address-select) {
  flex: 1;
  width: 100%;
  min-width: 0;
}

.record-cell-text {
  display: block;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-cell-edit {
  position: relative;
  z-index: 1;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  padding: 0;
  color: var(--el-color-primary);
  cursor: pointer;
  background: transparent;
  border: 0;
  opacity: 0;
}

.record-cell:hover .record-cell-edit,
.record-cell.is-editing .record-cell-edit {
  opacity: 1;
}

.record-cell-images {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}

.record-cell-thumb {
  width: 36px;
  height: 36px;
  margin-right: 4px;
  border-radius: 4px;
}

.record-cell-files {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
  gap: 4px;
}

.record-cell-file {
  max-width: 100%;
  min-width: 0;
  margin-right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-cell-file.is-link {
  color: var(--el-color-primary);
  cursor: pointer;
}

.record-cell-file.is-link:hover {
  text-decoration: underline;
}

.record-cell :deep(.el-textarea),
.record-cell :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
</style>
