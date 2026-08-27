<template>
  <div class="filter-editor" :class="{ 'is-comfortable': comfortable }">
    <div class="filter-match">
      <span v-if="required" class="filter-required">*</span>
      <span>{{ matchLead }}</span>
      <el-select
        v-model="filters.match"
        class="filter-match-select"
        :size="controlSize"
      >
        <el-option
          v-for="item in FILTER_MATCH_OPTIONS"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <span>{{ matchTail }}</span>
    </div>
    <el-button class="filter-add" type="primary" link :icon="Plus" @click="addCondition">
      添加过滤条件
    </el-button>
    <div class="filter-rows">
      <div v-for="(item, index) in filters.conditions" :key="index" class="filter-row">
        <FieldSelect
          v-model="item.key"
          class="filter-field"
          :fields="filterFields"
          :size="controlSize"
          :disabled="locked"
          placeholder="联动表字段"
          @change="onFilterFieldChange(item)"
        />
        <el-select
          v-model="item.op"
          class="filter-op"
          :size="controlSize"
          :disabled="locked"
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
              :size="controlSize"
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
              :size="controlSize"
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
              :size="controlSize"
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
                :size="controlSize"
                placeholder="开始"
              />
              <el-cascader
                v-model="item.value.end"
                :options="DYNAMIC_FILTER_OPTIONS"
                :props="cascaderProps"
                filterable
                clearable
                :size="controlSize"
                placeholder="结束"
              />
            </div>
            <FieldSelect
              v-else
              v-model="item.value"
              :fields="sameTypeFormFields(item)"
              :size="controlSize"
              :disabled="locked"
              placeholder="当前表单同类型字段"
            />
          </template>
          <template v-else>
            <el-button
              class="filter-type-btn"
              :size="controlSize"
              :icon="item.valueType === 'field' ? Tickets : EditPen"
              :title="item.valueType === 'field' ? '当前表单字段' : '自定义值'"
              :disabled="locked"
              @click="toggleValueType(item)"
            />
            <FieldSelect
              v-if="item.valueType === 'field'"
              v-model="item.value"
              :fields="compatibleFormFields(item)"
              :size="controlSize"
              :disabled="locked"
              placeholder="当前表单字段"
            />
            <el-select
              v-else-if="dictItemsFor(item).length"
              v-model="item.value"
              :size="controlSize"
              :disabled="locked"
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
              :size="controlSize"
              :disabled="locked"
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
          :disabled="locked"
          @click="removeCondition(index)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, EditPen, Plus, Tickets } from '@element-plus/icons-vue'
import { listDictionaryItemsByCodesApi } from '../../api/apps'
import FieldSelect from './FieldSelect.vue'
import { compatibleCurrentFields } from './linkage'
import {
  DYNAMIC_FILTER_OPTIONS,
  FILTER_MATCH_OPTIONS,
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
  filters: { type: Object, required: true },
  appId: { type: Number, default: 0 },
  sourceFields: { type: Array, default: () => [] },
  formFields: { type: Array, default: () => [] },
  matchLead: { type: String, default: '符合以下' },
  matchTail: { type: String, default: '条件的数据' },
  required: { type: Boolean, default: false },
  comfortable: { type: Boolean, default: false },
  preferFieldValue: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  lockedHint: { type: String, default: '请先选择联动表单' },
})

const dictItemsByCode = ref({})
const cascaderProps = { expandTrigger: 'hover' }
const filterFields = computed(() => withFilterSystemFields(props.sourceFields))
const controlSize = computed(() => (props.comfortable ? 'default' : 'small'))
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

function compatibleFormFields(item) {
  return compatibleCurrentFields(props.formFields, fieldTypeOf(item))
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
  item.valueType = props.preferFieldValue ? 'field' : 'custom'
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
  for (const item of props.filters.conditions || []) {
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

function addCondition() {
  if (props.locked) {
    ElMessage.warning(props.lockedHint)
    return
  }
  if (!Array.isArray(props.filters.conditions)) {
    props.filters.conditions = []
  }
  props.filters.conditions.push(
    emptyCondition(props.preferFieldValue ? 'field' : 'custom'),
  )
}

function removeCondition(index) {
  props.filters.conditions.splice(index, 1)
}

watch(
  () => [props.appId, props.sourceFields],
  () => {
    loadDictItems()
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
.filter-match {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.filter-required {
  color: var(--el-color-danger);
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

.filter-editor.is-comfortable .filter-rows {
  gap: 12px;
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
  flex: 0 0 108px;
  width: 108px;
  margin-right: 8px;
}

.filter-value {
  display: flex;
  flex: 1.2 1 0;
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

.filter-type-btn {
  flex-shrink: 0;
  padding: 0 8px;
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
