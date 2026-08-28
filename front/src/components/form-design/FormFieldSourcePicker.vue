<template>
  <div class="source-picker">
    <el-popover
      v-model:visible="open"
      placement="bottom-start"
      :fallback-placements="['top-start', 'bottom-start']"
      :width="popperWidth"
      :offset="4"
      :show-arrow="false"
      :hide-after="0"
      trigger="click"
      :popper-style="{ padding: '8px' }"
      @show="onPopoverShow"
    >
      <template #reference>
        <div
          ref="triggerRef"
          class="source-picker-trigger"
          :class="{ 'is-open': open, 'is-placeholder': !displayText }"
        >
          <span class="source-picker-value">{{ displayText || '请选择表字段' }}</span>
          <el-icon class="source-picker-arrow"><ArrowDown /></el-icon>
        </div>
      </template>
      <div class="source-picker-panel">
        <el-input
          v-model="keyword"
          size="small"
          clearable
          placeholder="搜索表名"
        />
        <div v-if="loadError" class="source-picker-status">加载失败</div>
        <div v-else-if="!treeData.length" class="source-picker-status">暂无已保存的表单</div>
        <el-tree
          v-else
          class="source-picker-tree"
          :data="treeData"
          node-key="id"
          :props="{ label: 'label', children: 'children' }"
          :expand-on-click-node="true"
          :highlight-current="true"
          @node-click="onNodeClick"
        />
      </div>
    </el-popover>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { listFormFieldsApi } from '../../api/apps'
import { fieldTypeLabel } from './fieldTypes'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  sourceFormId: { type: Number, default: null },
  sourceFieldKey: { type: String, default: '' },
})

const emit = defineEmits(['select'])

const triggerRef = ref(null)
const open = ref(false)
const popperWidth = ref(288)
const keyword = ref('')
const loadError = ref(false)
const loaded = ref(false)
const forms = ref([])

const displayText = computed(() => {
  if (!props.sourceFormId || !props.sourceFieldKey) {
    return ''
  }
  const form = forms.value.find(
    (item) => Number(item.id) === Number(props.sourceFormId),
  )
  const field = form?.fields.find((item) => item.key === props.sourceFieldKey)
  if (form && field) {
    return `${form.name} / ${field.title || field.key}`
  }
  if (!loaded.value) {
    return ''
  }
  return '已选字段不可用'
})

const treeData = computed(() => {
  const q = keyword.value.trim()
  return forms.value
    .filter((form) => !q || form.name.includes(q))
    .map((form) => ({
      id: `form-${form.id}`,
      label: form.name,
      disabled: true,
      children: form.fields
        .filter((field) => field.type !== 'image' && field.type !== 'file')
        .map((field) => ({
          id: `${form.id}:${field.key}`,
          formId: form.id,
          fieldKey: field.key,
          label: `${field.title || field.key}（${fieldTypeLabel(field.type)}）`,
        })),
    }))
    .filter((form) => form.children.length)
})

async function loadForms() {
  loadError.value = false
  try {
    const rows = (await listFormFieldsApi(props.appId, {
      excludeFormId: props.formId,
    })) || []
    forms.value = rows.filter(
      (form) => Number(form.id) !== Number(props.formId),
    )
  } catch {
    forms.value = []
    loadError.value = true
  } finally {
    loaded.value = true
  }
}

function onPopoverShow() {
  keyword.value = ''
  popperWidth.value = triggerRef.value?.offsetWidth || 288
  loadForms()
}

function onNodeClick(node) {
  if (!node.fieldKey) {
    return
  }
  emit('select', { formId: node.formId, fieldKey: node.fieldKey })
  open.value = false
}

onMounted(() => {
  if (props.sourceFormId) {
    loadForms()
  }
})

watch(
  () => [props.appId, props.formId],
  () => {
    forms.value = []
    if (open.value || props.sourceFormId) {
      loadForms()
    }
  },
)
</script>

<style scoped lang="less">
.source-picker {
  width: 100%;
}

.source-picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  cursor: pointer;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}

.source-picker-trigger.is-open {
  border-color: var(--el-color-primary);
}

.source-picker-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-picker-trigger.is-placeholder .source-picker-value {
  color: var(--el-text-color-placeholder);
}

.source-picker-arrow {
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
}

.source-picker-status {
  padding: 12px 0;
  color: var(--el-text-color-placeholder);
  text-align: center;
  font-size: 13px;
}

.source-picker-tree {
  margin-top: 8px;
  height: min(240px, 40vh);
  overflow: auto;
}

.source-picker-tree :deep(.el-tree-node.is-disabled > .el-tree-node__content) {
  cursor: default;
  color: var(--el-text-color-regular);
  background: transparent;
}
</style>
