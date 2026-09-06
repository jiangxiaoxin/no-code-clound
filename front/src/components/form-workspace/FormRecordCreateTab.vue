<template>
  <div class="form-work-body" v-loading="schemaLoading">
    <el-empty
      v-if="!schemaLoading && fields.length === 0"
      description="请先保存表单设计"
    />
    <template v-else>
      <div class="fill-scroll">
        <FormFillGrid
          ref="gridRef"
          :app-id="appId"
          :fields="fields"
          :values="values"
          :dict-items-by-code="dictItemsByCode"
        />
      </div>
      <div v-if="unpublished" class="wf-unpublished">
        这张表单还没有配置流程，暂时不能填报
      </div>
      <div class="fill-footer">
        <el-button @click="onCancel">取消</el-button>
        <template v-if="workflowEnabled">
          <el-button :loading="saving" @click="onDraft">保存草稿</el-button>
          <el-button type="primary" :loading="saving" @click="onSubmit">提交</el-button>
        </template>
        <el-button v-else type="primary" :loading="saving" @click="onSave">
          保存
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import FormFillGrid from '../form-fill/FormFillGrid.vue'

defineProps({
  appId: { type: Number, required: true },
  fields: { type: Array, default: () => [] },
  values: { type: Object, required: true },
  dictItemsByCode: { type: Object, default: () => ({}) },
  schemaLoading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  unpublished: { type: Boolean, default: false },
  workflowEnabled: { type: Boolean, default: false },
})

const emit = defineEmits(['cancel', 'save', 'draft', 'submit'])
const gridRef = ref(null)

function onCancel() {
  emit('cancel')
}

function onSave() {
  emit('save')
}

function onDraft() {
  emit('draft')
}

function onSubmit() {
  emit('submit')
}

defineExpose({
  revealField: (key) => gridRef.value?.revealField(key),
})
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';

.wf-unpublished {
  margin: 0 16px 8px;
  padding: 8px 12px;
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
  border-radius: 6px;
  line-height: 1.5;
}
</style>
