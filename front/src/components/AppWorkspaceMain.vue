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
            class="form-work-tab"
            :class="{ 'is-active': tab === 'create' }"
            @click="tab = 'create'"
          >
            添加数据
          </span>
          <span
            class="form-work-tab"
            :class="{ 'is-active': tab === 'list' }"
            @click="tab = 'list'"
          >
            数据管理
          </span>
        </div>
      </div>

      <FormRecordCreateTab
        v-show="tab === 'create'"
        :fields="fields"
        :values="values"
        :dict-items-by-code="dictItemsByCode"
        :schema-loading="schemaLoading"
        :saving="saving"
        @cancel="resetValues"
        @save="onSave"
      />
      <FormRecordList
        v-if="tab === 'list'"
        ref="listRef"
        :app-id="appId"
        :form="form"
        :fields="fields"
        :dict-items-by-code="dictItemsByCode"
        :schema-loading="schemaLoading"
        @create="openCreateDialog"
        @row-click="openDetail"
      />
    </div>

    <FormRecordDetailDialog
      v-model="detailVisible"
      :record="detailRecord"
      :fields="fields"
      :dict-items-by-code="dictItemsByCode"
      :app-id="appId"
      :form-id="form?.id"
      @saved="onDetailSaved"
    />
    <FormRecordCreateDialog
      v-model="createVisible"
      :fields="fields"
      :values="values"
      :dict-items-by-code="dictItemsByCode"
      :schema-loading="schemaLoading"
      :saving="saving"
      @save="onSave"
      @closed="resetValues"
    />
  </el-main>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import {
  createFormRecordApi,
  getFormApi,
  listDictionaryItemsByCodesApi,
} from '../api/apps'
import {
  buildRecordData,
  emptyRecordValues,
  validateRequired,
} from './form-fill/fillValues.js'
import { isSelectType as isSelectField } from './form-design/fieldTypes'
import FormRecordCreateTab from './form-workspace/FormRecordCreateTab.vue'
import FormRecordList from './form-workspace/FormRecordList.vue'
import FormRecordCreateDialog from './form-workspace/FormRecordCreateDialog.vue'
import FormRecordDetailDialog from './form-workspace/FormRecordDetailDialog.vue'

const props = defineProps({
  appId: { type: Number, required: true },
  form: { type: Object, default: null },
})

const router = useRouter()
const listRef = ref(null)

function goDesign() {
  if (!props.form?.id) {
    return
  }
  router.push({
    name: 'form-design',
    params: { id: props.appId, formId: props.form.id },
  })
}

const tab = ref('create')
const schemaLoading = ref(false)
const saving = ref(false)
const fields = ref([])
const values = reactive({})
const dictItemsByCode = ref({})
const createVisible = ref(false)
const detailVisible = ref(false)
const detailRecord = ref(null)

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
  if (!props.form?.id || !props.appId) {
    fields.value = []
    resetValues()
    return
  }
  schemaLoading.value = true
  try {
    const detail = await getFormApi(props.appId, props.form.id)
    fields.value = Array.isArray(detail?.fields) ? detail.fields : []
    resetValues()
  } catch {
    fields.value = []
    resetValues()
  } finally {
    schemaLoading.value = false
  }
}

async function loadDictItems() {
  const codes = dictCodes.value
  if (!codes.length || !props.appId) {
    dictItemsByCode.value = {}
    return
  }
  try {
    const rows = (await listDictionaryItemsByCodesApi(props.appId, codes)) || []
    dictItemsByCode.value = Object.fromEntries(
      rows.map((row) => [row.code, row.items || []]),
    )
  } catch {
    dictItemsByCode.value = {}
  }
}

async function onSave() {
  const message = validateRequired(fields.value, values)
  if (message) {
    ElMessage.warning(message)
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
    const fromDialog = createVisible.value
    resetValues()
    if (fromDialog) {
      createVisible.value = false
      await listRef.value?.reload({ resetPage: true })
    }
  } catch {
    return
  } finally {
    saving.value = false
  }
}

function openCreateDialog() {
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

watch(
  () => [props.appId, props.form?.id],
  () => {
    tab.value = 'create'
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
