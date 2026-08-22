<template>
  <div
    class="canvas-field"
    :class="[
      widthClass[field.width] || 'is-w-full',
      {
        'is-selected': selected,
        'is-dragging': dragging,
        'is-drag-over': dragOver,
      },
    ]"
    draggable="true"
    @click="$emit('select')"
    @dragstart="$emit('dragstart', $event)"
    @dragover.prevent="$emit('dragover')"
    @drop.prevent.stop="$emit('drop', $event)"
    @dragend="$emit('dragend')"
  >
    <div v-if="selected" class="canvas-field-actions">
      <el-button-group>
        <el-button size="small" :icon="CopyDocument" @click.stop="$emit('copy')" />
        <el-button size="small" :icon="Delete" @click.stop="$emit('remove')" />
      </el-button-group>
    </div>
    <!-- el-divider 会自己显示title，不需要再添加标题  -->
     <!-- 其余的组件标题都显示到上面 -->
      <!-- 左右布局需要设置合理的 label width ，暂时不支持-->
    <span v-if="field.type !== 'divider'" class="canvas-field-title">
      <span v-if="field.required" class="canvas-field-required">*</span>
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
      :placeholder="field.placeholder"
      :maxlength="field.maxLength || undefined"
    />
    <el-input-number
      v-else-if="field.type === 'number'"
      disabled
      class="canvas-full"
      :controls="false"
      :precision="field.precision"
      :min="field.rangeEnabled ? field.min : undefined"
      :max="field.rangeEnabled ? field.max : undefined"
      :placeholder="field.placeholder"
    />
    <el-input
      v-else-if="field.type === 'textarea'"
      type="textarea"
      disabled
      :rows="3"
      :placeholder="field.placeholder"
      :maxlength="field.maxLength || undefined"
    />
    <el-radio-group v-else-if="field.type === 'radio'" disabled>
      <el-radio value="1">选项一</el-radio>
      <el-radio value="2">选项二</el-radio>
    </el-radio-group>
    <el-checkbox-group v-else-if="field.type === 'checkbox'" disabled>
      <el-checkbox value="1">选项一</el-checkbox>
      <el-checkbox value="2">选项二</el-checkbox>
    </el-checkbox-group>
    <el-date-picker
      v-else-if="field.type === 'date'"
      disabled
      class="canvas-full"
      :type="field.format || 'date'"
      :placeholder="field.placeholder || '请选择'"
    />
    <el-time-picker
      v-else-if="field.type === 'time'"
      disabled
      class="canvas-full"
      :format="field.format || 'HH:mm:ss'"
      :placeholder="field.placeholder || '请选择'"
    />
    <el-date-picker
      v-else-if="field.type === 'datetime'"
      disabled
      class="canvas-full"
      type="datetime"
      :format="field.format || 'YYYY-MM-DD HH:mm:ss'"
      :placeholder="field.placeholder || '请选择'"
    />
    <el-select
      v-else-if="
        field.type === 'select' ||
        field.type === 'member' ||
        field.type === 'dept' ||
        field.type === 'data' ||
        field.type === 'relate'
      "
      disabled
      class="canvas-full"
      :placeholder="field.placeholder"
    />
    <el-divider v-else-if="field.type === 'divider'">
      {{ field.title }}
    </el-divider>
    <el-upload
      v-else-if="field.type === 'image'"
      disabled
      list-type="picture-card"
      :auto-upload="false"
    >
      <el-icon><Plus /></el-icon>
    </el-upload>
    <el-upload
      v-else-if="field.type === 'file'"
      disabled
      :auto-upload="false"
      :show-file-list="false"
    >
      <el-button disabled :icon="Upload" />
    </el-upload>
    <div v-else-if="field.type === 'subform'" class="canvas-subform" />
  </div>
</template>

<script setup>
import { CopyDocument, Delete, InfoFilled, Plus, Upload } from '@element-plus/icons-vue'
import { widthClass } from './fieldTypes'

defineProps({
  field: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  dragOver: { type: Boolean, default: false },
})

defineEmits(['select', 'copy', 'remove', 'dragstart', 'dragover', 'drop', 'dragend'])
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

.canvas-field-info {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  cursor: help;
}

.canvas-full {
  width: 100%;
}

.canvas-subform {
  min-height: 88px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}
</style>
