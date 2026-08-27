<template>
  <el-dialog
    :model-value="modelValue"
    title="添加过滤条件"
    width="840px"
    align-center
    draggable
    destroy-on-close
    class="my-dialog"
    body-class="my-dialog-body"
    @update:model-value="onDialogVisible"
  >
    <p class="filter-desc">{{ description }}</p>
    <FormFilterConditions
      :filters="draft"
      :app-id="appId"
      :source-fields="sourceFields"
      :form-fields="formFields"
    />
    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, watch } from 'vue'
import FormFilterConditions from './FormFilterConditions.vue'
import {
  cloneOptionFilters,
  emptyCondition,
  withFilterSystemFields,
} from './optionFilters'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, default: 0 },
  optionFilters: { type: Object, default: null },
  sourceFields: { type: Array, default: () => [] },
  formFields: { type: Array, default: () => [] },
  description: { type: String, default: '添加过滤条件来限定选项内容' },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const draft = reactive(cloneOptionFilters(null))

function findSourceType(key) {
  return withFilterSystemFields(props.sourceFields).find((field) => field.key === key)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const next = cloneOptionFilters(props.optionFilters)
    draft.match = next.match
    draft.conditions = next.conditions.length
      ? next.conditions
      : [emptyCondition()]
    for (const item of draft.conditions) {
      const field = item.key ? findSourceType(item.key) : null
      if (!item.sourceType && field) {
        item.sourceType = field.type || ''
      }
      if (!item.sourceFormat && field) {
        item.sourceFormat = field.format || ''
      }
      if (item.op === 'dynamic' && (!item.value || typeof item.value !== 'object' || Array.isArray(item.value))) {
        item.value = { start: [], end: [] }
      }
      if (item.op === 'between' && !Array.isArray(item.value)) {
        item.value = []
      }
    }
  },
)

function onDialogVisible(value) {
  emit('update:modelValue', value)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function onConfirm() {
  const conditions = draft.conditions.filter((item) => item.key)
  emit('confirm', conditions.length ? { match: draft.match, conditions } : null)
  emit('update:modelValue', false)
}
</script>

<style scoped lang="less">
.filter-desc {
  margin: 0 0 16px;
  color: var(--el-text-color-regular);
}
</style>
