<template>
  <el-main class="canvas">
    <div
      class="canvas-paper"
      @click="onCanvasBlank"
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
          :app-id="appId"
          :field="field"
          :fill-tip="fillTips[field.key]"
          :fill-tips="fillTips"
          :items="dictItemsByCode[field.dictCode] || []"
          :dict-items-by-code="dictItemsByCode"
          :selected="isFieldSelected(field)"
          :selected-key="selectedKey"
          :active-pane-id="activePaneId"
          :dragging="dragKey === field.key"
          :drag-over="dragOverKey === field.key"
          @select="onSelect"
          @copy="onCopy"
          @remove="onRemove"
          @add="onAdd"
          @add-child="onAddChild"
          @reorder="onReorder"
          @update:activePaneId="onActivePaneId"
          @dragstart="onDragStart"
          @dragover="onDragOver"
          @drop="onDrop"
          @dragend="onDragEnd"
        />
      </div>
    </div>
  </el-main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { fillInfluencerTips } from './dataSelect'
import { fieldTypes } from './fieldTypes'
import FormDesignCanvasField from './FormDesignCanvasField.vue'

const props = defineProps({
  appId: { type: Number, default: 0 },
  fields: { type: Array, required: true },
  selectedKey: { type: String, default: '' },
  dictItemsByCode: { type: Object, default: () => ({}) },
  activePaneId: { type: String, default: '' },
})

const fillTips = computed(() => fillInfluencerTips(props.fields))

const emit = defineEmits([
  'select',
  'copy',
  'remove',
  'reorder',
  'add',
  'add-child',
  'update:activePaneId',
])

const dragKey = ref('')
const dragOverKey = ref('')

function isFieldSelected(field) {
  return props.selectedKey === field.key
}

function paletteItem(data) {
  if (!data.startsWith('palette:')) {
    return null
  }
  const type = data.slice('palette:'.length)
  return fieldTypes.find((item) => item.type === type) || null
}

function onSelect(field) {
  emit('select', field)
}

function onCopy(field) {
  emit('copy', field)
}

function onRemove(field) {
  emit('remove', field)
}

function onAdd(item, beforeKey, paneId) {
  emit('add', item, beforeKey, paneId)
}

function onAddChild(parentField, item) {
  emit('add-child', parentField.key, item)
}

function onReorder(fromKey, toKey) {
  emit('reorder', fromKey, toKey)
}

function onActivePaneId(id) {
  emit('update:activePaneId', id)
}

function onCanvasBlank() {
  emit('select', null)
}

function onDragStart(event, field) {
  dragKey.value = field.key
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', field.key)
}

function onDragOver(field) {
  if (field.key !== dragKey.value) {
    dragOverKey.value = field.key
  }
}

function onDrop(event, field) {
  dragOverKey.value = ''
  const data = event.dataTransfer.getData('text/plain')
  const item = paletteItem(data)
  if (item) {
    if (field.type === 'subform') {
      emit('add-child', field.key, item)
      return
    }
    emit('add', item, field.key)
    return
  }
  emit('reorder', data, field.key)
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
