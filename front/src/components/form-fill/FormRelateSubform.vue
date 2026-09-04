<template>
  <div class="relate-subform-runtime">
    <div v-if="!ready" class="relate-subform-tip">请先在设计器里选择关联表单</div>
    <div v-else-if="!configuredColumnKeys.length" class="relate-subform-tip">请先配置显示的列</div>
    <div v-else-if="!recordId" class="relate-subform-tip">
      保存后可在数据详情里查看关联数据
    </div>
    <template v-else>
      <el-table
        v-loading="loading"
        :data="rows"
        border
        stripe
        size="small"
        @row-click="onRowClick"
      >
        <el-table-column type="index" width="55" label="序号" />
        <el-table-column
          v-for="col in columns"
          :key="col.key"
          :label="col.title"
          min-width="120"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ formatColumn(col, row) }}
          </template>
        </el-table-column>
        <template #empty>
          <span>{{ loadError ? '加载失败' : '暂无关联数据' }}</span>
        </template>
      </el-table>
      <div class="relate-subform-footer">
        <el-button v-if="loadError" type="primary" link @click="reload">重试</el-button>
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
      <FormRecordDetailDrawer
        v-if="detailVisible"
        v-model="detailVisible"
        :record="detailRecord"
        :fields="childFields"
        :dict-items-by-code="dictItemsByCode"
        :app-id="appId"
        :form-id="field.childFormId"
        :can-edit="false"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import {
  getFormApi,
  listDictionaryItemsByCodesApi,
  queryFormRecordsApi,
} from '../../api/apps'
import { listOrgDepartmentsApi } from '../../api/org'
import { flattenDeptNames, isDeptField } from '../form-design/deptField.js'
import { sourceDictCodes } from '../form-design/dataSelect'
import {
  relateSubformColumnTitles,
  relateSubformQuery,
  relateSubformReady,
} from '../form-design/relateSubform.js'
import { flattenFields } from '../form-design/tabsField.js'
import { PAGE_SIZES } from '../../utils/pagination.js'
import { formatCellValue, isFillable } from './fillValues.js'

const FormRecordDetailDrawer = defineAsyncComponent(
  () => import('../form-workspace/FormRecordDetailDrawer.vue'),
)

const props = defineProps({
  field: { type: Object, required: true },
  appId: { type: Number, default: 0 },
  recordId: { type: String, default: '' },
})

const loading = ref(false)
const loadError = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const childFields = ref([])
const dictItemsByCode = ref({})
const userNames = ref({})
const deptNames = ref({})
const detailVisible = ref(false)
const detailRecord = ref(null)
let loadedFormId = 0

const ready = computed(() => relateSubformReady(props.field))
const pageSize = ref(PAGE_SIZES[0])
const configuredColumnKeys = computed(() =>
  Array.isArray(props.field.columnKeys)
    ? props.field.columnKeys.filter((key) => typeof key === 'string' && key)
    : [],
)

const columns = computed(() => {
  const fieldByKey = new Map(childFields.value.map((item) => [item.key, item]))
  return relateSubformColumnTitles(props.field.columnKeys, childFields.value)
    .map((col) => {
      const field = fieldByKey.get(col.key)
      return field ? { ...col, field } : null
    })
    .filter(Boolean)
})

function formatColumn(col, row) {
  return formatCellValue(
    col.field,
    row?.data?.[col.key],
    dictItemsByCode.value,
    userNames.value,
    deptNames.value,
  )
}

async function loadChildForm() {
  const formId = Number(props.field.childFormId)
  if (loadedFormId === formId && childFields.value.length) return
  try {
    const detail = await getFormApi(props.appId, formId)
    childFields.value = flattenFields(detail?.fields || []).filter(isFillable)
    loadedFormId = formId
  } catch {
    childFields.value = []
    loadedFormId = 0
    return
  }
  const codes = sourceDictCodes(childFields.value)
  if (codes.length) {
    try {
      const items = (await listDictionaryItemsByCodesApi(props.appId, codes)) || []
      dictItemsByCode.value = Object.fromEntries(
        items.map((item) => [item.code, item.items || []]),
      )
    } catch {
      dictItemsByCode.value = {}
    }
  }
  if (childFields.value.some(isDeptField)) {
    try {
      deptNames.value = flattenDeptNames(await listOrgDepartmentsApi())
    } catch {
      deptNames.value = {}
    }
  }
}

async function loadRows() {
  if (!ready.value || !props.recordId || !props.appId) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  loadError.value = false
  try {
    await loadChildForm()
    const result = await queryFormRecordsApi(
      props.appId,
      Number(props.field.childFormId),
      relateSubformQuery(props.field, props.recordId, page.value, pageSize.value),
    )
    rows.value = result?.items || []
    total.value = result?.total || 0
    userNames.value = result?.userNames || {}
  } catch {
    rows.value = []
    total.value = 0
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function reload() {
  loadRows()
}

function onPageChange(next) {
  page.value = next
  loadRows()
}

function onPageSizeChange(next) {
  pageSize.value = next
  page.value = 1
  loadRows()
}

function onRowClick(row) {
  if (!row?.id) return
  detailRecord.value = row
  detailVisible.value = true
}

watch(
  () => [props.appId, props.recordId, props.field.childFormId, props.field.childRelateKey],
  () => {
    page.value = 1
    loadRows()
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
.relate-subform-runtime {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.relate-subform-tip {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  line-height: 32px;
}

.relate-subform-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
