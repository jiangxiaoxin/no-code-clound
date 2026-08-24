<template>
  <el-drawer
    :model-value="modelValue"
    title="新增"
    direction="rtl"
    size="800px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @closed="$emit('closed')"
  >
    <el-empty
      v-if="!schemaLoading && fields.length === 0"
      description="请先保存表单设计"
    />
    <div v-else class="fill-drawer-body">
      <FormFillGrid
        :fields="fields"
        :values="values"
        :dict-items-by-code="dictItemsByCode"
      />
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="$emit('save')">保存</el-button>
    </template>
  </el-drawer>
</template>

<script setup>
import FormFillGrid from '../form-fill/FormFillGrid.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
  fields: { type: Array, default: () => [] },
  values: { type: Object, required: true },
  dictItemsByCode: { type: Object, default: () => ({}) },
  schemaLoading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

defineEmits(['update:modelValue', 'save', 'closed'])
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';
</style>
