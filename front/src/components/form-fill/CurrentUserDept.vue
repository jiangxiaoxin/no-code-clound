<template>
  <el-input :model-value="name" disabled :title="title" />
</template>

<script setup>
import { computed } from 'vue'
import { useUserStore } from '../../stores/user'

defineProps({
  title: { type: String, default: undefined },
})

const userStore = useUserStore()
const name = computed(
  () => userStore.user?.departmentName || '未分配部门',
)
</script>
