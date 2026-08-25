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
      @create="openCreate"
      @row-click="openDetail"
    />
    <FormRecordDetailDrawer
      v-model="detailVisible"
      :record="detailRecord"
      :fields="fields"
      :dict-items-by-code="dictItemsByCode"
      :app-id="appId"
      :form-id="form?.id"
      @saved="onDetailSaved"
    />
    <FormRecordCreateDrawer
      v-model="createVisible"
      :app-id="appId"
      :fields="fields"
      :values="values"
      :dict-items-by-code="dictItemsByCode"
      :schema-loading="schemaLoading"
      :saving="saving"
      @save="onCreate"
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
  listDictionaryItemsByCodesApi,
} from '../../api/apps'
import {
  buildRecordData,
  emptyRecordValues,
  validateRequired,
} from '../form-fill/fillValues.js'
import { isSelectType as isSelectField } from '../form-design/fieldTypes'
import FormRecordList from './FormRecordList.vue'
import FormRecordCreateDrawer from './FormRecordCreateDrawer.vue'
import FormRecordDetailDrawer from './FormRecordDetailDrawer.vue'

const props = defineProps({
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
})

const listRef = ref(null)
const schemaLoading = ref(false)
const saving = ref(false)
const form = ref(null)
const fields = ref([])
const values = reactive({})
const dictItemsByCode = ref({})
const createVisible = ref(false)
const detailVisible = ref(false)
const detailRecord = ref(null)
// 切换表单时作废进行中的请求，避免把上一张表的字段写进来
const loadSession = ref(0)

function resetValues() {
  for (const key of Object.keys(values)) {
    delete values[key]
  }
  Object.assign(values, emptyRecordValues(fields.value))
}

const dictCodes = computed(() => {
  const codes = []
  const seen = new Set()
  for (const field of fields.value) {
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
  resetValues()
  createVisible.value = true
}

function openDetail(row) {
  detailRecord.value = row
  detailVisible.value = true
}

function onDetailSaved(updated) {
  detailRecord.value = updated
  listRef.value?.upsertRecord(updated)
}

async function onCreate() {
  const message = validateRequired(fields.value, values)
  if (message) {
    ElMessage.warning(message)
    return
  }
  if (!form.value?.id) {
    return
  }
  saving.value = true
  try {
    await createFormRecordApi(
      props.appId,
      form.value.id,
      buildRecordData(fields.value, values),
    )
    ElMessage.success('保存成功')
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
    loadSchema()
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
