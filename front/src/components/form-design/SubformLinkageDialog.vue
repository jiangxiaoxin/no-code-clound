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
          <div class="linkage-label">
            <span class="linkage-required">*</span>
            <span>赋值数据源</span>
          </div>
          <el-select
            class="linkage-form-select"
            v-model="draft.sourceSubformKey"
            placeholder="请选择联动表子表单"
            @change="onSourceSubformChange"
          >
            <el-option
              v-for="item in sourceSubforms"
              :key="item.key"
              :label="item.title || item.key"
              :value="item.key"
            />
          </el-select>
        </div>
        <div v-if="draft.sourceSubformKey" class="linkage-section">
          <div class="linkage-label">
            <span class="linkage-required">*</span>
            <span>子字段对照</span>
          </div>
          <div
            v-for="(item, index) in draft.fieldMappings"
            :key="index"
            class="mapping-row"
          >
            <el-select v-model="item.targetKey" placeholder="当前子表列">
              <el-option
                v-for="child in targetFields"
                :key="child.key"
                :label="child.title || child.key"
                :value="child.key"
              />
            </el-select>
            <span class="mapping-join">对应</span>
            <el-select v-model="item.sourceKey" placeholder="源子表列">
              <el-option
                v-for="child in sourceFieldsFor(item.targetKey)"
                :key="child.key"
                :label="child.title || child.key"
                :value="child.key"
              />
            </el-select>
            <el-button link type="danger" @click="removeMapping(index)">删除</el-button>
          </div>
          <el-button type="primary" link @click="addMapping">添加对照</el-button>
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
import FormFilterConditions from './FormFilterConditions.vue'
import { emptyCondition } from './optionFilters'
import {
  cloneSubformLinkage,
  filterLinkageSourceFields,
  isCompleteCondition,
  isSubformLinkageConfigured,
} from './linkage'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  linkage: { type: Object, default: null },
  formFields: { type: Array, default: () => [] },
  targetFields: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const draft = reactive(cloneSubformLinkage(null))
const forms = ref([])
const sourceFields = ref([])
const sourceSubforms = ref([])

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
    draft.sourceSubformKey = ''
    draft.fieldMappings = [{ sourceKey: '', targetKey: '' }]
  }
  draft.sourceFormId = formId || null
}

function onSourceSubformChange() {
  draft.fieldMappings = [{ sourceKey: '', targetKey: '' }]
}

function addMapping() {
  draft.fieldMappings.push({ sourceKey: '', targetKey: '' })
}

function removeMapping(index) {
  draft.fieldMappings.splice(index, 1)
  if (!draft.fieldMappings.length) {
    addMapping()
  }
}

function sourceChildren() {
  const sub = sourceSubforms.value.find(
    (item) => item.key === draft.sourceSubformKey,
  )
  return sub?.fields || []
}

function sourceFieldsFor(targetKey) {
  const target = (props.targetFields || []).find((item) => item.key === targetKey)
  if (!target) {
    return sourceChildren()
  }
  return filterLinkageSourceFields(sourceChildren(), target.type)
}

async function loadForms() {
  if (!props.appId) {
    forms.value = []
    return
  }
  try {
    forms.value = (await listFormFieldsApi(props.appId, { include: 'subform' })) || []
  } catch {
    forms.value = []
  }
}

function loadSourceFields() {
  const sourceFormId = Number(draft.sourceFormId)
  if (!Number.isInteger(sourceFormId) || sourceFormId <= 0) {
    sourceFields.value = []
    sourceSubforms.value = []
    return
  }
  const form = forms.value.find((item) => Number(item.id) === sourceFormId)
  const all = form?.fields || []
  sourceSubforms.value = all.filter((item) => item.type === 'subform')
  sourceFields.value = all.filter((item) => item.type !== 'subform')
}

function onConfirm() {
  const conditions = (draft.conditions || []).filter(isCompleteCondition)
  const next = cloneSubformLinkage({
    ...draft,
    conditions,
    fieldMappings: (draft.fieldMappings || []).filter(
      (item) => item.sourceKey && item.targetKey,
    ),
  })
  if (!isSubformLinkageConfigured(next)) {
    ElMessage.warning('请完整设置联动表单、条件、源子表和对照')
    return
  }
  emit('confirm', next)
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    const next = cloneSubformLinkage(props.linkage)
    draft.sourceFormId = next.sourceFormId
    draft.match = next.match
    draft.conditions = next.conditions
    draft.sourceKey = next.sourceKey
    draft.sourceSubformKey = next.sourceSubformKey
    draft.fieldMappings = next.fieldMappings.length
      ? next.fieldMappings
      : [{ sourceKey: '', targetKey: '' }]
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

.linkage-form-select {
  width: 100%;
}

.mapping-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.mapping-row .el-select {
  flex: 1;
  min-width: 0;
}

.mapping-join {
  flex-shrink: 0;
  margin: 0 8px;
  font-size: 13px;
}
</style>
