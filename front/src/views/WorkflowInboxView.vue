<template>
  <el-container class="inbox-page" direction="vertical">
    <AppHeader />
    <el-main class="inbox-body">
      <h1 class="inbox-title">{{ title }}</h1>
      <WorkflowInboxList :kind="kind" @changed="onChanged" />
    </el-main>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import WorkflowInboxList from '../components/workflow-inbox/WorkflowInboxList.vue'

const route = useRoute()
const kind = computed(() => {
  const value = route.params.kind
  return value === 'mine' || value === 'done' || value === 'cc' ? value : 'todo'
})
const title = computed(() => {
  if (kind.value === 'todo') return '我的待办'
  if (kind.value === 'mine') return '我发起的'
  if (kind.value === 'cc') return '抄送我的'
  return '我处理的'
})

function onChanged() {
  window.dispatchEvent(new Event('workflow-inbox-changed'))
}
</script>

<style scoped lang="less">
.inbox-page {
  min-height: 100vh;
}

.inbox-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: white;
}

.inbox-title {
  margin: 0;
  padding: 16px 16px 0;
  font-size: 20px;
}
</style>
