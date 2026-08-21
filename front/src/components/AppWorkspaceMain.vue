<template>
  <el-main class="workspace-main">
    <el-empty
      v-if="!form"
      description="请选择左侧表单查看"
    />
    <span v-else class="form-preview-name">{{ form.name }}</span>
  </el-main>
</template>

<script setup>
defineProps({
  form: { type: Object, default: null },
})
</script>

<style scoped lang="less">
.workspace-main {
  display: flex;
  align-items: center;
  justify-content: center;
}

.form-preview-name {
  font-size: 16px;
  font-weight: 600;
}
</style>
