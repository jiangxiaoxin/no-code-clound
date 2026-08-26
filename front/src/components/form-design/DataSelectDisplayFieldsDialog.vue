<template>
  <el-dialog
    :model-value="modelValue"
    title="选择显示字段"
    width="520px"
    align-center
    draggable
    destroy-on-close
    @update:model-value="onVisibleChange"
    body-class="data-select-display-fields-dialog-body"
  >
    <div class="display-toolbar">
      
      <el-button type="primary" link @click="toggleSelectAll">
        {{ selectAllLabel }}
      </el-button>
      <span class="display-count">{{ selectedCountText }}</span>
    </div>
    <el-checkbox-group
      v-if="displayableFields.length"
      v-model="draft"
      class="display-list"
      size="small"
    >
      <el-checkbox
        v-for="field in displayableFields"
        :key="field.key"
        :value="field.key"
      >
        {{ field.title || field.key }}
      </el-checkbox>
    </el-checkbox-group>
    <el-empty v-else description="数据源表暂无可用字段" />
    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { cloneDisplayFieldKeys, withSystemDisplayFields } from './dataSelect'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  displayFieldKeys: { type: Array, default: () => [] },
  sourceFields: { type: Array, default: () => [] },
})


console.log('sourceFields', props.sourceFields);
console.log('displayFieldKeys', props.displayFieldKeys)


const emit = defineEmits(['update:modelValue', 'confirm'])

const draft = ref([])
const displayableFields = computed(() =>
  withSystemDisplayFields(props.sourceFields),
)
const totalCount = computed(() => displayableFields.value.length)
const selectedCount = computed(() => {
  const allowed = new Set(displayableFields.value.map((field) => field.key))
  return draft.value.filter((key) => allowed.has(key)).length
})
const allSelected = computed(
  () => totalCount.value > 0 && selectedCount.value === totalCount.value,
)
const selectAllLabel = computed(() => (allSelected.value ? '取消全选' : '全选'))
const selectedCountText = computed(
  () => `[${selectedCount.value}/${totalCount.value}]`,
)

watch(
  () => [props.modelValue, props.displayFieldKeys, props.sourceFields],
  () => {
    if (!props.modelValue) return
    const allowed = new Set(displayableFields.value.map((field) => field.key))
    draft.value = cloneDisplayFieldKeys(props.displayFieldKeys).filter((key) =>
      allowed.has(key),
    )
  },
)

function toggleSelectAll() {
  if (allSelected.value) {
    draft.value = []
    return
  }
  draft.value = displayableFields.value.map((field) => field.key)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function onVisibleChange(value) {
  emit('update:modelValue', value)
}

function confirm() {
  emit('confirm', cloneDisplayFieldKeys(draft.value))
  emit('update:modelValue', false)
}
</script>

<style scoped lang="less">
.display-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 8px;
  gap: 8px;
}

.display-count {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.display-list {
  display: flex;
  flex-direction: column;
  max-height: 360px;
  overflow: auto;
}
</style>
