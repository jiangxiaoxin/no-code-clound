<template>
  <div
    class="file-upload"
    :class="{ 'is-full': isFull, 'is-disabled': disabled }"
  >
    <el-upload
      :accept="acceptAttr"
      :file-list="fileList"
      :auto-upload="true"
      :limit="maxCount"
      :before-upload="beforeUpload"
      :http-request="doUpload"
      :on-exceed="onExceed"
      :on-success="onUploadSuccess"
      :on-remove="onRemove"
      :disabled="disabled"
      class="my-upload"
    >
      <el-button :disabled="disabled" :icon="Upload">上传文件</el-button>
      <template #file="{ file }">
        <div class="file-row">
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <el-icon
            v-if="canDownload"
            class="file-action"
            title="下载"
            @click.stop="onDownload(file)"
          >
            <Download />
          </el-icon>
          <el-icon
            v-if="!disabled"
            class="file-action"
            title="删除"
            @click.stop="onRemove(file)"
          >
            <Delete />
          </el-icon>
        </div>
      </template>
    </el-upload>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Download, Upload } from '@element-plus/icons-vue'
import { uploadAppFileApi } from '../../api/apps'
import {
  downloadFile,
  fileAcceptAttr,
  fileDownloadable,
  fileFormatLabels,
  fileItemsOf,
  fileMaxCount,
  fileMaxSizeBytes,
  fileMaxSizeMB,
  isAllowedFile,
} from './fileField.js'

const props = defineProps({
  field: { type: Object, required: true },
  appId: { type: Number, default: 0 },
  modelValue: { default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const items = computed(() => fileItemsOf(props.modelValue))
const maxCount = computed(() => fileMaxCount(props.field))
const isFull = computed(() => items.value.length >= maxCount.value)
const acceptAttr = computed(() => fileAcceptAttr(props.field))
const canDownload = computed(() => fileDownloadable(props.field))

const fileList = computed(() =>
  items.value.map((item) => ({
    name: item.name,
    url: item.url,
    uid: item.url,
  })),
)

function onExceed() {
  ElMessage.warning(`最多上传 ${maxCount.value} 个文件`)
}

function onRemove(file) {
  if (props.disabled) return
  emit(
    'update:modelValue',
    items.value.filter((item) => item.url !== file.url),
  )
}

async function onDownload(file) {
  try {
    await downloadFile({ url: file.url, name: file.name })
  } catch {
    ElMessage.error('下载失败')
  }
}

function beforeUpload(file) {
  if (props.disabled) return false
  if (!props.appId) {
    ElMessage.warning('无法上传文件')
    return false
  }
  if (!isAllowedFile(props.field, file)) {
    ElMessage.warning(`请上传 ${fileFormatLabels(props.field)} 文件`)
    return false
  }
  if (file.size > fileMaxSizeBytes(props.field)) {
    ElMessage.warning(`每个文件不能超过 ${fileMaxSizeMB(props.field)}MB`)
    return false
  }
  return true
}

function doUpload(options) {
  return uploadAppFileApi(props.appId, options.file)
}

function onUploadSuccess(result, file) {
  const url = result?.url
  if (!url) {
    ElMessage.error('上传失败')
    return
  }
  emit('update:modelValue', [
    ...items.value,
    { url, name: result.name || file.name },
  ])
}
</script>

<style scoped lang="less">
.file-upload {
  width: 100%;
}

.file-upload.is-full :deep(.el-upload) {
  display: none;
}

.file-upload.is-disabled :deep(.el-upload-list) {
  pointer-events: auto;
}

.file-row {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 4px 0;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-action {
  flex-shrink: 0;
  margin-left: 8px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
}

// .my-upload {
//   :deep(.el-upload) {
//     width: 100% !important;
//   }
// }
</style>
