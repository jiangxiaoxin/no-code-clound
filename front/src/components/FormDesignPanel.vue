<template>
  <el-container class="form-body" direction="vertical">
    <FormDesignToolbar
      @clear="clearFields"
      @save="saveFields"
      @preview="openPreview"
    />
    <el-container class="form-layout">
      <FormDesignPalette @add="addField" />
      <FormDesignCanvas
        :app-id="appId"
        :fields="fields"
        :selected-key="selectedKey"
        :dict-items-by-code="dictItemsByCode"
        v-model:active-pane-id="activePaneId"
        @select="selectField"
        @copy="copyField"
        @remove="removeField"
        @reorder="reorderFields"
        @add="onCanvasAdd"
      />
      <FormDesignProps
        v-model:tab="propTab"
        v-model:columns="columns"
        :field="selectedField"
        :fields="fields"
        :app-id="appId"
        :form-id="formId"
        @update:width="setFieldWidth"
      />
    </el-container>
  </el-container>

  <el-dialog
    v-model="previewVisible"
    title="预览"
    width="800px"
    align-center
    destroy-on-close
    draggable
  >
    <div class="preview-json">{{ previewJson }}</div>
    <template #footer>
      <el-button @click="closePreview">关闭</el-button>
      <el-button type="primary" @click="copyPreviewJson">复制</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, toRaw, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FormDesignToolbar from './form-design/FormDesignToolbar.vue'
import FormDesignPalette from './form-design/FormDesignPalette.vue'
import FormDesignCanvas from './form-design/FormDesignCanvas.vue'
import FormDesignProps from './form-design/FormDesignProps.vue'
import { listDictionaryItemsByCodesApi, saveFormFieldsApi } from '../api/apps'
import { defaultWidthByColumns, isSelectType } from './form-design/fieldTypes'
import { cloneOptionFilters } from './form-design/optionFilters'
import { cloneLinkage, LINKAGE_VALUE_TYPES } from './form-design/linkage'
import {
  cloneDisplayFieldKeys,
  cloneDisplayFieldLabels,
  cloneFillMappings,
} from './form-design/dataSelect'
import {
  createTabsField,
  findFieldByKey,
  findTabsField,
  flattenFields,
  hasTabsField,
  isTabsField,
  neighborPaneId,
  paneIdOfField,
} from './form-design/tabsField.js'
import {
  DEFAULT_IMAGE_MAX_COUNT,
  DEFAULT_IMAGE_MAX_SIZE_MB,
  defaultImageFormats,
} from './form-fill/imageField'
import {
  DEFAULT_FILE_MAX_COUNT,
  DEFAULT_FILE_MAX_SIZE_MB,
  defaultFileFormats,
} from './form-fill/fileField'
import { DEFAULT_ADDRESS_FORMAT } from './form-fill/addressField'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  initialFields: { type: Array, default: null },
  initialColumns: { type: Number, default: 1 },
})

const emit = defineEmits(['saved'])

const propTab = ref('field')
const previewVisible = ref(false)
const columns = ref(1)
const fields = ref([])
const selectedKey = ref('')
const activePaneId = ref('')
const dictItemsByCode = ref({})

const selectedField = computed(
  () => findFieldByKey(fields.value, selectedKey.value),
)

const previewJson = computed(() => JSON.stringify(fields.value, null, 2))

const dictCodes = computed(() => {
  const codes = []
  const seen = new Set()
  for (const field of flattenFields(fields.value)) {
    const usesDict =
      (field.type === 'radio' || field.type === 'checkbox' || isSelectType(field.type)) &&
      (field.optionSource || 'dictionary') === 'dictionary' &&
      field.dictCode
    if (!usesDict || seen.has(field.dictCode)) {
      continue
    }
    seen.add(field.dictCode)
    codes.push(field.dictCode)
  }
  return codes
})

watch(
  [() => props.appId, dictCodes],
  async () => {
    const codes = dictCodes.value
    if (!codes.length) {
      dictItemsByCode.value = {}
      return
    }
    try {
      const rows = (await listDictionaryItemsByCodesApi(props.appId, codes)) || []
      dictItemsByCode.value = Object.fromEntries(
        rows.map((row) => [row.code, row.items || []]),
      )
    } catch {
      dictItemsByCode.value = {}
    }
  },
  { immediate: true },
)

async function copyPreviewJson() {
  try {
    await navigator.clipboard.writeText(previewJson.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

function nextKey() {
  return crypto.randomUUID()
}

function openPreview() {
  previewVisible.value = true
}

function closePreview() {
  previewVisible.value = false
}

function onCanvasAdd(item, beforeKey, paneId) {
  addField(item, beforeKey, paneId, true)
}

function insertIntoList(list, field, beforeKey) {
  if (beforeKey) {
    const index = list.findIndex((entry) => entry.key === beforeKey)
    list.splice(index < 0 ? list.length : index, 0, field)
  } else {
    list.push(field)
  }
}

function findPane(paneId) {
  if (!paneId) return null
  const tabs = findTabsField(fields.value)
  return (tabs?.panes || []).find((pane) => pane.id === paneId) || null
}

function resolveTargetPaneId(paneId) {
  if (paneId) return paneId
  const selected = selectedField.value
  if (isTabsField(selected) || paneIdOfField(fields.value, selectedKey.value)) {
    const tabs = findTabsField(fields.value)
    return activePaneId.value || tabs?.panes?.[0]?.id || ''
  }
  return ''
}

function listContaining(key) {
  if ((fields.value || []).some((item) => item.key === key)) {
    return fields.value
  }
  const tabs = findTabsField(fields.value)
  if (!tabs) return null
  for (const pane of tabs.panes || []) {
    if ((pane.fields || []).some((item) => item.key === key)) {
      return pane.fields
    }
  }
  return null
}

function addField(item, beforeKey, paneId, fromCanvas) {
  if (item.type === 'tabs') {
    if (hasTabsField(fields.value)) {
      ElMessage.warning('每个表单只能有一个标签页')
      return
    }
    const field = createTabsField(nextKey(), [nextKey(), nextKey()])
    insertIntoList(fields.value, field, beforeKey)
    activePaneId.value = field.panes[0].id
    selectField(field)
    return
  }

  const field = {
    key: nextKey(),
    type: item.type,
    component: item.component,
    title: item.label,
    placeholder: item.placeholder || '',
    width: item.type === 'divider' ? '1' : defaultWidthByColumns(columns.value),
    required: false,
    disabled: false,
    editable: true,
    description: '',
    ...(item.type === 'number' ? { rangeEnabled: false, precision: 0 } : {}),
    ...(item.type === 'date' ? { format: 'date' } : {}),
    ...(item.type === 'time' ? { format: 'HH:mm:ss' } : {}),
    ...(item.type === 'datetime' ? { format: 'YYYY-MM-DD HH:mm:ss' } : {}),
    ...(item.type === 'radio' || item.type === 'checkbox'
      ? { optionSource: 'dictionary', dictCode: '' }
      : {}),
    ...(item.type === 'select' || item.type === 'select-multiple'
      ? { optionSource: 'dictionary', dictCode: '' }
      : {}),
    ...(item.type === 'address' ? { addressFormat: DEFAULT_ADDRESS_FORMAT } : {}),
    ...(LINKAGE_VALUE_TYPES.includes(item.type)
      ? { optionSource: 'custom' }
      : {}),
    ...(item.type === 'image'
      ? {
          maxCount: DEFAULT_IMAGE_MAX_COUNT,
          maxSizeMB: DEFAULT_IMAGE_MAX_SIZE_MB,
          acceptFormats: defaultImageFormats(),
          compress: false,
        }
      : {}),
    ...(item.type === 'file'
      ? {
          maxCount: DEFAULT_FILE_MAX_COUNT,
          maxSizeMB: DEFAULT_FILE_MAX_SIZE_MB,
          acceptFormats: defaultFileFormats(),
          downloadable: true,
        }
      : {}),
  }

  if (!(fromCanvas && !paneId)) {
    const targetPaneId = resolveTargetPaneId(paneId)
    const pane = findPane(targetPaneId)
    if (pane) {
      if (!pane.fields) pane.fields = []
      insertIntoList(pane.fields, field, beforeKey)
      activePaneId.value = pane.id
      selectField(field)
      return
    }
  }

  insertIntoList(fields.value, field, beforeKey)
  selectField(field)
}

function copyField(field) {
  const copied = {
    ...field,
    key: nextKey(),
  }
  if (field.optionFilters) {
    copied.optionFilters = cloneOptionFilters(field.optionFilters)
  }
  if (field.linkage) {
    copied.linkage = cloneLinkage(field.linkage)
  }
  if (field.displayFieldKeys) {
    copied.displayFieldKeys = cloneDisplayFieldKeys(field.displayFieldKeys)
  }
  if (field.displayFieldLabels) {
    copied.displayFieldLabels = cloneDisplayFieldLabels(field.displayFieldLabels)
  }
  if (field.fillMappings) {
    copied.fillMappings = cloneFillMappings(field.fillMappings)
  }
  if (field.acceptFormats) {
    copied.acceptFormats = [...field.acceptFormats]
  }
  const index = fields.value.findIndex((item) => item.key === field.key)
  fields.value.splice(index + 1, 0, copied)
  selectField(copied)
}

async function removeField(field) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${field.title}」？`,
      '删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  const list = listContaining(field.key)
  if (!list) {
    return
  }
  const filtered = list.filter((item) => item.key !== field.key)
  if (list === fields.value) {
    fields.value = filtered
  } else {
    const paneId = paneIdOfField(fields.value, field.key)
    const pane = findPane(paneId)
    if (pane) pane.fields = filtered
  }
  if (selectedKey.value === field.key) {
    selectedKey.value = filtered.at(-1)?.key || fields.value.at(-1)?.key || ''
  }
}

function ensureOptionSource(field) {
  if (field.type === 'radio' || field.type === 'checkbox') {
    if (!field.optionSource) field.optionSource = 'dictionary'
    if (field.dictCode == null) field.dictCode = ''
  }
  if (isSelectType(field.type)) {
    if (!field.optionSource) field.optionSource = 'dictionary'
    if (field.optionSource === 'dictionary' && field.dictCode == null) {
      field.dictCode = ''
    }
  }
  if (LINKAGE_VALUE_TYPES.includes(field.type) && !field.optionSource) {
    field.optionSource = 'custom'
  }
  if (field.type === 'image') {
    if (!field.maxCount) field.maxCount = DEFAULT_IMAGE_MAX_COUNT
    if (!field.maxSizeMB) field.maxSizeMB = DEFAULT_IMAGE_MAX_SIZE_MB
    if (!Array.isArray(field.acceptFormats) || !field.acceptFormats.length) {
      field.acceptFormats = defaultImageFormats()
    }
    if (typeof field.compress !== 'boolean') field.compress = false
  }
  if (field.type === 'file') {
    if (!field.maxCount) field.maxCount = DEFAULT_FILE_MAX_COUNT
    if (!field.maxSizeMB) field.maxSizeMB = DEFAULT_FILE_MAX_SIZE_MB
    if (!Array.isArray(field.acceptFormats) || !field.acceptFormats.length) {
      field.acceptFormats = defaultFileFormats()
    }
    if (typeof field.downloadable !== 'boolean') field.downloadable = true
  }
}

function selectField(field) {
  if (!field?.key) {
    selectedKey.value = ''
    return
  }
  ensureOptionSource(field)
  selectedKey.value = field.key
  propTab.value = 'field'
  if (isTabsField(field)) {
    if (!activePaneId.value) {
      activePaneId.value = field.panes?.[0]?.id || ''
    }
    return
  }
  const paneId = paneIdOfField(fields.value, field.key)
  if (paneId) {
    activePaneId.value = paneId
  }
}

function setFieldWidth(width) {
  if (!selectedField.value) {
    return
  }
  selectedField.value.width = width
}

function reorderFields(fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) {
    return
  }
  const fromList = listContaining(fromKey)
  const toList = listContaining(toKey)
  if (!fromList || !toList || fromList !== toList) {
    return
  }
  const from = fromList.findIndex((item) => item.key === fromKey)
  const to = toList.findIndex((item) => item.key === toKey)
  if (from < 0 || to < 0) {
    return
  }
  const [moved] = fromList.splice(from, 1)
  fromList.splice(to, 0, moved)
}

async function clearFields() {
  if (fields.value.length === 0) {
    return
  }

  try {
    await ElMessageBox.confirm('确定清空当前表单字段？', '清空', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  fields.value = []
  selectedKey.value = ''
  activePaneId.value = ''
}

async function saveFields() {
  try {
    const saved = await saveFormFieldsApi(props.appId, props.formId, {
      fields: fields.value,
      columns: columns.value,
    })
    ElMessage.success('保存成功')
    emit('saved', saved)
  } catch {
    return
  }
}

function cloneFields(value) {
  const raw = toRaw(value)
  if (!Array.isArray(raw)) {
    return []
  }
  try {
    return JSON.parse(JSON.stringify(raw))
  } catch {
    return raw.map((item) => ({ ...toRaw(item) }))
  }
}

watch(
  () => [props.appId, props.formId],
  () => {
    fields.value = cloneFields(props.initialFields)
    columns.value =
      props.initialColumns === 2 ||
      props.initialColumns === 3 ||
      props.initialColumns === 4
        ? props.initialColumns
        : 1
    selectedKey.value = ''
    activePaneId.value = ''
  },
  { immediate: true },
)

watch(
  () => {
    const field = selectedField.value
    if (!isTabsField(field)) return ''
    return (field.panes || []).map((pane) => pane.id).join(',')
  },
  (key, prevKey) => {
    const ids = key ? key.split(',') : []
    if (!ids.length) return
    if (ids.includes(activePaneId.value)) return
    const prevIds = prevKey ? prevKey.split(',') : []
    const removedId = prevIds.find((id) => !ids.includes(id))
    const neighbor = neighborPaneId(
      prevIds.map((id) => ({ id })),
      removedId,
    )
    activePaneId.value = ids.includes(neighbor) ? neighbor : ids[0]
  },
)
</script>

<style scoped lang="less">
.form-body {
  min-height: 0;
}

.form-layout {
  min-height: 0;
}

.preview-json {
  max-height: 420px;
  overflow: auto;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
</style>
