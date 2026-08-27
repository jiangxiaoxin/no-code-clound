<template>
  <el-drawer
    :model-value="modelValue"
    title="选择过程设置"
    direction="btt"
    size="85%"
    destroy-on-close
    @update:model-value="onVisibleChange"
    @open="onOpen"
  >
    <div class="process-body">
      <section class="process-section">
        <div class="process-section-head">
          <h3 class="process-title">表格列</h3>
          <el-button type="primary" link @click="toggleSelectAll">
            {{ selectAllLabel }}
          </el-button>
          <span class="process-count">{{ selectedCountText }}</span>
        </div>
        <p class="process-desc">设置弹框表格要显示数据源的哪些列</p>
        <el-checkbox-group
          v-if="displayableFields.length"
          v-model="columnDraft"
          class="process-columns"
          size="small"
        >
          <el-checkbox
            v-for="field in displayableFields"
            :key="field.key"
            :value="field.key"
          >
            {{ field.title || field.key }}
          </el-checkbox>
        </el-checkbox-group>
        <el-empty v-else description="数据源表暂无可用字段" />
      </section>
      <section class="process-section">
        <h3 class="process-title">过滤条件</h3>
        <p class="process-desc">
          作为数据源表的默认筛选条件，筛选后的数据作为弹框表格的数据来源
        </p>
        <div
          class="filter-trigger"
          :class="{ 'is-placeholder': !hasFilters }"
          @click="openFilter"
        >
          {{ filterTriggerText }}
        </div>
      </section>
    </div>
    <template #footer>
      <el-button @click="closeDrawer">取消</el-button>
      <el-button type="primary" @click="confirm">确定</el-button>
    </template>
  </el-drawer>
  <FormOptionFilterDialog
    v-model="filterVisible"
    :app-id="appId"
    :option-filters="filterDraft"
    :source-fields="sourceFields"
    :form-fields="formFields"
    description="添加过滤条件来限定弹框表格的数据"
    @confirm="onFilterConfirm"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  cloneDisplayFieldKeys,
  withSystemDisplayFields,
} from './dataSelect'
import { cloneOptionFilters, hasOptionFilters } from './optionFilters'
import FormOptionFilterDialog from './FormOptionFilterDialog.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: Number, default: 0 },
  pickerColumnKeys: { type: Array, default: () => [] },
  optionFilters: { type: Object, default: null },
  sourceFields: { type: Array, default: () => [] },
  formFields: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const columnDraft = ref([])
const filterDraft = ref(null)
const filterVisible = ref(false)

const displayableFields = computed(() =>
  withSystemDisplayFields(props.sourceFields),
)
const totalCount = computed(() => displayableFields.value.length)
const selectedCount = computed(() => {
  const allowed = new Set(displayableFields.value.map((field) => field.key))
  return columnDraft.value.filter((key) => allowed.has(key)).length
})
const allSelected = computed(
  () => totalCount.value > 0 && selectedCount.value === totalCount.value,
)
const selectAllLabel = computed(() => (allSelected.value ? '取消全选' : '全选'))
const selectedCountText = computed(
  () => `[${selectedCount.value}/${totalCount.value}]`,
)
const hasFilters = computed(() => hasOptionFilters(filterDraft.value))
const filterTriggerText = computed(() => {
  const count = filterDraft.value?.conditions?.length || 0
  return count ? `已添加${count}条过滤条件` : '添加过滤条件'
})

function onOpen() {
  const allowed = new Set(displayableFields.value.map((field) => field.key))
  columnDraft.value = cloneDisplayFieldKeys(props.pickerColumnKeys).filter(
    (key) => allowed.has(key),
  )
  const cloned = cloneOptionFilters(props.optionFilters)
  filterDraft.value = cloned.conditions.length ? cloned : null
}

function toggleSelectAll() {
  if (allSelected.value) {
    columnDraft.value = []
    return
  }
  columnDraft.value = displayableFields.value.map((field) => field.key)
}

function openFilter() {
  filterVisible.value = true
}

function onFilterConfirm(next) {
  filterDraft.value = next
}

function onVisibleChange(value) {
  emit('update:modelValue', value)
}

function closeDrawer() {
  emit('update:modelValue', false)
}

function confirm() {
  emit('confirm', {
    pickerColumnKeys: cloneDisplayFieldKeys(columnDraft.value),
    optionFilters: hasOptionFilters(filterDraft.value)
      ? cloneOptionFilters(filterDraft.value)
      : null,
  })
  emit('update:modelValue', false)
}
</script>

<style scoped lang="less">
.process-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 1200px;
  margin: 0 auto;
}

.process-section + .process-section {
  margin-top: 24px;
}

.process-section-head {
  display: flex;
  align-items: center;
}

.process-title {
  margin: 0 12px 0 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}

.process-count {
  margin-left: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.process-desc {
  margin: 8px 0 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-text-color-secondary);
}

.process-columns {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow: auto;
}

.filter-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  cursor: pointer;
  font-size: 14px;
  line-height: 32px;
  white-space: nowrap;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.filter-trigger:hover {
  border-color: var(--el-border-color-hover);
}

.filter-trigger.is-placeholder {
  color: var(--el-text-color-placeholder);
}
</style>
