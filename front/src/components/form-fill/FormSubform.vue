<template>
  <div class="subform">
    <div v-if="!children.length" class="subform-empty">
      请先在表单设计中添加子字段
    </div>
    <template v-else>
      <el-table
        :data="rows"
        border
        size="small"
        class="subform-table"
        :row-key="rowKey"
      >
        <el-table-column
          v-if="!locked"
          label="操作"
          width="168"
          fixed="right"
        >
          <template #default="{ $index }">
            <!-- <el-button link type="primary" :disabled="atLimit" @click="insertRow($index)">
              插入
            </el-button>
            <el-button link type="primary" :disabled="atLimit" @click="copyRow($index)">
              复制
            </el-button> -->
            <el-button link type="danger" @click="removeRow($index)">删除</el-button>
          </template>
        </el-table-column>
        <el-table-column
          v-for="(child, colIndex) in children"
          :key="child.key"
          :min-width="child.type === 'textarea' ? 220 : 160"
          :fixed="colIndex < frozenCols ? 'left' : false"
        >
          <template #header>
            <span class="subform-col-title">
              <span v-if="child.required" class="subform-required">*</span>
              <span>{{ child.title }}</span>
            </span>
          </template>
          <template #default="{ row, $index }">
            <FormFillField
              class="subform-cell"
              :class="{
                'is-subform-image': child.type === 'image',
                'is-subform-file': child.type === 'file',
                'is-subform-data': child.type === 'data',
              }"
              plain
              :app-id="appId"
              :field="child"
              :items="itemsFor(child, row)"
              :model-value="row[child.key]"
              :disabled="locked || Boolean(child.disabled)"
              :updating="updating"
              :record-values="rowValues(row)"
              :form-fields="rowFormFields"
              :user-names="fillUserNames"
              :multiple="isDataMultiple(child, row)"
              :compact="child.type === 'data'"
              @update:model-value="onCellChange($index, child.key, $event)"
              @fill-rows="onFillRows($index, child, $event)"
            />
          </template>
        </el-table-column>
      </el-table>
      <el-button
        v-if="!locked"
        class="subform-add"
        :disabled="atLimit"
        @click="addRow"
        type="primary"
        size="small"
      >
        添加
      </el-button>
    </template>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { hasLinkage } from '../form-design/linkage'
import { isSelectType } from '../form-design/fieldTypes'
import FormFillField from './FormFillField.vue'
import {
  applyCellWrites,
  emptySubformRow,
  shouldSubformDataSelectMultiple,
} from './subformField.js'
import {
  applyLinkageResult,
  linkageConditionsReady,
  linkageQueryPaging,
} from './linkageRuntime'
import { queryFormRecordsApi } from '../../api/apps'
import {
  buildSourceQuery,
  optionFieldLoadKey,
  recordsToSelectItems,
} from './tableOptions'

const SUBFORM_MAX_ROWS = 200

const props = defineProps({
  appId: { type: Number, default: 0 },
  field: { type: Object, required: true },
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  updating: { type: Boolean, default: false },
  recordValues: { type: Object, default: () => ({}) },
  formFields: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  linkageItemsByKey: { type: Object, default: () => ({}) },
  userNames: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

const linkageUserNames = ref({})
const fillUserNames = computed(() => ({
  ...props.userNames,
  ...linkageUserNames.value,
}))

const children = computed(() =>
  Array.isArray(props.field.fields) ? props.field.fields : [],
)

const locked = computed(
  () =>
    props.disabled ||
    Boolean(props.field.disabled) ||
    (props.updating && props.field.editable === false),
)

const frozenCols = computed(() => {
  const n = Number(props.field.frozenCols)
  return Number.isInteger(n) ? Math.min(5, Math.max(0, n)) : 0
})

const rows = ref([])
let uid = 0
let syncing = false
const linkageItems = ref({})
const tableItems = ref({})
const pendingQueries = new Map()
let linkageTimer = 0
let linkagePrimed = false
let lastLinkageKeys = {}
let tableSeq = 0
let rowLinkageSeq = 0

function nextUid() {
  uid += 1
  return uid
}

function wrapRow(row, uidValue) {
  return {
    ...emptySubformRow(children.value),
    ...(row && typeof row === 'object' ? row : {}),
    __uid: uidValue ?? nextUid(),
  }
}

function plainRows(list) {
  return list.map((row) => {
    const next = { ...row }
    delete next.__uid
    return next
  })
}

function commit(next) {
  rows.value = next
  syncing = true
  emit('update:modelValue', plainRows(next))
  syncing = false
}

watch(
  () => props.modelValue,
  (value) => {
    if (syncing) {
      return
    }
    const list = Array.isArray(value) ? value : []
    const prev = rows.value
    rows.value = list.map((row, index) => wrapRow(row, prev[index]?.__uid))
  },
  { immediate: true },
)

const atLimit = computed(() => rows.value.length >= SUBFORM_MAX_ROWS)

const rowFormFields = computed(() => [
  ...(props.formFields || []),
  ...children.value,
])

function rowKey(row) {
  return row.__uid
}

function rowValues(row) {
  const next = { ...props.recordValues }
  for (const child of children.value) {
    next[child.key] = row[child.key]
  }
  return next
}

function itemsFor(child, row) {
  if (hasLinkage(child) && isSelectType(child.type)) {
    return linkageItems.value[`${row.__uid}:${child.key}`] || []
  }
  if (isTableSelect(child)) {
    return tableItems.value[tableCacheKey(child, rowValues(row))] || []
  }
  return props.dictItemsByCode[child.dictCode] || []
}

function resolveSourceFormId(field) {
  const n = Number(field.sourceFormId)
  return Number.isInteger(n) && n > 0 ? n : 0
}

function isTableSelect(child) {
  return (
    isSelectType(child.type) &&
    child.optionSource === 'table_data' &&
    resolveSourceFormId(child) &&
    child.sourceFieldKey
  )
}

function tableCacheKey(child, values) {
  return `${props.appId}:${optionFieldLoadKey(child, values)}`
}

function linkageConditionKey(child, values) {
  const refs = (child.linkage?.conditions || [])
    .filter((item) => item.valueType === 'field' && item.value)
    .map((item) => `${item.value}=${JSON.stringify(values[item.value])}`)
  return [
    child.linkage?.sourceFormId,
    child.linkage?.sourceKey,
    child.linkage?.match,
    refs.join('&'),
  ].join(':')
}

const tableLoadSignature = computed(() => {
  const keys = new Set()
  for (const row of rows.value) {
    const values = rowValues(row)
    for (const child of children.value.filter(isTableSelect)) {
      keys.add(tableCacheKey(child, values))
    }
  }
  return [...keys].sort().join('|')
})

const linkageLoadSignature = computed(() => {
  if (props.disabled) {
    return `off:${props.appId}`
  }
  const linked = children.value.filter((child) => hasLinkage(child))
  if (!linked.length) {
    return 'none'
  }
  return rows.value
    .map((row, index) =>
      linked
        .map((child) => `${index}:${child.key}:${linkageConditionKey(child, rowValues(row))}`)
        .join(','),
    )
    .join('|')
})

const optionLoadKey = computed(
  () => `${props.appId}#${props.disabled}#${tableLoadSignature.value}#${linkageLoadSignature.value}`,
)

function isDataMultiple(child, row) {
  if (child.type !== 'data') {
    return false
  }
  return shouldSubformDataSelectMultiple({
    filters: child.optionFilters,
    rowHasId: Boolean(row[child.key]),
    childKeys: children.value.map((item) => item.key),
  })
}

function warnLimit() {
  ElMessage.warning('子表单最多 200 行')
}

function addRow() {
  if (atLimit.value) {
    warnLimit()
    return
  }
  commit([...rows.value, wrapRow(emptySubformRow(children.value))])
}

function insertRow(index) {
  if (atLimit.value) {
    warnLimit()
    return
  }
  const next = rows.value.slice()
  next.splice(index, 0, wrapRow(emptySubformRow(children.value)))
  commit(next)
}

function copyRow(index) {
  if (atLimit.value) {
    warnLimit()
    return
  }
  const source = rows.value[index]
  const copied = wrapRow(plainRows([source])[0])
  const next = rows.value.slice()
  next.splice(index + 1, 0, copied)
  commit(next)
}

function removeRow(index) {
  const next = rows.value.slice()
  next.splice(index, 1)
  commit(next)
}

function onCellChange(index, key, value) {
  const next = rows.value.slice()
  next[index] = { ...next[index], [key]: value }
  commit(next)
}

function onFillRows(index, child, items) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) {
    return
  }
  const next = rows.value.slice()
  const room = SUBFORM_MAX_ROWS - next.length + 1
  const kept = list.slice(0, Math.max(0, room))
  if (kept.length < list.length) {
    warnLimit()
  }
  kept.forEach((item, offset) => {
    const base =
      offset === 0
        ? { ...next[index] }
        : wrapRow(emptySubformRow(children.value))
    base[child.key] = item.id
    Object.assign(base, item.patches || {})
    if (offset === 0) {
      next[index] = base
    } else {
      next.splice(index + offset, 0, base)
    }
  })
  if (next.length > SUBFORM_MAX_ROWS) {
    commit(next.slice(0, SUBFORM_MAX_ROWS))
    warnLimit()
    return
  }
  commit(next)
}

function queryRecordsOnce(appId, formId, query) {
  const key = `${appId}:${formId}:${JSON.stringify(query)}`
  const hit = pendingQueries.get(key)
  if (hit) {
    return hit
  }
  const pending = queryFormRecordsApi(appId, formId, query)
    .then((result) => {
      const extra = result?.userNames
      if (extra && typeof extra === 'object') {
        linkageUserNames.value = { ...linkageUserNames.value, ...extra }
      }
      return result
    })
    .finally(() => {
      pendingQueries.delete(key)
    })
  pendingQueries.set(key, pending)
  return pending
}

async function loadTableItems() {
  const seq = ++tableSeq
  if (!props.appId) {
    tableItems.value = {}
    return
  }
  const needed = new Map()
  for (const row of rows.value) {
    const values = rowValues(row)
    for (const child of children.value.filter(isTableSelect)) {
      const key = tableCacheKey(child, values)
      if (!needed.has(key)) {
        needed.set(key, { child, values })
      }
    }
  }
  const nextItems = { ...tableItems.value }
  for (const key of Object.keys(nextItems)) {
    if (!needed.has(key)) {
      delete nextItems[key]
    }
  }
  await Promise.all(
    [...needed.entries()].map(async ([key, { child, values }]) => {
      if (Array.isArray(nextItems[key])) {
        return
      }
      try {
        const result = await queryRecordsOnce(
          props.appId,
          resolveSourceFormId(child),
          buildSourceQuery(
            child.optionFilters,
            values,
            rowFormFields.value,
          ),
        )
        nextItems[key] = recordsToSelectItems(
          result?.items,
          child.sourceFieldKey,
        )
      } catch {
        nextItems[key] = []
      }
    }),
  )
  if (seq !== tableSeq) {
    return
  }
  tableItems.value = nextItems
}

function canWriteChild(child) {
  if (props.disabled) {
    return false
  }
  if (props.updating && (props.field.editable === false || child.editable === false)) {
    return false
  }
  return true
}

async function loadRowLinkages() {
  const seq = ++rowLinkageSeq
  if (!props.appId || props.disabled) {
    linkagePrimed = false
    lastLinkageKeys = {}
    return
  }
  const nextItems = { ...linkageItems.value }
  const nextKeys = {}
  const writes = []
  const messages = []
  const writeValues = !props.disabled && (!props.updating || linkagePrimed)
  await Promise.all(
    rows.value.flatMap((row) =>
      children.value
        .filter((child) => hasLinkage(child))
        .map(async (child) => {
          const values = rowValues(row)
          const key = linkageConditionKey(child, values)
          const itemKey = `${row.__uid}:${child.key}`
          nextKeys[itemKey] = key
          if (lastLinkageKeys[itemKey] === key) {
            return
          }
          if (!linkageConditionsReady(child.linkage, values)) {
            if (isSelectType(child.type)) {
              nextItems[itemKey] = []
            }
            return
          }
          try {
            const result = await queryRecordsOnce(
              props.appId,
              Number(child.linkage.sourceFormId),
              buildSourceQuery(
                {
                  match: child.linkage.match,
                  conditions: child.linkage.conditions,
                },
                values,
                rowFormFields.value,
                linkageQueryPaging(child),
              ),
            )
            const applied = applyLinkageResult(child, result, row[child.key])
            if (isSelectType(child.type)) {
              nextItems[itemKey] = applied.items
            }
            if (writeValues && canWriteChild(child)) {
              if (row[child.key] !== applied.value) {
                writes.push({
                  uid: row.__uid,
                  key: child.key,
                  value: applied.value,
                })
              }
              if (applied.message) {
                messages.push(applied.message)
              }
            }
          } catch {
            if (isSelectType(child.type)) {
              nextItems[itemKey] = []
            }
          }
        }),
    ),
  )
  if (seq !== rowLinkageSeq) {
    return
  }
  lastLinkageKeys = nextKeys
  linkageItems.value = nextItems
  linkagePrimed = true
  if (writes.length) {
    commit(applyCellWrites(rows.value, writes))
  }
  for (const message of messages) {
    ElMessage.warning(message)
  }
}

watch(optionLoadKey, () => {
  window.clearTimeout(linkageTimer)
  const delay = linkagePrimed ? 1000 : 0
  if (delay) {
    linkageTimer = window.setTimeout(runChildOptionLoads, delay)
  } else {
    runChildOptionLoads()
  }
}, { immediate: true })

function runChildOptionLoads() {
  loadTableItems()
  loadRowLinkages()
}

onUnmounted(() => {
  window.clearTimeout(linkageTimer)
  tableSeq += 1
  rowLinkageSeq += 1
})
</script>

<style scoped lang="less">
.subform {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.subform-empty {
  padding: 16px 8px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  text-align: center;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}

.subform-col-title {
  display: flex;
  align-items: center;
}

.subform-required {
  margin-right: 4px;
  color: var(--el-color-danger);
}

.subform-add {
  margin-top: 8px;
  align-self: flex-start;
}

.subform-cell.is-subform-image :deep(.el-upload--picture-card) {
  width: 64px;
  height: 64px;
}

.subform-cell.is-subform-image :deep(.el-upload-list--picture-card .el-upload-list__item) {
  width: 64px;
  height: 64px;
}

.subform-cell.is-subform-data :deep(.data-select-preview) {
  margin-top: 4px;
  font-size: 12px;
}

.subform-cell.is-subform-file :deep(.el-upload-list__item-name) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
