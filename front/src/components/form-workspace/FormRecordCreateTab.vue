<template>
  <div class="form-work-body" v-loading="schemaLoading">
    <el-empty
      v-if="!schemaLoading && fields.length === 0"
      description="请先保存表单设计"
    />
    <template v-else>
      <div class="fill-scroll">
        <FormFillGrid
          :app-id="appId"
          :fields="fields"
          :values="values"
          :dict-items-by-code="dictItemsByCode"
        />
      </div>
      <div class="fill-footer">
        <el-button @click="$emit('cancel')">取消</el-button>
        <el-button type="primary" :loading="saving" @click="$emit('save')">
          保存
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import FormFillGrid from '../form-fill/FormFillGrid.vue'

defineProps({
  appId: { type: Number, required: true },
  fields: { type: Array, default: () => [] },
  values: { type: Object, required: true },
  dictItemsByCode: { type: Object, default: () => ({}) },
  schemaLoading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

defineEmits(['cancel', 'save'])
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';
</style>
