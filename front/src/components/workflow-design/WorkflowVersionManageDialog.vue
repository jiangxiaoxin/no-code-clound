<template>
  <el-dialog
    title="管理已有版本"
    :model-value="visible"
    width="640px"
    draggable
    @close="onClose"
    @update:model-value="onVisible"
  >
    <div class="wf-ver-list">
      <div v-for="row in sorted" :key="row.id" class="wf-ver-row">
        <span class="wf-ver-name">{{ row.title }}</span>
        <span class="wf-ver-status" :class="statusClass(row)">
          {{ row.enabled ? '启用中' : '设计中' }}
        </span>
        <div class="wf-ver-row-actions">
          <el-button
            v-if="!row.enabled"
            link
            type="primary"
            :data-id="String(row.id)"
            @click="onEnableClick"
          >
            启用流程
          </el-button>
          <el-button
            v-if="!row.enabled"
            link
            type="primary"
            :data-id="String(row.id)"
            @click="onEditClick"
          >
            编辑
          </el-button>
          <el-button
            v-if="!row.enabled"
            link
            type="danger"
            :data-id="String(row.id)"
            @click="onDeleteClick"
          >
            删除
          </el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { sortVersions } from './workflowVersion.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  versions: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:visible', 'enable', 'edit', 'delete'])

const sorted = computed(() => sortVersions(props.versions))

function statusClass(row) {
  return row.enabled ? 'is-enabled' : 'is-draft'
}

function idFromEvent(event) {
  return Number(event.currentTarget?.dataset?.id)
}

function onEnableClick(event) {
  emit('enable', idFromEvent(event))
}

function onEditClick(event) {
  emit('edit', idFromEvent(event))
}

function onDeleteClick(event) {
  emit('delete', idFromEvent(event))
}

function onVisible(value) {
  emit('update:visible', value)
}

function onClose() {
  emit('update:visible', false)
}
</script>

<style scoped lang="less">
.wf-ver-list {
  display: flex;
  flex-direction: column;
  min-height: 500px;
}

.wf-ver-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.wf-ver-name {
  flex: 1;
  min-width: 0;
}

.wf-ver-status {
  margin-right: 12px;
  padding: 0 6px;
  font-size: 12px;
  border-radius: 4px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.wf-ver-status.is-enabled {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.wf-ver-row-actions {
  display: flex;
  align-items: center;
}
</style>
