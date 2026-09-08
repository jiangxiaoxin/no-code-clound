<template>
  <div class="record-manage" v-loading="schemaLoading">
    <FormRecordList
      v-if="form"
      ref="listRef"
      :app-id="appId"
      :form="form"
      :fields="fields"
      :dict-items-by-code="dictItemsByCode"
      :schema-loading="schemaLoading"
      :record-actions="recordActions"
      @create="openCreate"
      @edit="openEdit"
      @row-click="openDetail"
    />
    <FormRecordDetailDrawer
      v-model="detailVisible"
      :record="detailRecord"
      :fields="fields"
      :dict-items-by-code="dictItemsByCode"
      :app-id="appId"
      :form-id="form?.id"
      :form-kind="form?.formKind || 'normal'"
      :can-edit="recordActions.edit"
      :can-configure="Boolean(detailRecord?.canConfigure ?? canConfigure)"
      :start-editing="detailStartEditing"
      :data-source="recordSource"
      @saved="onDetailSaved"
    />
    <FormRecordCreateDrawer
      ref="createDrawerRef"
      v-model="createVisible"
      :app-id="appId"
      :fields="fields"
      :values="values"
      :dict-items-by-code="dictItemsByCode"
      :schema-loading="schemaLoading"
      :saving="saving"
      :unpublished="workflowUnpublished"
      :workflow-enabled="workflowEnabled"
      :field-access="startFieldAccess"
      @save="onCreate"
      @draft="onCreateDraft"
      @submit="onCreateSubmit"
      @closed="resetValues"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createFormRecordApi,
  getFormApi,
  getFormConfigApi,
  getFormRecordApi,
  listDictionaryItemsByCodesApi,
} from '../../api/apps'
import { appRecordSource } from './recordDataSource.js'
import { submitSuccessText } from '../workflow-inbox/workflowStatus.js'
import {
  buildRecordData,
  emptyRecordValues,
  firstRequiredError,
} from '../form-fill/fillValues.js'
import { isSelectType as isSelectField } from '../form-design/fieldTypes'
import { walkFormFields } from '../form-fill/subformField.js'
import { normalizeRecordActions } from '../../utils/recordActions'
import FormRecordList from './FormRecordList.vue'
import FormRecordCreateDrawer from './FormRecordCreateDrawer.vue'
import FormRecordDetailDrawer from './FormRecordDetailDrawer.vue'
import { gridFieldAccessFromStart } from '../workflow-design/fieldAccess.js'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  canConfigure: { type: Boolean, default: false },
})

const listRef = ref(null)
const createDrawerRef = ref(null)
const schemaLoading = ref(false)
const saving = ref(false)
const form = ref(null)
const fields = ref([])
const values = reactive({})
const dictItemsByCode = ref({})
const recordActions = ref(normalizeRecordActions())
const createVisible = ref(false)
const detailVisible = ref(false)
const detailRecord = ref(null)
const detailStartEditing = ref(false)
// 切换表单时作废进行中的请求，避免把上一张表的字段写进来
const loadSession = ref(0)
const workflowUnpublished = computed(
  () => form.value?.formKind === 'workflow' && !form.value?.workflowPublished,
)
const workflowEnabled = computed(
  () => form.value?.formKind === 'workflow' && Boolean(form.value?.workflowEnabled),
)
const startFieldAccess = computed(() =>
  gridFieldAccessFromStart(form.value?.startFieldAccess, fields.value),
)
const recordSource = computed(() =>
  appRecordSource({ appId: props.appId, formId: props.formId }),
)

watch(detailRecord, (newval, oldval) => {
  console.log('watch detailRecord======');
  console.log(newval);
  console.log(oldval);
  console.log('===========');
  
})

function resetValues() {
  for (const key of Object.keys(values)) {
    delete values[key]
  }
  Object.assign(values, emptyRecordValues(fields.value))
}

const dictCodes = computed(() => {
  const codes = []
  const seen = new Set()
  walkFormFields(fields.value, (field) => {
    const usesDict =
      (field.type === 'radio' ||
        field.type === 'checkbox' ||
        isSelectField(field.type)) &&
      (field.optionSource || 'dictionary') === 'dictionary' &&
      field.dictCode
    if (!usesDict || seen.has(field.dictCode)) return
    seen.add(field.dictCode)
    codes.push(field.dictCode)
  })
  return codes
})

async function loadSchema() {
  const session = loadSession.value
  if (!props.appId || !props.formId) {
    form.value = null
    fields.value = []
    resetValues()
    return
  }
  schemaLoading.value = true
  try {
    const detail = await getFormApi(props.appId, props.formId)
    if (session !== loadSession.value) return
    form.value = detail
    fields.value = Array.isArray(detail?.fields) ? detail.fields : []
    resetValues()
  } catch {
    if (session !== loadSession.value) return
    form.value = null
    fields.value = []
    resetValues()
  } finally {
    if (session === loadSession.value) {
      schemaLoading.value = false
    }
  }
}

async function loadConfig() {
  const session = loadSession.value
  if (!props.appId || !props.formId) {
    recordActions.value = normalizeRecordActions()
    return
  }
  try {
    const config = await getFormConfigApi(props.appId, props.formId)
    if (session !== loadSession.value) return
    recordActions.value = normalizeRecordActions(config?.recordActions)
  } catch {
    if (session !== loadSession.value) return
    recordActions.value = normalizeRecordActions()
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

function openCreate() {
  if (workflowUnpublished.value) {
    ElMessage.warning('这张表单还没有配置流程，暂时不能填报')
    return
  }
  resetValues()
  createVisible.value = true
}

async function openRecord(row, startEditing) {
  console.log("🚀 ~ FormRecordManage.vue:184 ~ openDetail ~ row:", row)
  detailStartEditing.value = startEditing
  try {
    detailRecord.value = await getFormRecordApi(props.appId, props.formId, row.id)
  } catch {
    detailRecord.value = row
  }
  detailVisible.value = true
}

function openDetail(row) {
  return openRecord(row, false)
}

function openEdit(row) {
  console.log("🚀 ~ FormRecordManage.vue:192 ~ openEdit ~ row:", row)
  return openRecord(row, true)
}

function onDetailSaved(updated) {
  detailStartEditing.value = false
  detailVisible.value = false
  if (updated?.id) {
    listRef.value?.upsertRecord(updated)
  }
  listRef.value?.reload()
}

async function onCreate() {
  return createRecord()
}

async function onCreateDraft() {
  return createRecord('draft')
}

async function onCreateSubmit() {
  return createRecord('submit')
}

async function createRecord(intent) {
  if (workflowUnpublished.value) {
    ElMessage.warning('这张表单还没有配置流程，暂时不能填报')
    return
  }
  const err = firstRequiredError(fields.value, values, {
    workflowForm: workflowEnabled.value,
  })
  if (err) {
    ElMessage.warning(err.message)
    createDrawerRef.value?.revealField(err.key)
    return
  }
  if (!form.value?.id) {
    return
  }
  saving.value = true
  try {
    const saved = await createFormRecordApi(
      props.appId,
      form.value.id,
      buildRecordData(fields.value, values),
      intent,
    )
    ElMessage.success(
      intent === 'submit' ? submitSuccessText(saved?.nextNodeTitle) : '保存成功',
    )
    resetValues()
    createVisible.value = false
    await listRef.value?.reload({ resetPage: true })
  } catch {
    return
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.appId, props.formId],
  () => {
    loadSession.value += 1
    createVisible.value = false
    detailVisible.value = false
    detailRecord.value = null
    detailStartEditing.value = false
    loadSchema()
    loadConfig()
  },
  { immediate: true },
)

watch(dictCodes, loadDictItems, { immediate: true })
</script>

<style scoped lang="less">
.record-manage {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  flex-direction: column;
  background: var(--el-bg-color);
}
</style>
