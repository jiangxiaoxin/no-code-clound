<template>
  <div class="fill-grid">
    <FormFillField
      v-for="field in fields"
      :key="field.key"
      :field="field"
      :items="itemsFor(field)"
      :model-value="values[field.key]"
      :disabled="disabled"
      @update:model-value="values[field.key] = $event"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
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
let loadSeq = 0

function isTableSelect(field) {
  return (
    isSelectType(field.type) &&
    field.optionSource === 'table_data' &&
    field.sourceFormId &&
    field.sourceFieldKey
  )
}

const loadKey = computed(() =>
  props.fields
    .filter(isTableSelect)
    .map((field) => {
      const refs = (field.optionFilters?.conditions || [])
        .filter((item) => item.valueType === 'field' && item.value)
        .map(
          (item) =>
            `${item.value}=${JSON.stringify(props.values?.[item.value])}`,
        )
      return [
        field.key,
        field.sourceFormId,
        field.sourceFieldKey,
        field.optionFilters?.match,
        JSON.stringify(field.optionFilters?.conditions || []),
        refs.join('&'),
      ].join(':')
    })
    .join('|'),
)

function itemsFor(field) {
  if (isTableSelect(field)) {
    return tableItemsByKey.value[field.key] || []
  }
  return props.dictItemsByCode[field.dictCode] || []
}

watch(
  () => [props.appId, loadKey.value],
  async () => {
    const seq = ++loadSeq
    if (!props.appId) {
      tableItemsByKey.value = {}
      return
    }
    const next = {}
    await Promise.all(
      props.fields.filter(isTableSelect).map(async (field) => {
        try {
          const result = await queryFormRecordsApi(
            props.appId,
            field.sourceFormId,
            buildSourceQuery(field.optionFilters, props.values),
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
      tableItemsByKey.value = next
    }
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
.fill-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 8px;
}
</style>
