<template>
  <div class="fill-grid">
    <FormFillField
      v-for="field in fields"
      :key="field.key"
      :field="field"
      :items="dictItemsByCode[field.dictCode] || []"
      :model-value="values[field.key]"
      :disabled="disabled"
      @update:model-value="values[field.key] = $event"
    />
  </div>
</template>

<script setup>
import FormFillField from './FormFillField.vue'

defineProps({
  fields: { type: Array, default: () => [] },
  values: { type: Object, required: true },
  dictItemsByCode: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false },
})
</script>

<style scoped lang="less">
.fill-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 8px;
}
</style>
