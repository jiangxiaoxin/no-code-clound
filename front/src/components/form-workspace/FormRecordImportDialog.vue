<template>
  <el-dialog
    :model-value="modelValue"
    title="导入数据"
    width="520px"
    align-center
    draggable
    destroy-on-close
    @update:model-value="onVisibleChange"
  >
    <el-upload
      class="import-upload"
      drag
      accept=".xlsx"
      :auto-upload="false"
      :limit="1"
      :on-exceed="onExceed"
      :on-change="onFileChange"
      :on-remove="onFileRemove"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">将 Excel 文件拖到此处，或<em>点击选择</em></div>
      <template #tip>
        <div class="el-upload__tip">仅支持 .xlsx，文件不超过 10MB</div>
      </template>
    </el-upload>
    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" :loading="importing" :disabled="!file" @click="submit">
        导入
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { importFormRecordsApi } from '../../api/apps'
import { MAX_IMPORT_FILE_SIZE } from '../../utils/recordActions'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, required: true },
  formId: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue', 'imported'])

const file = ref(null)
const importing = ref(false)

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) file.value = null
  },
)

function onVisibleChange(value) {
  emit('update:modelValue', value)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function onExceed() {
  ElMessage.warning('一次只能选择一个文件')
}

function onFileRemove() {
  file.value = null
}

function onFileChange(uploadFile) {
  const raw = uploadFile?.raw
  if (!raw) {
    file.value = null
    return
  }
  if (!raw.name.toLowerCase().endsWith('.xlsx')) {
    ElMessage.warning('请上传 xlsx 文件')
    file.value = null
    return
  }
  if (raw.size > MAX_IMPORT_FILE_SIZE) {
    ElMessage.warning('文件不能超过 10MB')
    file.value = null
    return
  }
  file.value = raw
}

async function submit() {
  if (!file.value || !props.formId) return
  importing.value = true
  try {
    const result = await importFormRecordsApi(props.appId, props.formId, file.value)
    const imported = Number(result?.imported) || 0
    ElMessage.success(`总共导入 ${imported} 条数据`)
    emit('imported', imported)
    emit('update:modelValue', false)
  } catch {
    return
  } finally {
    importing.value = false
  }
}
</script>

<style scoped lang="less">
.import-upload {
  width: 100%;
}
</style>
