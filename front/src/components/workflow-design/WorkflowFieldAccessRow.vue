<template>
  <div class="wf-access-row">
    <span>{{ field.title || field.key }}</span>
    <el-radio-group :model-value="modelValue" @change="onChange">
      <el-radio v-for="opt in options" :key="opt" :value="opt">
        {{ labelOf(opt) }}
      </el-radio>
    </el-radio-group>
  </div>
</template>

<script setup>
const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: String, default: 'readonly' },
  options: { type: Array, default: () => ['readonly'] },
})
const emit = defineEmits(['change'])

function onChange(value) {
  emit('change', props.field.key, value)
}

function labelOf(value) {
  if (value === 'editable') return '可编辑'
  if (value === 'hidden') return '隐藏'
  return '只读'
}
</script>

<style scoped lang="less">
.wf-access-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
