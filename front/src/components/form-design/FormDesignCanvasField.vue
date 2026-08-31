<template>
  <div
    class="canvas-field"
    :class="[
      widthClass[field.width] || 'is-w-full',
      {
        'is-selected': selected,
        'is-dragging': dragging,
        'is-drag-over': dragOver,
        'is-image': field.type === 'image',
        'is-file': field.type === 'file',
        'is-tabs': field.type === 'tabs',
      },
    ]"
    draggable="true"
    @click.stop="onSelect"
    @dragstart.stop="onDragStart"
    @dragover.prevent="onDragOver"
    @drop.prevent.stop="onDrop"
    @dragend="onDragEnd"
  >
    <div v-if="selected" class="canvas-field-actions">
      <el-button-group>
        <!-- <el-button size="small" :icon="CopyDocument" @click.stop="$emit('copy')" /> -->
        <el-button size="small" :icon="Delete" @click.stop="onRemove" />
      </el-button-group>
    </div>
    <!-- el-divider 会自己显示title，不需要再添加标题  -->
     <!-- 其余的组件标题都显示到上面 -->
      <!-- 左右布局需要设置合理的 label width ，暂时不支持-->
    <span v-if="field.type !== 'divider' && field.type !== 'tabs'" class="canvas-field-title">
      <span v-if="field.required" class="canvas-field-required">*</span>
      <el-tooltip v-if="linked" content="设置了数据联动" placement="top">
        <el-icon class="canvas-field-fill" @click.stop>
          <Link />
        </el-icon>
      </el-tooltip>
      <el-tooltip v-if="fillTip" :content="fillTip" placement="top">
        <el-icon class="canvas-field-fill" @click.stop>
          <Connection />
        </el-icon>
      </el-tooltip>
      <span class="canvas-field-title-text">{{ field.title }}</span>
      <el-tooltip
        v-if="field.description?.trim()"
        :content="field.description"
        placement="top"
      >
        <el-icon class="canvas-field-info" @click.stop>
          <InfoFilled />
        </el-icon>
      </el-tooltip>
    </span>
    <el-input
      v-if="field.type === 'input'"
      disabled
      class="canvas-item"
      :placeholder="field.placeholder"
      :maxlength="field.maxLength || undefined"
    />
    <el-input-number
      v-else-if="field.type === 'number'"
      disabled
      class="canvas-item"
      :controls="false"
      :precision="field.precision"
      :min="field.rangeEnabled ? field.min : undefined"
      :max="field.rangeEnabled ? field.max : undefined"
      :placeholder="field.placeholder"
      align="left"
    />
    <el-input
      v-else-if="field.type === 'textarea'"
      type="textarea"
      disabled
      class="canvas-item"
      :rows="3"
      :placeholder="field.placeholder"
      :maxlength="field.maxLength || undefined"
    />
    <div
      v-else-if="(field.type === 'radio' || field.type === 'checkbox') && !field.dictCode"
      class="canvas-field-hint"
    >
      请配置选项字典
    </div>
    <el-radio-group v-else-if="field.type === 'radio'" disabled class="canvas-item">
      <el-radio v-for="item in items" :key="item.value" :value="item.value">
        {{ item.label }}
      </el-radio>
    </el-radio-group>
    <el-checkbox-group v-else-if="field.type === 'checkbox'" disabled class="canvas-item">
      <el-checkbox v-for="item in items" :key="item.value" :value="item.value">
        {{ item.label }}
      </el-checkbox>
    </el-checkbox-group>
    <el-date-picker
      v-else-if="field.type === 'date'"
      disabled
      class="canvas-item"
      :type="field.format || 'date'"
      :placeholder="field.placeholder || '请选择'"
    />
    <el-time-picker
      v-else-if="field.type === 'time'"
      disabled
      class="canvas-item"
      :format="field.format || 'HH:mm:ss'"
      :placeholder="field.placeholder || '请选择'"
    />
    <el-date-picker
      v-else-if="field.type === 'datetime'"
      disabled
      class="canvas-item"
      type="datetime"
      :format="field.format || 'YYYY-MM-DD HH:mm:ss'"
      :placeholder="field.placeholder || '请选择'"
    />
    <div
      v-else-if="needsOptionSourceHint"
      class="canvas-field-hint"
    >
      请配置选项来源
    </div>
    <el-select
      v-else-if="field.type === 'select' || field.type === 'select-multiple'"
      disabled
      class="canvas-item"
      :multiple="field.type === 'select-multiple'"
      :placeholder="field.placeholder"
    >
      <el-option
        v-for="item in items"
        :key="item.value"
        :label="item.label"
        :value="item.value"
      />
    </el-select>
    <el-select
      v-else-if="
        field.type === 'member' ||
        field.type === 'dept' ||
        field.type === 'relate'
      "
      disabled
      class="canvas-item"
      :placeholder="field.placeholder"
    />
    <FormDataSelect
      v-else-if="field.type === 'data'"
      class="canvas-item"
      :app-id="appId"
      :field="field"
      preview
    />
    <CurrentUserName v-else-if="field.type === 'currentUser'" class="canvas-item" />
    <CurrentUserDept v-else-if="field.type === 'currentUserDept'" class="canvas-item" />
    <el-divider v-else-if="field.type === 'divider'">
      {{ field.title }}
    </el-divider>
    <el-upload
      v-else-if="field.type === 'image'"
      disabled
      class="canvas-item"
      list-type="picture-card"
      :auto-upload="false"
    >
      <el-icon><Plus /></el-icon>
    </el-upload>
    <FormFileUpload
      v-else-if="field.type === 'file'"
      class="canvas-item"
      :field="field"
      disabled
    />
    <FormAddressSelect
      v-else-if="field.type === 'address'"
      class="canvas-item"
      :field="field"
      disabled
      preview
    />
    <div
      v-else-if="field.type === 'tabs'"
      class="canvas-tabs"
      @dragover.prevent
      @drop.prevent.stop="onPaneDrop"
    >
      <div class="canvas-tabs-bar">
        <div
          v-for="pane in field.panes"
          :key="pane.id"
          class="canvas-tabs-tab"
          :class="{ 'is-active': pane.id === currentPaneId }"
          @click.stop="onPaneClick(pane)"
        >
          {{ pane.title }}
        </div>
      </div>
      <div class="canvas-tabs-body" @click.stop="onSelect">
        <div v-if="currentPaneFields.length" class="canvas-tabs-fields">
          <FormDesignCanvasField
            v-for="child in currentPaneFields"
            :key="child.key"
            :app-id="appId"
            :field="child"
            :fill-tip="fillTips[child.key]"
            :items="dictItemsByCode[child.dictCode] || []"
            :selected="selectedKey === child.key"
            :dragging="innerDragKey === child.key"
            :drag-over="innerDragOverKey === child.key"
            @select="onForwardSelect"
            @copy="onForwardCopy"
            @remove="onForwardRemove"
            @dragstart="onChildDragStart"
            @dragover="onChildDragOver"
            @drop="onChildDrop"
            @dragend="onChildDragEnd"
          />
        </div>
        <div v-else class="canvas-tabs-empty">
          从左侧选择或拖动字段添加到此标签页
        </div>
      </div>
    </div>
    <div v-else-if="field.type === 'subform'" class="canvas-subform" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { CopyDocument, Connection, Delete, InfoFilled, Link, Plus } from '@element-plus/icons-vue'
import { fieldTypes, widthClass } from './fieldTypes'
import {
  hasLinkage,
  needsOptionSourceHint as fieldNeedsOptionSourceHint,
} from './linkage'
import { isTabsField } from './tabsField.js'
import FormDataSelect from '../form-fill/FormDataSelect.vue'
import FormFileUpload from '../form-fill/FormFileUpload.vue'
import FormAddressSelect from '../form-fill/FormAddressSelect.vue'
import CurrentUserName from '../form-fill/CurrentUserName.vue'
import CurrentUserDept from '../form-fill/CurrentUserDept.vue'

defineOptions({ name: 'FormDesignCanvasField' })

const props = defineProps({
  appId: { type: Number, default: 0 },
  field: { type: Object, required: true },
  fillTip: { type: String, default: '' },
  fillTips: { type: Object, default: () => ({}) },
  items: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false },
  selectedKey: { type: String, default: '' },
  activePaneId: { type: String, default: '' },
  dragging: { type: Boolean, default: false },
  dragOver: { type: Boolean, default: false },
})

const emit = defineEmits([
  'select',
  'copy',
  'remove',
  'dragstart',
  'dragover',
  'drop',
  'dragend',
  'add',
  'reorder',
  'update:activePaneId',
])

const innerDragKey = ref('')
const innerDragOverKey = ref('')

const needsOptionSourceHint = computed(() =>
  fieldNeedsOptionSourceHint(props.field),
)

const linked = computed(() => hasLinkage(props.field))

const currentPane = computed(() => {
  const panes = props.field.panes || []
  return panes.find((pane) => pane.id === props.activePaneId) || panes[0] || null
})

const currentPaneId = computed(() => currentPane.value?.id || '')

const currentPaneFields = computed(() => currentPane.value?.fields || [])

function paletteItem(data) {
  if (!data.startsWith('palette:')) {
    return null
  }
  const type = data.slice('palette:'.length)
  return fieldTypes.find((item) => item.type === type) || null
}

function onSelect() {
  emit('select', props.field)
}

function onRemove() {
  emit('remove', props.field)
}

function onDragStart(event) {
  emit('dragstart', event, props.field)
}

function onDragOver() {
  emit('dragover', props.field)
}

function onDrop(event) {
  if (isTabsField(props.field)) {
    onPaneDrop(event)
    return
  }
  emit('drop', event, props.field)
}

function onDragEnd() {
  emit('dragend')
}

function onPaneClick(pane) {
  emit('select', props.field)
  emit('update:activePaneId', pane.id)
}

function onPaneDrop(event) {
  const pane = currentPane.value
  if (!pane?.id) {
    return
  }
  const data = event.dataTransfer.getData('text/plain')
  const item = paletteItem(data)
  if (item) {
    emit('add', item, undefined, pane.id)
    return
  }
  emit('reorder', data, '')
}

function onForwardSelect(field) {
  emit('select', field)
}

function onForwardCopy(field) {
  emit('copy', field)
}

function onForwardRemove(field) {
  emit('remove', field)
}

function onChildDragStart(event, child) {
  innerDragKey.value = child.key
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', child.key)
}

function onChildDragOver(child) {
  if (child.key !== innerDragKey.value) {
    innerDragOverKey.value = child.key
  }
}

function onChildDrop(event, child) {
  innerDragOverKey.value = ''
  const pane = currentPane.value
  const data = event.dataTransfer.getData('text/plain')
  const item = paletteItem(data)
  if (item) {
    emit('add', item, child.key, pane?.id)
    return
  }
  emit('reorder', data, child.key)
}

function onChildDragEnd() {
  innerDragKey.value = ''
  innerDragOverKey.value = ''
}
</script>

<style scoped lang="less">
.canvas-field {
  position: relative;
  box-sizing: border-box;
  min-width: 0;
  padding: 6px 12px;
  cursor: grab;
  border: 1px solid transparent;
  border-radius: 4px;
  user-select: none;
}

.canvas-field.is-w-full {
  grid-column: span 12;
}

.canvas-field.is-w-half {
  grid-column: span 6;
}

.canvas-field.is-w-third {
  grid-column: span 4;
}

.canvas-field.is-w-two-thirds {
  grid-column: span 8;
}

.canvas-field.is-w-quarter {
  grid-column: span 3;
}

.canvas-field.is-w-three-quarters {
  grid-column: span 9;
}

.canvas-field:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-color-primary-light-5);
}

.canvas-field.is-selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.canvas-field.is-dragging {
  opacity: 0.4;
}

.canvas-field.is-drag-over {
  border: 1px solid var(--el-color-primary);
}

.canvas-field-actions {
  position: absolute;
  top: 4px;
  right: 4px;
}

.canvas-field-title {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.canvas-field-title-text {
  min-width: 0;
}

.canvas-field-required {
  margin-right: 4px;
  color: var(--el-color-danger);
}

.canvas-field-fill {
  margin-right: 4px;
  color: var(--el-color-primary);
  cursor: help;
}

.canvas-field-info {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  cursor: help;
}

.canvas-field-hint {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  line-height: 32px;
}

:deep(.canvas-item) {
  width: 100%;
  max-width: 354px;
}

.canvas-field.is-image :deep(.canvas-item),
.canvas-field.is-file :deep(.canvas-item) {
  max-width: none;
}

:deep(.canvas-item.el-date-editor) {
  --el-date-editor-width: 100%;
}

.canvas-subform {
  width: 100%;
  max-width: 354px;
  min-height: 88px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}

.canvas-field.is-tabs {
  max-width: none;
}

.canvas-tabs {
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
}

.canvas-tabs-bar {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color);
}

.canvas-tabs-tab {
  padding: 8px 12px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  border-bottom: 2px solid transparent;
}

.canvas-tabs-tab.is-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.canvas-tabs-body {
  min-height: 88px;
  padding: 8px 0;
}

.canvas-tabs-fields {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 8px;
}

.canvas-tabs-empty {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  line-height: 32px;
}
</style>
