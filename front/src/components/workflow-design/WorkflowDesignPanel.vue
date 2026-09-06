<template>
  <div class="wf-design">
    <div class="wf-toolbar">
      <span class="wf-version">{{ versionText }}</span>
      <div class="wf-toolbar-actions">
        <el-button :loading="saving" @click="onSave">保存</el-button>
        <el-button type="primary" :loading="publishing" @click="onPublish">发布</el-button>
        <el-switch
          :model-value="enabled"
          :disabled="!publishedVersion"
          @change="onToggleEnabled"
        />
        <span>启用流程</span>
      </div>
    </div>
    <div v-if="publishErrors.length" class="wf-errors">
      <div v-for="(item, index) in publishErrors" :key="index">{{ item }}</div>
    </div>
    <div class="wf-body">
      <WorkflowNodePalette @add="onAddNode" />
      <div ref="canvasRef" class="wf-canvas" />
      <WorkflowNodeProps
        v-if="selectedNode"
        :node="selectedNode"
        :form-fields="formFields"
        @change="onNodeChange"
      />
      <WorkflowEdgeProps
        v-else-if="selectedEdge"
        :edge="selectedEdge"
        :from-branch="edgeFromBranch"
        :form-fields="formFields"
        @change="onEdgeChange"
        @move="onEdgeMove"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
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

function onAddNode(type) {
  if (!lf) return
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
    }
    properties.signMode = 'any'
    properties.commentRequiredOnApprove = false
    properties.fieldAccess = {}
  }
  lf.addNode({
    id: properties.key,
    type,
    x: 240,
    y: 180 + Math.random() * 80,
    text: titles[type],
    properties,
  })
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
.wf-design {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.wf-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.wf-toolbar-actions {
  display: flex;
  align-items: center;
}

.wf-version {
  color: var(--el-text-color-regular);
}

.wf-errors {
  padding: 8px 16px;
  color: var(--el-color-danger);
}

.wf-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.wf-canvas {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
