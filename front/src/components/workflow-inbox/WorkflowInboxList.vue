<template>
  <div class="wf-inbox" v-loading="loading">
        <el-empty v-if="!loading && !items.length" :description="emptyDescription" />
    <div v-else class="wf-inbox-list">
      <WorkflowInboxCard
        v-for="item in items"
        :key="`${item.kind}-${item.id}`"
        :card="item"
        :show-app="!appId"
        @open="openCard"
      />
    </div>
    <div v-if="total > pageSize" class="wf-inbox-pager">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        size="small"
        @current-change="onPageChange"
      />
    </div>
    <WorkflowInboxDrawer
      v-model="drawerVisible"
      :kind="kind"
      :item-id="openedId"
      :app-id="openedAppId"
      @changed="onChanged"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { queryWorkflowInboxApi } from '../../api/workflow'
import WorkflowInboxCard from './WorkflowInboxCard.vue'
import WorkflowInboxDrawer from './WorkflowInboxDrawer.vue'

const props = defineProps({
  kind: { type: String, required: true },
  appId: { type: Number, default: 0 },
  emptyText: { type: String, default: '' },
})

const emit = defineEmits(['changed'])

const loading = ref(false)
const items = ref([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const drawerVisible = ref(false)
const openedId = ref(0)
const openedAppId = ref(0)

const emptyDescription = computed(() => {
  if (props.emptyText) return props.emptyText
  if (props.appId) {
    if (props.kind === 'todo') return '本应用还没有待办'
    if (props.kind === 'mine') return '本应用还没有发起过'
    return '本应用还没有处理过'
  }
  if (props.kind === 'todo') return '还没有待办'
  if (props.kind === 'mine') return '还没有发起过'
  return '还没有处理过'
})

async function load() {
  loading.value = true
  try {
    const result = await queryWorkflowInboxApi({
      kind: props.kind,
      appId: props.appId || undefined,
      page: page.value,
      pageSize,
    })
    items.value = result?.items || []
    total.value = result?.total || 0
  } catch {
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onPageChange(next) {
  page.value = next
  load()
}

function openCard(card) {
  openedId.value = card.id
  openedAppId.value = Number(card.appId) || props.appId || 0
  drawerVisible.value = true
}

function onChanged() {
  load()
  emit('changed')
}

watch(
  () => [props.kind, props.appId],
  () => {
    page.value = 1
    load()
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
.wf-inbox {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 16px;
}

.wf-inbox-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}

.wf-inbox-pager {
  display: flex;
  justify-content: center;
  padding-top: 12px;
}
</style>
