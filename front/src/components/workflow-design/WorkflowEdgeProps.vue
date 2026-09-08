<template>
  <div class="wf-props">
    <div class="wf-props-body">
      <label class="wf-label">连线标题</label>
      <el-input :model-value="edge.title" :disabled="disabled" @update:model-value="onTitle" />
      <template v-if="fromBranch">
        <el-checkbox :model-value="Boolean(edge.isDefault)" :disabled="disabled" @change="onDefault">
          其他情况
        </el-checkbox>
        <template v-if="!edge.isDefault">
          <div class="wf-hint">
            字段只列主表（含标签页），不含子表列。
          </div>
          <div
            class="filter-trigger"
            :class="{
              'is-placeholder': !hasFilters,
              'is-disabled': disabled,
            }"
            @click="openFilterDialog"
          >
            {{ hasFilters ? '已添加筛选条件' : '添加过滤条件' }}
          </div>
        </template>
      </template>
      <el-button class="wf-props-delete" type="danger" plain :disabled="disabled" @click="onDelete">
        删除连线
      </el-button>
    </div>
    <FormOptionFilterDialog
      v-model="filterVisible"
      :app-id="appId"
      :option-filters="optionFiltersFromEdge"
      :source-fields="conditionFields"
      :form-fields="conditionFields"
      description="添加过滤条件来限定这条分支何时生效"
      @confirm="onFilterConfirm"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import FormOptionFilterDialog from '../form-design/FormOptionFilterDialog.vue'
import { hasOptionFilters } from '../form-design/optionFilters.js'
import { flattenFields } from '../form-design/tabsField.js'

const props = defineProps({
  edge: { type: Object, default: null },
  fromBranch: { type: Boolean, default: false },
  appId: { type: Number, default: 0 },
  formFields: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['change', 'delete'])

const filterVisible = ref(false)

const conditionFields = computed(() =>
  flattenFields(props.formFields).filter((field) => field.type !== 'subform'),
)

const optionFiltersFromEdge = computed(() => whenToOptionFilters(props.edge?.when))

const hasFilters = computed(() => hasOptionFilters(optionFiltersFromEdge.value))

function whenToOptionFilters(when) {
  if (!when?.items?.length) return null
  return {
    match: when.logic === 'any' ? 'any' : 'all',
    conditions: when.items.map((item) => ({ ...item })),
  }
}

function optionFiltersToWhen(filters) {
  if (!filters?.conditions?.length) return undefined
  return {
    logic: filters.match === 'any' ? 'any' : 'all',
    items: filters.conditions.map((item) => ({ ...item })),
  }
}

function patch(next) {
  if (props.disabled) return
  emit('change', { ...props.edge, ...next })
}

function onTitle(title) {
  patch({ title })
}

function onDefault(isDefault) {
  patch({
    isDefault,
    when: isDefault ? undefined : props.edge.when,
  })
}

function openFilterDialog() {
  if (props.disabled || props.edge?.isDefault) return
  filterVisible.value = true
}

function onFilterConfirm(filters) {
  patch({ when: optionFiltersToWhen(filters) })
}

async function onDelete() {
  if (props.disabled) return
  const title = props.edge?.title?.trim()
  const message = title
    ? `确定删除连线「${title}」吗？`
    : '确定删除这条连线吗？'
  try {
    await ElMessageBox.confirm(message, '删除连线', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  emit('delete')
}
</script>

<style scoped lang="less">
@import './workflowProps.less';

.filter-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  cursor: pointer;
  font-size: 14px;
  line-height: 32px;
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

.filter-trigger.is-disabled {
  cursor: not-allowed;
  color: var(--el-text-color-disabled);
  background: var(--el-fill-color-light);
}
</style>
