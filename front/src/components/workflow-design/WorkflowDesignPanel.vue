<template>
  <div class="wf-design">
    <div class="wf-toolbar">
      <div class="wf-toolbar-left">
        
        <span class="wf-version">{{ versionText }}</span>
      </div>
      <div class="wf-toolbar-actions">
        <WorkflowVersionMenu
          :versions="versions"
          :viewing-id="viewingId"
          @pick="onPickVersion"
          @add="onAddVersion"
          @manage="onOpenManage"
        />
        <el-tooltip placement="bottom-end" :show-after="200" popper-class="wf-save-publish-tip">
          <template #content>
            <div class="wf-save-publish-tip">
              <p>保存：只写入当前正在看的设计中版本，不会切换启用。</p>
              <p>保存并启用：先保存再启用当前版本。若已有启用中的版本，那一版会变成设计中。</p>
            </div>
          </template>
          <el-icon class="wf-toolbar-tip">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
        <el-button :loading="saving" :disabled="readonly || enabling" @click="onSave">
          保存
        </el-button>
        <el-button
          type="primary"
          :loading="enabling"
          :disabled="readonly || saving"
          @click="onSaveAndEnable"
        >
          保存并启用
        </el-button>
      </div>
    </div>
    <div v-if="enableErrors.length" class="wf-errors">
      <div v-for="(item, index) in enableErrors" :key="index">{{ item }}</div>
    </div>
    <div class="wf-body">
      <WorkflowNodePalette :disabled="readonly" @add="onAddNode" @drag-start="onStartDragNode" />
      <div ref="canvasRef" class="wf-canvas" />
      <div class="wf-props-sidebar">
        <WorkflowNodeProps
          v-if="selectedNode"
          :node="selectedNode"
          :form-fields="formFields"
          :disabled="readonly"
          @change="onNodeChange"
          @delete="onDeleteSelectedNode"
        />
        <WorkflowEdgeProps
          v-else-if="selectedEdge"
          :edge="selectedEdge"
          :from-branch="edgeFromBranch"
          :app-id="appId"
          :form-fields="formFields"
          :disabled="readonly"
          @change="onEdgeChange"
          @delete="onDeleteSelectedEdge"
        />
        <div v-else class="wf-props wf-props-empty">
          <el-empty description="请点击画布中的节点或连线" />
        </div>
      </div>
    </div>
    <WorkflowVersionManageDialog
      v-model:visible="manageVisible"
      :versions="versions"
      @enable="onEnableVersion"
      @edit="onEditVersion"
      @delete="onDeleteVersion"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import LogicFlow, { RectNode, RectNodeModel } from '@logicflow/core'
import '@logicflow/core/es/index.css'

class WorkflowNodeModel extends RectNodeModel {
  initNodeData(data) {
    super.initNodeData(data)
    this.width = 140
    this.height = 48
    if (this.type === 'start') this.resizable = false
    if (this.text) this.text.editable = false
  }
}
import {
  copyWorkflowVersionApi,
  deleteWorkflowVersionApi,
  enableWorkflowVersionApi,
  getWorkflowApi,
  saveWorkflowVersionApi,
} from '../../api/workflow'
import { applyDefaultFieldAccessToGraph, withDefaultFieldAccess } from './fieldAccess.js'
import { emptyDraftGraph, toLogicflowGraph, toProductGraph } from './workflowGraph.js'
import { sortVersions } from './workflowVersion.js'
import { validateCanvasEdge } from './workflowConnectRules.js'
import { validatePublishedGraph } from './workflowValidate.js'
import WorkflowEdgeProps from './WorkflowEdgeProps.vue'
import WorkflowNodePalette from './WorkflowNodePalette.vue'
import WorkflowNodeProps from './WorkflowNodeProps.vue'
import WorkflowVersionManageDialog from './WorkflowVersionManageDialog.vue'
import WorkflowVersionMenu from './WorkflowVersionMenu.vue'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  formFields: { type: Array, default: () => [] },
})

const canvasRef = ref(null)
const saving = ref(false)
const enabling = ref(false)
const versions = ref([])
const viewingId = ref(0)
const hasBeenEnabled = ref(false)
const runningCount = ref(0)
const enableErrors = ref([])
const selectedNode = ref(null)
const selectedEdge = ref(null)
const manageVisible = ref(false)
const dirty = ref(false)
const suppressEdgeValidation = ref(false)
let lf = null
let lfSilent = false

const currentVersion = computed(
  () => versions.value.find((row) => row.id === viewingId.value) || versions.value[0],
)
const readonly = computed(() => Boolean(currentVersion.value?.enabled))
const enabledVersion = computed(() => versions.value.find((row) => row.enabled))

const versionText = computed(() => {
  if (enabledVersion.value) {
    return `V${enabledVersion.value.version}启用中`
  }
  if (!hasBeenEnabled.value) return '尚未启用任何版本'
  return `当前没有启用中的版本`
})

const edgeFromBranch = computed(() => {
  if (!selectedEdge.value || !lf) return false
  const from = lf.getNodeDataById(selectedEdge.value.from)
  return from?.type === 'branch'
})

function currentProduct() {
  if (!lf) return emptyDraftGraph()
  return applyDefaultFieldAccessToGraph(
    toProductGraph(lf.getGraphRawData()),
    props.formFields,
  )
}

let keySeq = 0
function nextKey(prefix) {
  keySeq += 1
  // 同一毫秒里连点两次会得到相同 key，拼一个自增序号兜底
  return `${prefix}_${Date.now().toString(36)}_${keySeq}`
}

function applyGraph(product) {
  if (!lf) return
  suppressEdgeValidation.value = true
  lf.render(toLogicflowGraph(product?.nodes?.length ? product : emptyDraftGraph()))
  suppressEdgeValidation.value = false
  selectedNode.value = null
  selectedEdge.value = null
}

function markDirty() {
  if (readonly.value) return
  dirty.value = true
}

function createNodeConfig(type) {
  const titles = { approve: '审批', branch: '分支', end: '结束', cc: '抄送' }
  const properties = {
    key: nextKey(type),
    title: titles[type],
    type,
  }
  if (type === 'approve' || type === 'cc') {
    properties.approver = {
      userIds: [],
      roleIds: [],
      memberFieldKeys: [],
      sameDeptAsInitiator: true,
      deptLeaderOfInitiator: false,
    }
    properties.fieldAccess = withDefaultFieldAccess({}, props.formFields)
  }
  if (type === 'approve') {
    properties.signMode = 'any'
    properties.commentRequiredOnApprove = false
    properties.allowTransfer = false
    properties.allowAddSign = false
  }
  return {
    id: properties.key,
    type,
    x: 0,
    y: 0,
    text: titles[type],
    properties,
  }
}

function onAddNode(type) {
  if (!lf || readonly.value) return
  const config = createNodeConfig(type)
  config.x = 240
  config.y = 180 + Math.random() * 80
  lf.addNode(config)
  markDirty()
}

function onStartDragNode(type) {
  if (!lf || readonly.value) return
  lf.dnd.startDrag(createNodeConfig(type))
}

function onNodeChange(node) {
  if (!lf || readonly.value) return
  lf.setProperties(node.key, {
    ...node,
    title: node.title,
  })
  const model = lf.getNodeModelById(node.key)
  if (model?.updateText) model.updateText(node.title || '')
  selectedNode.value = node
  markDirty()
}

function onEdgeChange(edge) {
  if (!lf || readonly.value) return
  lf.setProperties(edge.key, {
    ...edge,
    title: edge.title,
  })
  lf.updateText(edge.key, edge.title || '')
  selectedEdge.value = edge
  markDirty()
}

function onDeleteSelectedNode() {
  if (!lf || !selectedNode.value || readonly.value) return
  lf.deleteNode(selectedNode.value.key)
  selectedNode.value = null
  markDirty()
}

function onDeleteSelectedEdge() {
  if (!lf || !selectedEdge.value || readonly.value) return
  lf.deleteEdge(selectedEdge.value.key)
  selectedEdge.value = null
  markDirty()
}

function onCanvasKeydown(e) {
  if (!lf || readonly.value) return
  const target = e.target
  if (target instanceof HTMLElement) {
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }
    // 焦点不在画布上（弹窗、菜单、页面其他输入区）时不抢键盘；
    // 点过画布后焦点可能仍停在 body 上，这种情况放行
    const inCanvas = canvasRef.value?.contains(target)
    if (!inCanvas && target !== document.body) return
  }
  if (document.querySelector('.el-overlay')) return
  const mod = e.ctrlKey || e.metaKey
  const key = String(e.key || '').toLowerCase()
  if (mod && key === 'z' && !e.shiftKey) {
    e.preventDefault()
    lf.undo()
    afterHistoryChange()
    return
  }
  if ((mod && key === 'y') || (mod && key === 'z' && e.shiftKey)) {
    e.preventDefault()
    lf.redo()
    afterHistoryChange()
    return
  }
  if (key === 'backspace' || key === 'delete') {
    e.preventDefault()
    deleteByKeyboard()
  }
}

function deleteByKeyboard() {
  if (selectedEdge.value) {
    lf.deleteEdge(selectedEdge.value.key)
    selectedEdge.value = null
    markDirty()
    return
  }
  if (selectedNode.value) {
    if (selectedNode.value.type === 'start') {
      ElMessage.warning('开始节点不能删除')
      return
    }
    lf.deleteNode(selectedNode.value.key)
    selectedNode.value = null
    markDirty()
  }
}

function afterHistoryChange() {
  // 撤销/重做是直接恢复历史快照，不走 edge:add 校验，
  // 之前因校验失败被删掉的连线可能跟着回来，这里统一再校验一遍
  const graph = currentProduct()
  for (const edge of graph.edges) {
    const result = validateCanvasEdge(graph, {
      from: edge.from,
      to: edge.to,
      key: edge.key,
    })
    if (!result.ok) lf.deleteEdge(edge.key)
  }
  selectedNode.value = null
  selectedEdge.value = null
  markDirty()
}

function bindEvents() {
  lf.on('node:click', ({ data }) => {
    selectedEdge.value = null
    selectedNode.value = {
      key: data.properties?.key || data.id,
      type: data.type,
      title: data.properties?.title || data.text?.value || data.text || '',
      ...data.properties,
    }
  })
  lf.on('edge:click', ({ data }) => {
    selectedNode.value = null
    selectedEdge.value = {
      key: data.properties?.key || data.id,
      from: data.sourceNodeId,
      to: data.targetNodeId,
      title: data.properties?.title || data.text?.value || data.text || '',
      ...data.properties,
    }
  })
  lf.on('blank:click', () => {
    selectedNode.value = null
    selectedEdge.value = null
  })
  lf.on('node:delete', ({ data }) => {
    if (data.type === 'start' || data.properties?.type === 'start') {
      restoreStart(data)
    }
    markDirty()
  })
  lf.on('node:dnd-add', markDirty)
  lf.on('edge:add', onEdgeAdded)
}

function onEdgeAdded({ data }) {
  if (suppressEdgeValidation.value) return
  const graph = currentProduct()
  const edgeKey = data.properties?.key || data.id
  const result = validateCanvasEdge(graph, {
    from: data.sourceNodeId,
    to: data.targetNodeId,
    key: edgeKey,
  })
  if (!result.ok) {
    lf.deleteEdge(data.id)
    ElMessage.warning(result.message)
    return
  }
  markDirty()
}

function restoreStart(data) {
  if (!lf) return
  const product = currentProduct()
  if (product.nodes.some((node) => node.type === 'start')) return
  lf.addNode({
    id: data.id || 'start',
    type: 'start',
    x: data.x || 240,
    y: data.y || 40,
    text: data.text || '开始',
    properties: {
      ...data.properties,
      key: 'start',
      title: '开始',
      type: 'start',
      allowResubmitAfterTerminated:
        data.properties?.allowResubmitAfterTerminated !== false,
      processTimeout: data.properties?.processTimeout,
    },
  })
  ElMessage.warning('开始节点不能删除')
}

function createLf(silent) {
  lf?.destroy?.()
  lf = new LogicFlow({
    container: canvasRef.value,
    grid: true,
    stopMoveGraph: false,
    // LogicFlow 自带快捷键改不掉默认行为：复制粘贴会带出重复 key 的节点、
    // 退格会删掉开始节点再补救。整体关掉，快捷键在组件上自己绑。
    keyboard: { enabled: false },
    isSilentMode: silent,
    textEdit: false,
  })
  ;['start', 'approve', 'branch', 'end', 'cc'].forEach((type) => {
    lf.register({ type, view: RectNode, model: WorkflowNodeModel })
  })
  lf.setTheme({
    rect: { radius: 6 },
  })
  lfSilent = silent
  bindEvents()
}

function ensureLf(silent) {
  if (lf && lfSilent === silent) return
  createLf(silent)
}

function applyDetail(detail, preferredId) {
  versions.value = sortVersions(detail?.versions || [])
  hasBeenEnabled.value = Boolean(detail?.hasBeenEnabled)
  runningCount.value = detail?.runningCount || 0
  const enabledId = versions.value.find((row) => row.enabled)?.id
  const nextId =
    preferredId ||
    detail?.viewingVersionId ||
    enabledId ||
    versions.value[0]?.id
  viewingId.value = nextId
  const current = versions.value.find((row) => row.id === nextId) || versions.value[0]
  ensureLf(Boolean(current?.enabled))
  applyGraph(current?.graph)
  dirty.value = false
}

async function load(preferredId) {
  const detail = await getWorkflowApi(props.appId, props.formId)
  applyDetail(detail, preferredId)
}

async function confirmLoseChanges() {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm(
      '当前版本有未保存的修改，切换将丢失。确定切换吗？',
      '切换版本',
      { confirmButtonText: '确定切换', cancelButtonText: '取消', type: 'warning' },
    )
    return true
  } catch {
    return false
  }
}

async function onPickVersion(id) {
  if (id === viewingId.value) return
  if (!(await confirmLoseChanges())) return
  const row = versions.value.find((item) => item.id === id)
  if (!row) return
  viewingId.value = id
  ensureLf(Boolean(row.enabled))
  applyGraph(row.graph)
  dirty.value = false
}

async function onAddVersion() {
  if (!(await confirmLoseChanges())) return
  const created = await copyWorkflowVersionApi(
    props.appId,
    props.formId,
    viewingId.value,
  )
  await load(created?.id)
}

function onOpenManage() {
  manageVisible.value = true
}

async function persistCurrentGraph() {
  const graph = currentProduct()
  await saveWorkflowVersionApi(
    props.appId,
    props.formId,
    viewingId.value,
    graph,
  )
  const row = versions.value.find((item) => item.id === viewingId.value)
  if (row) row.graph = graph
  dirty.value = false
}

async function onSave() {
  if (readonly.value) return
  saving.value = true
  enableErrors.value = []
  try {
    await persistCurrentGraph()
    ElMessage.success('已保存')
  } catch {
    return
  } finally {
    saving.value = false
  }
}

async function onSaveAndEnable() {
  if (readonly.value) return
  try {
    await ElMessageBox.confirm(
      '确定保存并启用当前版本吗？启用后新提交会走这个版本；若已有启用中的版本，那一版会变成设计中。',
      '保存并启用',
      {
        confirmButtonText: '保存并启用',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  const localErrors = validatePublishedGraph(currentProduct(), props.formFields)
  if (localErrors.length) {
    enableErrors.value = localErrors
    return
  }
  enabling.value = true
  enableErrors.value = []
  try {
    await persistCurrentGraph()
    await enableWorkflowVersionApi(props.appId, props.formId, viewingId.value)
    ElMessage.success('已保存并启用')
    await load(viewingId.value)
  } catch (error) {
    enableErrors.value = extractEnableErrors(error)
  } finally {
    enabling.value = false
  }
}

async function onEnableVersion(versionId) {
  if (dirty.value) {
    ElMessage.warning('请先保存')
    return
  }
  try {
    await enableWorkflowVersionApi(props.appId, props.formId, versionId)
    enableErrors.value = []
    ElMessage.success('已启用')
    await load(versionId)
  } catch (error) {
    enableErrors.value = extractEnableErrors(error)
  }
}

function extractEnableErrors(error) {
  // axios 报错时 error.message 只是 "Request failed with status code 400"，
  // 后端校验信息在 response.data.message 里（启用失败时是数组，每条一条）
  const raw = error?.response?.data?.message ?? error?.message
  if (Array.isArray(raw)) return raw.map((item) => String(item))
  return raw ? [String(raw)] : []
}

async function onEditVersion(versionId) {
  manageVisible.value = false
  await onPickVersion(versionId)
}

async function onDeleteVersion(versionId) {
  try {
    await ElMessageBox.confirm(
      '删除后不能恢复。确定删除这个版本吗？',
      '删除版本',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const detail = await deleteWorkflowVersionApi(
      props.appId,
      props.formId,
      versionId,
    )
    const keepId = versionId === viewingId.value ? undefined : viewingId.value
    applyDetail(detail, keepId)
  } catch {
    return
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onCanvasKeydown)
  createLf(false)
  try {
    await load()
  } catch {
    applyGraph(emptyDraftGraph())
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onCanvasKeydown)
  // 只置空不销毁会留下键盘绑定和画布 DOM，来回进出这一页会越来越卡
  lf?.destroy?.()
  lf = null
})

watch(
  () => [props.appId, props.formId],
  () => {
    if (lf) load()
  },
)
</script>

<style scoped lang="less">
@import './workflowProps.less';

.wf-design {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wf-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.wf-toolbar-left {
  display: flex;
  align-items: center;
  min-width: 0;
}

.wf-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;

  :deep(.el-button) {
    margin-left: 0 !important; // el-button 自己会带默认的margin-left
  }
}

.wf-toolbar-tip {
  margin-right: 8px;
  color: var(--el-text-color-secondary);
  cursor: help;
  font-size: 16px;
}

.wf-version {
  color: var(--el-text-color-regular);
  font-weight: bold;
  font-size: 14px;
}

.wf-errors {
  flex-shrink: 0;
  padding: 8px 16px;
  color: var(--el-color-danger);
}

.wf-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wf-canvas {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.wf-props-sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: 320px;
  min-height: 0;
  overflow: hidden;

  > .wf-props {
    flex: 1;
    min-height: 0;
  }
}
</style>

<style lang="less">
.wf-save-publish-tip {
  max-width: 280px;

  p {
    margin: 0;

    + p {
      margin-top: 6px;
    }
  }
}
</style>
