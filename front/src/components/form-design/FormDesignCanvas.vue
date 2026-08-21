<template>
  <el-main class="canvas">
    <div class="canvas-paper">
      <el-empty
        v-if="fields.length === 0"
        description="从左侧选择字段添加到表单"
      />
      <div v-else class="canvas-fields">
        <FormDesignCanvasField
          v-for="field in fields"
          :key="field.key"
          :field="field"
          :selected="selectedKey === field.key"
          :dragging="dragKey === field.key"
          :drag-over="dragOverKey === field.key"
          @select="$emit('select', field)"
          @copy="$emit('copy', field)"
          @remove="$emit('remove', field)"
          @dragstart="onDragStart(field, $event)"
          @dragover="onDragOver(field)"
          @drop="onDrop(field)"
          @dragend="onDragEnd"
        />
      </div>
    </div>
  </el-main>
</template>

<script setup>
import { ref } from 'vue'
import FormDesignCanvasField from './FormDesignCanvasField.vue'

defineProps({
  fields: { type: Array, required: true },
  selectedKey: { type: String, default: '' },
})

const emit = defineEmits(['select', 'copy', 'remove', 'reorder'])

const dragKey = ref('')
const dragOverKey = ref('')

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

function onDrop(field) {
  emit('reorder', dragKey.value, field.key)
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
