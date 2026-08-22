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
        @select="selectField"
        @copy="copyField"
        @remove="removeField"
        @reorder="reorderFields"
        @add="addField"
      />
      <FormDesignProps
        v-model:tab="propTab"
        :field="selectedField"
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
    <el-input
      type="textarea"
      :rows="18"
      readonly
      :model-value="previewJson"
    />
    <template #footer>
      <el-button @click="previewVisible = false">关闭</el-button>
      <el-button type="primary" @click="copyPreviewJson">复制</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FormDesignToolbar from './form-design/FormDesignToolbar.vue'
import FormDesignPalette from './form-design/FormDesignPalette.vue'
import FormDesignCanvas from './form-design/FormDesignCanvas.vue'
import FormDesignProps from './form-design/FormDesignProps.vue'

const propTab = ref('field')
const previewVisible = ref(false)
const fields = ref([])
const selectedKey = ref('')

const selectedField = computed(
  () => fields.value.find((field) => field.key === selectedKey.value) || null,
)

const previewJson = computed(() => JSON.stringify(fields.value, null, 2))

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
    placeholder: item.type === 'input' ? '请输入' : '',
    width: '1',
    required: true,
    description: '',
    ...(item.type === 'number' ? { rangeEnabled: false, precision: 0 } : {}),
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

function selectField(field) {
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

function saveFields() {
  ElMessage.success('保存成功')
}
</script>

<style scoped lang="less">
.form-body {
  min-height: 0;
}

.form-layout {
  min-height: 0;
}
</style>
