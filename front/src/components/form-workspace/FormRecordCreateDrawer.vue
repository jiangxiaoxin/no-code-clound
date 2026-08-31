<template>
  <el-drawer
    :model-value="modelValue"
    title="新增"
    direction="rtl"
    size="800px"
    destroy-on-close
    @update:model-value="onVisibleChange"
    @closed="onClosed"
  >
    <el-empty
      v-if="!schemaLoading && fields.length === 0"
      description="请先保存表单设计"
    />
    <div v-else class="fill-drawer-body">
      <FormFillGrid
        ref="gridRef"
        :app-id="appId"
        :fields="fields"
        :values="values"
        :dict-items-by-code="dictItemsByCode"
      />
    </div>
    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'
import FormFillGrid from '../form-fill/FormFillGrid.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, required: true },
  fields: { type: Array, default: () => [] },
  values: { type: Object, required: true },
  dictItemsByCode: { type: Object, default: () => ({}) },
  schemaLoading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'save', 'closed'])
const gridRef = ref(null)

function onVisibleChange(value) {
  emit('update:modelValue', value)
}

function onClosed() {
  emit('closed')
}

function onCancel() {
  emit('update:modelValue', false)
}

function onSave() {
  emit('save')
}

defineExpose({
  revealField: (key) => gridRef.value?.revealField(key),
})
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';
</style>
