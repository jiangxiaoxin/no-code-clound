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
    <div v-loading="loading" class="fill-drawer-body">
      <el-empty v-if="!loading && !detail" description="单据不存在" />
      <template v-else-if="detail">
        <p v-if="detail.recordMissing" class="wf-missing">数据已删除</p>
        <WorkflowMiniGraph
          :graph="detail.instance?.graph"
          :visited-node-keys="detail.instance?.visitedNodeKeys"
          :current-node-key="detail.instance?.currentNodeKey"
        />
        <p v-if="detail.instance?.errorReason" class="wf-error">
          {{ detail.instance.errorReason }}
        </p>
        <WorkflowProgressList :progress="progress" />
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
          :field-access="detail.fieldAccess || {}"
          :data-source="inboxSource"
          :lock-subform="kind === 'todo'"
        />
      </template>
    </div>
    <template #footer>
      <div class="wf-drawer-footer">
        <div v-if="kind === 'todo' && !detail?.recordMissing" class="wf-comment">
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
            通过
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
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  cancelWorkflowInstanceApi,
  completeWorkflowTaskApi,
  getWorkflowInboxDetailApi,
  retryWorkflowInstanceApi,
  saveWorkflowInstanceDraftApi,
  submitWorkflowInstanceApi,
} from '../../api/workflow'
import FormFillGrid from '../form-fill/FormFillGrid.vue'
import { cloneRecordValues, firstRequiredError, buildRecordData } from '../form-fill/fillValues.js'
import { workflowInboxSource } from '../form-workspace/recordDataSource.js'
import {
  inboxActionsVisible,
  submitSuccessText,
} from './workflowStatus.js'
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
const gridRef = ref(null)

const title = computed(() => {
  if (props.kind === 'todo') return '我的待办'
  if (props.kind === 'mine') return '我发起的'
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
const formDisabled = computed(() => {
  if (!detail.value || detail.value.recordMissing) return true
  if (detail.value.actions?.readOnly) return true
  if (props.kind === 'done') return true
  if (props.kind === 'todo') return false
  return !detail.value.actions?.canDraft
})
const visible = computed(() => {
  if (detail.value?.recordMissing) return {}
  return inboxActionsVisible(props.kind, detail.value?.actions || {})
})
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
  for (const key of Object.keys(values)) {
    delete values[key]
  }
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
  if (!comment.value.trim()) {
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

watch(
  () => [props.modelValue, props.kind, props.itemId],
  () => {
    if (props.modelValue) loadDetail()
  },
)
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';

.wf-missing,
.wf-error {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.wf-error {
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
