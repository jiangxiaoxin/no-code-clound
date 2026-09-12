<template>
  <el-dialog
    :model-value="modelValue"
    width="min(920px, 92vw)"
    align-center
    draggable
    append-to-body
    destroy-on-close
    class="my-dialog formula-help-dialog"
    body-class="my-dialog-body"
    @update:model-value="onDialogVisible"
  >
    <template #header="{ titleId, titleClass }">
      <span :id="titleId" :class="[titleClass, 'formula-help-head']">函数帮助文档</span>
    </template>
    <div class="formula-help-body">
      <div class="formula-help-list">
        <el-input
          v-model="keyword"
          class="formula-help-search"
          size="small"
          placeholder="搜索函数"
          clearable
          :prefix-icon="Search"
        />
        <el-scrollbar class="formula-help-list-body">
          <template v-for="group in groups" :key="group.label">
            <div class="formula-help-group">{{ group.label }}</div>
            <button
              v-for="item in group.items"
              :key="item.name"
              type="button"
              class="formula-help-item"
              :class="{ 'is-active': item.name === active.name }"
              @click="selectFunction(item.name)"
            >
              {{ item.name }}
            </button>
          </template>
          <div v-if="!groups.length" class="formula-help-empty">没有匹配的函数</div>
        </el-scrollbar>
      </div>
      <el-scrollbar class="formula-help-detail">
        <div class="formula-help-title">
          <span class="formula-help-name">{{ active.name }}</span>
          <el-tag size="small" type="info" effect="plain">{{ active.categoryLabel }}</el-tag>
        </div>
        <div class="formula-help-signature">{{ active.signature }}</div>
        <p class="formula-help-desc">{{ active.description }}</p>
        <p v-for="(tip, index) in active.tips" :key="index" class="formula-help-tip">
          {{ tip }}
        </p>

        <div class="formula-help-section">参数</div>
        <p v-if="!active.paramNames.length" class="formula-help-none">这个函数不用填参数。</p>
        <div v-for="(name, index) in active.paramNames" :key="index" class="formula-help-param">
          <span class="formula-help-param-name">{{ name }}</span>
          <span class="formula-help-param-desc">{{ active.params[index] }}</span>
        </div>

        <div class="formula-help-section">返回值</div>
        <p class="formula-help-none">{{ active.returns }}</p>

        <div class="formula-help-section">使用示例</div>
        <div v-for="(example, index) in active.examples" :key="index" class="formula-help-example">
          <div class="formula-help-example-expr">{{ example.expr }}</div>
          <div class="formula-help-example-note">
            <span>{{ example.note }}</span>
            <span v-if="example.expectText" class="formula-help-example-result">
              结果：{{ example.expectText }}
            </span>
          </div>
        </div>
        <p class="formula-help-foot">
          示例里的字段（如「单价」「明细.金额」）只是示意，实际用时从左侧「字段」栏点选插入。
        </p>
      </el-scrollbar>
    </div>
    <template #footer>
      <el-button type="primary" @click="closeDialog">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { buildFormulaHelp, FORMULA_CATEGORY_LABELS } from './formulaHelp.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const keyword = ref('')
const activeName = ref('')

const help = computed(() => buildFormulaHelp())

const groups = computed(() => {
  const word = keyword.value.trim()
  const lowered = word.toLowerCase()
  const items = word
    ? help.value.filter(
        (item) =>
          item.name.toLowerCase().includes(lowered) ||
          item.signature.toLowerCase().includes(lowered) ||
          item.description.includes(word),
      )
    : help.value
  return Object.entries(FORMULA_CATEGORY_LABELS)
    .map(([category, label]) => ({
      label,
      items: items.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length)
})

const active = computed(
  () => help.value.find((item) => item.name === activeName.value) || help.value[0],
)

function selectFunction(name) {
  activeName.value = name
}

function onDialogVisible(value) {
  emit('update:modelValue', value)
}

function closeDialog() {
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    keyword.value = ''
    activeName.value = help.value[0]?.name || ''
  },
)
</script>

<style scoped lang="less">
.formula-help-head {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  color: var(--el-text-color-primary);
}

.formula-help-body {
  display: flex;
  align-items: stretch;
  height: 440px;
}

.formula-help-list {
  display: flex;
  flex-direction: column;
  flex: none;
  width: 200px;
  margin-right: 16px;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.formula-help-search {
  flex: none;
  padding: 8px 10px 4px;
}

.formula-help-list-body {
  flex: 1;
  height: auto;
  min-height: 0;

  :deep(.el-scrollbar__view) {
    padding: 4px 8px 10px;
  }
}

.formula-help-group {
  margin: 8px 0 4px;
  padding-left: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-help-item {
  display: block;
  width: 100%;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-text-color-regular);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 6px;
  transition: color 0.15s, background-color 0.15s;

  &:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color-light);
  }

  &.is-active {
    font-weight: 600;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.formula-help-empty {
  padding: 20px 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}

.formula-help-detail {
  flex: 1;
  height: auto;
  min-width: 0;
  min-height: 0;
  padding: 0 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;

  :deep(.el-scrollbar__view) {
    padding: 12px 4px 16px;
  }
}

.formula-help-title {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.formula-help-name {
  margin-right: 8px;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  color: var(--el-text-color-primary);
}

.formula-help-signature {
  padding: 6px 10px;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-color-primary);
  word-break: break-all;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
}

.formula-help-desc {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-text-color-regular);
}

.formula-help-tip {
  margin: 6px 0 0;
  padding-left: 10px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-color-warning);
  border-left: 2px solid var(--el-color-warning-light-5);
}

.formula-help-section {
  margin: 16px 0 6px;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  color: var(--el-text-color-primary);
}

.formula-help-param {
  display: flex;
  align-items: flex-start;
  margin-bottom: 4px;
  font-size: 12px;
  line-height: 18px;
}

.formula-help-param-name {
  flex: none;
  width: 88px;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  color: var(--el-text-color-primary);
}

.formula-help-param-desc {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-secondary);
}

.formula-help-none {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-help-example {
  margin-bottom: 8px;
  padding: 8px 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}

.formula-help-example-expr {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-color-primary);
  word-break: break-all;
}

.formula-help-example-note {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-help-example-result {
  flex: none;
  margin-left: 8px;
  color: var(--el-color-success);
}

.formula-help-foot {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-placeholder);
}
</style>
