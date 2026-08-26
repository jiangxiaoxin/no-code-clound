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
          @change="onFilterFieldChange(item)"
        >
          <el-option
            v-for="field in filterFields"
            :key="field.key"
            :label="field.title || field.key"
            :value="field.key"
          />
        </el-select>
        <el-select
          v-model="item.op"
          class="filter-op"
          size="small"
          @change="onFilterOpChange(item)"
        >
          <el-option
            v-for="op in opsFor(item)"
            :key="op.value"
            :label="op.label"
            :value="op.value"
          />
        </el-select>
        <div v-if="needsFilterValue(item.op)" class="filter-value">
          <template v-if="isTimeFilterRow(item)">
            <el-date-picker
              v-if="item.op === 'between' && fieldTypeOf(item) === 'date'"
              v-model="item.value"
              class="filter-range"
              type="daterange"
              size="small"
              unlink-panels
              start-placeholder="开始"
              end-placeholder="结束"
              value-format="YYYY-MM-DD"
            />
            <el-date-picker
              v-else-if="item.op === 'between' && fieldTypeOf(item) === 'datetime'"
              v-model="item.value"
              class="filter-range"
              type="datetimerange"
              size="small"
              unlink-panels
              start-placeholder="开始"
              end-placeholder="结束"
              format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss"
            />
            <el-time-picker
              v-else-if="item.op === 'between'"
              v-model="item.value"
              class="filter-range"
              is-range
              size="small"
              start-placeholder="开始"
              end-placeholder="结束"
              :format="timeFormatOf(item)"
              :value-format="timeFormatOf(item)"
            />
            <div v-else-if="item.op === 'dynamic'" class="filter-dynamic">
              <el-cascader
                v-model="item.value.start"
                :options="DYNAMIC_FILTER_OPTIONS"
                :props="cascaderProps"
                filterable
                clearable
                size="small"
                placeholder="开始"
              />
              <el-cascader
                v-model="item.value.end"
                :options="DYNAMIC_FILTER_OPTIONS"
                :props="cascaderProps"
                filterable
                clearable
                size="small"
                placeholder="结束"
              />
            </div>
            <el-select
              v-else
              v-model="item.value"
              size="small"
              placeholder="当前表单同类型字段"
            >
              <el-option
                v-for="field in sameTypeFormFields(item)"
                :key="field.key"
                :label="field.title || field.key"
                :value="field.key"
              />
            </el-select>
          </template>
          <template v-else>
            <el-button
              size="small"
              :icon="item.valueType === 'field' ? Tickets : EditPen"
              :title="item.valueType === 'field' ? '当前表单字段' : '自定义值'"
              @click="toggleValueType(item)"
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
          </template>
        </div>
        <div v-else class="filter-value" />
        <el-button
          class="filter-remove"
          type="danger"
          link
          :icon="Delete"
          @click="removeCondition(index)"
        />
      </div>
    </div>
    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Delete, EditPen, Plus, Tickets } from '@element-plus/icons-vue'
import { listDictionaryItemsByCodesApi } from '../../api/apps'
import {
  DYNAMIC_FILTER_OPTIONS,
  FILTER_MATCH_OPTIONS,
  cloneOptionFilters,
  emptyCondition,
  emptyValueForOp,
  isTimeFilterField,
  mapDictFilterValue,
  needsFilterValue,
  opsForFieldType,
  sourceFieldDictCode,
  valueTypeForTimeOp,
  withFilterSystemFields,
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
const cascaderProps = { expandTrigger: 'hover' }
const filterFields = computed(() => withFilterSystemFields(props.sourceFields))
let loadSeq = 0

function findFilterField(key) {
  return filterFields.value.find((field) => field.key === key)
}

function fieldTypeOf(item) {
  if (item.sourceType) return item.sourceType
  return findFilterField(item.key)?.type || ''
}

function isTimeFilterRow(item) {
  return isTimeFilterField(fieldTypeOf(item))
}

function opsFor(item) {
  return opsForFieldType(fieldTypeOf(item))
}

function timeFormatOf(item) {
  return findFilterField(item.key)?.format || 'HH:mm:ss'
}

function sameTypeFormFields(item) {
  const type = fieldTypeOf(item)
  return (props.formFields || []).filter((field) => field.type === type)
}

function applyTimeOp(item, op) {
  item.op = op
  item.valueType = valueTypeForTimeOp(op)
  item.value = emptyValueForOp(op)
}

function onFilterFieldChange(item) {
  const field = findFilterField(item.key)
  item.sourceType = field?.type || ''
  item.sourceFormat = field?.format || ''
  if (isTimeFilterField(item.sourceType)) {
    applyTimeOp(item, 'between')
    return
  }
  item.op = 'eq'
  item.valueType = 'custom'
  item.value = ''
}

function onFilterOpChange(item) {
  if (!isTimeFilterRow(item)) return
  applyTimeOp(item, item.op)
}

function toggleValueType(item) {
  item.valueType = item.valueType === 'field' ? 'custom' : 'field'
  item.value = ''
}

function dictItemsFor(item) {
  if (item.valueType !== 'custom') return []
  const field = props.sourceFields.find((field) => field.key === item.key)
  return dictItemsByCode.value[sourceFieldDictCode(field)] || []
}

function normalizeDraftValues() {
  for (const item of draft.conditions) {
    if (item.valueType !== 'custom') continue
    if (typeof item.value !== 'string') continue
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
    for (const item of draft.conditions) {
      const field = item.key ? findFilterField(item.key) : null
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

function removeCondition(index) {
  draft.conditions.splice(index, 1)
}

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
  width: 128px;
  margin-right: 8px;
}

.filter-value {
  display: flex;
  flex: 1.6 1 0;
  align-items: center;
  min-width: 0;
  margin-right: 8px;
  gap: 8px;
}

.filter-value :deep(.el-select),
.filter-value :deep(.el-input),
.filter-value :deep(.el-date-editor),
.filter-range {
  flex: 1;
  min-width: 0;
}

.filter-dynamic {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.filter-dynamic :deep(.el-cascader) {
  flex: 1;
  min-width: 0;
}

.filter-remove {
  flex-shrink: 0;
}
</style>
