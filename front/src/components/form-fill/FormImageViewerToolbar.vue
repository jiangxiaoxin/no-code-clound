<template>
  <el-icon @click="onZoomOut"><ZoomOut /></el-icon>
  <el-icon @click="onZoomIn"><ZoomIn /></el-icon>
  <i class="el-image-viewer__actions__divider" />
  <el-icon @click="onReset"><FullScreen /></el-icon>
  <i class="el-image-viewer__actions__divider" />
  <el-icon @click="onAnticlockwise"><RefreshLeft /></el-icon>
  <el-icon @click="onClockwise"><RefreshRight /></el-icon>
  <i class="el-image-viewer__actions__divider" />
  <el-icon title="下载" @click="onDownload"><Download /></el-icon>
</template>

<script setup>
import { ElMessage } from 'element-plus'
import {
  Download,
  FullScreen,
  RefreshLeft,
  RefreshRight,
  ZoomIn,
  ZoomOut,
} from '@element-plus/icons-vue'
import { downloadImage } from './imageField.js'

const props = defineProps({
  actions: { type: Function, default: null },
  reset: { type: Function, default: null },
  urls: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
})

function onZoomOut() {
  props.actions?.('zoomOut')
}

function onZoomIn() {
  props.actions?.('zoomIn')
}

function onReset() {
  props.reset?.()
}

function onAnticlockwise() {
  props.actions?.('anticlockwise')
}

function onClockwise() {
  props.actions?.('clockwise')
}

async function onDownload() {
  const url = props.urls[props.activeIndex]
  try {
    await downloadImage(url)
  } catch {
    ElMessage.error('下载失败')
  }
}
</script>
