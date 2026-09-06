<template>
  <div class="form-work-body list-body">
    <el-empty
      v-if="!schemaLoading && fields.length === 0"
      description="请先保存表单设计"
    />
    <template v-else>
      <div class="list-toolbar">
        <div class="list-toolbar-actions">
          <el-button v-if="actions.create" type="primary" link @click="onCreateClick">
            新增
          </el-button>
          <el-button
            v-if="actions.edit"
            type="warning"
            :disabled="!canEditSelected"
            @click="onEditClick"
            link
          >
            编辑
          </el-button>
          <el-button
            v-if="actions.delete"
            type="danger"
            link
            :disabled="!canDeleteSelected"
            @click="onDeleteSelected"
          >
            删除
          </el-button>
          <el-button v-if="showImport" type="success" @click="openImport" link>导入</el-button>
          <el-button
            v-if="showImportTemplate"
            type="info"
            @click="onDownloadTemplate"
            link
          >
            下载导入模版
          </el-button>
        </div>
        <div class="list-toolbar-extra">
          <el-select
            v-if="isWorkflowForm"
            :model-value="workflowStatus"
            clearable
            placeholder="流程状态"
            class="workflow-status-filter"
            @change="onWorkflowStatusChange"
          >
            <el-option label="全部" value="" />
            <el-option label="草稿" value="draft" />
            <el-option label="审批中" value="running" />
            <el-option label="已通过" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="异常" value="error" />
          </el-select>
          <FormRecordQuickSearch
            :key="quickSearchKey"
            :app-id="appId"
            :form-id="form.id"
            :fields="quickSearchFields"
            @search="onQuickSearch"
          />
          <el-button :icon="Refresh" link @click="onRefresh">刷新</el-button>
          <FormRecordSortSetup
            v-model="sortRules"
            :sort-options="sortOptions"
            @apply="onSortApply"
          />
          <FormRecordColumnSetup v-model="columnPrefs" />
        </div>
      </div>
      <div class="table-wrap">
        <!-- TODO 要增加统计列 -->
        <el-table
          ref="tableRef"
          v-loading="listLoading"
          :data="records"
          border
          stripe
          height="100%"
          size="small"
          row-key="id"
          @row-click="onRecordRowClick"
          @selection-change="onSelectionChange"
        >
          <el-table-column
            v-if="actions.delete || actions.edit"
            type="selection"
            width="42"
            fixed="left"
          />
          <el-table-column type="index" width="55" label="序号" fixed="left" />
          <el-table-column
            v-if="isWorkflowForm"
            label="流程状态"
            width="100"
          >
            <template #default="{ row }">
              {{ workflowStatusText(row.workflowStatus) }}
            </template>
          </el-table-column>
          <el-table-column
            v-for="col in visibleColumns"
            :key="col.key"
            :label="col.title"
            :width="isTimeColumnKey(col.key) ? TIME_COL_WIDTH : undefined"
            :min-width="isTimeColumnKey(col.key) ? undefined : normalizeColWidth(col.minWidth)"
            :resizable="!isTimeColumnKey(col.key)"
            :fixed="col.fixed || undefined"
            :class-name="isDataColumn(col.key) ? 'record-data-col' : undefined"
          >
            <template #default="{ row }">
              <span v-if="col.key === RECORD_ID_KEY" class="sys-cell" :title="row.id">
                {{ row.id }}
              </span>
              <span v-else-if="col.key === CREATED_AT_KEY" class="sys-cell" :title="formatTime(row.createdAt)">
                {{ formatTime(row.createdAt) }}
              </span>
              <span v-else-if="col.key === UPDATED_AT_KEY" class="sys-cell" :title="formatTime(row.updatedAt)">
                {{ formatTime(row.updatedAt) }}
              </span>
              <span v-else-if="col.key === CREATED_BY_KEY" class="sys-cell" :title="row.createdByName">
                {{ row.createdByName }}
              </span>
              <span v-else-if="col.key === UPDATED_BY_KEY" class="sys-cell" :title="row.updatedByName">
                {{ row.updatedByName }}
              </span>
              <FormRecordCell
                v-else-if="fieldByKey[col.key]"
                :app-id="appId"
                :form-id="form.id"
                :row="row"
                :field="fieldByKey[col.key]"
                :fields="tableFields"
                :dict-items-by-code="dictItemsByCode"
                :user-names="userNames"
                :dept-names="deptNames"
                :relate-titles="relateTitles"
                :editing="editingCell === cellKey(row.id, col.key)"
                :inline-disabled="isWorkflowForm"
                @start="editingCell = cellKey(row.id, col.key)"
                @close="onCellClose(row.id, col.key)"
                @saved="upsertRecord"
              />
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
          :page-sizes="PAGE_SIZES"
          :total="total"
          size="small"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </template>
    <FormRecordImportDialog
      v-model="importVisible"
      :app-id="appId"
      :form-id="form?.id || 0"
      @imported="onImported"
    />
  </div>
</template>

<script setup>
import { computed, ref, toRef, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { deleteFormRecordApi, downloadRecordImportTemplateApi, queryFormRecordsApi } from '../../api/apps'
import { listOrgDepartmentsApi } from '../../api/org'
import { flattenDeptNames, isDeptField } from '../form-design/deptField.js'
import { walkFormFields } from '../form-fill/subformField.js'
import { flattenFields } from '../form-design/tabsField.js'
import { isFillable, isListColumn } from '../form-fill/fillValues.js'
import { relateColumnFields } from '../form-design/relateField.js'
import { loadRelateTitles } from './relateTitles'
import { formatDateTime } from '../../utils/timeValue.js'
import FormRecordCell from './FormRecordCell.vue'
import FormRecordColumnSetup from './FormRecordColumnSetup.vue'
import FormRecordImportDialog from './FormRecordImportDialog.vue'
import FormRecordQuickSearch from './FormRecordQuickSearch.vue'
import FormRecordSortSetup from './FormRecordSortSetup.vue'
import {
  RECORD_ID_KEY,
  CREATED_AT_KEY,
  UPDATED_AT_KEY,
  CREATED_BY_KEY,
  UPDATED_BY_KEY,
  TIME_COL_WIDTH,
  isTimeColumnKey,
  normalizeColWidth,
  useColumnPrefs,
} from './columnPrefs'
import { buildQuickSearchQuery, isQuickSearchField } from './quickSearch'
import { PAGE_SIZES } from '../../utils/pagination'
import { normalizeRecordActions } from '../../utils/recordActions'
import {
  canDeleteWorkflowRecord,
  canEditWorkflowRecord,
  workflowStatusText,
} from '../workflow-inbox/workflowStatus.js'
import { useUserStore } from '../../stores/user'
import { useSortPrefs } from './sortPrefs'

const props = defineProps({
  appId: { type: Number, required: true },
  form: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  dictItemsByCode: { type: Object, default: () => ({}) },
  schemaLoading: { type: Boolean, default: false },
  recordActions: { type: Object, default: () => normalizeRecordActions() },
})

const emit = defineEmits(['create', 'edit', 'row-click'])
const userStore = useUserStore()

const listLoading = ref(false)
const tableRef = ref(null)
const records = ref([])
const selectedRecords = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const editingCell = ref('')
const importVisible = ref(false)
const userNames = ref({})
const deptNames = ref({})
const relateTitles = ref({})
const relateFields = computed(() => relateColumnFields(props.fields))
// 切换表单时作废进行中的请求，避免把上一张表的记录写进来
const loadSession = ref(0)
const actions = computed(() => normalizeRecordActions(props.recordActions))
const isWorkflowForm = computed(() => props.form?.formKind === 'workflow')
const showImport = computed(() => actions.value.import && !isWorkflowForm.value)
const showImportTemplate = computed(
  () => actions.value.downloadTemplate && !isWorkflowForm.value,
)
const workflowStatus = ref('')
const actorId = computed(() => userStore.user?.id)
const canEditSelected = computed(() => {
  if (selectedRecords.value.length !== 1) return false
  return rowCanEdit(selectedRecords.value[0])
})
const canDeleteSelected = computed(() => {
  if (!selectedRecords.value.length) return false
  return selectedRecords.value.every(rowCanDelete)
})

function rowCanEdit(row) {
  if (!isWorkflowForm.value) return true
  return canEditWorkflowRecord({
    formKind: 'workflow',
    status: row.workflowStatus,
    initiatorId: row.workflowInstance?.initiatorId,
    actorId: actorId.value,
    hasInstance: Boolean(row.workflowInstanceId),
    publishEdit: actions.value.edit,
  })
}

function rowCanDelete(row) {
  if (!isWorkflowForm.value) return true
  return canDeleteWorkflowRecord({
    formKind: 'workflow',
    status: row.workflowStatus,
    initiatorId: row.workflowInstance?.initiatorId,
    actorId: actorId.value,
    publishDelete: actions.value.delete,
  })
}

const tableFields = computed(() => flattenFields(props.fields).filter(isListColumn))
const sortFields = computed(() => tableFields.value.filter(isFillable))
const fieldByKey = computed(() =>
  Object.fromEntries(tableFields.value.map((field) => [field.key, field])),
)
const quickSearchFields = computed(() =>
  tableFields.value.filter(isQuickSearchField),
)
const quickSearchKey = computed(
  () => `${props.appId}:${props.form?.id || ''}`,
)
const searchKeyword = ref('')
const searchFieldKeys = ref(null)

const { columnPrefs, visibleColumns } = useColumnPrefs({
  appId: toRef(props, 'appId'),
  formId: computed(() => props.form?.id),
  tableFields,
  schemaLoading: toRef(props, 'schemaLoading'),
})
const { sortRules, sortOptions, saveSortRules } = useSortPrefs({
  appId: toRef(props, 'appId'),
  formId: computed(() => props.form?.id),
  tableFields: sortFields,
  schemaLoading: toRef(props, 'schemaLoading'),
})

function formatTime(value) {
  return formatDateTime(value)
}

function isDataColumn(key) {
  return Boolean(fieldByKey.value[key])
}

function cellKey(rowId, fieldKey) {
  return `${rowId}:${fieldKey}`
}

function onCellClose(rowId, fieldKey) {
  if (editingCell.value === cellKey(rowId, fieldKey)) {
    editingCell.value = ''
  }
}

function onRecordRowClick(row, _column, event) {
  if (
    event?.target?.closest(
      '.el-table-column--selection, .record-cell-edit, .record-cell.is-editing',
    )
  ) {
    return
  }
  emit('row-click', row)
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
    const searchQuery = buildQuickSearchQuery(
      searchFieldKeys.value == null
        ? quickSearchFields.value
        : quickSearchFields.value.filter((field) =>
            searchFieldKeys.value.includes(field.key),
          ),
      searchKeyword.value,
      props.dictItemsByCode,
    )
    const result = await queryFormRecordsApi(props.appId, props.form.id, {
      page: page.value,
      pageSize: pageSize.value,
      ...(sortRules.value.length
        ? { sort: sortRules.value.map(({ key, order }) => ({ key, order })) }
        : {}),
      ...(searchQuery || {}),
      ...(isWorkflowForm.value && workflowStatus.value
        ? { workflowStatus: workflowStatus.value }
        : {}),
    })
    if (session !== loadSession.value) return
    records.value = result?.items || []
    total.value = result?.total || 0
    userNames.value = result?.userNames || {}
    const titles = relateFields.value.length
      ? await loadRelateTitles(props.appId, relateFields.value, records.value)
      : {}
    if (session !== loadSession.value) return
    relateTitles.value = titles
  } catch {
    if (session !== loadSession.value) return
    records.value = []
    total.value = 0
    relateTitles.value = {}
  } finally {
    if (session === loadSession.value) {
      listLoading.value = false
    }
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

function onWorkflowStatusChange(value) {
  workflowStatus.value = value || ''
  page.value = 1
  loadRecords()
}

function onCreateClick() {
  emit('create')
}

function onEditClick() {
  if (selectedRecords.value.length !== 1) {
    ElMessage.warning('请选择一条要编辑的数据')
    return
  }
  console.log("🚀 ~ FormRecordList.vue:321 ~ onEditClick ~ selectedRecords.value[0]:", selectedRecords.value[0])
  const row = selectedRecords.value[0]
  if (!rowCanEdit(row)) {
    ElMessage.warning('当前状态不能编辑')
    return
  }
  emit('edit', row)
}

function onSelectionChange(rows) {
  selectedRecords.value = rows
}

function openImport() {
  importVisible.value = true
}

async function onDownloadTemplate() {
  if (!props.form?.id) return
  await downloadRecordImportTemplateApi(props.appId, props.form.id)
}

async function onImported() {
  await reload({ resetPage: true })
}

async function onDeleteSelected() {
  if (!selectedRecords.value.length) {
    ElMessage.warning('请先选择要删除的数据')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedRecords.value.length} 条数据？`,
      '删除',
      { type: 'warning' },
    )
  } catch {
    return
  }
  if (!selectedRecords.value.every(rowCanDelete)) {
    ElMessage.warning('审批中的数据不能删除，草稿和已驳回只能由发起人删除')
    return
  }
  const ids = selectedRecords.value.map((row) => row.id)
  const removed = records.value.length === ids.length
  try {
    await Promise.all(
      ids.map((id) => deleteFormRecordApi(props.appId, props.form.id, id)),
    )
    ElMessage.success('已删除')
    clearSelectedRecords()
    if (removed && page.value > 1) {
      page.value -= 1
    }
    await loadRecords()
  } catch {
    await loadRecords()
  }
}

async function reload({ resetPage = false } = {}) {
  if (resetPage) {
    page.value = 1
  }
  clearSelectedRecords()
  await loadRecords()
}

function onRefresh() {
  editingCell.value = ''
  loadRecords()
}

function onSortApply(rules) {
  sortRules.value = rules
  saveSortRules(rules)
  page.value = 1
  loadRecords()
}

function onQuickSearch(payload) {
  const keyword = payload?.keyword || ''
  const fieldKeys = payload?.fieldKeys ?? null
  const sameKeys =
    JSON.stringify(fieldKeys) === JSON.stringify(searchFieldKeys.value)
  if (keyword === searchKeyword.value && sameKeys) return
  searchKeyword.value = keyword
  searchFieldKeys.value = fieldKeys
  page.value = 1
  loadRecords()
}

function clearSelectedRecords() {
  selectedRecords.value = []
  tableRef.value?.clearSelection()
}

function upsertRecord(updated) {
  const index = records.value.findIndex((item) => item.id === updated.id)
  if (index >= 0) {
    records.value[index] = updated
  }
  clearSelectedRecords()
}

function formHasDeptField(fields) {
  let found = false
  walkFormFields(fields, (field) => {
    if (isDeptField(field)) found = true
  })
  return found
}

async function loadDeptNames() {
  if (!formHasDeptField(props.fields)) {
    deptNames.value = {}
    return
  }
  try {
    const tree = await listOrgDepartmentsApi()
    deptNames.value = flattenDeptNames(tree)
  } catch {
    deptNames.value = {}
  }
}

watch(
  () => [props.appId, props.form?.id],
  () => {
    loadSession.value += 1
    page.value = 1
    selectedRecords.value = []
    records.value = []
    total.value = 0
    editingCell.value = ''
    searchKeyword.value = ''
    searchFieldKeys.value = null
    loadRecords()
  },
  { immediate: true },
)

watch(
  () => props.fields,
  () => {
    loadDeptNames()
  },
  { immediate: true },
)

defineExpose({ reload, upsertRecord })
</script>

<style scoped lang="less">
@import '../form-fill/fillLayout.less';

.list-body {
  padding: 12px 16px 16px;
}

.list-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.list-toolbar-actions,
.list-toolbar-extra {
  display: flex;
  align-items: center;
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

:deep(td.record-data-col .cell) {
  overflow: visible;
}

.sys-cell {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
