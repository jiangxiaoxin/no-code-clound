<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="880px"
    align-center
    draggable
    destroy-on-close
    class="my-dialog formula-editor-dialog"
    body-class="my-dialog-body"
    @update:model-value="onDialogVisible"
  >
    <div class="formula-body">
      <div class="formula-side">
        <div class="formula-side-block">
          <div class="formula-side-label">函数</div>
          <div class="formula-options">
            <div
              v-for="group in functionGroups"
              :key="group.label"
              class="formula-option-group"
            >
              <div class="formula-option-group-label">{{ group.label }}</div>
              <div class="formula-option-items">
                <span
                  v-for="fn in group.items"
                  :key="fn.name"
                  class="formula-option-item"
                  :title="fn.summary"
                  @click="insertFunction(fn.name)"
                >
                  {{ fn.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="formula-side-block">
          <div class="formula-side-label">字段</div>
          <div class="formula-options">
            <div
              v-for="group in refGroups"
              :key="group.label"
              class="formula-option-group"
            >
              <div class="formula-option-group-label">{{ group.label }}</div>
              <div class="formula-option-items">
                <span
                  v-for="item in group.items"
                  :key="item.token"
                  class="formula-option-item"
                  :title="item.label"
                  @click="insertText(item.token)"
                >
                  {{ item.label }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="formula-main">
        <el-input
          ref="exprInput"
          v-model="expr"
          type="textarea"
          :rows="8"
          maxlength="2000"
          show-word-limit
          placeholder="点击左侧函数和字段插入公式，引用字段写作 $'字段key'"
        />
        <div class="formula-status" :class="{ 'is-error': !validation.ok }">
          {{ statusText }}
        </div>
        <div v-if="validation.ok && refs.length" class="formula-refs">
          <span v-for="ref in refs" :key="ref" class="formula-ref-item">
            {{ refLabel(ref) }}
          </span>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" :disabled="!validation.ok" @click="onConfirm">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { FORMULA_FUNCTIONS } from '../form-fill/formula/evaluator.js'
import { buildFormulaRefGroups, validateFormulaConfig } from './formulaField.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  field: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'save'])

const FUNCTION_CATEGORY_LABELS = {
  math: '数学',
  logic: '逻辑',
  text: '文本',
  date: '日期',
  aggregate: '聚合',
}

const expr = ref('')
const exprInput = ref(null)

const dialogTitle = computed(() => `计算公式 · ${props.field?.title || '未命名'}`)

const functionGroups = computed(() => {
  const groups = []
  for (const label of Object.values(FUNCTION_CATEGORY_LABELS)) {
    groups.push({ label, items: [] })
  }
  const byLabel = new Map(groups.map((group) => [group.label, group]))
  for (const fn of FORMULA_FUNCTIONS) {
    byLabel.get(FUNCTION_CATEGORY_LABELS[fn.category])?.items.push(fn)
  }
  return groups.filter((group) => group.items.length)
})

const refGroups = computed(() => buildFormulaRefGroups(props.fields, props.field))

const validation = computed(() => {
  const text = String(expr.value || '')
  if (text.trim() === '') {
    return { ok: false, message: '请填写公式' }
  }
  return validateFormulaConfig(text, {
    field: props.field,
    fields: props.fields,
  })
})

const refs = computed(() => (validation.value.ok ? validation.value.refs : []))

const statusText = computed(() =>
  validation.value.ok ? '公式可以保存' : validation.value.message,
)

function refLabel(ref) {
  for (const group of refGroups.value) {
    const found = group.items.find((item) => item.path.join('.') === ref)
    if (found) return found.label
  }
  return ref
}

function onDialogVisible(value) {
  emit('update:modelValue', value)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function insertText(text, caretOffset = text.length) {
  const el = exprInput.value?.textarea
  const current = String(expr.value || '')
  if (!el) {
    expr.value = current + text
    return
  }
  const start = el.selectionStart ?? current.length
  const end = el.selectionEnd ?? current.length
  expr.value = current.slice(0, start) + text + current.slice(end)
  nextTick(() => {
    el.focus()
    const caret = start + caretOffset
    el.setSelectionRange(caret, caret)
  })
}

function insertFunction(name) {
  const text = `${name}()`
  insertText(text, text.length - 1)
}

function onConfirm() {
  if (!validation.value.ok) return
  emit('save', { expr: expr.value.trim(), refs: refs.value })
  closeDialog()
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    expr.value = props.field?.formula?.expr || ''
    nextTick(() => exprInput.value?.focus())
  },
)
</script>

<style scoped lang="less">
.formula-body {
  display: flex;
  align-items: stretch;
  min-height: 360px;
}

.formula-side {
  display: flex;
  flex-direction: column;
  width: 240px;
  margin-right: 16px;
}

.formula-side-block {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.formula-side-label {
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-text-color-secondary);
}

.formula-options {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}

.formula-option-group + .formula-option-group {
  margin-top: 12px;
}

.formula-option-group-label {
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-option-items {
  display: flex;
  flex-wrap: wrap;
}

.formula-option-item {
  display: inline-block;
  max-width: 100%;
  margin: 0 6px 6px 0;
  padding: 2px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
}

.formula-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.formula-status {
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-status.is-error {
  color: var(--el-color-danger);
}

.formula-refs {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8px;
}

.formula-ref-item {
  margin: 0 8px 4px 0;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
}
</style>
