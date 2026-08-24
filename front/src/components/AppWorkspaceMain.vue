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

      <div v-show="tab === 'create'" class="form-work-body" v-loading="schemaLoading">
        <el-empty
          v-if="!schemaLoading && fields.length === 0"
          description="请先保存表单设计"
        />
        <template v-else>
          <div class="fill-scroll">
            <div class="fill-grid">
              <FormFillField
                v-for="field in fields"
                :key="field.key"
                :field="field"
                :items="dictItemsByCode[field.dictCode] || []"
                :model-value="values[field.key]"
                @update:model-value="values[field.key] = $event"
              />
            </div>
          </div>
          <div class="fill-footer">
            <el-button @click="resetValues">取消</el-button>
            <el-button type="primary" :loading="saving" @click="onSave">
              保存
            </el-button>
          </div>
        </template>
      </div>

      <div v-if="tab === 'list'" class="form-work-body list-body">
        <el-empty
          v-if="!schemaLoading && fields.length === 0"
          description="请先保存表单设计"
        />
        <template v-else>
          <div class="table-wrap">
            <el-table
              v-loading="listLoading"
              :data="records"
              border
              stripe
              height="100%"
              size="small"
            >
              <el-table-column type="index" width="55" label="序号" />
              <el-table-column
                v-for="field in tableFields"
                :key="field.key"
                :label="field.title || '未命名'"
                min-width="120"
                show-overflow-tooltip
              >
                <template #default="{ row }">
                  {{ formatCellValue(field, row.data?.[field.key], dictItemsByCode) }}
                </template>
              </el-table-column>
              <el-table-column label="创建时间" width="180">
                <template #default="{ row }">
                  {{ formatTime(row.createdAt) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="pager">
            <el-pagination
              background
              layout="total, sizes, prev, pager, next"
              :current-page="page"
              :page-size="pageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="total"
              size="small"
              @current-change="onPageChange"
              @size-change="onPageSizeChange"
            />
          </div>
        </template>
      </div>
    </div>
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
  queryFormRecordsApi,
} from '../api/apps'
import FormFillField from './form-fill/FormFillField.vue'
import {
  buildRecordData,
  formatCellValue,
  isFillable,
  validateRequired,
} from './form-fill/fillValues.js'
import { isSelectType as isSelectField } from './form-design/fieldTypes'

const props = defineProps({
  appId: { type: Number, required: true },
  form: { type: Object, default: null },
})

const router = useRouter()

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
const listLoading = ref(false)
const fields = ref([])
const values = reactive({})
const dictItemsByCode = ref({})
const records = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
// 切换表单时作废进行中的请求，避免把上一张表的字段/记录写进来
const loadSession = ref(0)

const tableFields = computed(() => fields.value.filter(isFillable))

function emptyValue(field) {
  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    return []
  }
  return undefined
}

function resetValues() {
  for (const key of Object.keys(values)) {
    delete values[key]
  }
  for (const field of fields.value) {
    if (isFillable(field)) {
      values[field.key] = emptyValue(field)
    }
  }
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

function formatTime(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

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

async function loadRecords() {
  const session = loadSession.value
  if (!props.form?.id || !props.appId) {
    records.value = []
    total.value = 0
    return
  }
  listLoading.value = true
  try {
    const result = await queryFormRecordsApi(props.appId, props.form.id, {
      page: page.value,
      pageSize: pageSize.value,
    })
    if (session !== loadSession.value) return
    records.value = result?.items || []
    total.value = result?.total || 0
  } catch {
    if (session !== loadSession.value) return
    records.value = []
    total.value = 0
  } finally {
    if (session === loadSession.value) {
      listLoading.value = false
    }
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
    resetValues()
    if (tab.value === 'list') {
      await loadRecords()
    } else {
      page.value = 1
    }
  } catch {
    return
  } finally {
    saving.value = false
  }
}

function onPageChange(next) {
  page.value = next
  loadRecords()
}

function onPageSizeChange(next) {
  pageSize.value = next
  page.value = 1
  loadRecords()
}

watch(
  () => [props.appId, props.form?.id],
  () => {
    loadSession.value += 1
    tab.value = 'create'
    page.value = 1
    records.value = []
    total.value = 0
    loadSchema()
  },
  { immediate: true },
)

watch(dictCodes, loadDictItems, { immediate: true })

watch(tab, (value) => {
  if (value === 'list') {
    loadRecords()
  }
})
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

.form-work-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}

.list-body {
  padding: 12px 16px 16px;
}

.fill-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.fill-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 8px;
}

.fill-footer {
  display: flex;
  flex-shrink: 0;
  justify-content: flex-start;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color);
}

.table-wrap {
  flex: 1;
  min-height: 0;
}

.pager {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  padding-top: 12px;
}
</style>
