<template>
  <el-select
    :model-value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :size="size"
    :clearable="clearable"
    class="field-select"
    @update:model-value="onUpdate"
    @change="onChange"
  >
    <template #label="{ label, value }">
      <span class="field-option">
        <el-icon v-if="iconOf(value)" class="field-option-icon">
          <component :is="iconOf(value)" />
        </el-icon>
        <span class="field-option-text">{{ label }}</span>
      </span>
    </template>
    <el-option
      v-for="field in fields"
      :key="field.key"
      :label="fieldOptionLabel(field)"
      :value="field.key"
    >
      <span class="field-option">
        <el-icon v-if="fieldTypeIcon(field.type)" class="field-option-icon">
          <component :is="fieldTypeIcon(field.type)" />
        </el-icon>
        <span>{{ fieldOptionLabel(field) }}</span>
      </span>
    </el-option>
  </el-select>
</template>

<script setup>
import { fieldOptionLabel, fieldTypeIcon } from './fieldTypes'

const props = defineProps({
  modelValue: { default: '' },
  fields: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择字段' },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  size: { type: String, default: 'default' },
})

const emit = defineEmits(['update:modelValue', 'change'])

function iconOf(key) {
  const field = (props.fields || []).find((item) => item.key === key)
  return field ? fieldTypeIcon(field.type) : null
}

function onUpdate(value) {
  emit('update:modelValue', value)
}

function onChange(value) {
  emit('change', value)
}
</script>

<style scoped lang="less">
.field-select {
  width: 100%;
}

.field-option {
  display: flex;
  align-items: center;
  min-width: 0;
}

.field-option-icon {
  flex-shrink: 0;
  margin-right: 6px;
  color: var(--el-text-color-secondary);
}

.field-option-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
