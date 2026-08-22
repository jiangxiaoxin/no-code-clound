<template>
  <el-main class="canvas">
    <div
      class="canvas-paper"
      @dragover.prevent
      @dragleave="onCanvasDragLeave"
      @drop.prevent="onDropCanvas"
    >
      <el-empty
        v-if="fields.length === 0"
        description="从左侧选择或拖动字段添加到表单"
      />
      <div v-else class="canvas-fields">
        <FormDesignCanvasField
          v-for="field in fields"
          :key="field.key"
          :field="field"
          :items="dictItemsByCode[field.dictCode] || []"
          :selected="selectedKey === field.key"
          :dragging="dragKey === field.key"
          :drag-over="dragOverKey === field.key"
          @select="$emit('select', field)"
          @copy="$emit('copy', field)"
          @remove="$emit('remove', field)"
          @dragstart="onDragStart(field, $event)"
          @dragover="onDragOver(field)"
          @drop="onDrop(field, $event)"
          @dragend="onDragEnd"
        />
      </div>
    </div>
  </el-main>
</template>

<script setup>
import { ref } from 'vue'
import { fieldTypes } from './fieldTypes'
import FormDesignCanvasField from './FormDesignCanvasField.vue'

defineProps({
  fields: { type: Array, required: true },
  selectedKey: { type: String, default: '' },
  dictItemsByCode: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['select', 'copy', 'remove', 'reorder', 'add'])

const dragKey = ref('')
const dragOverKey = ref('')

function paletteItem(data) {
  if (!data.startsWith('palette:')) {
    return null
  }
  const type = data.slice('palette:'.length)
  return fieldTypes.find((item) => item.type === type) || null
}

function onDragStart(field, event) {
  dragKey.value = field.key
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', field.key)
}

function onDragOver(field) {
  if (field.key !== dragKey.value) {
    dragOverKey.value = field.key
  }
}

function onDrop(field, event) {
  dragOverKey.value = ''
  const item = paletteItem(event.dataTransfer.getData('text/plain'))
  if (item) {
    emit('add', item, field.key)
    return
  }
  emit('reorder', dragKey.value, field.key)
}

function onDropCanvas(event) {
  dragOverKey.value = ''
  const item = paletteItem(event.dataTransfer.getData('text/plain'))
  if (item) {
    emit('add', item)
  }
}

function onCanvasDragLeave(event) {
  if (event.currentTarget.contains(event.relatedTarget)) {
    return
  }
  dragOverKey.value = ''
}

function onDragEnd() {
  dragKey.value = ''
  dragOverKey.value = ''
}
</script>

<style scoped lang="less">
.canvas {
  padding: 12px;
}

.canvas-paper {
  min-height: 100%;
  padding: 24px;
  background: var(--el-bg-color);
  border-radius: 4px;
}

.canvas-fields {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 8px;
}
</style>
