<template>
  <el-drawer
    :model-value="modelValue"
    title="数据详情"
    direction="rtl"
    size="1000px"
    destroy-on-close
    @update:model-value="onVisibleChange"
    @closed="resetDetail"
  >
    <div v-if="record" class="fill-drawer-body">
      <FormFillGrid
        ref="gridRef"
        :app-id="appId"
        :fields="fields"
        :values="detailValues"
        :dict-items-by-code="dictItemsByCode"
        :disabled="!editing"
        :updating="true"
        :user-names="record?.userNames || {}"
        :record-id="record?.id || ''"
        :data-source="recordSource"
      />
      <div v-if="isWorkflowForm" class="wf-progress">
        <div class="wf-progress-title">流程进度</div>
        <p v-if="record.workflowHint" class="wf-progress-hint">
          {{ record.workflowHint }}
        </p>
        <template v-else-if="record.workflowProgress">
          <WorkflowMiniGraph
            :graph="record.workflowProgress.graph"
            :visited-node-keys="record.workflowProgress.visitedNodeKeys"
            :current-node-key="record.workflowProgress.currentNodeKey"
          />
          <p v-if="record.workflowProgress.errorReason" class="wf-progress-error">
            {{ record.workflowProgress.errorReason }}
          </p>
          <WorkflowProgressList :progress="record.workflowProgress" />
        </template>
      </div>
      <div v-if="!editing" class="record-audit">
        <div class="record-audit-row">
          <span>创建人：{{ createdByLabel }}</span>
          <span>创建时间：{{ createdAtLabel }}</span>
        </div>
        <div class="record-audit-row">
          <span>更新人：{{ updatedByLabel }}</span>
          <span>更新时间：{{ updatedAtLabel }}</span>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="record-detail-footer">
        <div>
          <el-button v-if="!editing && showEdit" type="primary" @click="startEdit">
            编辑
          </el-button>
          <el-button
            v-if="!editing && showRetry"
            :loading="retrying"
            @click="onRetry"
          >
            重试
          </el-button>
        </div>
        <div class="record-detail-footer-right">
          <template v-if="editing">
            <el-button @click="cancelEdit">取消</el-button>
            <el-button
              v-if="!approvedSubmitOnly"
              type="primary"
              :loading="saving"
              @click="saveDetail"
            >
              保存
            </el-button>
            <el-button
              v-if="isWorkflowForm"
              type="primary"
              :loading="saving"
              @click="submitDetail"
            >
              提交
            </el-button>
          </template>
          <el-button v-else @click="closeDrawer">关闭</el-button>
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import FormFillGrid from '../form-fill/FormFillGrid.vue'
import { cloneRecordValues, firstRequiredError, buildRecordData } from '../form-fill/fillValues.js'
import { formatDateTime } from '../../utils/timeValue.js'
import { appRecordSource } from './recordDataSource.js'
import { retryWorkflowInstanceApi } from '../../api/workflow.js'
import { submitSuccessText } from '../workflow-inbox/workflowStatus.js'
import WorkflowMiniGraph from '../workflow-inbox/WorkflowMiniGraph.vue'
import WorkflowProgressList from '../workflow-inbox/WorkflowProgressList.vue'
import { useUserStore } from '../../stores/user'
import { canEditWorkflowRecord } from '../workflow-inbox/workflowStatus.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  record: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  appId: { type: Number, required: true },
  formId: { type: Number, default: null },
  formKind: { type: String, default: 'normal' },
  canEdit: { type: Boolean, default: true },
  canConfigure: { type: Boolean, default: false },
  startEditing: { type: Boolean, default: false },
  dataSource: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const userStore = useUserStore()
const editing = ref(false)
const saving = ref(false)
const retrying = ref(false)
const detailValues = reactive({})
const snapshot = ref({})
const gridRef = ref(null)

const recordSource = computed(
  () =>
    props.dataSource ||
    appRecordSource({ appId: props.appId, formId: props.formId }),
)
const isWorkflowForm = computed(() => props.formKind === 'workflow')
const createdByLabel = computed(() => props.record?.createdByName || '')
const updatedByLabel = computed(() => props.record?.updatedByName || '')
const createdAtLabel = computed(() => formatDateTime(props.record?.createdAt))
const updatedAtLabel = computed(() => formatDateTime(props.record?.updatedAt))
const actorId = computed(() => userStore.user?.id)
const showEdit = computed(() => {
  if (!props.canEdit) return false
  if (!isWorkflowForm.value) return true
  return canEditWorkflowRecord({
    formKind: 'workflow',
    status: props.record?.workflowStatus,
    initiatorId: props.record?.workflowInstance?.initiatorId,
    actorId: actorId.value,
    hasInstance: Boolean(props.record?.workflowInstanceId),
    publishEdit: true,
  })
})
const showRetry = computed(() => {
  if (!isWorkflowForm.value) return false
  if (props.record?.workflowStatus !== 'error') return false
  const initiatorId = props.record?.workflowInstance?.initiatorId
  return initiatorId === actorId.value || props.canConfigure
})
const approvedSubmitOnly = computed(
  () => isWorkflowForm.value && props.record?.workflowStatus === 'approved',
)

function applyValues(data) {
  for (const key of Object.keys(detailValues)) {
    delete detailValues[key]
  }
  Object.assign(detailValues, cloneRecordValues(props.fields, data))
  snapshot.value = cloneRecordValues(props.fields, data)
}

function onVisibleChange(value) {
  emit('update:modelValue', value)
}

function closeDrawer() {
  emit('update:modelValue', false)
}

function startEdit() {
  editing.value = true
}

function resetDetail() {
  editing.value = false
  snapshot.value = {}
  for (const key of Object.keys(detailValues)) {
    delete detailValues[key]
  }
}

function cancelEdit() {
  applyValues(snapshot.value)
  editing.value = false
}

async function persistDetail(intent) {
  const err = firstRequiredError(props.fields, detailValues)
  if (err) {
    ElMessage.warning(err.message)
    gridRef.value?.revealField(err.key)
    return
  }
  if (!props.record?.id || !props.formId) {
    return
  }
  saving.value = true
  try {
    const updated = await recordSource.value.update(
      props.record.id,
      buildRecordData(props.fields, detailValues, { clearEmpty: true }),
      intent,
    )
    applyValues(updated.data)
    editing.value = false
    if (intent === 'submit') {
      ElMessage.success(submitSuccessText(updated.nextNodeTitle))
    } else {
      ElMessage.success('保存成功')
    }
    emit('saved', updated)
    closeDrawer()
  } catch {
    return
  } finally {
    saving.value = false
  }
}

function saveDetail() {
  return persistDetail(isWorkflowForm.value ? 'draft' : undefined)
}

function submitDetail() {
  return persistDetail('submit')
}

async function onRetry() {
  const instanceId = props.record?.workflowInstanceId
  if (!instanceId) return
  retrying.value = true
  try {
    await retryWorkflowInstanceApi(instanceId)
    ElMessage.success('已重试')
    emit('saved', props.record)
    closeDrawer()
  } catch {
    return
  } finally {
    retrying.value = false
  }
}

watch(
  [() => props.modelValue, () => props.record?.id, () => props.startEditing],
  () => {
    if (props.modelValue && props.record) {
      editing.value = Boolean(props.startEditing && showEdit.value)
      applyValues(props.record.data)
    }
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';

.record-audit {
  display: flex;
  flex-direction: column;
  margin-top: 32px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
  background-color: var(--el-disabled-bg-color);
  padding: 6px;
  border-radius: 6px;
}

.record-audit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}

.record-detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-detail-footer-right {
  display: flex;
}

.wf-progress {
  margin-top: 24px;
}

.wf-progress-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.wf-progress-hint,
.wf-progress-error {
  margin: 0 0 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.wf-progress-error {
  color: var(--el-color-danger);
}
</style>
