<template>
  <RouterView />
</template>

<script setup>
import { RouterView } from 'vue-router'
</script>

<style lang="less">
.el-dropdown-menu {
  padding: 4px;
}

.el-input-number.is-without-controls .el-input__wrapper {
  padding-left: 11px;
  padding-right: 11px;
}

.el-date-editor {
  --el-date-editor-width: 100%;
}

.el-drawer__header {
  margin-bottom: 0;
}
</style>
