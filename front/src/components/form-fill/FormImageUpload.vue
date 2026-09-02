<template>
  <div
    class="image-upload"
    :class="{ 'is-full': isFull, 'is-disabled': disabled }"
  >
    <el-upload
      list-type="picture-card"
      :accept="acceptAttr"
      :file-list="fileList"
      :auto-upload="true"
      :limit="maxCount"
      :before-upload="beforeUpload"
      :http-request="doUpload"
      :on-exceed="onExceed"
      :on-success="onUploadSuccess"
      :on-preview="onPreview"
      :on-remove="onRemove"
      :disabled="disabled"
    >
      <el-icon><Plus /></el-icon>
    </el-upload>
    <el-image-viewer
      v-if="viewerVisible"
      :url-list="urls"
      :initial-index="viewerIndex"
      teleported
      @close="closeViewer"
    >
      <template #toolbar="toolbar">
        <FormImageViewerToolbar
          v-bind="toolbar"
          :urls="urls"
        />
      </template>
    </el-image-viewer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { uploadAppImageApi } from '../../api/apps'
import FormImageViewerToolbar from './FormImageViewerToolbar.vue'
import {
  compressImageFile,
  imageAcceptAttr,
  imageCompressEnabled,
  imageFormatLabels,
  imageMaxCount,
  imageMaxSizeBytes,
  imageMaxSizeMB,
  imageUrlsOf,
  isAllowedImageFile,
} from './imageField.js'

const props = defineProps({
  field: { type: Object, required: true },
  appId: { type: Number, default: 0 },
  modelValue: { default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const viewerVisible = ref(false)
const viewerIndex = ref(0)

const urls = computed(() => imageUrlsOf(props.modelValue))
const maxCount = computed(() => imageMaxCount(props.field))
const isFull = computed(() => urls.value.length >= maxCount.value)
const acceptAttr = computed(() => imageAcceptAttr(props.field))

const fileList = computed(() =>
  urls.value.map((url, index) => ({
    name: `image-${index + 1}`,
    url,
    uid: url,
  })),
)

function onExceed() {
  ElMessage.warning(`最多上传 ${maxCount.value} 张图片`)
}

function onPreview(file) {
  const index = urls.value.indexOf(file.url)
  viewerIndex.value = index < 0 ? 0 : index
  viewerVisible.value = true
}

function closeViewer() {
  viewerVisible.value = false
}

function onRemove(file) {
  if (props.disabled) return
  emit(
    'update:modelValue',
    urls.value.filter((url) => url !== file.url),
  )
}

async function beforeUpload(file) {
  if (props.disabled) return false
  if (!props.appId) {
    ElMessage.warning('无法上传图片')
    return false
  }
  if (!isAllowedImageFile(props.field, file)) {
    ElMessage.warning(`请上传 ${imageFormatLabels(props.field)} 图片`)
    return false
  }
  let uploadFile = file
  if (imageCompressEnabled(props.field)) {
    uploadFile = await compressImageFile(file)
  }
  const maxBytes = imageMaxSizeBytes(props.field)
  if (uploadFile.size > maxBytes) {
    ElMessage.warning(`每张图片不能超过 ${imageMaxSizeMB(props.field)}MB`)
    return false
  }
  return uploadFile
}

function doUpload(options) {
  return uploadAppImageApi(props.appId, options.file)
}

function onUploadSuccess(result) {
  const url = result?.url
  if (!url) {
    ElMessage.error('上传失败')
    return
  }
  emit('update:modelValue', [...urls.value, url])
}
</script>

<style scoped lang="less">
.image-upload {
  width: 100%;
}

.image-upload.is-full :deep(.el-upload--picture-card) {
  display: none;
}

</style>
