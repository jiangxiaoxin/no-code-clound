<template>
  <div
    class="image-upload"
    :class="{ 'is-full': isFull, 'is-disabled': disabled }"
  >
    <el-upload
      list-type="picture-card"
      accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
      :file-list="fileList"
      :auto-upload="true"
      :limit="maxCount"
      :before-upload="beforeUpload"
      :on-exceed="onExceed"
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
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { uploadAppImageApi } from '../../api/apps'
import {
  imageMaxCount,
  imageMaxSizeBytes,
  imageMaxSizeMB,
  imageUrlsOf,
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
  if (urls.value.length >= maxCount.value) {
    onExceed()
    return false
  }
  const maxBytes = imageMaxSizeBytes(props.field)
  if (file.size > maxBytes) {
    ElMessage.warning(`每张图片不能超过 ${imageMaxSizeMB(props.field)}MB`)
    return false
  }
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
    ElMessage.warning('请上传 jpg、png、gif 或 webp 图片')
    return false
  }
  try {
    const result = await uploadAppImageApi(props.appId, file)
    const url = result?.url
    if (!url) {
      ElMessage.error('上传失败')
      return false
    }
    emit('update:modelValue', [...urls.value, url])
  } catch {
    return false
  }
  return false
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
