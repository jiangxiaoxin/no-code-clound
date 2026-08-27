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
          <p class="publish-desc">默认全部开启，关闭后数据管理页不显示对应按钮。导出暂未开放。</p>
          <div class="action-list">
            <el-checkbox v-model="actions.create">新增</el-checkbox>
            <el-checkbox v-model="actions.delete">删除</el-checkbox>
            <el-checkbox v-model="actions.import">导入</el-checkbox>
            <el-checkbox v-model="actions.export">导出</el-checkbox>
            <el-checkbox v-model="actions.downloadTemplate">下载导入模版</el-checkbox>
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
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFormConfigApi, saveFormConfigApi } from '../api/apps'
import { normalizeRecordActions } from '../utils/recordActions'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  form: { type: Object, default: null },
})

const tabOrder = ref('create-first')
const actions = reactive(normalizeRecordActions())
const saving = ref(false)
const activeSetting = ref('workspace')

function readTabOrder(value) {
  return Array.isArray(value) && value[0] === 'list' ? 'list-first' : 'create-first'
}

function applyActions(raw) {
  const next = normalizeRecordActions(raw)
  for (const key of Object.keys(next)) {
    actions[key] = next[key]
  }
}

function onSettingSelect(index) {
  activeSetting.value = index
}

async function loadConfig() {
  if (!props.appId || !props.formId) return
  try {
    const config = await getFormConfigApi(props.appId, props.formId)
    tabOrder.value = readTabOrder(config?.workspaceTabOrder)
    applyActions(config?.recordActions)
  } catch {
    tabOrder.value = 'create-first'
    applyActions()
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
    await saveFormConfigApi(props.appId, props.formId, {
      workspaceTabOrder,
      recordActions: { ...actions },
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
