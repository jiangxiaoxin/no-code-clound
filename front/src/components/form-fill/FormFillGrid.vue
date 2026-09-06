<template>
  <div class="fill-grid">
    <template v-for="field in fields" :key="field.key">
      <div v-if="isTabsField(field)" class="fill-tabs">
        <el-tabs :model-value="activePaneId" @tab-change="onTabChange">
          <el-tab-pane
            v-for="pane in field.panes"
            :key="pane.id"
            :name="pane.id"
            :label="pane.title"
          >
            <div class="fill-grid">
              <FormFillField
                v-for="paneField in visiblePaneFields(pane)"
                :key="paneField.key"
                :app-id="appId"
                :field="paneField"
                :fill-tip="fillTips[paneField.key]"
                :items="itemsFor(paneField)"
                :model-value="values[paneField.key]"
                :disabled="isFieldDisabled(paneField)"
                :updating="updating"
                :record-values="values"
                :form-fields="flatFields"
                :dict-items-by-code="dictItemsByCode"
                :user-names="fillUserNames"
                :dept-names="fillDeptNames"
                :record-id="recordId"
                :data-source="dataSource"
                @fill="onFill"
              />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
      <FormFillField
        v-else-if="accessOf(field) !== 'hidden'"
        :app-id="appId"
        :field="field"
        :fill-tip="fillTips[field.key]"
        :items="itemsFor(field)"
        :model-value="values[field.key]"
        :disabled="isFieldDisabled(field)"
        :updating="updating"
        :record-values="values"
        :form-fields="flatFields"
        :dict-items-by-code="dictItemsByCode"
        :user-names="fillUserNames"
        :dept-names="fillDeptNames"
        :record-id="recordId"
        :data-source="dataSource"
        @fill="onFill"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { queryFormRecordsApi } from '../../api/apps'
import { listOrgDepartmentsApi } from '../../api/org'
import { flattenDeptNames, isDeptField } from '../form-design/deptField.js'
import { fillInfluencerTips } from '../form-design/dataSelect'
import { isSelectType } from '../form-design/fieldTypes'
import { hasLinkage, hasSubformLinkage } from '../form-design/linkage'
import {
  flattenFields,
  findTabsField,
  isTabsField,
  paneIdOfField,
} from '../form-design/tabsField.js'
import FormFillField from './FormFillField.vue'
import { emptyValue } from './fillValues'
import {
  applyLinkageResult,
  applyPendingValueWrites,
  linkageConditionsReady,
  linkageManyMessage,
  linkageQueryPaging,
} from './linkageRuntime'
import { mapSourceSubformRows, walkFormFields } from './subformField.js'
import { addressFormatOf, regionJsonForFormat } from './addressField.js'
import { buildSourceQuery, recordsToSelectItems } from './tableOptions'

const props = defineProps({
  appId: { type: Number, default: 0 },
  fields: { type: Array, default: () => [] },
  values: { type: Object, required: true },
  dictItemsByCode: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false },
  updating: { type: Boolean, default: false },
  userNames: { type: Object, default: () => ({}) },
  deptNames: { type: Object, default: () => ({}) },
  recordId: { type: String, default: '' },
  fieldAccess: { type: Object, default: () => ({}) },
  dataSource: { type: Object, default: null },
  lockSubform: { type: Boolean, default: false },
})

const linkageUserNames = ref({})
const fillUserNames = computed(() => ({
  ...props.userNames,
  ...linkageUserNames.value,
}))
const localDeptNames = ref({})
const fillDeptNames = computed(() => ({
  ...localDeptNames.value,
  ...props.deptNames,
}))

function formHasDeptField(fields) {
  let found = false
  walkFormFields(fields, (field) => {
    if (isDeptField(field)) found = true
  })
  return found
}

async function loadDeptNames() {
  if (!formHasDeptField(props.fields)) return
  try {
    const tree = await listOrgDepartmentsApi()
    localDeptNames.value = flattenDeptNames(tree)
  } catch {
    localDeptNames.value = {}
  }
}

watch(
  () => props.fields,
  () => {
    loadDeptNames()
  },
  { immediate: true },
)

const fillTips = computed(() => fillInfluencerTips(props.fields))
const flatFields = computed(() => flattenFields(props.fields))
const tabsField = computed(() => findTabsField(props.fields))
const activePaneId = ref('')
const tableItemsByKey = ref({})
const linkageItemsByKey = ref({})
const pendingQueries = new Map()
let loadSeq = 0
let linkageSeq = 0
let loadTimer = 0
let loadPrimed = false
let lastLoadKeys = {}
let lastLinkageKeys = {}
let linkagePrimed = false

watch(
  tabsField,
  (tabs) => {
    const ids = (tabs?.panes || []).map((pane) => pane.id)
    if (!ids.includes(activePaneId.value)) {
      activePaneId.value = ids[0] || ''
    }
  },
  { immediate: true },
)

function revealField(key) {
  const paneId = paneIdOfField(props.fields, key)
  if (paneId) activePaneId.value = paneId
}

function onTabChange(name) {
  activePaneId.value = name
}

defineExpose({ revealField })

function resolveSourceFormId(field) {
  const n = Number(field.sourceFormId)
  return Number.isInteger(n) && n > 0 ? n : 0
}

function resolveLinkageFormId(field) {
  const n = Number(field.linkage?.sourceFormId)
  return Number.isInteger(n) && n > 0 ? n : 0
}

// 判断字段是否是select，并且配置了从别的表关联数据
function isTableSelect(field) {
  return (
    isSelectType(field.type) &&
    field.optionSource === 'table_data' &&
    resolveSourceFormId(field) &&
    field.sourceFieldKey
  )
}

function isLinkageField(field) {
  return hasLinkage(field)
}

function isSubformLinkageField(field) {
  return hasSubformLinkage(field)
}

const regionLoaders = {
  'sheng.json': () => import('@region/sheng.json'),
  'sheng-shi.json': () => import('@region/sheng-shi.json'),
  'sheng-shi-qu.json': () => import('@region/sheng-shi-qu.json'),
}

async function addressTreeOf(field) {
  if (field.type !== 'address') return undefined
  const file = regionJsonForFormat(addressFormatOf(field))
  const mod = await regionLoaders[file]()
  return mod.default || mod
}

function fieldLoadKey(field) {
  const refs = (field.optionFilters?.conditions || [])
    .filter((item) => item.valueType === 'field' && item.value)
    .map(
      (item) => `${item.value}=${JSON.stringify(props.values?.[item.value])}`,
    )
  return [
    resolveSourceFormId(field),
    field.sourceFieldKey,
    field.optionFilters?.match,
    JSON.stringify(field.optionFilters?.conditions || []),
    refs.join('&'),
  ].join(':')
}

function linkageFieldLoadKey(field) {
  const refs = (field.linkage?.conditions || [])
    .filter((item) => item.valueType === 'field' && item.value)
    .map(
      (item) => `${item.value}=${JSON.stringify(props.values?.[item.value])}`,
    )
  return [
    resolveLinkageFormId(field),
    field.linkage?.sourceKey,
    field.linkage?.match,
    JSON.stringify(field.linkage?.conditions || []),
    refs.join('&'),
  ].join(':')
}

const tableLoadKey = computed(() =>
  flatFields.value
    .filter(isTableSelect)
    .map((field) => `${field.key}:${fieldLoadKey(field)}`)
    .join('|'),
)

const linkageLoadKey = computed(() =>
  flatFields.value
    .filter(isLinkageField)
    .map((field) => `${field.key}:${linkageFieldLoadKey(field)}`)
    .join('|'),
)

const subformLinkageLoadKey = computed(() =>
  flatFields.value
    .filter(isSubformLinkageField)
    .map((field) => `${field.key}:${linkageFieldLoadKey(field)}:${field.linkage?.sourceSubformKey}`)
    .join('|'),
)

const loadKey = computed(
  () =>
    `${tableLoadKey.value}#${linkageLoadKey.value}#${subformLinkageLoadKey.value}#${props.disabled}`,
)

function itemsFor(field) {
  if (isTableSelect(field)) {
    return tableItemsByKey.value[field.key] || []
  }
  if (isLinkageField(field) && isSelectType(field.type)) {
    return linkageItemsByKey.value[field.key] || []
  }
  return props.dictItemsByCode[field.dictCode] || []
}

function onFill(patches) {
  if (!patches) return
  for (const [key, value] of Object.entries(patches)) {
    props.values[key] = value
  }
}

function hasFieldFilterRefs() {
  return flatFields.value.some((field) => {
    const conditions = isTableSelect(field)
      ? field.optionFilters?.conditions
      : isLinkageField(field)
        ? field.linkage?.conditions
        : null
    return (conditions || []).some(
      (item) => item.valueType === 'field' && item.value,
    )
  })
}

function accessOf(field) {
  return props.fieldAccess?.[field?.key] || ''
}

function isFieldDisabled(field) {
  if (props.disabled) return true
  if (field?.type === 'subform' && props.lockSubform) return true
  return accessOf(field) === 'readonly'
}

function visiblePaneFields(pane) {
  return (pane.fields || []).filter((field) => accessOf(field) !== 'hidden')
}

function queryRecordsOnce(appId, formId, query, fieldKey) {
  const key = `${appId}:${formId}:${fieldKey || ''}:${JSON.stringify(query)}`
  const hit = pendingQueries.get(key)
  if (hit) return hit
  const pending = (
    props.dataSource?.querySource
      ? props.dataSource.querySource({
          fieldKey,
          sourceFormId: formId,
          body: query,
        })
      : queryFormRecordsApi(appId, formId, {
          ...query,
          pickApproved: true,
        })
  )
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

function canWriteLinkageValue(field) {
  if (props.disabled) return false
  const access = accessOf(field)
  if (access === 'readonly' || access === 'hidden') return false
  if (props.updating && field.editable === false && access !== 'editable') {
    return false
  }
  return true
}

let lastSubformKeys = {}
let subformSeq = 0

async function loadSubformLinkages() {
  const seq = ++subformSeq
  if (props.disabled || (!props.appId && !props.dataSource)) {
    lastSubformKeys = {}
    return
  }
  const fields = flatFields.value.filter(isSubformLinkageField)
  const writeValues = shouldWriteLinkageValues()
  const nextKeys = {}
  const writes = []
  await Promise.all(
    fields.map(async (field) => {
      const key = `${linkageFieldLoadKey(field)}:${field.linkage?.sourceSubformKey}`
      nextKeys[field.key] = key
      if (lastSubformKeys[field.key] === key) {
        return
      }
      if (!writeValues || !canWriteLinkageValue(field)) {
        return
      }
      if (!linkageConditionsReady(field.linkage, props.values)) {
        writes.push({ key: field.key, value: [] })
        return
      }
      try {
        const result = await queryRecordsOnce(
          props.appId,
          resolveLinkageFormId(field),
          buildSourceQuery(
            {
              match: field.linkage.match,
              conditions: field.linkage.conditions,
            },
            props.values,
            flatFields.value,
            { page: 1, pageSize: 2 },
          ),
          field.key,
        )
        const total =
          typeof result?.total === 'number'
            ? result.total
            : result?.items?.length || 0
        if (total <= 0) {
          writes.push({ key: field.key, value: [] })
          return
        }
        if (total > 1) {
          writes.push({
            key: field.key,
            value: [],
            message: linkageManyMessage(field),
          })
          return
        }
        const sourceRows = result?.items?.[0]?.data?.[field.linkage.sourceSubformKey]
        const mapped = mapSourceSubformRows({
          sourceRows,
          mappings: field.linkage.fieldMappings,
          targetFields: field.fields,
        })
        writes.push({
          key: field.key,
          value: mapped,
          message:
            Array.isArray(sourceRows) && sourceRows.length > 200
              ? '子表单最多 200 行'
              : '',
        })
      } catch {
        writes.push({ key: field.key, value: [] })
      }
    }),
  )
  if (!applyPendingValueWrites(props.values, writes, seq, subformSeq)) {
    return
  }
  lastSubformKeys = nextKeys
  for (const item of writes) {
    if (item.message) {
      ElMessage.warning(item.message)
    }
  }
}

function shouldWriteLinkageValues() {
  return !props.disabled && (!props.updating || linkagePrimed)
}

function applyNotReady(field) {
  if (isSelectType(field.type)) {
    return []
  }
  return null
}

function pendingEmptyWrite(field, writeValues) {
  if (!writeValues || !canWriteLinkageValue(field)) return null
  return { key: field.key, value: emptyValue(field) }
}

async function loadTableItems() {
  const seq = ++loadSeq
  if (!props.appId && !props.dataSource) {
    tableItemsByKey.value = {}
    lastLoadKeys = {}
    return
  }
  const fields = flatFields.value.filter(isTableSelect)
  const next = { ...tableItemsByKey.value }
  const nextKeys = {}
  for (const key of Object.keys(next)) {
    if (!fields.some((field) => field.key === key)) {
      delete next[key]
    }
  }
  await Promise.all(
    fields.map(async (field) => {
      const key = fieldLoadKey(field)
      nextKeys[field.key] = key
      if (lastLoadKeys[field.key] === key) {
        return
      }
      lastLoadKeys[field.key] = key
      try {
        const result = await queryRecordsOnce(
          props.appId,
          resolveSourceFormId(field),
          buildSourceQuery(field.optionFilters, props.values, flatFields.value),
          field.key,
        )
        next[field.key] = recordsToSelectItems(
          result?.items,
          field.sourceFieldKey,
        )
      } catch {
        next[field.key] = []
      }
    }),
  )
  if (seq === loadSeq) {
    lastLoadKeys = nextKeys
    tableItemsByKey.value = next
  }
}

async function loadLinkage() {
  const seq = ++linkageSeq
  if (props.disabled || (!props.appId && !props.dataSource)) {
    linkagePrimed = false
    lastLinkageKeys = {}
    return
  }
  const fields = flatFields.value.filter(isLinkageField)
  const writeValues = shouldWriteLinkageValues()
  const next = { ...linkageItemsByKey.value }
  const nextKeys = {}
  const writes = []
  for (const key of Object.keys(next)) {
    if (!fields.some((field) => field.key === key)) {
      delete next[key]
    }
  }
  await Promise.all(
    fields.map(async (field) => {
      const key = linkageFieldLoadKey(field)
      nextKeys[field.key] = key
      if (lastLinkageKeys[field.key] === key) {
        return
      }
      if (!linkageConditionsReady(field.linkage, props.values)) {
        const items = applyNotReady(field)
        if (items) next[field.key] = items
        const emptyWrite = pendingEmptyWrite(field, writeValues)
        if (emptyWrite) writes.push(emptyWrite)
        return
      }
      try {
        if (props.dataSource?.linkage) {
          const query = buildSourceQuery(
            {
              match: field.linkage.match,
              conditions: field.linkage.conditions,
            },
            props.values,
            flatFields.value,
            linkageQueryPaging(field),
          )
          const mapped = await props.dataSource.linkage({
            fieldKey: field.key,
            body: { conditions: query.filters },
          })
          if (writeValues && canWriteLinkageValue(field)) {
            for (const [targetKey, value] of Object.entries(mapped?.data || {})) {
              writes.push({ key: targetKey, value })
            }
          }
          return
        }
        const result = await queryRecordsOnce(
          props.appId,
          resolveLinkageFormId(field),
          buildSourceQuery(
            {
              match: field.linkage.match,
              conditions: field.linkage.conditions,
            },
            props.values,
            flatFields.value,
            linkageQueryPaging(field),
          ),
          field.key,
        )
        const applied = applyLinkageResult(
          field,
          result,
          props.values[field.key],
          {
            addressTree:
              field.type === 'address' ? await addressTreeOf(field) : undefined,
          },
        )
        if (isSelectType(field.type)) {
          next[field.key] = applied.items
        }
        if (writeValues && canWriteLinkageValue(field)) {
          writes.push({
            key: field.key,
            value: applied.value,
            message: applied.message || '',
          })
        }
      } catch {
        const items = applyNotReady(field)
        if (items) next[field.key] = items
        const emptyWrite = pendingEmptyWrite(field, writeValues)
        if (emptyWrite) writes.push(emptyWrite)
      }
    }),
  )
  if (seq !== linkageSeq) {
    return
  }
  lastLinkageKeys = nextKeys
  linkageItemsByKey.value = next
  linkagePrimed = true
  applyPendingValueWrites(props.values, writes, seq, linkageSeq)
  for (const item of writes) {
    if (item.message) {
      ElMessage.warning(item.message)
    }
  }
}

function runLoads() {
  loadTableItems()
  loadSubformLinkages().then(() => loadLinkage())
}

watch(
  () => [props.appId, loadKey.value],
  () => {
    window.clearTimeout(loadTimer)
    // 做个延迟，避免频繁请求
    const delay = loadPrimed && hasFieldFilterRefs() ? 1000 : 0
    loadPrimed = true
    if (delay) {
      loadTimer = window.setTimeout(runLoads, delay)
    } else {
      runLoads()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  window.clearTimeout(loadTimer)
  loadSeq += 1
  linkageSeq += 1
  subformSeq += 1
})
</script>

<style scoped lang="less">
.fill-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 8px;
  min-height: 120px; // 设个最小高度，为空白标签页占个位，不要跟下面的内容连在一起
}

.fill-tabs {
  grid-column: span 12;
  min-width: 0;
}
</style>
