<template>
  <div v-if="visible" class="json-helper">
    <button
      v-show="!open"
      type="button"
      class="json-helper-fab"
      aria-label="画布 JSON 解读"
      @click="openDrawer"
    >
      <el-icon><Document /></el-icon>
    </button>
    <el-drawer
      :model-value="open"
      title="画布 JSON 解读"
      direction="ltr"
      size="80%"
      :append-to-body="false"
      @update:model-value="onOpenChange"
    >
      <div class="json-helper-body">
        <el-input
          v-model="sourceText"
          type="textarea"
          class="json-helper-pane"
          placeholder="粘贴表单画布 JSON"
          :autosize="{ minRows: 10 }"
        />
        <div class="json-helper-mid">
          <el-button type="primary" :loading="converting" @click="onConvert">
            转换
          </el-button>
        </div>
        <el-input
          v-model="resultText"
          type="textarea"
          class="json-helper-pane"
          placeholder="转换结果"
          :autosize="{ minRows: 10 }"
        />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document } from '@element-plus/icons-vue'
import { getDirectoryApi, getFormApi, listDictionaryOptionsApi } from '../../api/apps'
import {
  annotateCanvasJson,
  collectFieldTitles,
  collectSourceFormIds,
  dictTitlesFromOptions,
  formTitlesFromDirectory,
  parseCanvasJson,
} from './annotateCanvasJson.js'

const HELPER_ROUTES = new Set([
  'app-workspace',
  'app-workspace-form',
  'form-design',
])

const route = useRoute()
const open = ref(false)
const converting = ref(false)
const sourceText = ref('')
const resultText = ref('')

const visible = computed(() => HELPER_ROUTES.has(route.name))
const appId = computed(() => Number(route.params.id))

function openDrawer() {
  open.value = true
}

function onOpenChange(value) {
  open.value = value
}

async function onConvert() {
  let parsed
  try {
    parsed = parseCanvasJson(sourceText.value)
  } catch (error) {
    ElMessage.error(error.message || 'JSON 无法解析')
    return
  }
  if (!Number.isInteger(appId.value) || appId.value <= 0) {
    ElMessage.error('当前页面没有应用')
    return
  }
  converting.value = true
  try {
    const [directory, dictionaries] = await Promise.all([
      getDirectoryApi(appId.value),
      listDictionaryOptionsApi(appId.value),
    ])
    const formTitles = formTitlesFromDirectory(directory)
    const dictTitles = dictTitlesFromOptions(dictionaries)
    const canvasTitles = collectFieldTitles(parsed)
    const sourceTitles = new Map()
    const ids = [...collectSourceFormIds(parsed)]
    const forms = await Promise.all(ids.map((id) => getFormApi(appId.value, id)))
    for (const form of forms) {
      collectFieldTitles(form?.fields, sourceTitles)
      const id = Number(form?.id)
      const name = typeof form?.name === 'string' ? form.name : ''
      if (Number.isInteger(id) && id > 0 && name && !formTitles.has(id)) {
        formTitles.set(id, name)
      }
    }
    resultText.value = annotateCanvasJson(
      parsed,
      canvasTitles,
      sourceTitles,
      formTitles,
      dictTitles,
    )
  } catch {
    // 接口错误已由 http 拦截器 ElMessage，右栏保持原样
  } finally {
    converting.value = false
  }
}
</script>

<style scoped lang="less">
.json-helper-fab {
  position: fixed;
  top: 50%;
  left: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 56px;
  padding: 0;
  color: #fff;
  background: var(--el-color-primary);
  border: 0;
  border-radius: 0 28px 28px 0;
  transform: translateY(-50%);
  cursor: pointer;
}

.json-helper :deep(.el-drawer__body) {
  display: flex;
  min-height: 0;
}

.json-helper-body {
  display: flex;
  height: 100%;
  min-height: 0;
  flex: 1;
}

.json-helper-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.json-helper-mid {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  padding: 0 12px;
}

.json-helper-pane :deep(.el-textarea),
.json-helper-pane :deep(.el-textarea__inner) {
  height: 100% !important;
}
</style>
