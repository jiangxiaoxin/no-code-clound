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
                v-for="paneField in pane.fields"
                :key="paneField.key"
                :app-id="appId"
                :field="paneField"
                :fill-tip="fillTips[paneField.key]"
                :items="itemsFor(paneField)"
                :model-value="values[paneField.key]"
                :disabled="disabled"
                :updating="updating"
                :record-values="values"
                :form-fields="flatFields"
                :dict-items-by-code="dictItemsByCode"
                :user-names="userNames"
                @fill="onFill"
              />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
      <FormFillField
        v-else
        :app-id="appId"
        :field="field"
        :fill-tip="fillTips[field.key]"
        :items="itemsFor(field)"
        :model-value="values[field.key]"
        :disabled="disabled"
        :updating="updating"
        :record-values="values"
        :form-fields="flatFields"
        :dict-items-by-code="dictItemsByCode"
        :user-names="userNames"
        @fill="onFill"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { queryFormRecordsApi } from '../../api/apps'
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
  linkageConditionsReady,
  linkageManyMessage,
  linkageQueryPaging,
} from './linkageRuntime'
import { mapSourceSubformRows } from './subformField.js'
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
})

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

function queryRecordsOnce(appId, formId, query) {
  const key = `${appId}:${formId}:${JSON.stringify(query)}`
  const hit = pendingQueries.get(key)
  if (hit) return hit
  const pending = queryFormRecordsApi(appId, formId, query).finally(() => {
    pendingQueries.delete(key)
  })
  pendingQueries.set(key, pending)
  return pending
}

function canWriteLinkageValue(field) {
  if (props.disabled) return false
  if (props.updating && field.editable === false) return false
  return true
}

let lastSubformKeys = {}
let subformSeq = 0

async function loadSubformLinkages() {
  const seq = ++subformSeq
  if (props.disabled || !props.appId) {
    lastSubformKeys = {}
    return
  }
  const fields = flatFields.value.filter(isSubformLinkageField)
  const writeValues = shouldWriteLinkageValues()
  const nextKeys = {}
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
        props.values[field.key] = []
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
        )
        const total =
          typeof result?.total === 'number'
            ? result.total
            : result?.items?.length || 0
        if (total <= 0) {
          props.values[field.key] = []
          return
        }
        if (total > 1) {
          props.values[field.key] = []
          ElMessage.warning(linkageManyMessage(field))
          return
        }
        const sourceRows = result?.items?.[0]?.data?.[field.linkage.sourceSubformKey]
        const mapped = mapSourceSubformRows({
          sourceRows,
          mappings: field.linkage.fieldMappings,
          targetFields: field.fields,
        })
        if (Array.isArray(sourceRows) && sourceRows.length > 200) {
          ElMessage.warning('子表单最多 200 行')
        }
        props.values[field.key] = mapped
      } catch {
        props.values[field.key] = []
      }
    }),
  )
  if (seq === subformSeq) {
    lastSubformKeys = nextKeys
  }
}

function shouldWriteLinkageValues() {
  return !props.disabled && (!props.updating || linkagePrimed)
}

function applyNotReady(field, writeValues) {
  if (isSelectType(field.type)) {
    return []
  }
  if (writeValues && canWriteLinkageValue(field)) {
    props.values[field.key] = emptyValue(field)
  }
  return null
}

async function loadTableItems() {
  const seq = ++loadSeq
  if (!props.appId) {
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
  if (props.disabled || !props.appId) {
    linkagePrimed = false
    lastLinkageKeys = {}
    return
  }
  const fields = flatFields.value.filter(isLinkageField)
  const writeValues = shouldWriteLinkageValues()
  const next = { ...linkageItemsByKey.value }
  const nextKeys = {}
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
        const items = applyNotReady(field, writeValues)
        if (items) next[field.key] = items
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
            linkageQueryPaging(field),
          ),
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
          props.values[field.key] = applied.value
          if (applied.message) {
            ElMessage.warning(applied.message)
          }
        }
      } catch {
        const items = applyNotReady(field, writeValues)
        if (items) next[field.key] = items
      }
    }),
  )
  if (seq === linkageSeq) {
    lastLinkageKeys = nextKeys
    linkageItemsByKey.value = next
    linkagePrimed = true
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
}

.fill-tabs {
  grid-column: span 12;
  min-width: 0;
}
</style>
