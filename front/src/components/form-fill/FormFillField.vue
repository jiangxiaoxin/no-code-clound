<template>
  <div class="fill-field" :class="widthClass[field.width] || 'is-w-full'">
    <span v-if="field.type !== 'divider'" class="fill-field-title">
      <span v-if="field.required" class="fill-field-required">*</span>
      <span class="fill-field-title-text">{{ field.title }}</span>
      <el-tooltip
        v-if="field.description?.trim()"
        :content="field.description"
        placement="top"
      >
        <el-icon class="fill-field-info">
          <InfoFilled />
        </el-icon>
      </el-tooltip>
    </span>
    <el-input
      v-if="field.type === 'input'"
      :model-value="modelValue"
      :disabled="disabled"
      :placeholder="field.placeholder"
      :maxlength="field.maxLength || undefined"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <el-input-number
      v-else-if="field.type === 'number'"
      class="fill-full"
      align="left"
      :model-value="modelValue"
      :disabled="disabled"
      :controls="false"
      :precision="field.precision"
      :min="field.rangeEnabled ? field.min : undefined"
      :max="field.rangeEnabled ? field.max : undefined"
      :placeholder="field.placeholder"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <el-input
      v-else-if="field.type === 'textarea'"
      type="textarea"
      :rows="3"
      :model-value="modelValue"
      :disabled="disabled"
      :placeholder="field.placeholder"
      :maxlength="field.maxLength || undefined"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <div
      v-else-if="(field.type === 'radio' || field.type === 'checkbox') && !field.dictCode"
      class="fill-field-hint"
    >
      请配置选项字典
    </div>
    <el-radio-group
      v-else-if="field.type === 'radio'"
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <el-radio v-for="item in items" :key="item.value" :value="item.value">
        {{ item.label }}
      </el-radio>
    </el-radio-group>
    <el-checkbox-group
      v-else-if="field.type === 'checkbox'"
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <el-checkbox v-for="item in items" :key="item.value" :value="item.value">
        {{ item.label }}
      </el-checkbox>
    </el-checkbox-group>
    <el-date-picker
      v-else-if="field.type === 'date'"
      class="fill-full"
      :model-value="modelValue"
      :disabled="disabled"
      :type="field.format || 'date'"
      :placeholder="field.placeholder || '请选择'"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <el-time-picker
      v-else-if="field.type === 'time'"
      class="fill-full"
      :model-value="modelValue"
      :disabled="disabled"
      :format="field.format || 'HH:mm:ss'"
      :value-format="field.format || 'HH:mm:ss'"
      :placeholder="field.placeholder || '请选择'"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <el-date-picker
      v-else-if="field.type === 'datetime'"
      class="fill-full"
      type="datetime"
      :model-value="modelValue"
      :disabled="disabled"
      :format="field.format || 'YYYY-MM-DD HH:mm:ss'"
      :placeholder="field.placeholder || '请选择'"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <div v-else-if="needsOptionSourceHint" class="fill-field-hint">
      请配置选项来源
    </div>
    <el-select
      v-else-if="field.type === 'select' || field.type === 'select-multiple'"
      class="fill-full"
      :multiple="field.type === 'select-multiple'"
      :model-value="modelValue"
      :disabled="disabled"
      :placeholder="field.placeholder"
      @update:model-value="$emit('update:modelValue', $event)"
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
        field.type === 'data' ||
        field.type === 'relate'
      "
      disabled
      class="fill-full"
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
    <div v-else-if="field.type === 'subform'" class="fill-subform" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { InfoFilled, Plus, Upload } from '@element-plus/icons-vue'
import { isSelectType, widthClass } from '../form-design/fieldTypes'

const props = defineProps({
  field: { type: Object, required: true },
  items: { type: Array, default: () => [] },
  modelValue: { default: undefined },
  disabled: { type: Boolean, default: false },
})

defineEmits(['update:modelValue'])

const needsOptionSourceHint = computed(() => {
  const field = props.field
  if (!isSelectType(field.type)) {
    return false
  }
  const source = field.optionSource || 'dictionary'
  if (source === 'table_data') {
    return !field.sourceFormId || !field.sourceFieldKey
  }
  return !field.dictCode
})
</script>

<style scoped lang="less">
.fill-field {
  box-sizing: border-box;
  min-width: 0;
  max-width: 354px;
}

.fill-field.is-w-full {
  grid-column: span 12;
}

.fill-field.is-w-half {
  grid-column: span 6;
}

.fill-field.is-w-third {
  grid-column: span 4;
}

.fill-field.is-w-two-thirds {
  grid-column: span 8;
}

.fill-field.is-w-quarter {
  grid-column: span 3;
}

.fill-field.is-w-three-quarters {
  grid-column: span 9;
}

.fill-field-title {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: bold;
}

.fill-field-required {
  margin-right: 4px;
  color: var(--el-color-danger);
}

.fill-field-info {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  cursor: help;
}

.fill-field-hint {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  line-height: 32px;
}

.fill-full {
  width: 100%;
}

.fill-subform {
  min-height: 88px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}
</style>
