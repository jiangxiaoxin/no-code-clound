<template>
  <div
    class="canvas-field"
    :class="[
      widthClass[field.width] || 'is-w-full',
      {
        'is-selected': selected,
        'is-child-selected': childSelected,
        'is-dragging': dragging,
        'is-drag-over': dragOver,
        'is-image': field.type === 'image',
        'is-file': field.type === 'file',
        'is-tabs': field.type === 'tabs',
        'is-embedded': embedded,
      },
    ]"
    :draggable="!embedded"
    @click.stop="onSelect"
    @dragstart.stop="onDragStart"
    @dragover.prevent="onDragOver"
    @drop.prevent.stop="onDrop"
    @dragend="onDragEnd"
  >
    <div v-if="selected && !embedded" class="canvas-field-actions">
      <el-button-group>
        <!-- <el-button size="small" :icon="CopyDocument" @click.stop="$emit('copy')" /> -->
        <el-button size="small" :icon="Delete" @click.stop="onRemove" />
      </el-button-group>
    </div>
    <!-- el-divider 会自己显示title，不需要再添加标题  -->
     <!-- 其余的组件标题都显示到上面 -->
      <!-- 左右布局需要设置合理的 label width ，暂时不支持-->
    <span v-if="field.type !== 'divider' && field.type !== 'tabs' && !embedded" class="canvas-field-title">
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
    <FormMemberSelect
      v-else-if="field.type === 'member' || field.type === 'member-multiple'"
      class="canvas-item"
      :field="field"
      preview
    />
    <el-select
      v-else-if="field.type === 'dept' || field.type === 'relate'"
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
    <el-input
      v-else-if="field.type === 'serialNumber'"
      disabled
      class="canvas-item"
      :placeholder="field.placeholder"
    />
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
            :fill-tips="fillTips"
            :items="dictItemsByCode[child.dictCode] || []"
            :dict-items-by-code="dictItemsByCode"
            :selected="selectedKey === child.key"
            :selected-key="selectedKey"
            :dragging="innerDragKey === child.key"
            :drag-over="innerDragOverKey === child.key"
            @select="onForwardSelect"
            @copy="onForwardCopy"
            @remove="onForwardRemove"
            @add="onForwardAdd"
            @add-child="onForwardAddChild"
            @reorder="onForwardReorder"
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
    <div v-else-if="field.type === 'subform'" class="canvas-subform">
      <div class="canvas-subform-table">
        <div class="canvas-subform-head">
          <div
            v-for="child in childFields"
            :key="child.key"
            class="canvas-subform-col"
            :class="{ 'is-selected': selectedKey === child.key }"
            @click.stop="onSelectChild(child)"
          >
            <span v-if="child.required" class="canvas-field-required">*</span>
            <el-tooltip v-if="hasLinkage(child)" content="设置了数据联动" placement="top">
              <el-icon class="canvas-field-fill">
                <Link />
              </el-icon>
            </el-tooltip>
            <el-tooltip v-if="fillTips[child.key]" :content="fillTips[child.key]" placement="top">
              <el-icon class="canvas-field-fill">
                <Connection />
              </el-icon>
            </el-tooltip>
            <span>{{ child.title }}</span>
          </div>
          <div class="canvas-subform-col is-add" @click.stop>
            <el-dropdown
              trigger="click"
              popper-class="canvas-subform-type-menu"
              @command="onAddChildType"
            >
              <el-icon class="canvas-subform-plus"><Plus /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="item in childTypeOptions"
                    :key="item.type"
                    :command="item.type"
                    :icon="item.icon"
                  >
                    {{ item.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <div class="canvas-subform-body">
          <div
            v-if="!childFields.length"
            class="canvas-subform-cell is-hint"
          >
            从左侧拖入字段到子表单
          </div>
          <div
            v-for="child in childFields"
            :key="`${child.key}-preview`"
            class="canvas-subform-cell"
            :class="{
              'is-image': child.type === 'image',
              'is-file': child.type === 'file',
            }"
            @click.stop="onSelectChild(child)"
          >
            <FormDesignCanvasField
              :app-id="appId"
              :field="child"
              :fill-tip="fillTips[child.key]"
              :items="dictItemsByCode[child.dictCode] || []"
              :selected="selectedKey === child.key"
              embedded
            />
          </div>
          <div class="canvas-subform-cell is-add" />
        </div>
      </div>
      <el-button class="canvas-subform-add" disabled size="small" type="primary">添加</el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { CopyDocument, Connection, Delete, InfoFilled, Link, Plus } from '@element-plus/icons-vue'
import { fieldTypes, widthClass } from './fieldTypes'
import {
  hasLinkage,
  hasSubformLinkage,
  needsOptionSourceHint as fieldNeedsOptionSourceHint,
} from './linkage'
import { isTabsField } from './tabsField.js'
import { SUBFORM_CHILD_TYPES } from '../form-fill/subformField.js'
import FormDataSelect from '../form-fill/FormDataSelect.vue'
import FormFileUpload from '../form-fill/FormFileUpload.vue'
import FormAddressSelect from '../form-fill/FormAddressSelect.vue'
import FormMemberSelect from '../form-fill/FormMemberSelect.vue'
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
  embedded: { type: Boolean, default: false },
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
  'add-child',
  'reorder',
  'update:activePaneId',
])

const innerDragKey = ref('')
const innerDragOverKey = ref('')

const childFields = computed(() =>
  Array.isArray(props.field.fields) ? props.field.fields : [],
)

const childSelected = computed(
  () =>
    props.field.type === 'subform' &&
    childFields.value.some((child) => child.key === props.selectedKey),
)

const childTypeOptions = computed(() =>
  fieldTypes.filter((item) => SUBFORM_CHILD_TYPES.includes(item.type)),
)

const needsOptionSourceHint = computed(() =>
  fieldNeedsOptionSourceHint(props.field),
)

const linked = computed(
  () => hasLinkage(props.field) || hasSubformLinkage(props.field),
)

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

function onSelectChild(child) {
  emit('select', child)
}

function onAddChildType(type) {
  const item = fieldTypes.find((entry) => entry.type === type)
  if (!item) {
    return
  }
  emit('add-child', props.field, item)
}

function onForwardAdd(item, beforeKey, paneId) {
  emit('add', item, beforeKey, paneId)
}

function onForwardAddChild(parentField, item) {
  emit('add-child', parentField, item)
}

function onForwardReorder(fromKey, toKey) {
  emit('reorder', fromKey, toKey)
}

function onDragStart(event) {
  if (props.embedded) {
    return
  }
  emit('dragstart', event, props.field)
}

function onDragOver() {
  if (props.embedded) {
    return
  }
  emit('dragover', props.field)
}

function onDrop(event) {
  if (props.embedded) {
    return
  }
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
    if (child.type === 'subform') {
      emit('add-child', child, item)
      return
    }
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
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: none;
  min-width: 0;
  min-height: 88px;
}

.canvas-subform-empty {
  padding: 20px 8px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  text-align: center;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}

.canvas-field.is-child-selected {
  border-color: var(--el-color-primary-light-5);
}

.canvas-field.is-embedded {
  padding: 0;
  cursor: default;
  border-color: transparent;
  background: transparent;
}

.canvas-field.is-embedded:hover,
.canvas-field.is-embedded.is-selected {
  background: transparent;
  border-color: transparent;
}

.canvas-subform-table {
  min-width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow-x: auto;
}

.canvas-subform-head,
.canvas-subform-body {
  display: flex;
  flex-wrap: nowrap;
  min-width: 100%;
}

.canvas-subform-col,
.canvas-subform-cell {
  box-sizing: border-box;
  flex: 0 0 160px;
  width: 160px;
  min-width: 160px;
  padding: 8px;
  border-right: 1px solid var(--el-border-color-lighter);
}

.canvas-subform-col:last-child,
.canvas-subform-cell:last-child {
  border-right: none;
}

.canvas-subform-col {
  display: flex;
  align-items: center;
  background: var(--el-fill-color-light);
  font-size: 13px;
  font-weight: 600;
}

.canvas-subform-col.is-add,
.canvas-subform-cell.is-add {
  flex: 1 0 80px;
  width: auto;
  min-width: 80px;
  justify-content: center;
}

.canvas-subform-cell.is-hint {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.canvas-subform-plus {
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 16px;
}

.canvas-subform-col.is-selected {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.canvas-subform-body {
  border-top: 1px solid var(--el-border-color-lighter);
}

.canvas-subform-add {
  margin-top: 8px;
  align-self: flex-start;
}

.canvas-field.is-embedded :deep(.canvas-item) {
  max-width: none;
}

.canvas-subform-cell :deep(.canvas-item) {
  width: 100%;
  max-width: 100%;
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

<style lang="less">
.canvas-subform-type-menu .el-dropdown-menu {
  max-height: 280px;
  overflow-y: auto;
}
</style>
