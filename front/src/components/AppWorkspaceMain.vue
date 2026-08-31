<template>
  <el-main class="workspace-main">
    <el-empty v-if="!form" description="请选择左侧表单查看" />
    <div v-else class="form-work">
      <div class="form-work-head">
        <div class="form-work-title">
          <span class="form-work-name">{{ form.name }}</span>
          <el-icon style="cursor: pointer;" title="编辑表单" @click="goDesign"><EditPen /></el-icon>
        </div>
        <div class="form-work-tabs">
          <span
            v-for="tabItem in workspaceTabs"
            :key="tabItem.key"
            class="form-work-tab"
            :class="{ 'is-active': tab === tabItem.key }"
            @click="setTab(tabItem.key)"
          >
            {{ tabItem.label }}
          </span>
        </div>
      </div>

      <FormRecordCreateTab
        v-show="tab === 'create'"
        ref="createTabRef"
        :app-id="appId"
        :fields="fields"
        :values="values"
        :dict-items-by-code="dictItemsByCode"
        :schema-loading="schemaLoading"
        :saving="saving"
        @cancel="resetValues"
        @save="onSave"
      />
      <FormRecordManage
        v-if="tab === 'list' && form"
        :app-id="appId"
        :form-id="form.id"
      />
    </div>
  </el-main>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import {
  createFormRecordApi,
  getFormConfigApi,
  getFormApi,
  listDictionaryItemsByCodesApi,
} from '../api/apps'
import {
  buildRecordData,
  emptyRecordValues,
  firstRequiredError,
} from './form-fill/fillValues.js'
import { isSelectType as isSelectField } from './form-design/fieldTypes'
import { flattenFields } from './form-design/tabsField.js'
import FormRecordCreateTab from './form-workspace/FormRecordCreateTab.vue'
import FormRecordManage from './form-workspace/FormRecordManage.vue'

const props = defineProps({
  appId: { type: Number, required: true },
  form: { type: Object, default: null },
})

const route = useRoute()
const router = useRouter()
const WORKSPACE_TAB_KEYS = new Set(['create', 'list'])

function goDesign() {
  if (!props.form?.id) {
    return
  }
  router.push({
    name: 'form-design',
    params: { id: props.appId, formId: props.form.id },
  })
}

function tabFromQuery() {
  const value = route.query.tab
  return typeof value === 'string' && WORKSPACE_TAB_KEYS.has(value) ? value : ''
}

function setTab(next) {
  const key = WORKSPACE_TAB_KEYS.has(next) ? next : 'create'
  if (!props.form?.id || route.query.tab === key) return
  router.replace({
    name: 'app-workspace-form',
    params: { id: props.appId, formId: props.form.id },
    query: { ...route.query, tab: key },
  })
}
const schemaLoading = ref(false)
const saving = ref(false)
const fields = ref([])
const values = reactive({})
const dictItemsByCode = ref({})
const workspaceTabOrder = ref([])
const createTabRef = ref(null)
// 切换表单时作废进行中的请求，避免把上一张表的字段写进来
const loadSession = ref(0)

const workspaceTabs = computed(() => {
  const labels = { create: '添加数据', list: '数据管理' }
  const configured = Array.isArray(workspaceTabOrder.value) && workspaceTabOrder.value.length
    ? workspaceTabOrder.value
    : []
  const order = configured.filter(
    (key, index) =>
      (key === 'create' || key === 'list') && configured.indexOf(key) === index,
  )
  ;['create', 'list'].forEach((key) => {
    if (!order.includes(key)) order.push(key)
  })
  return order.map((key) => ({ key, label: labels[key] }))
})

const defaultTab = computed(() => workspaceTabs.value[0]?.key || 'create')
const tab = computed(() => tabFromQuery() || defaultTab.value)

function resetValues() {
  console.log('--resteValues');
  setTimeout(() => {
    console.log('清空后', values);
    
  }, 1000);
  
  for (const key of Object.keys(values)) {
    delete values[key]
  }
  Object.assign(values, emptyRecordValues(fields.value))
}

const dictCodes = computed(() => {
  const codes = []
  const seen = new Set()
  for (const field of flattenFields(fields.value)) {
    const usesDict =
      (field.type === 'radio' ||
        field.type === 'checkbox' ||
        isSelectField(field.type)) &&
      (field.optionSource || 'dictionary') === 'dictionary' &&
      field.dictCode
    if (!usesDict || seen.has(field.dictCode)) continue
    seen.add(field.dictCode)
    codes.push(field.dictCode)
  }
  return codes
})

async function loadSchema() {
  const session = loadSession.value
  if (!props.form?.id || !props.appId) {
    fields.value = []
    resetValues()
    return
  }
  schemaLoading.value = true
  try {
    const detail = await getFormApi(props.appId, props.form.id)
    if (session !== loadSession.value) return
    fields.value = Array.isArray(detail?.fields) ? detail.fields : []
    resetValues()
  } catch {
    if (session !== loadSession.value) return
    fields.value = []
    resetValues()
  } finally {
    if (session === loadSession.value) {
      schemaLoading.value = false
    }
  }
}

async function loadWorkspaceConfig() {
  const session = loadSession.value
  workspaceTabOrder.value = []
  if (!props.form?.id || !props.appId) return
  try {
    const config = await getFormConfigApi(props.appId, props.form.id)
    if (session !== loadSession.value) return
    if (Array.isArray(config?.workspaceTabOrder)) {
      workspaceTabOrder.value = config.workspaceTabOrder
    }
  } catch {
    return
  }
}

async function loadDictItems() {
  const session = loadSession.value
  const codes = dictCodes.value
  if (!codes.length || !props.appId) {
    dictItemsByCode.value = {}
    return
  }
  try {
    const rows = (await listDictionaryItemsByCodesApi(props.appId, codes)) || []
    if (session !== loadSession.value) return
    dictItemsByCode.value = Object.fromEntries(
      rows.map((row) => [row.code, row.items || []]),
    )
  } catch {
    if (session !== loadSession.value) return
    dictItemsByCode.value = {}
  }
}

async function onSave() {
  const err = firstRequiredError(fields.value, values)
  if (err) {
    ElMessage.warning(err.message)
    createTabRef.value?.revealField(err.key)
    return
  }
  saving.value = true
  try {
    await createFormRecordApi(
      props.appId,
      props.form.id,
      buildRecordData(fields.value, values),
    )
    ElMessage.success('保存成功')
    resetValues()
  } catch {
    return
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.appId, props.form?.id],
  () => {
    loadSession.value += 1
    loadSchema()
    loadWorkspaceConfig()
  },
  { immediate: true },
)

watch(dictCodes, loadDictItems, { immediate: true })
</script>

<style scoped lang="less">
.workspace-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: white;
  padding: 0; // 我觉得0更好
}

.workspace-main:not(:has(.form-work)) {
  align-items: center;
  justify-content: center;
}

.form-work {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.form-work-head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  // justify-content: space-between;
  padding: 12px 16px 0;
  border-bottom: 1px solid var(--el-border-color);
}

.form-work-title {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  margin-right: 80px;
}

.form-work-name {
  white-space: nowrap;
  font-size: 16px;
  font-weight: 600;
}

.form-work-tabs {
  display: flex;
  gap: 24px;
}

.form-work-tab {
  padding: 8px 0;
  font-weight: 600;
  cursor: pointer;
  color: var(--el-text-color-regular);
  border-bottom: 2px solid transparent;
}

.form-work-tab.is-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}
</style>
