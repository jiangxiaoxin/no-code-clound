<template>
  <RouterView />
  <!-- 画布 JSON 解读辅助。改成 false 即隐藏左侧按钮和抽屉，不必改路由。 -->
  <CanvasJsonHelper v-if="SHOW_CANVAS_JSON_HELPER" />
</template>

<script setup>
import { RouterView } from 'vue-router'
import CanvasJsonHelper from './components/canvas-json-helper/CanvasJsonHelper.vue'

const SHOW_CANVAS_JSON_HELPER = true
</script>

<style lang="less">

</style>
