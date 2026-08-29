<template>
  <div class="address-select">
    <el-cascader
      class="address-cascader"
      :model-value="pathIds"
      :options="options"
      :props="cascaderProps"
      :placeholder="cascaderPlaceholder"
      :disabled="disabled"
      :size="size"
      filterable
      clearable
      @change="onPathChange"
    />
    <el-input
      v-if="showDetail"
      :model-value="detailText"
      class="address-detail"
      :disabled="disabled"
      :size="size"
      :maxlength="ADDRESS_DETAIL_MAX_LENGTH"
      show-word-limit
      placeholder="请输入详细地址"
      @update:model-value="onDetailInput"
      type="textarea"
      :autosize="{ minRows: 3 }"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  ADDRESS_DETAIL_MAX_LENGTH,
  addressFormatOf,
  addressHasDetail,
  cascaderProps,
  normalizeAddressValue,
  regionJsonForFormat,
  resolveAddressLabels,
} from './addressField.js'

const props = defineProps({
  modelValue: { default: undefined },
  field: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  size: { type: String, default: undefined },
  preview: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const options = ref([])

const showDetail = computed(() => addressHasDetail(props.field))
const cascaderPlaceholder = computed(() => props.placeholder || '请选择')
const normalized = computed(() => normalizeAddressValue(props.modelValue))
const pathIds = computed(() =>
  normalized.value.ids.length ? normalized.value.ids : undefined,
)
const detailText = computed(() => normalized.value.detail || '')

const loaders = {
  'sheng.json': () => import('@region/sheng.json'),
  'sheng-shi.json': () => import('@region/sheng-shi.json'),
  'sheng-shi-qu.json': () => import('@region/sheng-shi-qu.json'),
}

async function loadOptions() {
  if (props.preview) {
    options.value = []
    return
  }
  const file = regionJsonForFormat(addressFormatOf(props.field))
  const mod = await loaders[file]()
  options.value = mod.default || mod
}

function emitAddress(ids, detail) {
  if (!ids?.length) {
    emit('update:modelValue', undefined)
    return
  }
  const nextIds = ids.map((id) => String(id))
  const next = {
    ids: nextIds,
    labels: resolveAddressLabels(options.value, nextIds, normalized.value),
  }
  if (showDetail.value) {
    const text = String(detail ?? '')
      .trim()
      .slice(0, ADDRESS_DETAIL_MAX_LENGTH)
    if (text) next.detail = text
  }
  emit('update:modelValue', next)
}

function onPathChange(ids) {
  emitAddress(ids, showDetail.value ? detailText.value : '')
}

function onDetailInput(text) {
  emitAddress(normalized.value.ids, text)
}

watch(
  () => [props.preview, addressFormatOf(props.field)],
  () => {
    loadOptions()
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
.address-select {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.address-cascader {
  width: 100%;
}

.address-detail {
  margin-top: 8px;
}
</style>
