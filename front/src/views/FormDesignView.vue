<template>
  <el-container class="form-design" direction="vertical" v-loading="loading">
    <el-header class="form-bar" height="56px">
      <div class="form-bar-side">
        <el-button :icon="ArrowLeft" text @click="goBack" />
        <span class="form-name">{{ form?.name || ' ' }}</span>
      </div>
      <div class="form-tabs">
        <span
          class="form-tab"
          :class="{ 'is-active': page === 'design' }"
          @click="setPage('design')"
        >
          表单设计
        </span>
        <span
          v-if="isWorkflowForm"
          class="form-tab"
          :class="{ 'is-active': page === 'workflow' }"
          @click="setPage('workflow')"
        >
          流程设计
        </span>
        <span
          class="form-tab"
          :class="{ 'is-active': page === 'publish' }"
          @click="setPage('publish')"
        >
          表单发布
        </span>
        <span
          class="form-tab"
          :class="{ 'is-active': page === 'records' }"
          @click="setPage('records')"
        >
          数据管理
        </span>
        
      </div>
      <div class="form-bar-side" />
    </el-header>

    <FormDesignPanel
      v-if="!loading && page === 'design' && form"
      :app-id="appId"
      :form-id="formId"
      :workflow-form="isWorkflowForm"
      :initial-fields="Array.isArray(form.fields) ? form.fields : []"
      :initial-columns="form.columns"
      @saved="onSaved"
    />
    <el-main
      v-else-if="!loading && page === 'workflow' && form"
      class="form-records"
    >
      <WorkflowDesignPanel
        :app-id="appId"
        :form-id="formId"
        :form-fields="Array.isArray(form.fields) ? form.fields : []"
      />
    </el-main>
    <el-main
      v-else-if="!loading && page === 'records'"
      class="form-records"
    >
      <FormRecordManage
        :app-id="appId"
        :form-id="formId"
        :can-configure="true"
      />
    </el-main>
    <FormPublishPanel
      v-else-if="!loading && page === 'publish' && form"
      :app-id="appId"
      :form-id="formId"
      :form="form"
    />
  </el-container>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getAppApi, getFormApi } from '../api/apps'
import FormDesignPanel from '../components/FormDesignPanel.vue'
import FormPublishPanel from '../components/FormPublishPanel.vue'
import FormRecordManage from '../components/form-workspace/FormRecordManage.vue'
import WorkflowDesignPanel from '../components/workflow-design/WorkflowDesignPanel.vue'
import { useDocumentTitle } from '../utils/documentTitle.js'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const form = ref(null)
useDocumentTitle(() => form.value?.name)

const appId = computed(() => Number(route.params.id))
const formId = computed(() => Number(route.params.formId))

const PAGE_TABS = new Set(['design', 'workflow', 'records', 'publish'])
const isWorkflowForm = computed(() => form.value?.formKind === 'workflow')
const page = computed(() => {
  const tab = route.query.tab
  if (tab === 'workflow' && !isWorkflowForm.value) return 'design'
  return PAGE_TABS.has(tab) ? tab : 'design'
})

function setPage(tab) {
  const allowed = tab === 'workflow' ? isWorkflowForm.value : PAGE_TABS.has(tab)
  const next = allowed ? tab : 'design'
  if (page.value === next) return
  router.replace({
    name: 'form-design',
    params: { id: appId.value, formId: formId.value },
    query: next === 'design' ? {} : { tab: next },
  })
}

function goBack() {
  router.push({
    name: 'app-workspace-form',
    params: { id: appId.value, formId: formId.value },
  })
}

function onSaved(detail) {
  if (detail) {
    form.value = detail
  }
}

async function loadForm() {
  if (
    !Number.isInteger(appId.value) ||
    appId.value <= 0 ||
    !Number.isInteger(formId.value) ||
    formId.value <= 0
  ) {
    router.replace('/')
    return
  }

  loading.value = true
  try {
    const app = await getAppApi(appId.value)
    if (!app?.canConfigure) {
      router.replace({ name: 'app-workspace', params: { id: appId.value } })
      return
    }
    form.value = await getFormApi(appId.value, formId.value)
  } catch (error) {
    if (error.response?.status !== 401) {
      router.replace({ name: 'app-workspace', params: { id: appId.value } })
    }
  } finally {
    loading.value = false
  }
}

watch([appId, formId], loadForm, { immediate: true })
</script>

<style scoped lang="less">
.form-design {
  height: 100vh;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.form-bar {
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
}

.form-bar-side {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.form-name {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-tabs {
  display: flex;
  gap: 28px;
}

.form-tab {
  padding: 16px 0;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  color: var(--el-text-color-regular);
  border-bottom: 2px solid transparent;
}

.form-tab.is-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.form-records {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  flex-direction: column;
  background: var(--el-bg-color);
}
</style>
