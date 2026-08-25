<template>
  <el-container class="form-body" direction="vertical">
    <FormDesignToolbar
      @clear="clearFields"
      @save="saveFields"
      @preview="previewVisible = true"
    />
    <el-container class="form-layout">
      <FormDesignPalette @add="addField" />
      <FormDesignCanvas
        :fields="fields"
        :selected-key="selectedKey"
        :dict-items-by-code="dictItemsByCode"
        @select="selectField"
        @copy="copyField"
        @remove="removeField"
        @reorder="reorderFields"
        @add="addField"
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
  >
    <div class="preview-json">{{ previewJson }}</div>
    <template #footer>
      <el-button @click="previewVisible = false">关闭</el-button>
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

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  initialFields: { type: Array, default: null },
  initialColumns: { type: Number, default: 1 },
})

const propTab = ref('field')
const previewVisible = ref(false)
const columns = ref(1)
const fields = ref([])
const selectedKey = ref('')
const dictItemsByCode = ref({})

const selectedField = computed(
  () => fields.value.find((field) => field.key === selectedKey.value) || null,
)

const previewJson = computed(() => JSON.stringify(fields.value, null, 2))

const dictCodes = computed(() => {
  const codes = []
  const seen = new Set()
  for (const field of fields.value) {
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

function addField(item, beforeKey) {
  const field = {
    key: nextKey(),
    type: item.type,
    component: item.component,
    title: item.label,
    placeholder: item.placeholder || '',
    width: item.type === 'divider' ? '1' : defaultWidthByColumns(columns.value),
    required: false,
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
  }
  if (beforeKey) {
    const index = fields.value.findIndex((entry) => entry.key === beforeKey)
    fields.value.splice(index < 0 ? fields.value.length : index, 0, field)
  } else {
    fields.value.push(field)
  }
  selectField(field)
}

function copyField(field) {
  const copied = {
    ...field,
    key: nextKey(),
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

  fields.value = fields.value.filter((item) => item.key !== field.key)
  if (selectedKey.value === field.key) {
    selectedKey.value = fields.value.at(-1)?.key || ''
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
}

function selectField(field) {
  ensureOptionSource(field)
  selectedKey.value = field.key
  propTab.value = 'field'
}

function setFieldWidth(width) {
  if (!selectedField.value) {
    return
  }
  selectedField.value.width = width
}

function reorderFields(fromKey, toKey) {
  const from = fields.value.findIndex((item) => item.key === fromKey)
  const to = fields.value.findIndex((item) => item.key === toKey)
  if (from < 0 || to < 0 || from === to) {
    return
  }
  const [moved] = fields.value.splice(from, 1)
  fields.value.splice(to, 0, moved)
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
}

async function saveFields() {
  try {
    await saveFormFieldsApi(props.appId, props.formId, {
      fields: fields.value,
      columns: columns.value,
    })
    ElMessage.success('保存成功')
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
  () => [props.initialFields, props.initialColumns],
  () => {
    fields.value = cloneFields(props.initialFields)
    columns.value =
      props.initialColumns === 2 ||
      props.initialColumns === 3 ||
      props.initialColumns === 4
        ? props.initialColumns
        : 1
    selectedKey.value = ''
  },
  { immediate: true },
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
