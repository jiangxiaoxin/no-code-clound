<template>
  <el-header class="design-toolbar" height="48px">
    <div class="design-toolbar-actions">
      <el-button :icon="Delete" @click="$emit('clear')">清空</el-button>
      <el-button :icon="View" @click="$emit('preview')">预览</el-button>
      <el-button type="primary" :icon="DocumentChecked" @click="$emit('save')">
        保存
      </el-button>
    </div>
  </el-header>
</template>

<script setup>
import { Delete, DocumentChecked, View } from '@element-plus/icons-vue'

defineEmits(['clear', 'save', 'preview'])
</script>

<style scoped lang="less">
.design-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
}

.design-toolbar-actions {
  display: flex;
  gap: 8px;
}
</style>
