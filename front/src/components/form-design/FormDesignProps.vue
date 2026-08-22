<template>
  <el-aside class="props" width="320px">
    <div class="props-tabs">
      <span
        class="props-tab"
        :class="{ 'is-active': tab === 'field' }"
        @click="$emit('update:tab', 'field')"
      >
        字段属性
      </span>
      <span
        class="props-tab"
        :class="{ 'is-active': tab === 'form' }"
        @click="$emit('update:tab', 'form')"
      >
        表单属性
      </span>
    </div>
    <el-empty
      v-if="tab === 'field' && !field"
      description="请选择字段"
    />
    <el-form v-else-if="tab === 'field'" label-position="top">
      <el-form-item label="字段标题">
        <el-input v-model="field.title" maxlength="32" />
      </el-form-item>
      <el-form-item label="提示文字">
        <el-input v-model="field.placeholder" maxlength="64" />
      </el-form-item>
      <el-form-item label="字段说明">
        <el-input
          v-model="field.description"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="填写后，标题右侧会显示说明"
        />
      </el-form-item>
      <el-form-item label="校验设置">
        <div class="required-row">
          <span>必填</span>
          <el-switch v-model="field.required" />
        </div>
      </el-form-item>
      <el-form-item label="字段宽度">
        <el-radio-group
          class="width-options"
          :model-value="field.width"
          @change="$emit('update:width', $event)"
        >
          <el-radio-button value="1/4">1/4</el-radio-button>
          <el-radio-button value="1/3">1/3</el-radio-button>
          <el-radio-button value="1/2">1/2</el-radio-button>
          <el-radio-button value="2/3">2/3</el-radio-button>
          <el-radio-button value="3/4">3/4</el-radio-button>
          <el-radio-button value="1">整行</el-radio-button>
        </el-radio-group>
      </el-form-item>
      
    </el-form>
  </el-aside>
</template>

<script setup>
defineProps({
  tab: { type: String, required: true },
  field: { type: Object, default: null },
})

defineEmits(['update:tab', 'update:width'])
</script>

<style scoped lang="less">
.props {
  padding: 16px;
  background: var(--el-bg-color);
  overflow: auto;
  border-left: 1px solid var(--el-border-color);
}

.props-tabs {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.props-tab {
  padding: 8px 0;
  font-weight: 600;
  cursor: pointer;
  color: var(--el-text-color-regular);
  border-bottom: 2px solid transparent;
}

.props-tab.is-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.width-options {
  display: flex;
  flex-wrap: nowrap;
  width: 100%;
}

.width-options :deep(.el-radio-button) {
  flex: 1 1 0;
}

.width-options :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 0;
  font-size: 12px;
}

.required-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
