<template>
  <el-dialog
    :model-value="modelValue"
    title="添加过滤条件"
    width="720px"
    align-center
    draggable
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    class="my-dialog"
    body-class="my-dialog-body"
  >
    <p class="filter-desc">添加过滤条件来限定选项内容</p>
    <div class="filter-match">
      <span>符合以下</span>
      <el-select v-model="draft.match" class="filter-match-select" size="small">
        <el-option
          v-for="item in FILTER_MATCH_OPTIONS"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <span>条件的数据</span>
    </div>
    <el-button class="filter-add" type="primary" link :icon="Plus" @click="addCondition">
      添加过滤条件
    </el-button>
    <div class="filter-rows">
      <div v-for="(item, index) in draft.conditions" :key="index" class="filter-row">
        <el-select
          v-model="item.key"
          class="filter-field"
          size="small"
          placeholder="请选择字段"
        >
          <el-option
            v-for="field in sourceFields"
            :key="field.key"
            :label="field.title || field.key"
            :value="field.key"
          />
        </el-select>
        <el-select v-model="item.op" class="filter-op" size="small">
          <el-option
            v-for="op in FILTER_OPS"
            :key="op.value"
            :label="op.label"
            :value="op.value"
          />
        </el-select>
        <div v-if="needsFilterValue(item.op)" class="filter-value">
          <el-button
            size="small"
            :icon="item.valueType === 'field' ? Tickets : EditPen"
            :title="item.valueType === 'field' ? '当前表单字段' : '自定义值'"
            @click="setValueType(item, item.valueType === 'field' ? 'custom' : 'field')"
          />
          <el-select
            v-if="item.valueType === 'field'"
            v-model="item.value"
            size="small"
            placeholder="当前表单字段"
          >
            <el-option
              v-for="field in formFields"
              :key="field.key"
              :label="field.title || field.key"
              :value="field.key"
            />
          </el-select>
          <el-select
            v-else-if="dictItemsFor(item).length"
            v-model="item.value"
            size="small"
            placeholder="请选择"
            clearable
          >
            <el-option
              v-for="opt in dictItemsFor(item)"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-input
            v-else
            v-model="item.value"
            size="small"
            placeholder="自定义值"
          />
        </div>
        <div v-else class="filter-value" />
        <el-button
          class="filter-remove"
          type="danger"
          link
          :icon="Delete"
          @click="draft.conditions.splice(index, 1)"
        />
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { Delete, EditPen, Plus, Tickets } from '@element-plus/icons-vue'
import { listDictionaryItemsByCodesApi } from '../../api/apps'
import {
  FILTER_MATCH_OPTIONS,
  FILTER_OPS,
  cloneOptionFilters,
  emptyCondition,
  mapDictFilterValue,
  needsFilterValue,
  sourceFieldDictCode,
} from './optionFilters'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, default: 0 },
  optionFilters: { type: Object, default: null },
  sourceFields: { type: Array, default: () => [] },
  formFields: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const draft = reactive(cloneOptionFilters(null))
const dictItemsByCode = ref({})
let loadSeq = 0

function dictItemsFor(item) {
  if (item.valueType !== 'custom') return []
  const field = props.sourceFields.find((field) => field.key === item.key)
  return dictItemsByCode.value[sourceFieldDictCode(field)] || []
}

function normalizeDraftValues() {
  for (const item of draft.conditions) {
    if (item.valueType !== 'custom') continue
    item.value = mapDictFilterValue(item.value, dictItemsFor(item))
  }
}

async function loadDictItems() {
  const seq = ++loadSeq
  const codes = []
  const seen = new Set()
  for (const field of props.sourceFields) {
    const code = sourceFieldDictCode(field)
    if (!code || seen.has(code)) continue
    seen.add(code)
    codes.push(code)
  }
  if (!props.appId || !codes.length) {
    dictItemsByCode.value = {}
    return
  }
  try {
    const rows = (await listDictionaryItemsByCodesApi(props.appId, codes)) || []
    if (seq !== loadSeq) return
    const next = {}
    for (const row of rows) {
      next[row.code] = row.items || []
    }
    dictItemsByCode.value = next
    normalizeDraftValues()
  } catch {
    if (seq === loadSeq) {
      dictItemsByCode.value = {}
    }
  }
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
    loadDictItems()
  },
)

watch(
  () => [props.appId, props.sourceFields],
  () => {
    if (props.modelValue) loadDictItems()
  },
)

function addCondition() {
  draft.conditions.push(emptyCondition())
}

function setValueType(item, valueType) {
  item.valueType = valueType
  item.value = ''
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

.filter-match {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-match-select {
  width: 88px;
}

.filter-add {
  padding: 0;
  margin-bottom: 12px;
}

.filter-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-row {
  display: flex;
  align-items: center;
}

.filter-field {
  flex: 1 1 0;
  min-width: 0;
  margin-right: 8px;
}

.filter-op {
  width: 112px;
  margin-right: 8px;
}

.filter-value {
  display: flex;
  flex: 1.4 1 0;
  align-items: center;
  min-width: 0;
  margin-right: 8px;
  gap: 8px;
}

.filter-value :deep(.el-select),
.filter-value :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.filter-remove {
  flex-shrink: 0;
}
</style>
