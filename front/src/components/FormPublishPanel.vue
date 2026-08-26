<template>
  <el-main class="publish-panel">
    <div class="publish-layout">
      <el-menu
        :default-active="activeSetting"
        class="publish-menu"
        @select="activeSetting = $event"
      >
        <el-menu-item index="workspace">工作区设置</el-menu-item>
      </el-menu>
      <section class="publish-content">
        <el-card v-if="activeSetting === 'workspace'" class="publish-card" shadow="never">
          <template #header>
            <div class="publish-card-title">工作区显示设置</div>
          </template>
          <el-form label-position="top">
            <el-form-item label="数据管理页 Tab 显示顺序">
              <el-radio-group v-model="tabOrder">
                <el-radio-button value="create-first">添加数据 → 数据管理</el-radio-button>
                <el-radio-button value="list-first">数据管理 → 添加数据</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-form>
          <div class="publish-actions">
            <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
          </div>
        </el-card>
      </section>
    </div>
  </el-main>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFormConfigApi, saveFormConfigApi } from '../api/apps'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  form: { type: Object, default: null },
})

const tabOrder = ref('create-first')
const saving = ref(false)
const activeSetting = ref('workspace')

function readTabOrder(value) {
  return Array.isArray(value) && value[0] === 'list' ? 'list-first' : 'create-first'
}

async function loadConfig() {
  if (!props.appId || !props.formId) return
  try {
    const config = await getFormConfigApi(props.appId, props.formId)
    tabOrder.value = readTabOrder(config?.workspaceTabOrder)
  } catch {
    tabOrder.value = 'create-first'
  }
}

watch(() => [props.appId, props.formId], loadConfig, { immediate: true })

async function save() {
  if (!props.form?.id) return
  saving.value = true
  try {
    const workspaceTabOrder = tabOrder.value === 'list-first'
      ? ['list', 'create']
      : ['create', 'list']
    await saveFormConfigApi(props.appId, props.formId, { workspaceTabOrder })
    ElMessage.success('保存成功')
  } catch {
    return
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="less">
.publish-panel {
  display: flex;
  padding: 24px;
  background: var(--el-bg-color-page);
}

.publish-layout {
  display: flex;
  width: min(1080px, 100%);
  min-height: 100%;
  margin: 0 auto;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
}

.publish-menu {
  flex: none;
  width: 190px;
  border-right: 1px solid var(--el-border-color-light);
}

.publish-content {
  flex: 1;
  min-width: 0;
  padding: 20px 24px;
}

.publish-card {
  width: 100%;
  height: fit-content;
}

.publish-card-title {
  font-size: 16px;
  font-weight: 600;
}

.publish-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
