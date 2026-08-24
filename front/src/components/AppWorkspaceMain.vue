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
          <div class="list-toolbar">
            <div class="list-toolbar-actions">
              <el-button type="primary" @click="openCreateDialog">新增</el-button>
              <el-button type="danger" :disabled="!selectedRecords.length" @click="onDeleteSelected">
                删除
              </el-button>
            </div>
            <div class="list-toolbar-extra">
              <el-popover placement="bottom-end" :width="460" trigger="click">
                <template #reference>
                  <el-button :icon="Setting" type="text">列设置</el-button>
                </template>
                <div class="col-setup">
                  <div class="col-setup-head">
                    <span class="col-setup-handle" />
                    <span class="col-setup-name">列名</span>
                    <span class="col-setup-check">显示</span>
                    <span class="col-setup-width">宽度</span>
                    <span class="col-setup-fixed">固定</span>
                  </div>
                  <div class="col-setup-row is-locked">
                    <span class="col-setup-handle is-disabled" />
                    <span class="col-setup-name">序号</span>
                    <span class="col-setup-check">
                      <el-checkbox :model-value="true" disabled />
                    </span>
                    <span class="col-setup-width" />
                    <el-select class="col-setup-fixed" model-value="left" disabled size="small">
                      <el-option label="左侧" value="left" />
                    </el-select>
                  </div>
                  <div
                    v-for="(col, index) in columnPrefs"
                    :key="col.key"
                    class="col-setup-row"
                    :class="{
                      'is-dragging': dragColumnIndex === index,
                      'is-drag-over': dragOverIndex === index && dragColumnIndex !== index,
                    }"
                    @dragover.prevent="dragOverIndex = index"
                    @drop.prevent="dropColumn(index)"
                  >
                    <span
                      class="col-setup-handle"
                      draggable="true"
                      @dragstart.stop="onColumnDragStart($event, index)"
                      @dragend="onColumnDragEnd"
                    >
                      <el-icon><Rank /></el-icon>
                    </span>
                    <span class="col-setup-name" :title="col.title">{{ col.title }}</span>
                    <span class="col-setup-check">
                      <el-checkbox v-model="col.visible" />
                    </span>
                    <el-input-number
                      v-model="col.minWidth"
                      class="col-setup-width"
                      :min="100"
                      :precision="0"
                      :step="10"
                      :controls="false"
                      size="small"
                      @change="col.minWidth = normalizeColWidth($event)"
                    />
                    <el-select
                      v-model="col.fixed"
                      class="col-setup-fixed"
                      clearable
                      placeholder="不固定"
                      size="small"
                    >
                      <el-option label="左侧" value="left" />
                      <el-option label="右侧" value="right" />
                    </el-select>
                  </div>
                </div>
              </el-popover>
            </div>
          </div>
          <div class="table-wrap">
            <el-table
              v-loading="listLoading"
              :data="records"
              border
              stripe
              height="100%"
              size="small"
              row-key="id"
              @row-click="onRecordRowClick"
              @selection-change="selectedRecords = $event"
            >
              <el-table-column type="selection" width="42" fixed="left" />
              <el-table-column type="index" width="55" label="序号" fixed="left" />
              <el-table-column
                v-for="col in visibleColumns"
                :key="col.key"
                :label="col.title"
                :min-width="normalizeColWidth(col.minWidth)"
                :fixed="col.fixed || undefined"
                show-overflow-tooltip
              >
                <template #default="{ row }">
                  <template v-if="col.key === createdAtKey">
                    {{ formatTime(row.createdAt) }}
                  </template>
                  <template v-else>
                    {{ formatCellValue(fieldByKey[col.key], row.data?.[col.key], dictItemsByCode) }}
                  </template>
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

    <el-dialog
      v-model="detailVisible"
      title="数据详情"
      width="800px"
      align-center
      destroy-on-close
      @closed="resetDetail"
    >
      <div v-if="detailRecord" class="record-detail-body">
        <div class="fill-grid">
          <FormFillField
            v-for="field in fields"
            :key="field.key"
            :field="field"
            :items="dictItemsByCode[field.dictCode] || []"
            :model-value="detailValues[field.key]"
            :disabled="!detailEditing"
            @update:model-value="detailValues[field.key] = $event"
          />
        </div>
      </div>
      <template #footer>
        <div class="record-detail-footer">
          <div>
            <el-button v-if="!detailEditing" type="primary" @click="startDetailEdit">
              编辑
            </el-button>
          </div>
          <div class="record-detail-footer-right">
            <template v-if="detailEditing">
              <el-button @click="cancelDetailEdit">取消</el-button>
              <el-button type="primary" :loading="detailSaving" @click="saveDetail">
                保存
              </el-button>
            </template>
            <el-button v-else @click="detailVisible = false">关闭</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="createVisible"
      title="新增"
      width="800px"
      align-center
      destroy-on-close
      @closed="resetValues"
    >
      <el-empty
        v-if="!schemaLoading && fields.length === 0"
        description="请先保存表单设计"
      />
      <div v-else class="create-dialog-body">
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
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </el-main>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { EditPen, Rank, Setting } from '@element-plus/icons-vue'
import {
  createFormRecordApi,
  deleteFormRecordApi,
  getFormApi,
  listDictionaryItemsByCodesApi,
  queryFormRecordsApi,
  updateFormRecordApi,
} from '../api/apps'
import FormFillField from './form-fill/FormFillField.vue'
import {
  buildRecordData,
  formatCellValue,
  isFillable,
  validateRequired,
} from './form-fill/fillValues.js'
import { isSelectType as isSelectField } from './form-design/fieldTypes'
import { useUserStore } from '../stores/user'

const props = defineProps({
  appId: { type: Number, required: true },
  form: { type: Object, default: null },
})

const userStore = useUserStore()
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
const selectedRecords = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const createdAtKey = '__createdAt'
const defaultColWidth = 100
const columnPrefs = ref([])
const dragColumnIndex = ref(-1)
const dragOverIndex = ref(-1)
const createVisible = ref(false)
const detailVisible = ref(false)
const detailEditing = ref(false)
const detailSaving = ref(false)
const detailRecord = ref(null)
const detailValues = reactive({})
const detailSnapshot = ref({})

const tableFields = computed(() => fields.value.filter(isFillable))

const fieldByKey = computed(() =>
  Object.fromEntries(tableFields.value.map((field) => [field.key, field])),
)

const visibleColumns = computed(() => columnPrefs.value.filter((col) => col.visible))

function normalizeColWidth(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < defaultColWidth) {
    return defaultColWidth
  }
  return Math.round(n)
}

function columnStorageKey() {
  const userId = userStore.user?.id
  if (!userId || !props.appId || !props.form?.id) {
    return ''
  }
  return `form-list-columns:${userId}:${props.appId}:${props.form.id}`
}

function loadStoredColumnPrefs() {
  const key = columnStorageKey()
  if (!key) {
    return []
  }
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    if (!Array.isArray(raw)) {
      return []
    }
    return raw
      .filter((item) => item && typeof item.key === 'string')
      .map((item) => ({
        key: item.key,
        visible: item.visible !== false,
        fixed: item.fixed === 'left' || item.fixed === 'right' ? item.fixed : '',
        minWidth: normalizeColWidth(item.minWidth),
      }))
  } catch {
    return []
  }
}

function saveColumnPrefs() {
  const key = columnStorageKey()
  if (!key || schemaLoading.value || !columnPrefs.value.length) {
    return
  }
  localStorage.setItem(
    key,
    JSON.stringify(
      columnPrefs.value.map((col) => ({
        key: col.key,
        visible: col.visible !== false,
        fixed: col.fixed === 'left' || col.fixed === 'right' ? col.fixed : '',
        minWidth: normalizeColWidth(col.minWidth),
      })),
    ),
  )
}

function defaultColumnPrefs() {
  return [
    ...tableFields.value.map((field) => ({
      key: field.key,
      title: field.title || '未命名',
      visible: true,
      fixed: '',
      minWidth: defaultColWidth,
    })),
    {
      key: createdAtKey,
      title: '创建时间',
      visible: true,
      fixed: '',
      minWidth: defaultColWidth,
    },
  ]
}

function syncColumnPrefs() {
  if (schemaLoading.value) {
    return
  }
  const defaults = defaultColumnPrefs()
  const stored = columnPrefs.value.length
    ? columnPrefs.value
    : loadStoredColumnPrefs()
  if (!stored.length) {
    columnPrefs.value = defaults
    return
  }
  const defaultMap = new Map(defaults.map((col) => [col.key, col]))
  const kept = stored.filter((col) => defaultMap.has(col.key))
  const keptKeys = new Set(kept.map((col) => col.key))
  const next = kept.map((col) => ({
    ...defaultMap.get(col.key),
    visible: col.visible !== false,
    fixed: col.fixed === 'left' || col.fixed === 'right' ? col.fixed : '',
    minWidth: normalizeColWidth(col.minWidth),
  }))
  defaults.forEach((col, index) => {
    if (keptKeys.has(col.key)) {
      return
    }
    next.splice(index, 0, col)
  })
  columnPrefs.value = next
}

function onColumnDragStart(event, index) {
  dragColumnIndex.value = index
  dragOverIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

function onColumnDragEnd() {
  dragColumnIndex.value = -1
  dragOverIndex.value = -1
}

function dropColumn(to) {
  const from = dragColumnIndex.value
  if (from < 0 || from === to) {
    onColumnDragEnd()
    return
  }
  const next = columnPrefs.value.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  columnPrefs.value = next
  onColumnDragEnd()
}

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

function cloneValues(data) {
  const next = {}
  for (const field of fields.value) {
    if (!isFillable(field)) {
      continue
    }
    const value = data?.[field.key]
    next[field.key] =
      value == null ? emptyValue(field) : Array.isArray(value) ? [...value] : value
  }
  return next
}

function applyDetailValues(data) {
  for (const key of Object.keys(detailValues)) {
    delete detailValues[key]
  }
  Object.assign(detailValues, cloneValues(data))
  detailSnapshot.value = cloneValues(data)
}

function onRecordRowClick(row, _column, event) {
  if (event?.target?.closest('.el-table-column--selection')) {
    return
  }
  detailRecord.value = row
  detailEditing.value = false
  applyDetailValues(row.data)
  detailVisible.value = true
}

function startDetailEdit() {
  detailEditing.value = true
}

function cancelDetailEdit() {
  applyDetailValues(detailSnapshot.value)
  detailEditing.value = false
}

function resetDetail() {
  detailEditing.value = false
  detailRecord.value = null
  detailSnapshot.value = {}
  for (const key of Object.keys(detailValues)) {
    delete detailValues[key]
  }
}

async function saveDetail() {
  const message = validateRequired(fields.value, detailValues)
  if (message) {
    ElMessage.warning(message)
    return
  }
  if (!detailRecord.value?.id || !props.form?.id) {
    return
  }
  detailSaving.value = true
  try {
    const updated = await updateFormRecordApi(
      props.appId,
      props.form.id,
      detailRecord.value.id,
      buildRecordData(fields.value, detailValues),
    )
    detailRecord.value = updated
    const index = records.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) {
      records.value[index] = updated
    }
    applyDetailValues(updated.data)
    detailEditing.value = false
    ElMessage.success('保存成功')
  } catch {
    return
  } finally {
    detailSaving.value = false
  }
}

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

async function loadRecords() {
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
    records.value = result?.items || []
    total.value = result?.total || 0
  } catch {
    records.value = []
    total.value = 0
  } finally {
    listLoading.value = false
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
      page.value = 1
      await loadRecords()
    } else if (tab.value === 'list') {
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

function openCreateDialog() {
  resetValues()
  createVisible.value = true
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
  const ids = selectedRecords.value.map((row) => row.id)
  const removed = records.value.length === ids.length
  try {
    await Promise.all(
      ids.map((id) => deleteFormRecordApi(props.appId, props.form.id, id)),
    )
    ElMessage.success('已删除')
    selectedRecords.value = []
    if (removed && page.value > 1) {
      page.value -= 1
    }
    await loadRecords()
  } catch {
    await loadRecords()
  }
}

watch(
  () => [props.appId, props.form?.id],
  () => {
    tab.value = 'create'
    page.value = 1
    createVisible.value = false
    detailVisible.value = false
    resetDetail()
    selectedRecords.value = []
    columnPrefs.value = []
    loadSchema()
  },
  { immediate: true },
)

watch(dictCodes, loadDictItems, { immediate: true })

watch(tableFields, syncColumnPrefs)

watch(
  () => userStore.user?.id,
  (id) => {
    if (!id || schemaLoading.value || !props.form?.id) {
      return
    }
    const stored = loadStoredColumnPrefs()
    if (stored.length) {
      columnPrefs.value = stored
    }
    syncColumnPrefs()
  },
)

watch(
  columnPrefs,
  () => {
    saveColumnPrefs()
  },
  { deep: true },
)

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

.col-setup {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.col-setup-head,
.col-setup-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.col-setup-handle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: var(--el-text-color-secondary);
  cursor: grab;
}

.col-setup-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-setup-check {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
}

.col-setup-width {
  flex: none;
  width: 72px;
}

:deep(.col-setup-width.el-input-number) {
  width: 72px;
}

:deep(.col-setup-width .el-input__inner) {
  padding-left: 8px;
  padding-right: 8px;
  text-align: center;
}

.col-setup-fixed {
  flex: none;
  width: 96px;
}

.col-setup-head {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.col-setup-row.is-locked {
  color: var(--el-text-color-secondary);
}

.col-setup-row.is-dragging {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  opacity: 0.55;
}

.col-setup-row.is-drag-over {
  background: var(--el-color-primary-light-8);
  border-color: var(--el-color-primary-light-5);
}

.col-setup-handle.is-disabled {
  cursor: default;
}

.col-setup-row.is-dragging .col-setup-handle {
  cursor: grabbing;
}

.create-dialog-body {
  max-height: 60vh;
  overflow: auto;
}

.record-detail-body {
  max-height: 60vh;
  overflow: auto;
}

.record-detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-detail-footer-right {
  display: flex;
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
