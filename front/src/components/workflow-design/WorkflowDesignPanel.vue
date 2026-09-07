<template>
  <div class="wf-design">
    <div class="wf-toolbar">
      <div class="wf-toolbar-left">
        <WorkflowVersionMenu
          :versions="versions"
          :viewing-id="viewingId"
          @pick="onPickVersion"
          @add="onAddVersion"
          @manage="onOpenManage"
        />
        <span class="wf-version">{{ versionText }}</span>
      </div>
      <div class="wf-toolbar-actions">
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
          @move="onEdgeMove"
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

function nextKey(prefix) {
  return `${prefix}_${Date.now().toString(36)}`
}

function applyGraph(product) {
  if (!lf) return
  lf.render(toLogicflowGraph(product?.nodes?.length ? product : emptyDraftGraph()))
  selectedNode.value = null
  selectedEdge.value = null
}

function markDirty() {
  if (readonly.value) return
  dirty.value = true
}

function createNodeConfig(type) {
  const titles = { approve: '审批', branch: '分支', end: '结束' }
  const properties = {
    key: nextKey(type),
    title: titles[type],
    type,
  }
  if (type === 'approve') {
    properties.approver = {
      userIds: [],
      roleIds: [],
      memberFieldKeys: [],
      sameDeptAsInitiator: true,
      deptLeaderOfInitiator: false,
    }
    properties.signMode = 'any'
    properties.commentRequiredOnApprove = false
    properties.fieldAccess = withDefaultFieldAccess({}, props.formFields)
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
  lf.setProperties(edge.key, edge)
  selectedEdge.value = edge
  markDirty()
}

function onEdgeMove(step) {
  if (readonly.value) return
  const product = currentProduct()
  const edges = product.edges.filter((item) => item.from === selectedEdge.value.from)
  const index = edges.findIndex((item) => item.key === selectedEdge.value.key)
  const next = index + step
  if (next < 0 || next >= edges.length) return
  const currentSort = edges[index].sort ?? index
  const swapSort = edges[next].sort ?? next
  lf.setProperties(edges[index].key, { ...edges[index], sort: swapSort })
  lf.setProperties(edges[next].key, { ...edges[next], sort: currentSort })
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
      title: data.properties?.title || '',
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
  lf.on('edge:add', markDirty)
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
      key: 'start',
      title: '开始',
      type: 'start',
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
    keyboard: { enabled: !silent },
    isSilentMode: silent,
    textEdit: false,
  })
  ;['start', 'approve', 'branch', 'end'].forEach((type) => {
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
    const message = error?.message || error?.response?.data?.message
    enableErrors.value = Array.isArray(message) ? message : []
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
    const message = error?.message || error?.response?.data?.message
    enableErrors.value = Array.isArray(message) ? message : []
  }
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
  createLf(false)
  try {
    await load()
  } catch {
    applyGraph(emptyDraftGraph())
  }
})

onBeforeUnmount(() => {
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
}

.wf-toolbar-tip {
  margin-right: 8px;
  color: var(--el-text-color-secondary);
  cursor: help;
  font-size: 16px;
}

.wf-version {
  margin-left: 32px;
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
