<template>
  <div class="fill-field" :class="widthClass[field.width] || 'is-w-full'">
    <span
      v-if="field.type !== 'divider'"
      class="fill-field-title"
      :title="fieldKeyTitle"
    >
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
      v-model="draft"
      :disabled="isDisabled"
      :placeholder="field.placeholder"
      :maxlength="field.maxLength || undefined"
      @change="onCommitDraft"
    />
    <el-input-number
      v-else-if="field.type === 'number'"
      class="fill-full"
      align="left"
      v-model="draft"
      :disabled="isDisabled"
      :controls="false"
      :precision="field.precision"
      :min="field.rangeEnabled ? field.min : undefined"
      :max="field.rangeEnabled ? field.max : undefined"
      :placeholder="field.placeholder"
      @change="onCommitDraft"
    />
    <el-input
      v-else-if="field.type === 'textarea'"
      v-model="draft"
      type="textarea"
      :rows="3"
      :disabled="isDisabled"
      :placeholder="field.placeholder"
      :maxlength="field.maxLength || undefined"
      @change="onCommitDraft"
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
      :disabled="isDisabled"
      @change="onUpdateModelValue"
    >
      <el-radio v-for="item in items" :key="item.value" :value="item.value">
        {{ item.label }}
      </el-radio>
    </el-radio-group>
    <el-checkbox-group
      v-else-if="field.type === 'checkbox'"
      :model-value="modelValue"
      :disabled="isDisabled"
      @change="onUpdateModelValue"
    >
      <el-checkbox v-for="item in items" :key="item.value" :value="item.value">
        {{ item.label }}
      </el-checkbox>
    </el-checkbox-group>
    <el-date-picker
      v-else-if="field.type === 'date'"
      class="fill-full"
      v-model="draft"
      :disabled="isDisabled"
      :type="field.format || 'date'"
      :placeholder="field.placeholder || '请选择'"
      @change="onCommitDraft"
    />
    <el-time-picker
      v-else-if="field.type === 'time'"
      class="fill-full"
      v-model="draft"
      :disabled="isDisabled"
      :format="field.format || 'HH:mm:ss'"
      :value-format="field.format || 'HH:mm:ss'"
      :placeholder="field.placeholder || '请选择'"
      @change="onCommitDraft"
    />
    <el-date-picker
      v-else-if="field.type === 'datetime'"
      class="fill-full"
      type="datetime"
      v-model="draft"
      :disabled="isDisabled"
      :format="field.format || 'YYYY-MM-DD HH:mm:ss'"
      :placeholder="field.placeholder || '请选择'"
      @change="onCommitDraft"
    />
    <div v-else-if="needsOptionSourceHint" class="fill-field-hint">
      请配置选项来源
    </div>
    <el-select
      v-else-if="field.type === 'select' || field.type === 'select-multiple'"
      class="fill-full"
      :multiple="field.type === 'select-multiple'"
      :model-value="modelValue"
      :disabled="isDisabled"
      :placeholder="field.placeholder"
      @change="onUpdateModelValue"
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
      class="fill-full"
      :placeholder="field.placeholder"
    />
    <FormDataSelect
      v-else-if="field.type === 'data'"
      class="fill-full"
      :app-id="appId"
      :field="field"
      :disabled="isDisabled"
      :model-value="modelValue"
      @update:model-value="onUpdateModelValue"
      @fill="onFill"
    />
    <CurrentUserName
      v-else-if="field.type === 'currentUser'"
      class="fill-full"
      :title="fieldKeyTitle"
    />
    <el-divider v-else-if="field.type === 'divider'" :title="fieldKeyTitle">
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
import { computed, ref, watch } from 'vue'
import { InfoFilled, Plus, Upload } from '@element-plus/icons-vue'
import { isSelectType, widthClass } from '../form-design/fieldTypes'
import FormDataSelect from './FormDataSelect.vue'
import CurrentUserName from './CurrentUserName.vue'

const props = defineProps({
  field: { type: Object, required: true },
  items: { type: Array, default: () => [] },
  modelValue: { default: undefined },
  disabled: { type: Boolean, default: false },
  updating: { type: Boolean, default: false },
  appId: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue', 'fill'])

function cloneDraft(value) {
  return Array.isArray(value) ? [...value] : value
}

const draft = ref(cloneDraft(props.modelValue))

watch(
  () => props.modelValue,
  (value) => {
    draft.value = cloneDraft(value)
  },
)

const fieldKeyTitle = computed(() =>
  import.meta.env.DEV ? props.field.key || undefined : undefined,
)

const isDisabled = computed(
  () =>
    props.disabled ||
    Boolean(props.field.disabled) ||
    (props.updating && props.field.editable === false),
)

function onUpdateModelValue(value) {
  emit('update:modelValue', value)
}

function onCommitDraft() {
  emit('update:modelValue', cloneDraft(draft.value))
}

function onFill(patches) {
  emit('fill', patches)
}

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
