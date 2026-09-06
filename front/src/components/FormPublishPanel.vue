<template>
  <el-main class="publish-panel">
    <div class="publish-layout">
      <el-menu
        :default-active="activeSetting"
        class="publish-menu"
        @select="onSettingSelect"
      >
        <el-menu-item index="workspace">工作区设置</el-menu-item>
        <el-menu-item index="records">数据管理</el-menu-item>
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
              <p class="publish-desc publish-desc-inline">
                本配置存在本机浏览器缓存，只在当前电脑、当前浏览器生效。换电脑或清除缓存后，恢复为「添加数据 → 数据管理」。
              </p>
            </el-form-item>
          </el-form>
          <div class="publish-actions">
            <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
          </div>
        </el-card>
        <el-card v-else-if="activeSetting === 'records'" class="publish-card" shadow="never">
          <template #header>
            <div class="publish-card-title">数据管理按钮</div>
          </template>
          <p class="publish-desc">新增、编辑、删除默认开启；导入、导出、下载导入模版默认关闭。关闭后数据管理页不显示对应按钮。导出暂未开放。</p>
          <p v-if="isWorkflowForm" class="publish-desc">
            流程表单不能导入。改已通过的数据会重新进入审批，通过之前不能再被别的表选到。
          </p>
          <div class="action-list">
            <el-checkbox v-model="actions.create">新增</el-checkbox>
            <el-checkbox v-model="actions.edit">编辑</el-checkbox>
            <el-checkbox v-model="actions.delete">删除</el-checkbox>
            <el-checkbox v-model="actions.import" :disabled="isWorkflowForm">导入</el-checkbox>
            <el-checkbox v-model="actions.export">导出</el-checkbox>
            <el-checkbox v-model="actions.downloadTemplate" :disabled="isWorkflowForm">
              下载导入模版
            </el-checkbox>
          </div>
          <div class="publish-actions">
            <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
          </div>
        </el-card>
      </section>
    </div>
  </el-main>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFormConfigApi, saveFormConfigApi } from '../api/apps'
import { normalizeRecordActions } from '../utils/recordActions'
import { useUserStore } from '../stores/user'
import {
  readWorkspaceTabOrder,
  workspaceTabOrderFromMode,
  workspaceTabOrderToMode,
  writeWorkspaceTabOrder,
} from './form-workspace/workspaceTabOrder.js'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  form: { type: Object, default: null },
})

const userStore = useUserStore()
const tabOrder = ref('create-first')
const actions = reactive(normalizeRecordActions())
const saving = ref(false)
const activeSetting = ref('workspace')
const isWorkflowForm = computed(() => props.form?.formKind === 'workflow')

function applyActions(raw) {
  const next = normalizeRecordActions(raw)
  if (isWorkflowForm.value) {
    next.import = false
    next.downloadTemplate = false
  }
  for (const key of Object.keys(next)) {
    actions[key] = next[key]
  }
}

function onSettingSelect(index) {
  activeSetting.value = index
}

function loadTabOrder() {
  tabOrder.value = workspaceTabOrderToMode(
    readWorkspaceTabOrder(userStore.user?.id, props.appId, props.formId),
  )
}

async function loadConfig() {
  if (!props.appId || !props.formId) return
  loadTabOrder()
  try {
    const config = await getFormConfigApi(props.appId, props.formId)
    applyActions(config?.recordActions)
  } catch {
    applyActions()
  }
}

watch(
  () => [props.appId, props.formId, userStore.user?.id],
  loadConfig,
  { immediate: true },
)

async function save() {
  if (!props.form?.id) return
  if (activeSetting.value === 'workspace') {
    writeWorkspaceTabOrder(
      userStore.user?.id,
      props.appId,
      props.formId,
      workspaceTabOrderFromMode(tabOrder.value),
    )
    ElMessage.success('已保存在本机')
    return
  }
  saving.value = true
  try {
    const recordActions = { ...actions }
    if (isWorkflowForm.value) {
      recordActions.import = false
      recordActions.downloadTemplate = false
    }
    await saveFormConfigApi(props.appId, props.formId, {
      recordActions,
    })
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

.publish-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-text-color-secondary);
}

.publish-desc-inline {
  margin: 8px 0 0;
}

.action-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.action-list .el-checkbox {
  margin-right: 16px;
  margin-bottom: 8px;
}

.publish-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
