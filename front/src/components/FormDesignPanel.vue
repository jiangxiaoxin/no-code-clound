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
        @add-child="addChildField"
      />
      <FormDesignProps
        v-model:tab="propTab"
        v-model:columns="columns"
        :field="selectedField"
        :fields="fields"
        :parent-subform="parentSubform"
        :app-id="appId"
        :form-id="formId"
        @update:width="setFieldWidth"
        @select-child="selectField"
        @add-child="addChildField"
        @copy-child="copyField"
        @remove-child="removeField"
        @move-child="moveChildField"
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
  <RelateSubformPickerDialog
    v-model="relateSubformVisible"
    :app-id="appId"
    :form-id="formId"
    @confirm="onRelateSubformConfirm"
    @cancel="onRelateSubformCancel"
  />
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
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
  findTabsField,
  hasTabsField,
  isTabsField,
  neighborPaneId,
  paneIdOfField,
} from './form-design/tabsField.js'
import {
  findFieldByKey,
  findParentSubform,
  isSubformChildType,
  walkFormFields,
} from './form-fill/subformField.js'
import {
  createDefaultSerialField,
  hasSerialNumberField,
} from './form-design/serialField.js'
import { isMemberField } from './form-design/memberField.js'
import { isDeptField } from './form-design/deptField.js'
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
import { insertAfterKey, insertIntoList } from './form-design/canvasInsert.js'
import RelateSubformPickerDialog from './form-design/RelateSubformPickerDialog.vue'
import {
  defaultRelateSubformColumns,
  hasRelateSubformField,
} from './form-design/relateSubform.js'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  initialFields: { type: Array, default: null },
  initialColumns: { type: Number, default: 1 },
})

const emit = defineEmits(['saved'])

const propTab = ref('field')
const previewVisible = ref(false)
const relateSubformVisible = ref(false)
let pendingRelateSubform = null
const columns = ref(1)
const fields = ref([])
const selectedKey = ref('')
const activePaneId = ref('')
const dictItemsByCode = ref({})

const selectedField = computed(
  () => findFieldByKey(fields.value, selectedKey.value),
)

const parentSubform = computed(() =>
  findParentSubform(fields.value, selectedKey.value),
)

const previewJson = computed(() => JSON.stringify(fields.value, null, 2))

const dictCodes = computed(() => {
  const codes = []
  const seen = new Set()
  walkFormFields(fields.value, (field) => {
    const usesDict =
      (field.type === 'radio' || field.type === 'checkbox' || isSelectType(field.type)) &&
      (field.optionSource || 'dictionary') === 'dictionary' &&
      field.dictCode
    if (!usesDict || seen.has(field.dictCode)) {
      return
    }
    seen.add(field.dictCode)
    codes.push(field.dictCode)
  })
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

function createFieldFromItem(item, { child = false } = {}) {
  const isSubform = item.type === 'subform'
  return {
    key: nextKey(),
    type: item.type,
    component: item.component,
    title: item.label,
    placeholder: isSubform ? '' : item.placeholder || '',
    width:
      isSubform || item.type === 'relate-subform' || item.type === 'divider' || child
        ? '1'
        : defaultWidthByColumns(columns.value),
    required: false,
    disabled: false,
    editable: true,
    visible: true,
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
    ...(isSubform
      ? {
          defaultRowCount: 0,
          frozenCols: 0,
          optionSource: 'custom',
          fields: [],
        }
      : {}),
    ...(isMemberField(item.type)
      ? {
          memberScope: 'all',
          optionSource: 'custom',
        }
      : {}),
    ...(isDeptField(item.type)
      ? {
          deptScope: 'all',
          optionSource: 'custom',
        }
      : {}),
  }
}

function insertIntoRoot(field, beforeKey, fromPalette) {
  if (fromPalette) {
    insertAfterKey(fields.value, field, selectedKey.value)
    return
  }
  insertIntoList(fields.value, field, beforeKey)
}

function placeField(field, { beforeKey, paneId, fromCanvas, fromPalette }) {
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
  insertIntoRoot(field, beforeKey, fromPalette)
  selectField(field)
}

function addField(item, beforeKey, paneId, fromCanvas) {
  const fromPalette = !fromCanvas && !beforeKey && !paneId
  if (item.type === 'serialNumber') {
    if (hasSerialNumberField(fields.value)) {
      ElMessage.warning('每个表单只能有一个流水号')
      return
    }
  }
  if (item.type === 'tabs') {
    if (hasTabsField(fields.value)) {
      ElMessage.warning('每个表单只能有一个标签页')
      return
    }
    const field = createTabsField(nextKey(), [nextKey(), nextKey()])
    insertIntoRoot(field, beforeKey, fromPalette)
    activePaneId.value = field.panes[0].id
    selectField(field)
    return
  }

  if (item.type === 'relate-subform') {
    pendingRelateSubform = { item, beforeKey, paneId, fromCanvas, fromPalette }
    relateSubformVisible.value = true
    return
  }

  const selectedParent = findParentSubform(fields.value, selectedKey.value)
  if (selectedParent && fromPalette) {
    addChildField(selectedParent.key, item, undefined, selectedKey.value)
    return
  }

  const field = createFieldFromItem(item)

  if (item.type === 'serialNumber') {
    const serial = createDefaultSerialField(field.key)
    field.placeholder = serial.placeholder
    field.serialSeparator = serial.serialSeparator
    field.serialRule = serial.serialRule
  }

  placeField(field, { beforeKey, paneId, fromCanvas, fromPalette })
}

function onRelateSubformConfirm(option) {
  const pending = pendingRelateSubform
  pendingRelateSubform = null
  if (!pending || !option) {
    return
  }
  if (hasRelateSubformField(fields.value, option.formId, option.relateKey)) {
    ElMessage.warning('已添加该关联表单')
    return
  }
  const field = createFieldFromItem(pending.item)
  field.title = option.formName
  field.width = '1'
  field.placeholder = ''
  field.childFormId = option.formId
  field.childRelateKey = option.relateKey
  field.columnKeys = defaultRelateSubformColumns(option.fields)
  field.canViewDetail = false
  placeField(field, pending)
}

function onRelateSubformCancel() {
  pendingRelateSubform = null
}

function remapCopiedKeys(field, keyMap) {
  if (!field.fillMappings) {
    return
  }
  field.fillMappings = cloneFillMappings(field.fillMappings).map((item) => ({
    ...item,
    targetKey: keyMap[item.targetKey] || item.targetKey,
  }))
}

function cloneOneField(field) {
  const copied = {
    ...field,
    key: nextKey(),
  }
  if (field.optionFilters) {
    copied.optionFilters = cloneOptionFilters(field.optionFilters)
  }
  if (field.linkage) {
    copied.linkage = {
      ...cloneLinkage(field.linkage),
      ...(field.linkage.sourceSubformKey
        ? { sourceSubformKey: field.linkage.sourceSubformKey }
        : {}),
      ...(Array.isArray(field.linkage.fieldMappings)
        ? {
            fieldMappings: field.linkage.fieldMappings.map((item) => ({
              sourceKey: item?.sourceKey || '',
              targetKey: item?.targetKey || '',
            })),
          }
        : {}),
    }
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
  return copied
}

function copySubformField(field) {
  const copied = cloneOneField(field)
  const keyMap = {}
  copied.fields = (field.fields || []).map((child) => {
    const childCopy = cloneOneField(child)
    keyMap[child.key] = childCopy.key
    return childCopy
  })
  for (const child of copied.fields) {
    remapCopiedKeys(child, keyMap)
  }
  if (copied.linkage?.fieldMappings) {
    copied.linkage.fieldMappings = copied.linkage.fieldMappings.map((item) => ({
      ...item,
      targetKey: keyMap[item.targetKey] || item.targetKey,
    }))
  }
  return copied
}

function addChildField(parentKey, item, beforeChildKey, afterChildKey) {
  const parent = findFieldByKey(fields.value, parentKey)
  if (!parent || parent.type !== 'subform') {
    return
  }
  if (!isSubformChildType(item.type)) {
    ElMessage.warning('该字段暂不支持添加到子表单')
    return
  }
  if (!Array.isArray(parent.fields)) {
    parent.fields = []
  }
  const field = createFieldFromItem(item, { child: true })
  if (beforeChildKey) {
    insertIntoList(parent.fields, field, beforeChildKey)
  } else if (afterChildKey) {
    insertAfterKey(parent.fields, field, afterChildKey)
  } else {
    parent.fields.push(field)
  }
  selectField(field)
}

function copyField(field) {
  const parent = findParentSubform(fields.value, field.key)
  const copied =
    field.type === 'subform' ? copySubformField(field) : cloneOneField(field)
  if (parent) {
    remapCopiedKeys(copied, { [field.key]: copied.key })
    const index = parent.fields.findIndex((item) => item.key === field.key)
    parent.fields.splice(index + 1, 0, copied)
    selectField(copied)
    return
  }
  const list = listContaining(field.key)
  if (!list) {
    return
  }
  const index = list.findIndex((item) => item.key === field.key)
  list.splice(index + 1, 0, copied)
  selectField(copied)
}

function moveChildField(childKey, direction) {
  const parent = findParentSubform(fields.value, childKey)
  if (!parent?.fields) {
    return
  }
  const index = parent.fields.findIndex((item) => item.key === childKey)
  const next = index + direction
  if (index < 0 || next < 0 || next >= parent.fields.length) {
    return
  }
  const [moved] = parent.fields.splice(index, 1)
  parent.fields.splice(next, 0, moved)
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

  const parent = findParentSubform(fields.value, field.key)
  if (parent) {
    parent.fields = parent.fields.filter((item) => item.key !== field.key)
    if (selectedKey.value === field.key) {
      selectedKey.value = parent.key
    }
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
  if (field.type === 'subform') {
    field.width = '1'
    if (!Array.isArray(field.fields)) field.fields = []
    if (field.defaultRowCount == null) field.defaultRowCount = 0
    if (field.frozenCols == null) field.frozenCols = 0
    if (!field.optionSource) field.optionSource = 'custom'
  }
  if (field.type === 'relate-subform') {
    field.width = '1'
    if (field.canViewDetail == null) field.canViewDetail = false
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
    return
  }
  const parent = findParentSubform(fields.value, field.key)
  if (parent) {
    const parentPane = paneIdOfField(fields.value, parent.key)
    if (parentPane) activePaneId.value = parentPane
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

let saveConfirmOpen = false

async function confirmSaveFields() {
  if (saveConfirmOpen) return
  saveConfirmOpen = true
  try {
    await ElMessageBox.confirm('当前是要保存配置吗？', '保存', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info',
    })
  } catch {
    return
  } finally {
    saveConfirmOpen = false
  }
  await saveFields()
}

function onPanelKeydown(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (event.code !== 'KeyS') return
  event.preventDefault()
  if (event.repeat) return
  confirmSaveFields()
}

onMounted(() => {
  window.addEventListener('keydown', onPanelKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onPanelKeydown)
})

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
    walkFormFields(fields.value, (field) => {
      if (field.type === 'relate-subform' || field.type === 'subform') {
        field.width = '1'
      }
      if (field.type === 'relate-subform' && field.canViewDetail == null) {
        field.canViewDetail = false
      }
    })
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
