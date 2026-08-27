<template>
  <el-dialog
    :model-value="modelValue"
    title="数据联动设置"
    width="880px"
    align-center
    draggable
    destroy-on-close
    class="my-dialog linkage-dialog"
    body-class="my-dialog-body"
    @update:model-value="onDialogVisible"
  >
    <div class="linkage-body">
      <div class="linkage-section">
        <div class="linkage-label">
          <span class="linkage-required">*</span>
          <span>联动表单</span>
        </div>
        <el-select
          class="linkage-form-select"
          :model-value="draft.sourceFormId"
          filterable
          placeholder="请选择表单"
          @change="onSourceFormChange"
        >
          <el-option
            v-for="form in forms"
            :key="form.id"
            :label="form.name"
            :value="form.id"
          />
        </el-select>
      </div>
      <template v-if="hasSourceForm">
      <div class="linkage-section">
        <FormFilterConditions
          :filters="draft"
          :app-id="appId"
          :source-fields="sourceFields"
          :form-fields="formFields"
          match-lead="联动表单字段满足以下"
          match-tail="条件时"
          required
          comfortable
          prefer-field-value
        />
      </div>
      <div class="linkage-section">
        <div class="linkage-label">触发以下联动</div>
        <div class="trigger-map">
          <div class="trigger-side">
            <span class="trigger-side-label">当前表单</span>
            <div class="trigger-box">
              <el-icon v-if="currentFieldIcon" class="trigger-box-icon">
                <component :is="currentFieldIcon" />
              </el-icon>
              <span class="trigger-box-text">{{ currentFieldLabel }}</span>
            </div>
          </div>
          <span class="trigger-join">联动显示</span>
          <div class="trigger-side is-grow">
            <span class="trigger-side-label">联动表单</span>
            <FieldSelect
              v-model="draft.sourceKey"
              :fields="triggerFields"
              placeholder="请选择联动表字段"
            />
          </div>
          <span class="trigger-join">的值</span>
        </div>
      </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { listFormFieldsApi } from '../../api/apps'
import FieldSelect from './FieldSelect.vue'
import FormFilterConditions from './FormFilterConditions.vue'
import { fieldOptionLabel, fieldTypeIcon } from './fieldTypes'
import { emptyCondition } from './optionFilters'
import {
  cloneLinkage,
  filterLinkageSourceFields,
  isCompleteCondition,
} from './linkage'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  fieldTitle: { type: String, default: '' },
  fieldType: { type: String, default: '' },
  linkage: { type: Object, default: null },
  currentFields: { type: Array, default: () => [] },
  formFields: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const draft = reactive(cloneLinkage(null))
const forms = ref([])
const sourceFields = ref([])

const triggerFields = computed(() =>
  filterLinkageSourceFields(sourceFields.value, props.fieldType),
)

const currentFieldIcon = computed(() => fieldTypeIcon(props.fieldType))

const currentFieldLabel = computed(() =>
  fieldOptionLabel({ title: props.fieldTitle, type: props.fieldType }),
)

const hasSourceForm = computed(() => {
  const id = Number(draft.sourceFormId)
  return Number.isInteger(id) && id > 0
})

function onDialogVisible(value) {
  emit('update:modelValue', value)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function blankCondition() {
  return emptyCondition('field')
}

function ensureConditionRow() {
  if (!draft.conditions.length) {
    draft.conditions.push(blankCondition())
  }
}

function onSourceFormChange(formId) {
  if (Number(draft.sourceFormId) !== Number(formId)) {
    draft.match = 'all'
    draft.conditions = [blankCondition()]
    draft.sourceKey = ''
  }
  draft.sourceFormId = formId || null
}

async function loadForms() {
  if (!props.appId) {
    forms.value = []
    return
  }
  try {
    forms.value = (await listFormFieldsApi(props.appId)) || []
  } catch {
    forms.value = []
  }
}

function loadSourceFields() {
  const sourceFormId = Number(draft.sourceFormId)
  if (!Number.isInteger(sourceFormId) || sourceFormId <= 0) {
    sourceFields.value = []
    return
  }
  if (sourceFormId === Number(props.formId)) {
    sourceFields.value = props.currentFields || []
    return
  }
  const form = forms.value.find((item) => Number(item.id) === sourceFormId)
  sourceFields.value = form?.fields || []
}

function onConfirm() {
  if (!draft.sourceFormId) {
    ElMessage.warning('请选择联动表单')
    return
  }
  const conditions = (draft.conditions || []).filter(isCompleteCondition)
  if (!conditions.length) {
    ElMessage.warning('请至少添加一条联动条件')
    return
  }
  if (!draft.sourceKey) {
    ElMessage.warning('请选择触发联动字段')
    return
  }
  emit('confirm', cloneLinkage({ ...draft, conditions }))
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    const next = cloneLinkage(props.linkage)
    draft.sourceFormId = next.sourceFormId
    draft.match = next.match
    draft.conditions = next.conditions
    draft.sourceKey = next.sourceKey
    ensureConditionRow()
    await loadForms()
    loadSourceFields()
  },
)

watch(
  () => [draft.sourceFormId, props.formId],
  () => {
    if (props.modelValue) loadSourceFields()
  },
)
</script>

<style scoped lang="less">
.linkage-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.linkage-label {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 22px;
  color: var(--el-text-color-regular);
}

.linkage-required {
  margin-right: 4px;
  color: var(--el-color-danger);
}

.trigger-map {
  display: flex;
  align-items: flex-end;
}

.trigger-side {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.trigger-side.is-grow {
  flex: 1;
}

.trigger-side-label {
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.trigger-box {
  display: flex;
  align-items: center;
  width: 320px;
  height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  font-size: 14px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.trigger-box-icon {
  flex-shrink: 0;
  margin-right: 6px;
  color: var(--el-text-color-secondary);
}

.trigger-box-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-join {
  flex-shrink: 0;
  margin: 0 12px;
  font-size: 13px;
  line-height: 32px;
  color: var(--el-text-color-regular);
}

.linkage-form-select {
  width: 100%;
}
</style>
