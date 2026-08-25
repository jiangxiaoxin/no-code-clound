<template>
  <el-popover placement="bottom-end" :width="460" trigger="click">
    <template #reference>
      <el-button :icon="Setting" link>列设置</el-button>
    </template>
    <div class="col-setup">
      <div class="col-setup-head">
        <span class="col-setup-handle" />
        <span class="col-setup-name">列名</span>
        <span class="col-setup-check">显示</span>
        <span class="col-setup-width">宽度</span>
        <span class="col-setup-fixed">固定</span>
      </div>
      <div class="col-setup-row is-locked">
        <span class="col-setup-handle is-disabled" />
        <span class="col-setup-name">序号</span>
        <span class="col-setup-check">
          <el-checkbox :model-value="true" disabled />
        </span>
        <span class="col-setup-width" />
        <el-select class="col-setup-fixed" model-value="left" disabled size="small">
          <el-option label="左侧" value="left" />
        </el-select>
      </div>
      <div
        v-for="(col, index) in modelValue"
        :key="col.key"
        class="col-setup-row"
        :class="{
          'is-dragging': dragColumnIndex === index,
          'is-drag-over': dragOverIndex === index && dragColumnIndex !== index,
        }"
        @dragover.prevent="dragOverIndex = index"
        @drop.prevent="dropColumn(index)"
      >
        <span
          class="col-setup-handle"
          draggable="true"
          @dragstart.stop="onColumnDragStart($event, index)"
          @dragend="onColumnDragEnd"
        >
          <el-icon><Rank /></el-icon>
        </span>
        <span class="col-setup-name" :title="col.title">{{ col.title }}</span>
        <span class="col-setup-check">
          <el-checkbox v-model="col.visible" />
        </span>
        <el-input-number
          v-model="col.minWidth"
          class="col-setup-width"
          :disabled="isTimeColumnKey(col.key)"
          :min="isTimeColumnKey(col.key) ? TIME_COL_WIDTH : 100"
          :precision="0"
          :step="10"
          :controls="false"
          size="small"
          @change="col.minWidth = isTimeColumnKey(col.key) ? TIME_COL_WIDTH : normalizeColWidth($event)"
          align="left"
        />
        <el-select
          v-model="col.fixed"
          class="col-setup-fixed"
          clearable
          placeholder="不固定"
          size="small"
        >
          <el-option label="左侧" value="left" />
          <el-option label="右侧" value="right" />
        </el-select>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { ref } from 'vue'
import { Rank, Setting } from '@element-plus/icons-vue'
import { TIME_COL_WIDTH, isTimeColumnKey, normalizeColWidth } from './columnPrefs'

const props = defineProps({
  modelValue: { type: Array, required: true },
})

const emit = defineEmits(['update:modelValue'])

const dragColumnIndex = ref(-1)
const dragOverIndex = ref(-1)

function onColumnDragStart(event, index) {
  dragColumnIndex.value = index
  dragOverIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

function onColumnDragEnd() {
  dragColumnIndex.value = -1
  dragOverIndex.value = -1
}

function dropColumn(to) {
  const from = dragColumnIndex.value
  if (from < 0 || from === to) {
    onColumnDragEnd()
    return
  }
  const next = props.modelValue.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  emit('update:modelValue', next)
  onColumnDragEnd()
}
</script>

<style scoped lang="less">
.col-setup {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.col-setup-head,
.col-setup-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.col-setup-handle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: var(--el-text-color-secondary);
  cursor: grab;
}

.col-setup-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-setup-check {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
}

.col-setup-width {
  flex: none;
  width: 72px;
}

:deep(.col-setup-width.el-input-number) {
  width: 72px;
}

:deep(.col-setup-width .el-input__inner) {
  padding-left: 8px;
  padding-right: 8px;
  text-align: center;
}

.col-setup-fixed {
  flex: none;
  width: 96px;
}

.col-setup-head {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.col-setup-row.is-locked {
  color: var(--el-text-color-secondary);
}

.col-setup-row.is-dragging {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  opacity: 0.55;
}

.col-setup-row.is-drag-over {
  background: var(--el-color-primary-light-8);
  border-color: var(--el-color-primary-light-5);
}

.col-setup-handle.is-disabled {
  cursor: default;
}

.col-setup-row.is-dragging .col-setup-handle {
  cursor: grabbing;
}
</style>
