<template>
  <div ref="canvasRef" class="wf-mini-graph" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
})

const canvasRef = ref(null)
let lf = null

function paint() {
  if (!lf || !props.graph) return
  lf.render(toLogicflowGraph(props.graph))
  const visited = new Set(props.visitedNodeKeys || [])
  for (const node of props.graph.nodes || []) {
    const current = node.key === props.currentNodeKey
    lf.setProperties(node.key, {
      style: {
        fill: current ? '#ecf5ff' : visited.has(node.key) ? '#f0f9eb' : '#fff',
        stroke: current ? '#409eff' : visited.has(node.key) ? '#67c23a' : '#c0c4cc',
      },
    })
  }
}

onMounted(() => {
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
  paint()
})

watch(
  () => [props.graph, props.visitedNodeKeys, props.currentNodeKey],
  paint,
)

onBeforeUnmount(() => {
  lf = null
})
</script>

<style scoped lang="less">
.wf-mini-graph {
  height: 180px;
  margin-bottom: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
</style>
