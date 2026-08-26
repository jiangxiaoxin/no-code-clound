<template>
  <div class="fill-grid">
    <FormFillField
      v-for="field in fields"
      :key="field.key"
      :app-id="appId"
      :field="field"
      :items="itemsFor(field)"
      :model-value="values[field.key]"
      :disabled="disabled"
      @update:model-value="values[field.key] = $event"
      @fill="onFill"
    />
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { queryFormRecordsApi } from '../../api/apps'
import { isSelectType } from '../form-design/fieldTypes'
import FormFillField from './FormFillField.vue'
import { buildSourceQuery, recordsToSelectItems } from './tableOptions'

const props = defineProps({
  appId: { type: Number, default: 0 },
  fields: { type: Array, default: () => [] },
  values: { type: Object, required: true },
  dictItemsByCode: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false },
})

const tableItemsByKey = ref({})
const pendingQueries = new Map()
let loadSeq = 0
let loadTimer = 0
let loadPrimed = false
let lastLoadKeys = {}

function resolveSourceFormId(field) {
  const n = Number(field.sourceFormId)
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

const loadKey = computed(() =>
  props.fields
    .filter(isTableSelect)
    .map((field) => `${field.key}:${fieldLoadKey(field)}`)
    .join('|'),
)

function itemsFor(field) {
  if (isTableSelect(field)) {
    return tableItemsByKey.value[field.key] || []
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
  return props.fields.some(
    (field) =>
      isTableSelect(field) &&
      (field.optionFilters?.conditions || []).some(
        (item) => item.valueType === 'field' && item.value,
      ),
  )
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

async function loadTableItems() {
  const seq = ++loadSeq
  if (!props.appId) {
    tableItemsByKey.value = {}
    lastLoadKeys = {}
    return
  }
  const fields = props.fields.filter(isTableSelect)
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
          buildSourceQuery(field.optionFilters, props.values, props.fields),
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

watch(
  () => [props.appId, loadKey.value],
  () => {
    window.clearTimeout(loadTimer)
    // 做个延迟，避免频繁请求
    const delay = loadPrimed && hasFieldFilterRefs() ? 1000 : 0
    loadPrimed = true
    if (delay) {
      loadTimer = window.setTimeout(loadTableItems, delay)
    } else {
      loadTableItems()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  window.clearTimeout(loadTimer)
  loadSeq += 1
})
</script>

<style scoped lang="less">
.fill-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 8px;
}
</style>
