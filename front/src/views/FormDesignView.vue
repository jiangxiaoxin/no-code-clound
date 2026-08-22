<template>
  <el-container class="form-design" direction="vertical" v-loading="loading">
    <el-header class="form-bar" height="56px">
      <div class="form-bar-side">
        <el-button :icon="ArrowLeft" text @click="goBack" />
        <el-text class="form-name" truncated>{{ form?.name || ' ' }}</el-text>
      </div>
      <div class="form-tabs">
        <el-text
          class="form-tab"
          :class="{ 'is-active': page === 'design' }"
          @click="page = 'design'"
        >
          表单设计
        </el-text>
        <el-text
          class="form-tab"
          :class="{ 'is-active': page === 'publish' }"
          @click="page = 'publish'"
        >
          表单发布
        </el-text>
      </div>
      <div class="form-bar-side" />
    </el-header>

    <FormDesignPanel v-if="page === 'design'" :app-id="appId" />
    <FormPublishPanel v-else />
  </el-container>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getFormApi } from '../api/apps'
import FormDesignPanel from '../components/FormDesignPanel.vue'
import FormPublishPanel from '../components/FormPublishPanel.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const page = ref('design')
const form = ref(null)

const appId = computed(() => Number(route.params.id))
const formId = computed(() => Number(route.params.formId))

function goBack() {
  router.push({ name: 'app-workspace', params: { id: appId.value } })
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
    form.value = await getFormApi(appId.value, formId.value)
    page.value = 'design'
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
  font-size: 16px;
  font-weight: 600;
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
</style>
