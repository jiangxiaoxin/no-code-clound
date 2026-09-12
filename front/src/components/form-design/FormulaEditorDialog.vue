<template>
  <el-dialog
    :model-value="modelValue"
    width="min(1040px, 94vw)"
    align-center
    draggable
    destroy-on-close
    class="my-dialog formula-editor-dialog"
    body-class="my-dialog-body"
    @update:model-value="onDialogVisible"
  >
    <template #header="{ titleId, titleClass }">
      <div class="formula-head">
        <span :id="titleId" :class="[titleClass, 'formula-head-title']">{{ dialogTitle }}</span>
        <el-tag v-if="fieldTypeText" size="small" type="info" effect="plain">
          {{ fieldTypeText }}
        </el-tag>
      </div>
    </template>
    <div class="formula-body">
      <div class="formula-palette">
        <div class="formula-block">
          <div class="formula-block-head">
            <span class="formula-block-title">函数</span>
            <span class="formula-block-note">悬停看说明</span>
          </div>
          <el-input
            v-model="functionKeyword"
            class="formula-block-search"
            size="small"
            placeholder="搜索函数"
            clearable
            :prefix-icon="Search"
          />
          <el-scrollbar class="formula-block-body">
            <div
              v-for="group in filteredFunctionGroups"
              :key="group.label"
              class="formula-group"
            >
              <div class="formula-group-title">{{ group.label }}</div>
              <div class="formula-chips">
                <el-tooltip
                  v-for="fn in group.items"
                  :key="fn.name"
                  :content="fn.summary"
                  placement="right"
                  :show-after="200"
                  popper-class="formula-fn-popper"
                >
                  <button type="button" class="formula-chip" @click="insertFunction(fn)">
                    {{ fn.name }}
                  </button>
                </el-tooltip>
              </div>
            </div>
            <div v-if="!filteredFunctionGroups.length" class="formula-empty">
              没有匹配的函数
            </div>
          </el-scrollbar>
        </div>
        <div class="formula-block">
          <div class="formula-block-head">
            <span class="formula-block-title">字段</span>
            <span class="formula-block-note">点一下就插进公式</span>
          </div>
          <el-input
            v-model="fieldKeyword"
            class="formula-block-search"
            size="small"
            placeholder="搜索字段"
            clearable
            :prefix-icon="Search"
          />
          <el-scrollbar class="formula-block-body">
            <div
              v-for="group in filteredRefGroups"
              :key="group.label"
              class="formula-group"
            >
              <div class="formula-group-title">{{ group.label }}</div>
              <div class="formula-chips">
                <button
                  v-for="item in group.items"
                  :key="item.token"
                  type="button"
                  class="formula-chip is-field"
                  :title="item.label"
                  @click="insertFieldRef(item)"
                >
                  <span class="formula-chip-text">{{ item.label }}</span>
                  <span v-if="chipTypeText(item)" class="formula-chip-type">
                    {{ chipTypeText(item) }}
                  </span>
                </button>
              </div>
            </div>
            <div v-if="!filteredRefGroups.length" class="formula-empty">
              {{ fieldEmptyText }}
            </div>
          </el-scrollbar>
        </div>
      </div>
      <div class="formula-main">
        <div class="formula-editor">
          <div class="formula-editor-bar">
            <span class="formula-editor-label">公式内容</span>
            <div class="formula-editor-actions">
              <span class="formula-count">{{ expr.length }} / 2000</span>
              <el-button v-if="rawExpr" link type="primary" @click="clearExpr">
                清空
              </el-button>
              <el-button v-if="expr" link type="primary" @click="toggleRaw">
                {{ showRaw ? '收起原始内容' : '原始内容' }}
              </el-button>
            </div>
          </div>
          <FormulaExpressionEditor
            ref="exprEditor"
            v-model="rawExpr"
            :ref-groups="refGroups"
            :ref-labels="refLabels"
            placeholder="例如：CONCATENATE('订单-', $'商品名称')"
          />
        </div>
        <div class="formula-status" :class="validation.ok ? 'is-ok' : 'is-error'">
          <el-icon>
            <CircleCheckFilled v-if="validation.ok" />
            <WarningFilled v-else />
          </el-icon>
          <span>{{ statusText }}</span>
        </div>
        <div class="formula-refs">
          <div class="formula-refs-label">已引用字段</div>
          <div v-if="refs.length" class="formula-refs-items">
            <el-tag v-for="ref in refs" :key="ref" size="small" type="info" effect="plain">
              {{ refLabel(ref) }}
            </el-tag>
          </div>
          <div v-else class="formula-refs-empty">还没引用字段</div>
        </div>
        <div v-if="showRaw && expr" class="formula-raw">
          <div class="formula-raw-title">原始内容（存库写法，字段是 key）</div>
          <div class="formula-raw-body">{{ expr }}</div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="formula-footer">
        <el-button :icon="QuestionFilled" @click="openHelp">帮助文档</el-button>
        <div class="formula-footer-buttons">
          <el-button @click="closeDialog">取消</el-button>
          <el-button type="primary" :disabled="!validation.ok" @click="onConfirm">
            确定
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
  <FormulaHelpDialog v-model="helpVisible" />
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { CircleCheckFilled, QuestionFilled, Search, WarningFilled } from '@element-plus/icons-vue'
import { FORMULA_FUNCTIONS } from '../form-fill/formula/evaluator.js'
import {
  buildFormulaRefGroups,
  buildFormulaRefLabels,
  validateFormulaConfig,
  formulaFromDisplay,
} from './formulaField.js'
import FormulaExpressionEditor from './FormulaExpressionEditor.vue'
import FormulaHelpDialog from './FormulaHelpDialog.vue'
import { fieldTypeLabel } from './fieldTypes.js'

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

const functionKeyword = ref('')
const fieldKeyword = ref('')
const showRaw = ref(false)
const helpVisible = ref(false)
const exprEditor = ref(null)

// 编辑器里字段是一颗颗 token（显示标题），拿到的表达式里是字段 key
const rawExpr = ref('')
const refLabels = computed(() => buildFormulaRefLabels(props.fields, props.field))
const expr = computed(() => formulaFromDisplay(rawExpr.value, refLabels.value))

const dialogTitle = computed(() => `计算公式 · ${props.field?.title || '未命名'}`)

const fieldTypeText = computed(() => fieldTypeLabel(props.field?.type))

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

const filteredFunctionGroups = computed(() => {
  const word = functionKeyword.value.trim().toLowerCase()
  if (!word) return functionGroups.value
  return functionGroups.value
    .map((group) => ({
      label: group.label,
      items: group.items.filter(
        (fn) =>
          fn.name.toLowerCase().includes(word) ||
          String(fn.summary || '').toLowerCase().includes(word),
      ),
    }))
    .filter((group) => group.items.length)
})

const filteredRefGroups = computed(() => {
  const word = fieldKeyword.value.trim().toLowerCase()
  if (!word) return refGroups.value
  return refGroups.value
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) =>
        String(item.label || '').toLowerCase().includes(word),
      ),
    }))
    .filter((group) => group.items.length)
})

const fieldEmptyText = computed(() =>
  fieldKeyword.value.trim() ? '没有匹配的字段' : '暂无可引用字段',
)

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
  return refLabels.value.byPath.get(ref) || ref
}

// 字段标题默认就是类型名时，不再重复显示类型
function chipTypeText(item) {
  const typeText = fieldTypeLabel(item.type)
  return typeText === item.label ? '' : typeText
}

function onDialogVisible(value) {
  emit('update:modelValue', value)
}

function closeDialog() {
  emit('update:modelValue', false)
}

// 点左侧按钮时输入框可能没有焦点，交给编辑器自己插到光标处（没光标就插到末尾）
function insertFieldRef(item) {
  exprEditor.value?.insertField(item)
}

function insertFunction(fn) {
  exprEditor.value?.insertFunction(fn)
}

function clearExpr() {
  exprEditor.value?.clear()
}

function toggleRaw() {
  showRaw.value = !showRaw.value
}

function openHelp() {
  helpVisible.value = true
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
    rawExpr.value = props.field?.formula?.expr || ''
    functionKeyword.value = ''
    fieldKeyword.value = ''
    showRaw.value = false
    nextTick(() => exprEditor.value?.focus())
  },
)
</script>

<style scoped lang="less">
.formula-head {
  display: flex;
  align-items: center;
}

.formula-head-title {
  margin-right: 8px;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  color: var(--el-text-color-primary);
}

.formula-body {
  display: flex;
  align-items: stretch;
  height: 440px;
}

.formula-palette {
  display: flex;
  flex: none;
  margin-right: 12px;
}

.formula-block {
  display: flex;
  flex-direction: column;
  flex: none;
  width: 246px;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;

  & + .formula-block {
    margin-left: 12px;
  }
}

.formula-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 5px 12px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.formula-block-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  color: var(--el-text-color-primary);
}

.formula-block-note {
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-placeholder);
}

.formula-block-search {
  flex: none;
  padding: 8px 12px 2px;
}

.formula-block-body {
  flex: 1;
  height: auto;
  min-height: 0;

  :deep(.el-scrollbar__view) {
    padding: 8px 12px 10px;
  }
}

.formula-group + .formula-group {
  margin-top: 12px;
}

.formula-group-title {
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.formula-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 8px;
  font-family: inherit;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  background: var(--el-fill-color-light);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;

  &:hover {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-7);
  }

  &.is-field {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-8);

    &:hover {
      background: var(--el-color-primary-light-8);
      border-color: var(--el-color-primary-light-5);
    }
  }
}

.formula-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.formula-chip-type {
  flex: none;
  margin-left: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.formula-empty {
  padding: 20px 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}

.formula-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.formula-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus-within {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
  }
}

.formula-editor-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 4px 8px 4px 12px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.formula-editor-label {
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-secondary);
}

.formula-editor-actions {
  display: flex;
  align-items: center;
}

.formula-count {
  margin-right: 12px;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-placeholder);
}

.formula-status {
  display: flex;
  align-items: flex-start;
  flex: none;
  margin-top: 10px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 18px;
  border-radius: 6px;

  .el-icon {
    flex: none;
    margin-right: 6px;
    font-size: 14px;
    line-height: 18px;
  }

  &.is-ok {
    color: var(--el-color-success);
    background: var(--el-color-success-light-9);
  }

  &.is-error {
    color: var(--el-color-danger);
    background: var(--el-color-danger-light-9);
  }
}

.formula-refs {
  flex: none;
  margin-top: 12px;
}

.formula-refs-label {
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-refs-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.formula-refs-empty {
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-placeholder);
}

.formula-raw {
  flex: none;
  margin-top: 12px;
}

.formula-raw-title {
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-raw-body {
  max-height: 84px;
  padding: 6px 8px;
  overflow: auto;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-regular);
  word-break: break-all;
  white-space: pre-wrap;
  user-select: text;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.formula-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.formula-footer-buttons {
  display: flex;
}
</style>
