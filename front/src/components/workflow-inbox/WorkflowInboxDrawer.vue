<template>
  <el-drawer
    :model-value="modelValue"
    :title="title"
    direction="rtl"
    size="1000px"
    destroy-on-close
    @update:model-value="onVisibleChange"
    @closed="reset"
  >
    <div v-loading="loading" class="fill-drawer-body wf-drawer-body">
      <el-empty v-if="!loading && !detail" description="单据不存在" />
      <template v-else-if="detail">
        <p v-if="detail.recordMissing" class="wf-missing">数据已删除</p>
        <el-tabs v-model="activeTab" class="wf-tabs" @tab-change="onTabChange">
          <el-tab-pane label="表单" name="form" class="wf-pane-form">
            <FormFillGrid
              v-if="!detail.recordMissing"
              ref="gridRef"
              :app-id="appId"
              :fields="detail.form?.fields || []"
              :values="values"
              :dict-items-by-code="dictItemsByCode"
              :disabled="formDisabled"
              :updating="true"
              :user-names="detail.names || {}"
              :record-id="detail.record?.id || ''"
              :field-access="gridFieldAccess"
              :data-source="inboxSource"
              :lock-subform="lockSubform"
            />
          </el-tab-pane>
          <el-tab-pane label="流程" name="progress" lazy class="wf-pane-process">
            <div class="wf-process">
              <WorkflowMiniGraph
                ref="graphRef"
                :graph="detail.instance?.graph"
                :visited-node-keys="detail.instance?.visitedNodeKeys"
                :current-node-key="detail.instance?.currentNodeKey"
                :instance-status="detail.instance?.status"
                :allow-resubmit-after-terminated="
                  detail.allowResubmitAfterTerminated !== false
                "
              />
              <p v-if="detail.instance?.errorReason" class="wf-error">
                {{ detail.instance.errorReason }}
              </p>
              <div class="wf-process-list">
                <WorkflowProgressList :progress="progress" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
    <template #footer>
      <div class="wf-drawer-footer">
        <div v-if="showComment" class="wf-comment">
          <el-input
            v-model="comment"
            type="textarea"
            :rows="2"
            placeholder="审批意见"
          />
        </div>
        <div class="wf-drawer-actions">
          <el-button
            v-if="visible.approve"
            type="primary"
            :loading="acting"
            :disabled="acting"
            @click="onApprove"
          >
            同意
          </el-button>
          <el-button
            v-if="visible.reject"
            type="danger"
            :loading="acting"
            :disabled="acting"
            @click="onReject"
          >
            驳回
          </el-button>
          <el-button
            v-if="visible.transfer"
            :loading="acting"
            :disabled="acting"
            @click="openTransfer"
          >
            转交
          </el-button>
          <el-button
            v-if="visible.addSign"
            :loading="acting"
            :disabled="acting"
            @click="openAddSign"
          >
            加签
          </el-button>
          <el-button
            v-if="visible.returnPrevious"
            :loading="acting"
            :disabled="acting"
            @click="onReturnPrevious"
          >
            退回至上一审批节点
          </el-button>
          <el-button
            v-if="visible.returnStart"
            :loading="acting"
            :disabled="acting"
            @click="onReturnStart"
          >
            退回至发起人
          </el-button>
          <el-button
            v-if="visible.resubmit"
            type="primary"
            :loading="acting"
            :disabled="acting"
            @click="onResubmit"
          >
            提交
          </el-button>
          <el-button
            v-if="visible.draft"
            :loading="acting"
            :disabled="acting"
            @click="onDraft"
          >
            保存草稿
          </el-button>
          <el-button
            v-if="visible.submit"
            type="primary"
            :loading="acting"
            :disabled="acting"
            @click="onSubmit"
          >
            再次提交
          </el-button>
          <el-button
            v-if="visible.cancel"
            :loading="acting"
            :disabled="acting"
            @click="onCancel"
          >
            撤回
          </el-button>
          <el-button
            v-if="visible.retry"
            :loading="acting"
            :disabled="acting"
            @click="onRetry"
          >
            重试
          </el-button>
          <el-button @click="closeDrawer">关闭</el-button>
        </div>
      </div>
    </template>
  </el-drawer>
  <WorkflowActionPicker
    v-model="pickerVisible"
    :mode="pickerMode"
    @confirm="onPickerConfirm"
  />
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  addSignWorkflowTaskApi,
  cancelWorkflowInstanceApi,
  completeWorkflowTaskApi,
  getWorkflowInboxDetailApi,
  resubmitWorkflowTaskApi,
  retryWorkflowInstanceApi,
  returnPreviousWorkflowTaskApi,
  returnStartWorkflowTaskApi,
  saveWorkflowInstanceDraftApi,
  submitWorkflowInstanceApi,
  transferWorkflowTaskApi,
} from '../../api/workflow'
import FormFillGrid from '../form-fill/FormFillGrid.vue'
import { cloneRecordValues, firstRequiredError, buildRecordData } from '../form-fill/fillValues.js'
import { workflowInboxSource } from '../form-workspace/recordDataSource.js'
import {
  inboxActionsVisible,
  submitSuccessText,
} from './workflowStatus.js'
import { withDefaultFieldAccess } from '../workflow-design/fieldAccess.js'
import WorkflowActionPicker from './WorkflowActionPicker.vue'
import WorkflowMiniGraph from './WorkflowMiniGraph.vue'
import WorkflowProgressList from './WorkflowProgressList.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  kind: { type: String, required: true },
  itemId: { type: Number, default: 0 },
  appId: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue', 'changed'])

const loading = ref(false)
const acting = ref(false)
const detail = ref(null)
const values = reactive({})
const comment = ref('')
const activeTab = ref('form')
const gridRef = ref(null)
const graphRef = ref(null)
const pickerVisible = ref(false)
const pickerMode = ref('transfer')

const title = computed(() => {
  if (props.kind === 'todo') return '我的待办'
  if (props.kind === 'mine') return '我发起的'
  if (props.kind === 'cc') return '抄送我的'
  return '我处理的'
})
const inboxSource = computed(() =>
  detail.value?.instance?.id
    ? workflowInboxSource({ instanceId: detail.value.instance.id })
    : null,
)
const dictItemsByCode = computed(() =>
  Object.fromEntries(
    (detail.value?.dictionaries || []).map((row) => [row.code, row.items || []]),
  ),
)
const gridFieldAccess = computed(() => {
  if ((props.kind !== 'todo' && props.kind !== 'cc') || !detail.value) return {}
  if (detail.value.actions?.canResubmit) return {}
  return withDefaultFieldAccess(
    detail.value.fieldAccess,
    detail.value.form?.fields || [],
  )
})
const formDisabled = computed(() => {
  if (!detail.value || detail.value.recordMissing) return true
  if (detail.value.actions?.readOnly) return true
  if (props.kind === 'done' || props.kind === 'cc') return true
  if (props.kind === 'todo') return false
  return !detail.value.actions?.canDraft
})
const visible = computed(() => {
  if (detail.value?.recordMissing) return {}
  return inboxActionsVisible(props.kind, detail.value?.actions || {})
})
const lockSubform = computed(
  () => props.kind === 'todo' && !visible.value.resubmit,
)
const showComment = computed(
  () =>
    props.kind === 'todo' &&
    !detail.value?.recordMissing &&
    (visible.value.approve || visible.value.reject),
)
const progress = computed(() => ({
  graph: detail.value?.instance?.graph,
  notes: detail.value?.instance?.notes,
  tasks: detail.value?.tasks,
}))

function onVisibleChange(value) {
  emit('update:modelValue', value)
}

function closeDrawer() {
  emit('update:modelValue', false)
}

function reset() {
  detail.value = null
  comment.value = ''
  activeTab.value = 'form'
  pickerVisible.value = false
  for (const key of Object.keys(values)) {
    delete values[key]
  }
}

function onTabChange(name) {
  if (name !== 'progress') return
  nextTick(() => {
    nextTick(() => {
      graphRef.value?.resizeCanvas?.()
    })
  })
}

async function loadDetail() {
  if (!props.modelValue || !props.itemId) return
  loading.value = true
  try {
    const next = await getWorkflowInboxDetailApi(props.kind, props.itemId)
    detail.value = next
    const data = next.record?.data || {}
    for (const key of Object.keys(values)) {
      delete values[key]
    }
    Object.assign(values, cloneRecordValues(next.form?.fields || [], data))
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

function recordPayload() {
  return buildRecordData(detail.value?.form?.fields || [], values, {
    clearEmpty: true,
  })
}

async function runAction(fn) {
  if (acting.value) return
  acting.value = true
  try {
    await fn()
    emit('changed')
    closeDrawer()
  } catch {
    await loadDetail()
  } finally {
    acting.value = false
  }
}

function onApprove() {
  if (detail.value?.commentRequiredOnApprove && !comment.value.trim()) {
    ElMessage.warning('请填写审批意见')
    return
  }
  return runAction(async () => {
    const result = await completeWorkflowTaskApi(props.itemId, {
      action: 'approve',
      comment: comment.value,
      data: recordPayload(),
    })
    ElMessage.success(
      result?.waitingOthers
        ? '已通过，等待其他人审批'
        : submitSuccessText(result?.nextNodeTitle),
    )
  })
}

function onReject() {
  if (detail.value?.commentRequiredOnReject !== false && !comment.value.trim()) {
    ElMessage.warning('请填写驳回意见')
    return
  }
  return runAction(async () => {
    await completeWorkflowTaskApi(props.itemId, {
      action: 'reject',
      comment: comment.value,
    })
    ElMessage.success('已驳回')
  })
}

function onDraft() {
  return runAction(async () => {
    await saveWorkflowInstanceDraftApi(detail.value.instance.id, recordPayload())
    ElMessage.success('保存成功')
  })
}

function onSubmit() {
  const err = firstRequiredError(detail.value?.form?.fields || [], values)
  if (err) {
    ElMessage.warning(err.message)
    gridRef.value?.revealField(err.key)
    return
  }
  return runAction(async () => {
    const result = await submitWorkflowInstanceApi(
      detail.value.instance.id,
      recordPayload(),
    )
    ElMessage.success(submitSuccessText(result?.nextNodeTitle))
  })
}

function onCancel() {
  return runAction(async () => {
    await cancelWorkflowInstanceApi(detail.value.instance.id)
    ElMessage.success('已撤回')
  })
}

function onRetry() {
  return runAction(async () => {
    await retryWorkflowInstanceApi(detail.value.instance.id)
    ElMessage.success('已重试')
  })
}

function openTransfer() {
  pickerMode.value = 'transfer'
  pickerVisible.value = true
}

function openAddSign() {
  pickerMode.value = 'addSign'
  pickerVisible.value = true
}

function onPickerConfirm(payload) {
  pickerVisible.value = false
  if (pickerMode.value === 'addSign') {
    return runAction(async () => {
      await addSignWorkflowTaskApi(props.itemId, payload)
      ElMessage.success('已加签')
    })
  }
  return runAction(async () => {
    await transferWorkflowTaskApi(props.itemId, payload)
    ElMessage.success('已转交')
  })
}

async function promptReturnComment(title) {
  const { value } = await ElMessageBox.prompt('请填写退回意见', title, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputType: 'textarea',
    inputPlaceholder: '退回意见',
    inputValidator: (text) =>
      String(text || '').trim() ? true : '请填写退回意见',
  })
  return String(value || '').trim()
}

async function onReturnPrevious() {
  let commentText
  try {
    commentText = await promptReturnComment('退回至上一审批节点')
  } catch {
    return
  }
  return runAction(async () => {
    await returnPreviousWorkflowTaskApi(props.itemId, { comment: commentText })
    ElMessage.success('已退回至上一审批节点')
  })
}

async function onReturnStart() {
  let commentText
  try {
    commentText = await promptReturnComment('退回至发起人')
  } catch {
    return
  }
  return runAction(async () => {
    await returnStartWorkflowTaskApi(props.itemId, { comment: commentText })
    ElMessage.success('已退回至发起人')
  })
}

function onResubmit() {
  const err = firstRequiredError(detail.value?.form?.fields || [], values)
  if (err) {
    ElMessage.warning(err.message)
    gridRef.value?.revealField(err.key)
    return
  }
  return runAction(async () => {
    const result = await resubmitWorkflowTaskApi(props.itemId, {
      data: recordPayload(),
    })
    ElMessage.success(submitSuccessText(result?.nextNodeTitle))
  })
}

watch(
  () => [props.modelValue, props.kind, props.itemId],
  () => {
    if (props.modelValue) {
      activeTab.value = 'form'
      loadDetail()
    }
  },
)
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';

:deep(.el-drawer__body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wf-drawer-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.wf-tabs {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.wf-tabs :deep(.el-tabs__header) {
  flex: none;
  margin-bottom: 8px;
}

.wf-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wf-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: auto;
}

.wf-tabs :deep(.wf-pane-process) {
  overflow: hidden;
}

.wf-process {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.wf-process :deep(.wf-mini-graph) {
  flex: 1 1 0;
  min-height: 280px;
  height: auto;
  margin-bottom: 0;
}

.wf-process-list {
  flex: 0 1 auto;
  max-height: 45%;
  overflow: auto;
  margin-top: 24px;
}

.wf-missing,
.wf-error {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.wf-error {
  flex: none;
  color: var(--el-color-danger);
}

.wf-drawer-footer {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.wf-comment {
  margin-bottom: 12px;
}

.wf-drawer-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
