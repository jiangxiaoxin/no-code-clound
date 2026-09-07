<template>
  <div class="wf-design">
    <div class="wf-toolbar">
      <span class="wf-version">{{ versionText }}</span>
      <div class="wf-toolbar-actions">
        <el-tooltip placement="bottom-end" :show-after="200" popper-class="wf-save-publish-tip">
          <template #content>
            <div class="wf-save-publish-tip">
              <p>保存：只存流程草稿，不启用；正在审批的单据仍按提交时的版本走。</p>
              <p>发布：校验通过后更新已发布版本并自动启用；之后新提交走新版本。</p>
            </div>
          </template>
          <el-icon class="wf-toolbar-tip">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
        <el-button :loading="saving" @click="onSave">保存</el-button>
        <el-button type="primary" :loading="publishing" @click="onPublish">发布</el-button>
        <el-switch
          :model-value="enabled"
          :disabled="!publishedVersion"
          @change="onToggleEnabled"
          style="margin-left: 12px;"
        />
        <span>启用流程</span>
      </div>
    </div>
    <div v-if="publishErrors.length" class="wf-errors">
      <div v-for="(item, index) in publishErrors" :key="index">{{ item }}</div>
    </div>
    <div class="wf-body">
      <WorkflowNodePalette @add="onAddNode" @drag-start="onStartDragNode" />
      <div ref="canvasRef" class="wf-canvas" />
      <div class="wf-props-sidebar">
        <WorkflowNodeProps
          v-if="selectedNode"
          :node="selectedNode"
          :form-fields="formFields"
          @change="onNodeChange"
          @delete="onDeleteSelectedNode"
        />
        <WorkflowEdgeProps
          v-else-if="selectedEdge"
          :edge="selectedEdge"
          :from-branch="edgeFromBranch"
          :app-id="appId"
          :form-fields="formFields"
          @change="onEdgeChange"
          @move="onEdgeMove"
          @delete="onDeleteSelectedEdge"
        />
        <div v-else class="wf-props wf-props-empty">
          <el-empty description="请点击画布中的节点或连线" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import LogicFlow, { RectNode, RectNodeModel } from '@logicflow/core'
import '@logicflow/core/es/index.css'

class WorkflowNodeModel extends RectNodeModel {
  initNodeData(data) {
    super.initNodeData(data)
    this.width = 140
    this.height = 48
    if (this.type === 'start') this.resizable = false
  }
}
import {
  getWorkflowApi,
  patchWorkflowEnabledApi,
  publishWorkflowApi,
  saveWorkflowDraftApi,
} from '../../api/workflow'
import { validatePublishedGraph } from './workflowValidate.js'
import { emptyDraftGraph, toLogicflowGraph, toProductGraph } from './workflowGraph.js'
import WorkflowEdgeProps from './WorkflowEdgeProps.vue'
import WorkflowNodePalette from './WorkflowNodePalette.vue'
import WorkflowNodeProps from './WorkflowNodeProps.vue'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  formFields: { type: Array, default: () => [] },
})

const canvasRef = ref(null)
const saving = ref(false)
const publishing = ref(false)
const enabled = ref(false)
const publishedVersion = ref(0)
const runningCount = ref(0)
const publishErrors = ref([])
const selectedNode = ref(null)
const selectedEdge = ref(null)
let lf = null

const versionText = computed(() => {
  if (!publishedVersion.value) return '尚未发布'
  return `当前已发布版本 v${publishedVersion.value}。审批中的 ${runningCount.value} 条仍按提交时的版本走。`
})

const edgeFromBranch = computed(() => {
  if (!selectedEdge.value || !lf) return false
  const from = lf.getNodeDataById(selectedEdge.value.from)
  return from?.type === 'branch'
})

function currentProduct() {
  if (!lf) return emptyDraftGraph()
  return toProductGraph(lf.getGraphRawData())
}

function nextKey(prefix) {
  return `${prefix}_${Date.now().toString(36)}`
}

function applyGraph(product) {
  if (!lf) return
  lf.render(toLogicflowGraph(product?.nodes?.length ? product : emptyDraftGraph()))
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
    properties.commentRequiredOnReject = true
    properties.fieldAccess = {}
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
  if (!lf) return
  const config = createNodeConfig(type)
  config.x = 240
  config.y = 180 + Math.random() * 80
  lf.addNode(config)
}

function onStartDragNode(type) {
  if (!lf) return
  lf.dnd.startDrag(createNodeConfig(type))
}

function onNodeChange(node) {
  if (!lf) return
  lf.setProperties(node.key, {
    ...node,
    title: node.title,
  })
  const model = lf.getNodeModelById(node.key)
  if (model?.updateText) model.updateText(node.title || '')
  selectedNode.value = node
}

function onEdgeChange(edge) {
  if (!lf) return
  lf.setProperties(edge.key, edge)
  selectedEdge.value = edge
}

function onEdgeMove(step) {
  const product = currentProduct()
  const edges = product.edges.filter((item) => item.from === selectedEdge.value.from)
  const index = edges.findIndex((item) => item.key === selectedEdge.value.key)
  const next = index + step
  if (next < 0 || next >= edges.length) return
  const currentSort = edges[index].sort ?? index
  const swapSort = edges[next].sort ?? next
  lf.setProperties(edges[index].key, { ...edges[index], sort: swapSort })
  lf.setProperties(edges[next].key, { ...edges[next], sort: currentSort })
}

function onDeleteSelectedNode() {
  if (!lf || !selectedNode.value) return
  lf.deleteNode(selectedNode.value.key)
  selectedNode.value = null
}

function onDeleteSelectedEdge() {
  if (!lf || !selectedEdge.value) return
  lf.deleteEdge(selectedEdge.value.key)
  selectedEdge.value = null
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
  })
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

async function load() {
  const detail = await getWorkflowApi(props.appId, props.formId)
  enabled.value = Boolean(detail?.enabled)
  publishedVersion.value = detail?.publishedVersion || 0
  runningCount.value = detail?.runningCount || 0
  applyGraph(detail?.draftGraph)
}

async function onSave() {
  saving.value = true
  publishErrors.value = []
  try {
    await saveWorkflowDraftApi(props.appId, props.formId, currentProduct())
    ElMessage.success('已保存草稿')
  } catch {
    return
  } finally {
    saving.value = false
  }
}

async function onPublish() {
  const graph = currentProduct()
  const localErrors = validatePublishedGraph(graph, props.formFields)
  if (localErrors.length) {
    publishErrors.value = localErrors
    return
  }
  publishing.value = true
  try {
    await saveWorkflowDraftApi(props.appId, props.formId, graph)
    await publishWorkflowApi(props.appId, props.formId)
    ElMessage.success('发布成功')
    publishErrors.value = []
    await load()
  } catch (error) {
    const message = error?.message || error?.response?.data?.message
    publishErrors.value = Array.isArray(message) ? message : []
  } finally {
    publishing.value = false
  }
}

async function onToggleEnabled(value) {
  try {
    await patchWorkflowEnabledApi(props.appId, props.formId, value)
    enabled.value = value
  } catch {
    enabled.value = !value
  }
}

onMounted(async () => {
  lf = new LogicFlow({
    container: canvasRef.value,
    grid: true,
    stopMoveGraph: false,
    keyboard: { enabled: true },
  })
  ;['start', 'approve', 'branch', 'end'].forEach((type) => {
    lf.register({ type, view: RectNode, model: WorkflowNodeModel })
  })
  lf.setTheme({
    rect: { radius: 6 },
  })
  bindEvents()
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
  color: var(--el-text-color-regular);
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
