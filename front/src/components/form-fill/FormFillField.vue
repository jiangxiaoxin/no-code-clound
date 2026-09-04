<template>
  <div v-if="shouldRender" class="fill-field" :class="fieldClass">
    <span
      v-if="field.type !== 'divider' && !plain"
      class="fill-field-title"
      :title="fieldKeyTitle"
    >
      <span v-if="field.required" class="fill-field-required">*</span>
      <el-tooltip v-if="linked" content="设置了数据联动" placement="top">
        <el-icon class="fill-field-fill">
          <Link />
        </el-icon>
      </el-tooltip>
      <el-tooltip v-if="fillTip" :content="fillTip" placement="top">
        <el-icon class="fill-field-fill">
          <Connection />
        </el-icon>
      </el-tooltip>
      <el-tooltip v-if="isRelateSubform" :content="relateSubformTitleTip" placement="top">
        <el-icon class="fill-field-fill">
          <Link />
        </el-icon>
      </el-tooltip>
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
      clearable
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
      clearable
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
      clearable
      :disabled="isDisabled"
      :type="field.format || 'date'"
      value-format="YYYY-MM-DD"
      :placeholder="field.placeholder || '请选择'"
      @change="onCommitDraft"
    />
    <el-time-picker
      v-else-if="field.type === 'time'"
      class="fill-full"
      v-model="draft"
      clearable
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
      clearable
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
      clearable
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
    <FormMemberSelect
      v-else-if="field.type === 'member' || field.type === 'member-multiple'"
      class="fill-full"
      :field="field"
      :model-value="modelValue"
      :disabled="isDisabled"
      :record-values="recordValues"
      :user-names="userNames"
      @update:model-value="onUpdateModelValue"
    />
    <FormDeptSelect
      v-else-if="field.type === 'dept' || field.type === 'dept-multiple'"
      class="fill-full"
      :field="field"
      :model-value="modelValue"
      :disabled="isDisabled"
      :dept-names="deptNames"
      @update:model-value="onUpdateModelValue"
    />
    <FormDataSelect
      v-else-if="field.type === 'relate'"
      class="fill-full"
      :app-id="appId"
      :field="field"
      mode="relate"
      :disabled="isDisabled"
      :model-value="modelValue"
      :record-values="recordValues"
      :form-fields="formFields"
      :exclude-record-id="recordId"
      @update:model-value="onUpdateModelValue"
      @fill="onFill"
    />
    <FormDataSelect
      v-else-if="field.type === 'data'"
      class="fill-full"
      :app-id="appId"
      :field="field"
      :disabled="isDisabled"
      :model-value="modelValue"
      :record-values="recordValues"
      :form-fields="formFields"
      :multiple="multiple"
      :compact="compact"
      @update:model-value="onUpdateModelValue"
      @fill="onFill"
      @fill-rows="onFillRows"
    />
    <CurrentUserName
      v-else-if="field.type === 'currentUser'"
      class="fill-full"
      :title="fieldKeyTitle"
    />
    <CurrentUserDept
      v-else-if="field.type === 'currentUserDept'"
      class="fill-full"
      :title="fieldKeyTitle"
    />
    <el-input
      v-else-if="field.type === 'serialNumber'"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      disabled
      class="fill-full"
      :placeholder="field.placeholder"
    />
    <el-divider v-else-if="field.type === 'divider'" :title="fieldKeyTitle">
      {{ field.title }}
    </el-divider>
    <FormImageUpload
      v-else-if="field.type === 'image'"
      :field="field"
      :app-id="appId"
      :model-value="modelValue"
      :disabled="isDisabled"
      @update:model-value="onUpdateModelValue"
    />
    <FormFileUpload
      v-else-if="field.type === 'file'"
      :field="field"
      :app-id="appId"
      :model-value="modelValue"
      :disabled="isDisabled"
      @update:model-value="onUpdateModelValue"
    />
    <FormAddressSelect
      v-else-if="field.type === 'address'"
      :field="field"
      :model-value="modelValue"
      :disabled="isDisabled"
      :placeholder="field.placeholder"
      @update:model-value="onUpdateModelValue"
    />
    <FormSubform
      v-else-if="field.type === 'subform'"
      class="fill-full"
      :app-id="appId"
      :field="field"
      :model-value="Array.isArray(modelValue) ? modelValue : []"
      :disabled="disabled"
      :updating="updating"
      :record-values="recordValues"
      :form-fields="formFields"
      :dict-items-by-code="dictItemsByCode"
      :user-names="userNames"
      :dept-names="deptNames"
      @update:model-value="onUpdateModelValue"
    />
    <FormRelateSubform
      v-else-if="field.type === 'relate-subform'"
      class="fill-full"
      :field="field"
      :app-id="appId"
      :record-id="recordId"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Connection, InfoFilled, Link } from '@element-plus/icons-vue'
import { widthClass } from '../form-design/fieldTypes'
import {
  hasLinkage,
  hasSubformLinkage,
  needsOptionSourceHint as fieldNeedsOptionSourceHint,
} from '../form-design/linkage'
import {
  isRelateSubformField,
  RELATE_SUBFORM_TITLE_TIP,
} from '../form-design/relateSubform.js'
import FormDataSelect from './FormDataSelect.vue'
import FormImageUpload from './FormImageUpload.vue'
import FormFileUpload from './FormFileUpload.vue'
import FormAddressSelect from './FormAddressSelect.vue'
import FormSubform from './FormSubform.vue'
import FormRelateSubform from './FormRelateSubform.vue'
import FormMemberSelect from './FormMemberSelect.vue'
import FormDeptSelect from './FormDeptSelect.vue'
import CurrentUserName from './CurrentUserName.vue'
import CurrentUserDept from './CurrentUserDept.vue'

const props = defineProps({
  field: { type: Object, required: true },
  fillTip: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  modelValue: { default: undefined },
  disabled: { type: Boolean, default: false },
  updating: { type: Boolean, default: false },
  appId: { type: Number, default: 0 },
  recordValues: { type: Object, default: () => ({}) },
  formFields: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  plain: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  userNames: { type: Object, default: () => ({}) },
  deptNames: { type: Object, default: () => ({}) },
  recordId: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'fill', 'fill-rows'])

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

const linked = computed(
  () => hasLinkage(props.field) || hasSubformLinkage(props.field),
)

const isRelateSubform = computed(() => isRelateSubformField(props.field))
const relateSubformTitleTip = RELATE_SUBFORM_TITLE_TIP

const isDisabled = computed(
  () =>
    props.disabled ||
    Boolean(props.field.disabled) ||
    (props.updating && props.field.editable === false),
)

function commitValue(value) {
  if (props.recordValues && props.field.key) {
    props.recordValues[props.field.key] = value
  }
  emit('update:modelValue', value)
}

function onUpdateModelValue(value) {
  commitValue(value)
}

function onCommitDraft() {
  commitValue(cloneDraft(draft.value))
}

function onFill(patches) {
  emit('fill', patches)
}

function onFillRows(items) {
  emit('fill-rows', items)
}

const needsOptionSourceHint = computed(() =>
  fieldNeedsOptionSourceHint(props.field),
)

const shouldRender = computed(() => {
  if (props.field.type === 'relate-subform' && !props.recordId) {
    return false
  }
  return true
})

const fieldClass = computed(() => {
  if (props.plain) {
    return ['is-plain']
  }
  if (props.field.type === 'relate-subform') {
    return ['is-w-full', 'is-subform']
  }
  const width = widthClass[props.field.width] || 'is-w-full'
  if (props.field.type === 'image') return [width, 'is-image']
  if (props.field.type === 'file') return [width, 'is-file']
  if (props.field.type === 'subform') return [width, 'is-subform']
  return width
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

.fill-field.is-image,
.fill-field.is-file,
.fill-field.is-subform,
.fill-field.is-plain {
  max-width: none;
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

.fill-field-fill {
  margin-right: 4px;
  color: var(--el-color-primary);
  cursor: help;
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
