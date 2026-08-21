<template>
  <el-aside class="palette" width="260px">
    <div class="palette-grid">
      <div
        v-for="item in fieldTypes"
        :key="item.type"
        class="palette-item"
        @click="$emit('add', item)"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </div>
    </div>
  </el-aside>
</template>

<script setup>
import { fieldTypes } from './fieldTypes'

defineEmits(['add'])
</script>

<style scoped lang="less">
.palette {
  padding: 16px;
  background: var(--el-bg-color);
  overflow: auto;
  border-right: 1px solid var(--el-border-color);
}

.palette-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 12px;
  user-select: none;
}

.palette-item:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.palette-item:hover .el-icon,
.palette-item:hover span {
  color: var(--el-color-primary);
}
</style>
