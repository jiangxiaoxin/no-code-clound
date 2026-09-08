<template>
  <div ref="canvasRef" class="wf-mini-graph" />
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LogicFlow, { RectNode, RectNodeModel } from '@logicflow/core'
import '@logicflow/core/es/index.css'
import { toLogicflowGraph } from '../workflow-design/workflowGraph.js'

class MiniNodeModel extends RectNodeModel {
  initNodeData(data) {
    super.initNodeData(data)
    this.width = 120
    this.height = 40
    this.resizable = false
  }
}

const props = defineProps({
  graph: { type: Object, default: null },
  visitedNodeKeys: { type: Array, default: () => [] },
  currentNodeKey: { type: String, default: '' },
  instanceStatus: { type: String, default: '' },
})

function resolveHighlightNodeKey() {
  if (props.currentNodeKey) return props.currentNodeKey
  if (props.instanceStatus !== 'approved') return ''
  const endNodes = (props.graph?.nodes || []).filter((node) => node.type === 'end')
  if (!endNodes.length) return ''
  if (endNodes.length === 1) return endNodes[0].key
  const endKeys = new Set(endNodes.map((node) => node.key))
  const visited = new Set(props.visitedNodeKeys || [])
  for (const edge of props.graph?.edges || []) {
    if (endKeys.has(edge.to) && visited.has(edge.from)) {
      return edge.to
    }
  }
  return endNodes[0].key
}

const canvasRef = ref(null)
let lf = null

function paint() {
  if (!lf || !props.graph) return
  lf.render(toLogicflowGraph(props.graph))
  const visited = new Set(props.visitedNodeKeys || [])
  const highlightKey = resolveHighlightNodeKey()
  for (const node of props.graph.nodes || []) {
    const current = node.key === highlightKey
    lf.setProperties(node.key, {
      style: {
        fill: current ? '#ecf5ff' : visited.has(node.key) ? '#f0f9eb' : '#fff',
        stroke: current ? '#409eff' : visited.has(node.key) ? '#67c23a' : '#c0c4cc',
      },
    })
  }
}

function resizeCanvas() {
  if (!lf || !canvasRef.value) return
  lf.resize()
  paint()
}

onMounted(async () => {
  if (!canvasRef.value) return
  lf = new LogicFlow({
    container: canvasRef.value,
    grid: false,
    isSilentMode: true,
    stopScrollGraph: true,
    stopZoomGraph: true,
    stopMoveGraph: false,
  })
  lf.register({ type: 'start', view: RectNode, model: MiniNodeModel })
  lf.register({ type: 'approve', view: RectNode, model: MiniNodeModel })
  lf.register({ type: 'branch', view: RectNode, model: MiniNodeModel })
  lf.register({ type: 'end', view: RectNode, model: MiniNodeModel })
  lf.register({ type: 'cc', view: RectNode, model: MiniNodeModel })
  await nextTick()
  resizeCanvas()
})

defineExpose({ resizeCanvas })

watch(
  () => [props.graph, props.visitedNodeKeys, props.currentNodeKey, props.instanceStatus],
  paint,
)

onBeforeUnmount(() => {
  // 每次打开抽屉都会新建一个画布，不销毁会一直堆在内存里
  lf?.destroy?.()
  lf = null
})
</script>

<style scoped lang="less">
.wf-mini-graph {
  height: 180px;
  margin-bottom: 12px;
  border: 1px solid var(--el-border-color-lighter);
}
</style>
